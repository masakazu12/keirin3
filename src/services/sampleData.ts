/**
 * Synthetic Keirin Dataset Generator
 * Replicates `generate_sample_data.py` for testing and demonstration.
 * Adheres to Section 4 & Section 8 of the specification.
 */

import { BetType, Entry, KeirinGrade, OddsItem, RaceGroup, RiderStyle } from '../types/keirin';
import { computeAllCombinations } from './harville';
import { buildRealisticRaceResult } from './liveCollector';

const VENUES = [
  '平塚',
  '立川',
  '前橋',
  '松戸',
  '伊東温泉',
  '名古屋',
  '岸和田',
  '小倉',
  '武雄',
  '別府',
  '宇都宮',
  '大宮',
  '京王閣',
  '取手',
];

const GRADES: KeirinGrade[] = ['F2', 'F1', 'G3', 'G2', 'G1'];

const RIDER_NAMES = [
  '佐藤 慎太郎',
  '脇本 雄太',
  '古性 優作',
  '松浦 悠士',
  '清水 裕友',
  '新山 響平',
  '眞杉 匠',
  '犬伏 湧也',
  '深谷 知広',
  '郡司 浩平',
  '山田 庸平',
  '吉田 拓矢',
  '嘉永 泰斗',
  '浅井 康太',
  '北井 佑季',
  '町田 太我',
  '寺崎 浩平',
  '窓場 千加',
  '森田 優弥',
  '佐々木 悠葵',
  '岩本 俊介',
  '小倉 竜二',
  '成田 和也',
  '守澤 太志',
  '平原 康多',
  '諸橋 愛',
  '香川 雄介',
  '渡邉 雄太',
  '阿部 力也',
  '松井 宏佑',
];

/**
 * Seeded pseudo-random number generator for reproducible generation.
 */
class PRNG {
  private s: number;
  constructor(seed: number = 20261010) {
    this.s = seed;
  }
  next(): number {
    this.s = (this.s * 9301 + 49297) % 233280;
    return this.s / 233280;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/**
 * Generates N realistic Keirin races with entries and odds.
 */
export function generateSampleDataset(
  numRaces: number = 120,
  seed: number = 20261010
): RaceGroup[] {
  const rng = new PRNG(seed);
  const races: RaceGroup[] = [];

  // Generate dates in 2026
  const baseDate = new Date('2026-05-01');

  for (let r = 0; r < numRaces; r++) {
    const dayOffset = Math.floor(r / 10);
    const raceDate = new Date(baseDate.getTime() + dayOffset * 86400000);
    const dateStr = raceDate.toISOString().slice(0, 10);

    const venue = rng.choice(VENUES);
    const venueCode = (VENUES.indexOf(venue) + 11).toString().padStart(2, '0');
    const raceNo = (r % 12) + 1;
    const raceId = `${dateStr.replace(/-/g, '')}-${venueCode}-${raceNo.toString().padStart(2, '0')}`;

    const grade: KeirinGrade =
      r % 50 === 0
        ? 'GP'
        : r % 25 === 0
        ? 'G1'
        : r % 15 === 0
        ? 'G2'
        : r % 8 === 0
        ? 'G3'
        : r % 3 === 0
        ? 'F1'
        : 'F2';

    // Base score ranges by grade
    const baseScore =
      grade === 'GP' || grade === 'G1'
        ? 112.0
        : grade === 'G2'
        ? 106.0
        : grade === 'G3'
        ? 101.0
        : grade === 'F1'
        ? 93.0
        : 83.0;

    // 7 cars or 9 cars (F2 typically 7 cars, G3/G1 9 cars)
    const numCars = grade === 'F2' && rng.next() > 0.4 ? 7 : 9;

    // Generate line groupings
    const lineStructures =
      numCars === 9
        ? [
            [3, 3, 3],
            [3, 3, 2, 1],
            [4, 3, 2],
            [2, 3, 2, 2],
            [3, 4, 1, 1],
          ]
        : [
            [3, 2, 2],
            [2, 2, 2, 1],
            [3, 3, 1],
            [4, 3],
          ];

    const chosenStruct = rng.choice(lineStructures);

    // Assign line IDs and positions to cars
    const carAssignments: { car_no: number; line_id: number; line_pos: number }[] = [];
    let currentCar = 1;
    chosenStruct.forEach((lineLength, lineIdx) => {
      const lineId = lineIdx + 1;
      for (let pos = 1; pos <= lineLength; pos++) {
        if (currentCar <= numCars) {
          carAssignments.push({
            car_no: currentCar,
            line_id: lineId,
            line_pos: pos,
          });
          currentCar++;
        }
      }
    });

    // Generate entries
    const entries: Entry[] = [];
    const riderPerf: { car_no: number; latentAbility: number }[] = [];

    // Pre-shuffle rider names
    const shuffledNames = [...RIDER_NAMES].sort(() => rng.next() - 0.5);

    for (let c = 0; c < numCars; c++) {
      const carNo = c + 1;
      const assign = carAssignments.find((a) => a.car_no === carNo) || {
        car_no: carNo,
        line_id: carNo,
        line_pos: 1,
      };

      const style: RiderStyle =
        assign.line_pos === 1
          ? rng.next() > 0.45
            ? '逃'
            : '捲'
          : rng.next() > 0.3
          ? '追'
          : '捲';

      const scoreVariation = rng.range(-6.5, 7.0);
      const score = Math.round((baseScore + scoreVariation) * 10) / 10;

      const backCount =
        style === '逃'
          ? Math.floor(rng.range(6, 22))
          : style === '捲'
          ? Math.floor(rng.range(2, 10))
          : Math.floor(rng.range(0, 4));

      const winRate =
        Math.round(
          Math.max(0.04, Math.min(0.55, 0.15 + (score - baseScore) * 0.02 + rng.range(-0.05, 0.05))) *
            1000
        ) / 1000;

      const top2Rate =
        Math.round(
          Math.max(winRate + 0.05, Math.min(0.72, winRate * 1.8 + rng.range(0.02, 0.08))) *
            1000
        ) / 1000;

      const top3Rate =
        Math.round(
          Math.max(top2Rate + 0.05, Math.min(0.88, top2Rate * 1.35 + rng.range(0.03, 0.1))) *
            1000
        ) / 1000;

      const gearRatio = Math.round(rng.range(3.85, 3.93) * 100) / 100;

      // Latent performance score for finish order simulation
      const lineLeaderBonus = assign.line_pos === 2 ? 1.5 : assign.line_pos === 1 ? 0.8 : -0.5;
      const latentAbility = score + lineLeaderBonus + rng.range(-5.0, 5.0);
      riderPerf.push({ car_no: carNo, latentAbility });

      entries.push({
        race_id: raceId,
        date: dateStr,
        grade,
        car_no: carNo,
        rider_name: shuffledNames[c % shuffledNames.length],
        rider_id: `R${1000 + (c % 30)}`,
        score,
        style,
        line_id: assign.line_id,
        line_pos: assign.line_pos,
        gear_ratio: gearRatio,
        win_rate: winRate,
        top2_rate: top2Rate,
        top3_rate: top3Rate,
        back_count: backCount,
      });
    }

    // Determine finish positions (1 to numCars)
    riderPerf.sort((a, b) => b.latentAbility - a.latentAbility);
    riderPerf.forEach((item, finishRank) => {
      const entry = entries.find((e) => e.car_no === item.car_no);
      if (entry) {
        entry.finish = finishRank + 1;
      }
    });

    // Generate Odds from Harville model with market noise and 25% takeout margin
    const carProbs = entries.map((e) => {
      // rough prior probability from score
      const p = Math.exp((e.score - baseScore) * 0.15);
      return { car_no: e.car_no, prob: p };
    });

    const sumP = carProbs.reduce((acc, c) => acc + c.prob, 0);
    const normCarProbs = carProbs.map((c) => ({
      car_no: c.car_no,
      prob: c.prob / sumP,
    }));

    const { byType } = computeAllCombinations(normCarProbs);
    const oddsList: OddsItem[] = [];

    // Keirin takeout rates: Exacta ~ 25%, Trifecta ~ 25%, Quinella ~ 25%, Trio ~ 25%, Wide ~ 25%
    const payoutRatio = 0.75;

    (['exacta', 'trifecta', 'quinella', 'trio', 'wide'] as BetType[]).forEach(
      (betType) => {
        const combos = byType[betType];
        combos.forEach((c) => {
          if (c.prob <= 0) return;
          // Fair odds = 1 / p
          // Market odds = (payoutRatio / p) with noise
          const noise = rng.range(0.88, 1.15);
          let rawOdds = (payoutRatio / c.prob) * noise;

          // Cap reasonable minimum and maximum
          if (rawOdds < 1.0) rawOdds = 1.0;
          if (rawOdds > 9999.0) rawOdds = 9999.0;

          oddsList.push({
            race_id: raceId,
            bet_type: betType,
            combo: c.combo,
            odds: Math.round(rawOdds * 10) / 10,
          });
        });
      }
    );

    const result = buildRealisticRaceResult(raceId, entries, oddsList, '晴 / 気温 20℃ / 風速 1.0m');

    const baseHour = r % 3 === 0 ? 15 : r % 4 === 0 ? 20 : 10;
    const timeSlot = baseHour === 15 ? 'ナイター' : baseHour === 20 ? 'ミッドナイト' : 'デイ';
    const minuteOffset = (raceNo - 1) * 25 + 15;
    const postH = baseHour + Math.floor(minuteOffset / 60);
    const postM = minuteOffset % 60;
    const postTime = `${String(postH).padStart(2, '0')}:${String(postM).padStart(2, '0')}`;
    const deadM = (postM - 5 + 60) % 60;
    const deadH = postM < 5 ? postH - 1 : postH;
    const deadlineTime = `${String(deadH).padStart(2, '0')}:${String(deadM).padStart(2, '0')}`;
    const raceTitle =
      raceNo === 12
        ? `${grade} 決勝`
        : raceNo >= 10
        ? `${grade} 準決勝`
        : raceNo >= 7
        ? 'S級 特選'
        : 'A級 予選';

    races.push({
      race_id: raceId,
      date: dateStr,
      grade,
      venue,
      race_no: raceNo,
      entries,
      odds: oddsList,
      status: 'finished',
      postTime,
      deadlineTime,
      raceTitle,
      timeSlot,
      result,
    });
  }

  return races;
}
