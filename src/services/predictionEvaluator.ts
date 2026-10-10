/**
 * Prediction Evaluation & Performance Analytics Engine
 * Evaluates AI predictions against confirmed race results:
 * - Hit / Miss (的中・不的中) judgment
 * - Recovery rate (回収率) & Net Profit/Loss (損益)
 * - Venue-by-venue (各開催地毎) breakdown & analytics
 */

import {
  BetType,
  CombinationProb,
  DatasetEvaluationSummary,
  EvaluatedBetItem,
  HitMissStatus,
  RaceGroup,
  RacePredictionEvaluation,
  StrategyParams,
  VenueEvaluationStat,
} from '../types/keirin';
import { TrainedModel, predictRiderWinProbabilities } from './modelEngine';
import { computeAllCombinations } from './harville';

/**
 * Get winning combo(s) for a specific bet type given top 3 finishers
 */
export function getWinningCombosForBetType(
  betType: BetType,
  top3: [number, number, number]
): string[] {
  const [c1, c2, c3] = top3;
  switch (betType) {
    case 'exacta':
      return [`${c1}-${c2}`];
    case 'trifecta':
      return [`${c1}-${c2}-${c3}`];
    case 'quinella': {
      const small = Math.min(c1, c2);
      const large = Math.max(c1, c2);
      return [`${small}-${large}`];
    }
    case 'trio': {
      const sorted = [c1, c2, c3].sort((a, b) => a - b);
      return [`${sorted[0]}-${sorted[1]}-${sorted[2]}`];
    }
    case 'wide': {
      const p1 = `${Math.min(c1, c2)}-${Math.max(c1, c2)}`;
      const p2 = `${Math.min(c1, c3)}-${Math.max(c1, c3)}`;
      const p3 = `${Math.min(c2, c3)}-${Math.max(c2, c3)}`;
      return [p1, p2, p3];
    }
    default:
      return [];
  }
}

/**
 * Evaluate AI prediction for a single race
 */
export function evaluateSingleRace(
  race: RaceGroup,
  model: TrainedModel,
  strategy: StrategyParams,
  unitBet: number = 100
): RacePredictionEvaluation {
  if (!race.entries || race.entries.length === 0) {
    return {
      race_id: race.race_id,
      date: race.date,
      venue: race.venue,
      race_no: race.race_no,
      grade: race.grade,
      raceTitle: race.raceTitle,
      status: race.status || 'scheduled',
      verdict: 'SKIP',
      verdictReason: '出走表データが存在しません',
      bets: [],
      totalBets: 0,
      betCost: 0,
      totalReturn: 0,
      profit: 0,
      recoveryRate: 0,
      hitStatus: 'skip',
    };
  }

  // 1. Predict 1st place probabilities
  const rawProbs = predictRiderWinProbabilities(model, race.entries);
  const cars = rawProbs.map((p) => ({ car_no: p.car_no, prob: p.prob }));

  // 2. Compute combinations for requested bet type
  const { byType } = computeAllCombinations(cars);
  const candidateCombos: CombinationProb[] = byType[strategy.bet_type] || [];

  // 3. Map odds
  const oddsMap = new Map<string, number>();
  race.odds
    .filter((o) => o.bet_type === strategy.bet_type)
    .forEach((o) => oddsMap.set(o.combo, o.odds));

  // 4. Calculate EV and filter
  const evaluatedCombos: EvaluatedBetItem[] = candidateCombos
    .map((c) => {
      const odds = oddsMap.get(c.combo) || 0;
      const ev = odds > 0 ? c.prob * odds : 0;
      return {
        combo: c.combo,
        prob: c.prob,
        odds,
        ev,
      };
    })
    .filter((c) => c.ev >= strategy.ev_threshold && c.prob >= strategy.min_prob)
    .sort((a, b) => b.ev - a.ev);

  const selectedBets = evaluatedCombos.slice(0, strategy.max_bets_per_race);
  const isBuy = selectedBets.length > 0;
  const verdict = isBuy ? 'BUY' : 'SKIP';
  const verdictReason = isBuy
    ? `期待値 EV ≧ ${strategy.ev_threshold.toFixed(1)} を満たす上位 ${selectedBets.length} 点を抽出`
    : `期待値 EV ≧ ${strategy.ev_threshold.toFixed(1)} を満たす買い目が基準未満のため見送り`;

  // 5. Check if race has confirmed result
  let top3: [number, number, number] | undefined = undefined;
  if (race.result && race.result.top3 && race.result.top3.length === 3) {
    top3 = race.result.top3;
  } else if (race.entries.some((e) => e.finish !== undefined && e.finish > 0)) {
    const finishedEntries = [...race.entries]
      .filter((e) => e.finish && e.finish > 0)
      .sort((a, b) => (a.finish || 99) - (b.finish || 99));
    if (finishedEntries.length >= 3) {
      top3 = [
        finishedEntries[0].car_no,
        finishedEntries[1].car_no,
        finishedEntries[2].car_no,
      ];
    }
  }

  const isFinished = race.status === 'finished' || !!top3;

  if (!isFinished || !top3) {
    // Unfinished race
    const betCost = isBuy ? selectedBets.length * unitBet : 0;
    return {
      race_id: race.race_id,
      date: race.date,
      venue: race.venue,
      race_no: race.race_no,
      grade: race.grade,
      raceTitle: race.raceTitle,
      status: race.status || 'scheduled',
      verdict,
      verdictReason,
      bets: selectedBets,
      totalBets: selectedBets.length,
      betCost,
      totalReturn: 0,
      profit: 0,
      recoveryRate: 0,
      hitStatus: isBuy ? 'pending' : 'skip',
    };
  }

  // 6. Evaluate against confirmed result
  const winningCombos = getWinningCombosForBetType(strategy.bet_type, top3);
  const primaryWinningCombo = winningCombos[0];

  if (!isBuy) {
    // AI skipped race
    return {
      race_id: race.race_id,
      date: race.date,
      venue: race.venue,
      race_no: race.race_no,
      grade: race.grade,
      raceTitle: race.raceTitle,
      status: 'finished',
      verdict: 'SKIP',
      verdictReason,
      bets: [],
      totalBets: 0,
      betCost: 0,
      totalReturn: 0,
      profit: 0,
      recoveryRate: 0,
      hitStatus: 'skip',
      winningCombo: primaryWinningCombo,
      top3,
    };
  }

  // AI bought bets: check hits and payouts
  let totalReturn = 0;
  const betCost = selectedBets.length * unitBet;
  let officialPayout = 0;

  const betsWithResults: EvaluatedBetItem[] = selectedBets.map((bet) => {
    const isHit = winningCombos.includes(bet.combo);
    let payout = 0;
    let returnAmount = 0;

    if (isHit) {
      // Find payout from race.result or odds
      const payoutItem = race.result?.payouts?.find(
        (p) => p.bet_type === strategy.bet_type && p.combo === bet.combo
      );
      if (payoutItem) {
        payout = payoutItem.payout;
      } else {
        payout = Math.round((bet.odds > 0 ? bet.odds : 4.5) * 100);
      }
      returnAmount = Math.round(payout * (unitBet / 100));
      totalReturn += returnAmount;
      if (payout > officialPayout) {
        officialPayout = payout;
      }
    }

    return {
      ...bet,
      isHit,
      payout,
      returnAmount,
    };
  });

  const isHit = totalReturn > 0;
  const profit = totalReturn - betCost;
  const recoveryRate = betCost > 0 ? Math.round((totalReturn / betCost) * 1000) / 10 : 0;
  const hitStatus: HitMissStatus = isHit ? 'hit' : 'miss';

  return {
    race_id: race.race_id,
    date: race.date,
    venue: race.venue,
    race_no: race.race_no,
    grade: race.grade,
    raceTitle: race.raceTitle,
    status: 'finished',
    verdict: 'BUY',
    verdictReason,
    bets: betsWithResults,
    totalBets: selectedBets.length,
    betCost,
    totalReturn,
    profit,
    recoveryRate,
    hitStatus,
    winningCombo: primaryWinningCombo,
    top3,
    officialPayout: officialPayout > 0 ? officialPayout : undefined,
  };
}

/**
 * Bank length lookup for known Japanese venues
 */
export const VENUE_BANKS: Record<string, string> = {
  平塚: '400m',
  立川: '400m',
  前橋: '335m (ドーム)',
  松戸: '333m',
  伊東温泉: '333m',
  名古屋: '400m',
  岸和田: '400m',
  小倉: '400m (ドーム)',
  武雄: '400m',
  別府: '400m',
  宇都宮: '500m',
  大宮: '500m',
  京王閣: '400m',
  取手: '400m',
  川崎: '400m',
  奈良: '333m',
  弥彦: '400m',
  富山: '333m',
  佐世保: '400m',
  岐阜: '400m',
  豊橋: '400m',
  四日市: '400m',
  高知: '500m',
  熊本: '500m',
  防府: '333m',
  広島: '400m',
  いわき平: '400m',
};

/**
 * Comprehensive dataset evaluation across all races and by venue
 */
export function evaluateDataset(
  races: RaceGroup[],
  model: TrainedModel,
  strategy: StrategyParams,
  unitBet: number = 100
): DatasetEvaluationSummary {
  const evaluations: RacePredictionEvaluation[] = races.map((race) =>
    evaluateSingleRace(race, model, strategy, unitBet)
  );

  let totalRaces = evaluations.length;
  let finishedRaces = 0;
  let boughtRaces = 0;
  let skippedRaces = 0;
  let pendingRaces = 0;
  let hitRaces = 0;
  let missRaces = 0;
  let totalBets = 0;
  let totalCost = 0;
  let totalReturn = 0;

  const venueMap = new Map<string, VenueEvaluationStat>();

  evaluations.forEach((evalItem) => {
    const venueName = evalItem.venue;
    let vStat = venueMap.get(venueName);
    if (!vStat) {
      vStat = {
        venue: venueName,
        bankLength: VENUE_BANKS[venueName] || '400m',
        totalRaces: 0,
        finishedRaces: 0,
        boughtRaces: 0,
        skippedRaces: 0,
        hitRaces: 0,
        missRaces: 0,
        totalBets: 0,
        totalCost: 0,
        totalReturn: 0,
        netProfit: 0,
        hitRate: 0,
        recoveryRate: 0,
      };
      venueMap.set(venueName, vStat);
    }

    vStat.totalRaces += 1;

    if (evalItem.status === 'finished') {
      finishedRaces += 1;
      vStat.finishedRaces += 1;

      if (evalItem.verdict === 'BUY') {
        boughtRaces += 1;
        vStat.boughtRaces += 1;
        totalBets += evalItem.totalBets;
        vStat.totalBets += evalItem.totalBets;
        totalCost += evalItem.betCost;
        vStat.totalCost += evalItem.betCost;
        totalReturn += evalItem.totalReturn;
        vStat.totalReturn += evalItem.totalReturn;

        if (evalItem.hitStatus === 'hit') {
          hitRaces += 1;
          vStat.hitRaces += 1;
        } else {
          missRaces += 1;
          vStat.missRaces += 1;
        }
      } else {
        skippedRaces += 1;
        vStat.skippedRaces += 1;
      }
    } else {
      pendingRaces += 1;
      if (evalItem.verdict === 'BUY') {
        boughtRaces += 1;
        vStat.boughtRaces += 1;
        totalBets += evalItem.totalBets;
        vStat.totalBets += evalItem.totalBets;
        totalCost += evalItem.betCost;
        vStat.totalCost += evalItem.betCost;
      } else {
        skippedRaces += 1;
        vStat.skippedRaces += 1;
      }
    }
  });

  const netProfit = totalReturn - totalCost;
  const hitRate =
    boughtRaces > 0 ? Math.round((hitRaces / boughtRaces) * 1000) / 10 : 0;
  const recoveryRate =
    totalCost > 0 ? Math.round((totalReturn / totalCost) * 1000) / 10 : 0;

  // Finalize venue stats
  const venueStats: VenueEvaluationStat[] = Array.from(venueMap.values()).map(
    (vStat) => {
      const vProfit = vStat.totalReturn - vStat.totalCost;
      const vHitRate =
        vStat.boughtRaces > 0
          ? Math.round((vStat.hitRaces / vStat.boughtRaces) * 1000) / 10
          : 0;
      const vRecoveryRate =
        vStat.totalCost > 0
          ? Math.round((vStat.totalReturn / vStat.totalCost) * 1000) / 10
          : 0;

      return {
        ...vStat,
        netProfit: vProfit,
        hitRate: vHitRate,
        recoveryRate: vRecoveryRate,
      };
    }
  );

  // Sort venues by total races descending, then recovery rate
  venueStats.sort((a, b) => b.totalRaces - a.totalRaces || b.recoveryRate - a.recoveryRate);

  return {
    totalRaces,
    finishedRaces,
    boughtRaces,
    skippedRaces,
    pendingRaces,
    hitRaces,
    missRaces,
    totalBets,
    totalCost,
    totalReturn,
    netProfit,
    hitRate,
    recoveryRate,
    venueStats,
    evaluations,
  };
}
