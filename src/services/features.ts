/**
 * Keirin AI Feature Engineering Module
 * Exactly 25 features according to Section 5 of the specification.
 */

import { Entry, FeatureRow, KeirinGrade, RiderStyle } from '../types/keirin';

export const FEATURE_NAMES: string[] = [
  'car_no', // 1: 車番
  'num_cars', // 2: 出走頭数
  'grade_num', // 3: グレード数値化
  'score', // 4: 競走得点
  'style_num', // 5: 脚質
  'gear_ratio', // 6: ギヤ倍数
  'win_rate', // 7: 勝率 (0..1)
  'top2_rate', // 8: 2連対率 (0..1)
  'top3_rate', // 9: 3連対率 (0..1)
  'back_count', // 10: バック回数
  'score_diff_mean', // 11: 得点の平均差
  'score_z', // 12: 得点z値
  'score_rank', // 13: レース内得点順位
  'score_diff_max', // 14: 最上位得点との差
  'win_rate_diff_mean', // 15: 勝率差
  'top3_rate_diff_mean', // 16: 3連対率差
  'line_pos', // 17: ライン内位置
  'line_size', // 18: ライン人数
  'is_line_leader', // 19: 先頭か (1/0)
  'is_solo', // 20: 単騎か (1/0)
  'line_score_share', // 21: ライン得点合計シェア
  'line_mean_score', // 22: ライン平均得点
  'leader_score', // 23: 先頭の得点
  'line_rank', // 24: ライン順位
  'num_lines', // 25: レース内ライン数
];

export const GRADE_MAP: Record<KeirinGrade, number> = {
  F2: 1,
  F1: 2,
  G3: 3,
  G2: 4,
  G1: 5,
  GP: 6,
};

export const STYLE_MAP: Record<RiderStyle, number> = {
  逃: 3,
  捲: 2,
  追: 1,
};

/**
 * Normalizes rates (if > 1.0, divides by 100 as per Section 4.1).
 */
export function normalizeRate(rate: number): number {
  if (isNaN(rate) || rate <= 0) return 0;
  if (rate > 1.0) return Math.min(1.0, rate / 100.0);
  return Math.min(1.0, rate);
}

/**
 * Extracts the 25 defined features for all entries in a single race.
 */
export function buildFeaturesForRace(entries: Entry[]): FeatureRow[] {
  const numCars = entries.length;
  if (numCars === 0) return [];

  // Pre-calculate race level metrics
  const scores = entries.map((e) => e.score || 70.0);
  const winRates = entries.map((e) => normalizeRate(e.win_rate));
  const top3Rates = entries.map((e) => normalizeRate(e.top3_rate));

  const meanScore = scores.reduce((a, b) => a + b, 0) / numCars;
  const maxScore = Math.max(...scores);
  const varianceScore =
    scores.reduce((sum, s) => sum + Math.pow(s - meanScore, 2), 0) / numCars;
  const stdScore = Math.sqrt(varianceScore) || 1.0;

  const meanWinRate = winRates.reduce((a, b) => a + b, 0) / numCars;
  const meanTop3Rate = top3Rates.reduce((a, b) => a + b, 0) / numCars;
  const totalRaceScore = scores.reduce((a, b) => a + b, 0) || 1.0;

  // Score ranks (1 = highest score)
  const sortedScores = [...scores].sort((a, b) => b - a);
  const getScoreRank = (sc: number) => sortedScores.indexOf(sc) + 1;

  // Pre-calculate line level metrics
  const lineGroups = new Map<number, Entry[]>();
  entries.forEach((e) => {
    const lid = e.line_id || e.car_no;
    if (!lineGroups.has(lid)) {
      lineGroups.set(lid, []);
    }
    lineGroups.get(lid)!.push(e);
  });

  const numLines = lineGroups.size;

  // Line stats
  const lineStats = new Map<
    number,
    {
      size: number;
      sumScore: number;
      meanScore: number;
      leaderScore: number;
    }
  >();

  lineGroups.forEach((riders, lid) => {
    const size = riders.length;
    const sumScore = riders.reduce((acc, r) => acc + (r.score || 70.0), 0);
    const mean = sumScore / size;
    // Leader is rider with line_pos === 1, or minimum line_pos
    const sortedPos = [...riders].sort((a, b) => (a.line_pos || 1) - (b.line_pos || 1));
    const leader = sortedPos[0];
    const leaderScore = leader ? leader.score || 70.0 : mean;

    lineStats.set(lid, {
      size,
      sumScore,
      meanScore: mean,
      leaderScore,
    });
  });

  // Line rankings by mean score
  const uniqueLineMeans = Array.from(lineStats.values()).map((ls) => ls.meanScore);
  uniqueLineMeans.sort((a, b) => b - a);
  const getLineRank = (meanSc: number) => uniqueLineMeans.indexOf(meanSc) + 1;

  // Build 25 features for each rider
  return entries.map((entry, idx) => {
    const gradeVal = GRADE_MAP[entry.grade] || 2;
    const styleVal = STYLE_MAP[entry.style] || 1;
    const scoreVal = entry.score || 70.0;
    const winRateVal = winRates[idx];
    const top2RateVal = normalizeRate(entry.top2_rate);
    const top3RateVal = top3Rates[idx];
    const backCountVal = Math.max(0, entry.back_count || 0);

    const lid = entry.line_id || entry.car_no;
    const lStat = lineStats.get(lid) || {
      size: 1,
      sumScore: scoreVal,
      meanScore: scoreVal,
      leaderScore: scoreVal,
    };

    const isLeader = (entry.line_pos === 1 || lStat.size === 1) ? 1 : 0;
    const isSolo = lStat.size === 1 ? 1 : 0;

    const featureVector: number[] = [
      entry.car_no, // 1
      numCars, // 2
      gradeVal, // 3
      scoreVal, // 4
      styleVal, // 5
      entry.gear_ratio || 3.92, // 6
      winRateVal, // 7
      top2RateVal, // 8
      top3RateVal, // 9
      backCountVal, // 10
      scoreVal - meanScore, // 11
      (scoreVal - meanScore) / stdScore, // 12
      getScoreRank(scoreVal), // 13
      maxScore - scoreVal, // 14
      winRateVal - meanWinRate, // 15
      top3RateVal - meanTop3Rate, // 16
      entry.line_pos || 1, // 17
      lStat.size, // 18
      isLeader, // 19
      isSolo, // 20
      lStat.sumScore / totalRaceScore, // 21
      lStat.meanScore, // 22
      lStat.leaderScore, // 23
      getLineRank(lStat.meanScore), // 24
      numLines, // 25
    ];

    const isFirst = entry.finish === 1 ? 1 : 0;

    return {
      race_id: entry.race_id,
      car_no: entry.car_no,
      finish: entry.finish,
      is_first: isFirst,
      features: featureVector,
    };
  });
}
