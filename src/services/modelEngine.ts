/**
 * Keirin AI Machine Learning Engine
 * Implements:
 * 1. Gradient Boosting Binary Classifier for 1st place
 * 2. Race-level Softmax Normalization with Temperature Calibration T in [0.5, 2.5] (step 0.05)
 * 3. Strategy Grid Explorer across 750 combinations (bet_type x EV x min_prob x max_bets)
 * 4. Selection Criterion: Maximize (Recovery Rate - Standard Error) on validation
 * 5. Test Evaluation with 2,000-iteration Race-level Bootstrap 95% Confidence Interval
 * 6. Baseline Comparisons (1st favorite vs. AI top probability)
 */

import {
  BacktestSummary,
  BetType,
  Entry,
  FeatureRow,
  GridSearchRow,
  ModelHyperparameters,
  OddsItem,
  RaceGroup,
  StrategyParams,
} from '../types/keirin';
import { buildFeaturesForRace, FEATURE_NAMES } from './features';
import { computeAllCombinations } from './harville';

// Decision stump / tree node
interface TreeNode {
  featureIdx: number;
  splitVal: number;
  leftVal: number;
  rightVal: number;
  leftNode?: TreeNode;
  rightNode?: TreeNode;
  isLeaf?: boolean;
  leafVal?: number;
}

export interface TrainedModel {
  hyperparams: ModelHyperparameters;
  trees: TreeNode[];
  baseScore: number;
  featureWeights: number[];
  optimalTemperature: number;
}

/**
 * Predict raw logit score for a feature vector using ensemble of trees.
 */
export function predictRawScore(model: TrainedModel, features: number[]): number {
  let score = model.baseScore;
  for (const tree of model.trees) {
    score += evaluateTreeNode(tree, features) * model.hyperparams.learningRate;
  }
  return score;
}

function evaluateTreeNode(node: TreeNode, features: number[]): number {
  if (node.isLeaf) return node.leafVal || 0;
  if (node.leftNode && node.rightNode) {
    if (features[node.featureIdx] <= node.splitVal) {
      return evaluateTreeNode(node.leftNode, features);
    } else {
      return evaluateTreeNode(node.rightNode, features);
    }
  }
  // Shallow stump fallback
  return features[node.featureIdx] <= node.splitVal ? node.leftVal : node.rightVal;
}

/**
 * Trains a gradient boosted tree ensemble on binary classification (1st place vs rest).
 */
export function trainGradientBoosting(
  trainRows: FeatureRow[],
  hyperparams: ModelHyperparameters = {
    maxDepth: 3,
    learningRate: 0.05,
    numTrees: 120, // responsive in-browser while preserving high accuracy
    minSamplesLeaf: 10,
    l2Regularization: 2.0,
    temperature: 1.0,
  }
): TrainedModel {
  const n = trainRows.length;
  if (n === 0) {
    return {
      hyperparams,
      trees: [],
      baseScore: 0,
      featureWeights: new Array(FEATURE_NAMES.length).fill(1 / FEATURE_NAMES.length),
      optimalTemperature: 1.0,
    };
  }

  // Base score: log-odds of positive class
  const numPos = trainRows.filter((r) => r.is_first === 1).length;
  const p0 = Math.max(0.01, Math.min(0.99, numPos / n));
  const baseScore = Math.log(p0 / (1 - p0));

  const currentScores = new Float64Array(n);
  currentScores.fill(baseScore);

  const trees: TreeNode[] = [];
  const featureImportances = new Float64Array(FEATURE_NAMES.length);

  for (let t = 0; t < hyperparams.numTrees; t++) {
    // 1. Calculate pseudo-residuals: r_i = y_i - sigmoid(score_i)
    const residuals = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const p = 1.0 / (1.0 + Math.exp(-currentScores[i]));
      residuals[i] = trainRows[i].is_first - p;
    }

    // 2. Build decision tree (depth 3)
    const tree = buildTreeRecursive(
      trainRows,
      residuals,
      Array.from({ length: n }, (_, i) => i),
      0,
      hyperparams.maxDepth,
      hyperparams.minSamplesLeaf,
      hyperparams.l2Regularization,
      featureImportances
    );

    trees.push(tree);

    // 3. Update current scores
    for (let i = 0; i < n; i++) {
      currentScores[i] +=
        evaluateTreeNode(tree, trainRows[i].features) * hyperparams.learningRate;
    }
  }

  // Normalize feature weights
  const totalImp = featureImportances.reduce((a, b) => a + b, 0) || 1.0;
  const featureWeights = Array.from(featureImportances).map((v) => v / totalImp);

  return {
    hyperparams,
    trees,
    baseScore,
    featureWeights,
    optimalTemperature: 1.0,
  };
}

function buildTreeRecursive(
  rows: FeatureRow[],
  residuals: Float64Array,
  indices: number[],
  depth: number,
  maxDepth: number,
  minLeaf: number,
  l2: number,
  featureImportances: Float64Array
): TreeNode {
  const sumRes = indices.reduce((acc, idx) => acc + residuals[idx], 0);
  const leafVal = sumRes / (indices.length + l2);

  if (depth >= maxDepth || indices.length <= minLeaf * 2) {
    return {
      featureIdx: 0,
      splitVal: 0,
      leftVal: leafVal,
      rightVal: leafVal,
      isLeaf: true,
      leafVal,
    };
  }

  let bestGain = -Infinity;
  let bestFeature = 0;
  let bestSplit = 0;
  let bestLeftIndices: number[] = [];
  let bestRightIndices: number[] = [];

  const numFeatures = FEATURE_NAMES.length;
  // Sample features or evaluate all 25
  for (let f = 0; f < numFeatures; f++) {
    const vals = indices.map((i) => rows[i].features[f]);
    vals.sort((a, b) => a - b);

    // Test quartiles / candidate splits
    const step = Math.max(1, Math.floor(vals.length / 8));
    for (let k = step; k < vals.length - step; k += step) {
      const split = (vals[k - 1] + vals[k]) / 2.0;

      let leftSum = 0;
      let leftCount = 0;
      let rightSum = 0;
      let rightCount = 0;

      for (const idx of indices) {
        if (rows[idx].features[f] <= split) {
          leftSum += residuals[idx];
          leftCount++;
        } else {
          rightSum += residuals[idx];
          rightCount++;
        }
      }

      if (leftCount < minLeaf || rightCount < minLeaf) continue;

      const gain =
        (leftSum * leftSum) / (leftCount + l2) +
        (rightSum * rightSum) / (rightCount + l2) -
        (sumRes * sumRes) / (indices.length + l2);

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestSplit = split;
      }
    }
  }

  if (bestGain <= 0.0001) {
    return {
      featureIdx: 0,
      splitVal: 0,
      leftVal: leafVal,
      rightVal: leafVal,
      isLeaf: true,
      leafVal,
    };
  }

  featureImportances[bestFeature] += bestGain;

  for (const idx of indices) {
    if (rows[idx].features[bestFeature] <= bestSplit) {
      bestLeftIndices.push(idx);
    } else {
      bestRightIndices.push(idx);
    }
  }

  const leftNode = buildTreeRecursive(
    rows,
    residuals,
    bestLeftIndices,
    depth + 1,
    maxDepth,
    minLeaf,
    l2,
    featureImportances
  );

  const rightNode = buildTreeRecursive(
    rows,
    residuals,
    bestRightIndices,
    depth + 1,
    maxDepth,
    minLeaf,
    l2,
    featureImportances
  );

  return {
    featureIdx: bestFeature,
    splitVal: bestSplit,
    leftVal: leafVal,
    rightVal: leafVal,
    leftNode,
    rightNode,
    isLeaf: false,
  };
}

/**
 * Optimizes temperature T in [0.5, 2.5] with step 0.05 on validation dataset
 * to maximize race-level log likelihood of actual winners.
 */
export function optimizeTemperature(
  model: TrainedModel,
  valRaces: RaceGroup[]
): number {
  let bestT = 1.0;
  let maxLogLikelihood = -Infinity;

  // Pre-calculate raw scores for all entries in validation races
  const raceRawScores = valRaces.map((rg) => {
    const fRows = buildFeaturesForRace(rg.entries);
    const winnerCarNo = rg.entries.find((e) => e.finish === 1)?.car_no;
    const scores = fRows.map((fr) => ({
      car_no: fr.car_no,
      score: predictRawScore(model, fr.features),
      isWinner: fr.car_no === winnerCarNo,
    }));
    return { winnerCarNo, scores };
  });

  for (let t = 0.5; t <= 2.5001; t += 0.05) {
    let currentLL = 0;

    for (const { scores, winnerCarNo } of raceRawScores) {
      if (!winnerCarNo) continue;
      // Softmax with temperature t
      const maxS = Math.max(...scores.map((s) => s.score / t));
      let sumExp = 0;
      let winnerExp = 0;

      for (const s of scores) {
        const expVal = Math.exp(s.score / t - maxS);
        sumExp += expVal;
        if (s.isWinner) {
          winnerExp = expVal;
        }
      }

      const pWinner = sumExp > 0 ? Math.max(1e-6, winnerExp / sumExp) : 1e-6;
      currentLL += Math.log(pWinner);
    }

    if (currentLL > maxLogLikelihood) {
      maxLogLikelihood = currentLL;
      bestT = Math.round(t * 100) / 100;
    }
  }

  return bestT;
}

/**
 * Predicts calibrated 1st place probabilities for entries in a race.
 */
export function predictRiderWinProbabilities(
  model: TrainedModel,
  entries: Entry[]
): { car_no: number; prob: number; raw_score: number }[] {
  const fRows = buildFeaturesForRace(entries);
  const T = model.optimalTemperature || 1.0;

  const raw = fRows.map((fr) => ({
    car_no: fr.car_no,
    raw_score: predictRawScore(model, fr.features),
  }));

  const maxScore = Math.max(...raw.map((r) => r.raw_score / T));
  let sumExp = 0;
  const expVals = raw.map((r) => {
    const val = Math.exp(r.raw_score / T - maxScore);
    sumExp += val;
    return { car_no: r.car_no, raw_score: r.raw_score, expVal: val };
  });

  return expVals.map((e) => ({
    car_no: e.car_no,
    raw_score: e.raw_score,
    prob: sumExp > 0 ? e.expVal / sumExp : 1.0 / entries.length,
  }));
}

/**
 * Simulates a strategy on a dataset of races.
 */
export function evaluateStrategyOnRaces(
  model: TrainedModel,
  races: RaceGroup[],
  strategy: StrategyParams
): {
  total_bets: number;
  total_cost: number;
  total_return: number;
  races_bought: number;
  total_races: number;
  hit_rate: number;
  recovery_rate: number;
  std_error: number;
  criterion_score: number;
  race_returns: number[]; // Return percentage per race bought
} {
  let totalBets = 0;
  let totalCost = 0;
  let totalReturn = 0;
  let hitRaces = 0;
  let racesBought = 0;
  const raceReturns: number[] = [];

  for (const race of races) {
    if (race.entries.length < 4) continue;
    // We need 1st, 2nd, 3rd finish to evaluate payout
    const finish1 = race.entries.find((e) => e.finish === 1)?.car_no;
    const finish2 = race.entries.find((e) => e.finish === 2)?.car_no;
    const finish3 = race.entries.find((e) => e.finish === 3)?.car_no;
    if (!finish1 || !finish2 || !finish3) continue;

    // 1. Calculate P(1st)
    const riderProbs = predictRiderWinProbabilities(model, race.entries);

    // 2. Harville combinations
    const { byType } = computeAllCombinations(riderProbs);
    const combos = byType[strategy.bet_type] || [];

    // 3. Match with odds
    const oddsMap = new Map<string, number>();
    race.odds
      .filter((o) => o.bet_type === strategy.bet_type)
      .forEach((o) => oddsMap.set(o.combo, o.odds));

    // 4. Compute EV and filter
    const qualifying = combos
      .map((c) => {
        const odds = oddsMap.get(c.combo) || 0;
        const ev = c.prob * odds;
        return { ...c, odds, ev };
      })
      .filter((c) => c.odds > 0 && c.ev >= strategy.ev_threshold && c.prob >= strategy.min_prob)
      .sort((a, b) => b.ev - a.ev);

    // 5. Select at most max_bets_per_race
    const selectedBets = qualifying.slice(0, strategy.max_bets_per_race);

    if (selectedBets.length === 0) {
      // Skipped race
      continue;
    }

    racesBought++;
    const raceCost = selectedBets.length * 100;
    let raceReturn = 0;

    // Check hit for this bet_type
    for (const bet of selectedBets) {
      let isHit = false;
      if (strategy.bet_type === 'exacta') {
        isHit = bet.combo === `${finish1}-${finish2}`;
      } else if (strategy.bet_type === 'trifecta') {
        isHit = bet.combo === `${finish1}-${finish2}-${finish3}`;
      } else if (strategy.bet_type === 'quinella') {
        const qCombo = `${Math.min(finish1, finish2)}-${Math.max(finish1, finish2)}`;
        isHit = bet.combo === qCombo;
      } else if (strategy.bet_type === 'trio') {
        const sorted = [finish1, finish2, finish3].sort((a, b) => a - b);
        isHit = bet.combo === `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
      } else if (strategy.bet_type === 'wide') {
        // Wide pays on {1,2}, {1,3}, {2,3}
        const w1 = `${Math.min(finish1, finish2)}-${Math.max(finish1, finish2)}`;
        const w2 = `${Math.min(finish1, finish3)}-${Math.max(finish1, finish3)}`;
        const w3 = `${Math.min(finish2, finish3)}-${Math.max(finish2, finish3)}`;
        isHit = bet.combo === w1 || bet.combo === w2 || bet.combo === w3;
      }

      if (isHit && bet.odds) {
        raceReturn += Math.round(100 * bet.odds);
      }
    }

    totalBets += selectedBets.length;
    totalCost += raceCost;
    totalReturn += raceReturn;

    if (raceReturn > 0) {
      hitRaces++;
    }

    raceReturns.push((raceReturn / raceCost) * 100);
  }

  const hitRate = racesBought > 0 ? hitRaces / racesBought : 0;
  const recoveryRate = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  // Standard error across race returns
  let stdError = 0;
  if (racesBought > 1) {
    const meanR = recoveryRate;
    const variance =
      raceReturns.reduce((sum, r) => sum + Math.pow(r - meanR, 2), 0) /
      (racesBought - 1);
    stdError = Math.sqrt(variance) / Math.sqrt(racesBought);
  }

  const criterionScore = recoveryRate - stdError;

  return {
    total_bets: totalBets,
    total_cost: totalCost,
    total_return: totalReturn,
    races_bought: racesBought,
    total_races: races.length,
    hit_rate: hitRate,
    recovery_rate: recoveryRate,
    std_error: stdError,
    criterion_score: criterionScore,
    race_returns: raceReturns,
  };
}

/**
 * Grid search across the specified parameters in Section 7 of the specification:
 * 券種: wide, quinella, exacta, trio, trifecta
 * EV閾値: {1.0, 1.1, 1.2, 1.3, 1.5, 2.0}
 * 最低確率: {0, 0.02, 0.05, 0.10, 0.15}
 * 最大点数: {1, 2, 3, 5, 8}
 */
export function runStrategyGridSearch(
  model: TrainedModel,
  valRaces: RaceGroup[],
  minBets: number = 100, // adjustable from CLI/UI
  minHitRate: number = 0.0
): {
  gridRows: GridSearchRow[];
  bestStrategy: StrategyParams;
  bestRow: GridSearchRow;
} {
  const betTypes: BetType[] = ['wide', 'quinella', 'exacta', 'trio', 'trifecta'];
  const evThresholds = [1.0, 1.1, 1.2, 1.3, 1.5, 2.0];
  const minProbs = [0.0, 0.02, 0.05, 0.1, 0.15];
  const maxBetsList = [1, 2, 3, 5, 8];

  const gridRows: GridSearchRow[] = [];
  let bestRow: GridSearchRow | null = null;
  let maxScore = -Infinity;

  for (const bet_type of betTypes) {
    for (const ev_threshold of evThresholds) {
      for (const min_prob of minProbs) {
        for (const max_bets_per_race of maxBetsList) {
          const strategy: StrategyParams = {
            bet_type,
            ev_threshold,
            min_prob,
            max_bets_per_race,
          };

          const res = evaluateStrategyOnRaces(model, valRaces, strategy);
          const meets = res.total_bets >= minBets && res.hit_rate >= minHitRate;

          const row: GridSearchRow = {
            id: `${bet_type}_ev${ev_threshold}_p${min_prob}_m${max_bets_per_race}`,
            bet_type,
            ev_threshold,
            min_prob,
            max_bets_per_race,
            total_bets: res.total_bets,
            total_races_bought: res.races_bought,
            hit_rate: res.hit_rate,
            recovery_rate: Math.round(res.recovery_rate * 10) / 10,
            std_error: Math.round(res.std_error * 10) / 10,
            criterion_score: Math.round(res.criterion_score * 10) / 10,
            meets_constraints: meets,
          };

          gridRows.push(row);

          if (meets && row.criterion_score > maxScore) {
            maxScore = row.criterion_score;
            bestRow = row;
          }
        }
      }
    }
  }

  // Fallback if none met strict constraints
  if (!bestRow) {
    const validWithBets = gridRows.filter((r) => r.total_bets > 0);
    bestRow = validWithBets.sort((a, b) => b.criterion_score - a.criterion_score)[0] || gridRows[0];
  }

  const bestStrategy: StrategyParams = {
    bet_type: bestRow.bet_type,
    ev_threshold: bestRow.ev_threshold,
    min_prob: bestRow.min_prob,
    max_bets_per_race: bestRow.max_bets_per_race,
  };

  return { gridRows, bestStrategy, bestRow };
}

/**
 * Computes 2,000 bootstrap iterations on race-level returns for 95% Confidence Interval.
 */
export function computeBootstrapCI(
  raceReturns: number[],
  numIterations: number = 2000
): { ci_low: number; ci_high: number } {
  const n = raceReturns.length;
  if (n === 0) return { ci_low: 0, ci_high: 0 };

  const sampleMeans: number[] = new Float64Array(numIterations) as unknown as number[];

  // Deterministic seeded PRNG for exact reproducibility
  let seed = 42;
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let it = 0; it < numIterations; it++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(pseudoRand() * n);
      sum += raceReturns[idx];
    }
    sampleMeans[it] = sum / n;
  }

  sampleMeans.sort((a, b) => a - b);
  const lowIdx = Math.floor(numIterations * 0.025);
  const highIdx = Math.floor(numIterations * 0.975);

  return {
    ci_low: Math.round(sampleMeans[lowIdx] * 10) / 10,
    ci_high: Math.round(sampleMeans[highIdx] * 10) / 10,
  };
}

/**
 * Computes the baseline models on the test set:
 * 1. 1番人気買い (flat 100 yen on lowest odds combo)
 * 2. AI最高確率買い (flat 100 yen on AI highest prob combo, ignoring EV)
 */
export function evaluateBaselines(
  model: TrainedModel,
  testRaces: RaceGroup[],
  betType: BetType
): {
  favorite1_recovery_rate: number;
  favorite1_hit_rate: number;
  ai_top_prob_recovery_rate: number;
  ai_top_prob_hit_rate: number;
} {
  let favCost = 0;
  let favReturn = 0;
  let favHits = 0;

  let aiCost = 0;
  let aiReturn = 0;
  let aiHits = 0;

  let validRaces = 0;

  for (const race of testRaces) {
    const f1 = race.entries.find((e) => e.finish === 1)?.car_no;
    const f2 = race.entries.find((e) => e.finish === 2)?.car_no;
    const f3 = race.entries.find((e) => e.finish === 3)?.car_no;
    if (!f1 || !f2 || !f3) continue;

    const relevantOdds = race.odds.filter((o) => o.bet_type === betType);
    if (relevantOdds.length === 0) continue;

    validRaces++;

    // 1. Favorite 1: lowest odds
    const favCombo = [...relevantOdds].sort((a, b) => a.odds - b.odds)[0];
    favCost += 100;
    if (checkComboHit(betType, favCombo.combo, f1, f2, f3)) {
      favReturn += Math.round(100 * favCombo.odds);
      favHits++;
    }

    // 2. AI top probability
    const riderProbs = predictRiderWinProbabilities(model, race.entries);
    const { byType } = computeAllCombinations(riderProbs);
    const combos = byType[betType] || [];
    const topAiCombo = [...combos].sort((a, b) => b.prob - a.prob)[0];

    if (topAiCombo) {
      aiCost += 100;
      const odds = relevantOdds.find((o) => o.combo === topAiCombo.combo)?.odds || 0;
      if (checkComboHit(betType, topAiCombo.combo, f1, f2, f3)) {
        aiReturn += Math.round(100 * odds);
        aiHits++;
      }
    }
  }

  return {
    favorite1_recovery_rate:
      favCost > 0 ? Math.round((favReturn / favCost) * 1000) / 10 : 0,
    favorite1_hit_rate:
      validRaces > 0 ? Math.round((favHits / validRaces) * 1000) / 10 : 0,
    ai_top_prob_recovery_rate:
      aiCost > 0 ? Math.round((aiReturn / aiCost) * 1000) / 10 : 0,
    ai_top_prob_hit_rate:
      validRaces > 0 ? Math.round((aiHits / validRaces) * 1000) / 10 : 0,
  };
}

function checkComboHit(
  betType: BetType,
  combo: string,
  f1: number,
  f2: number,
  f3: number
): boolean {
  if (betType === 'exacta') return combo === `${f1}-${f2}`;
  if (betType === 'trifecta') return combo === `${f1}-${f2}-${f3}`;
  if (betType === 'quinella') return combo === `${Math.min(f1, f2)}-${Math.max(f1, f2)}`;
  if (betType === 'trio') {
    const s = [f1, f2, f3].sort((a, b) => a - b);
    return combo === `${s[0]}-${s[1]}-${s[2]}`;
  }
  if (betType === 'wide') {
    const w1 = `${Math.min(f1, f2)}-${Math.max(f1, f2)}`;
    const w2 = `${Math.min(f1, f3)}-${Math.max(f1, f3)}`;
    const w3 = `${Math.min(f2, f3)}-${Math.max(f2, f3)}`;
    return combo === w1 || combo === w2 || combo === w3;
  }
  return false;
}

/**
 * Complete Train, Strategy Grid Search & Test Backtest Pipeline
 * Adheres to 60% Train, 20% Validation, 20% Test chronological split.
 */
export function runFullPipeline(
  races: RaceGroup[],
  minBets: number = 50,
  minHitRate: number = 0.0
): {
  model: TrainedModel;
  summary: BacktestSummary;
  gridRows: GridSearchRow[];
} {
  // 1. Sort races chronologically by date
  const sortedRaces = [...races].sort((a, b) => a.date.localeCompare(b.date));
  const total = sortedRaces.length;

  const trainEnd = Math.floor(total * 0.6);
  const valEnd = Math.floor(total * 0.8);

  const trainRaces = sortedRaces.slice(0, trainEnd);
  const valRaces = sortedRaces.slice(trainEnd, valEnd);
  const testRaces = sortedRaces.slice(valEnd);

  // 2. Build feature rows for training
  const trainRows: FeatureRow[] = [];
  trainRaces.forEach((r) => {
    trainRows.push(...buildFeaturesForRace(r.entries));
  });

  // 3. Train Gradient Boosting
  const model = trainGradientBoosting(trainRows);

  // 4. Optimize temperature T on validation races
  const optimalT = optimizeTemperature(model, valRaces);
  model.optimalTemperature = optimalT;

  // 5. Run Strategy Grid Search on validation races
  const { gridRows, bestStrategy, bestRow } = runStrategyGridSearch(
    model,
    valRaces,
    minBets,
    minHitRate
  );

  // 6. Test Period Evaluation (held out until now)
  const testRes = evaluateStrategyOnRaces(model, testRaces, bestStrategy);
  const { ci_low, ci_high } = computeBootstrapCI(testRes.race_returns, 2000);

  // 7. Baselines on test set
  const baselines = evaluateBaselines(model, testRaces, bestStrategy.bet_type);

  const summary: BacktestSummary = {
    train_races: trainRaces.length,
    val_races: valRaces.length,
    test_races: testRaces.length,
    optimal_temperature: optimalT,
    best_strategy: bestStrategy,
    val_performance: {
      total_bets: bestRow.total_bets,
      hit_rate: Math.round(bestRow.hit_rate * 1000) / 10,
      recovery_rate: bestRow.recovery_rate,
      criterion_score: bestRow.criterion_score,
    },
    test_performance: {
      total_bets: testRes.total_bets,
      total_cost: testRes.total_cost,
      total_return: testRes.total_return,
      races_bought: testRes.races_bought,
      total_races: testRaces.length,
      hit_rate: Math.round(testRes.hit_rate * 1000) / 10,
      recovery_rate: Math.round(testRes.recovery_rate * 10) / 10,
      std_error: Math.round(testRes.std_error * 10) / 10,
      ci_95_low: ci_low,
      ci_95_high: ci_high,
      is_statistically_profitable: ci_low > 100.0,
    },
    baselines,
    trained_at: new Date().toISOString(),
  };

  return { model, summary, gridRows };
}
