/**
 * Harville Combinatorial Probability Engine for Keirin
 * Calculates probabilities for:
 * - 2車単 (exacta)
 * - 3連単 (trifecta)
 * - 2車複 (quinella)
 * - 3連複 (trio)
 * - ワイド (wide)
 *
 * Verifies mathematical integrity:
 * - Sum(exacta) = 1.0
 * - Sum(trifecta) = 1.0
 * - Sum(quinella) = 1.0
 * - Sum(trio) = 1.0
 * - Sum(wide) = 3.0
 */

import { BetType, CombinationProb } from '../types/keirin';

export interface CarProb {
  car_no: number;
  prob: number; // P(1st)
}

export function computeExactaProbs(cars: CarProb[]): Map<string, number> {
  const result = new Map<string, number>();
  const n = cars.length;

  for (let i = 0; i < n; i++) {
    const c1 = cars[i];
    const denom = 1.0 - c1.prob;
    if (denom <= 1e-9) continue;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const c2 = cars[j];
      const p = c1.prob * (c2.prob / denom);
      result.set(`${c1.car_no}-${c2.car_no}`, p);
    }
  }

  return result;
}

export function computeTrifectaProbs(cars: CarProb[]): Map<string, number> {
  const result = new Map<string, number>();
  const n = cars.length;

  for (let i = 0; i < n; i++) {
    const c1 = cars[i];
    const denom1 = 1.0 - c1.prob;
    if (denom1 <= 1e-9) continue;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const c2 = cars[j];
      const denom2 = 1.0 - c1.prob - c2.prob;
      if (denom2 <= 1e-9) continue;

      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue;
        const c3 = cars[k];
        const p = c1.prob * (c2.prob / denom1) * (c3.prob / denom2);
        result.set(`${c1.car_no}-${c2.car_no}-${c3.car_no}`, p);
      }
    }
  }

  return result;
}

export function computeQuinellaProbs(
  exactaProbs: Map<string, number>,
  cars: CarProb[]
): Map<string, number> {
  const result = new Map<string, number>();
  const n = cars.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c1 = Math.min(cars[i].car_no, cars[j].car_no);
      const c2 = Math.max(cars[i].car_no, cars[j].car_no);
      const p1 = exactaProbs.get(`${c1}-${c2}`) || 0;
      const p2 = exactaProbs.get(`${c2}-${c1}`) || 0;
      result.set(`${c1}-${c2}`, p1 + p2);
    }
  }

  return result;
}

export function computeTrioProbs(
  trifectaProbs: Map<string, number>,
  cars: CarProb[]
): Map<string, number> {
  const result = new Map<string, number>();
  const n = cars.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const sorted = [cars[i].car_no, cars[j].car_no, cars[k].car_no].sort(
          (a, b) => a - b
        );
        const [a, b, c] = sorted;

        // Sum of all 6 permutations
        const pSum =
          (trifectaProbs.get(`${a}-${b}-${c}`) || 0) +
          (trifectaProbs.get(`${a}-${c}-${b}`) || 0) +
          (trifectaProbs.get(`${b}-${a}-${c}`) || 0) +
          (trifectaProbs.get(`${b}-${c}-${a}`) || 0) +
          (trifectaProbs.get(`${c}-${a}-${b}`) || 0) +
          (trifectaProbs.get(`${c}-${b}-${a}`) || 0);

        result.set(`${a}-${b}-${c}`, pSum);
      }
    }
  }

  return result;
}

export function computeWideProbs(
  trifectaProbs: Map<string, number>,
  cars: CarProb[]
): Map<string, number> {
  const result = new Map<string, number>();
  const n = cars.length;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c1 = Math.min(cars[i].car_no, cars[j].car_no);
      const c2 = Math.max(cars[i].car_no, cars[j].car_no);

      let totalP = 0;
      // Sum over all third cars k
      for (let k = 0; k < n; k++) {
        const c3 = cars[k].car_no;
        if (c3 === c1 || c3 === c2) continue;

        // 6 permutations of (c1, c2, c3)
        totalP += trifectaProbs.get(`${c1}-${c2}-${c3}`) || 0;
        totalP += trifectaProbs.get(`${c1}-${c3}-${c2}`) || 0;
        totalP += trifectaProbs.get(`${c3}-${c1}-${c2}`) || 0;
        totalP += trifectaProbs.get(`${c2}-${c1}-${c3}`) || 0;
        totalP += trifectaProbs.get(`${c2}-${c3}-${c1}`) || 0;
        totalP += trifectaProbs.get(`${c3}-${c2}-${c1}`) || 0;
      }

      result.set(`${c1}-${c2}`, totalP);
    }
  }

  return result;
}

/**
 * Computes all combination probabilities for a race and validates sums.
 */
export function computeAllCombinations(cars: CarProb[]): {
  byType: Record<BetType, CombinationProb[]>;
  sumChecks: Record<BetType, number>;
} {
  // Normalize P(1st) to sum to 1.0
  const sumP = cars.reduce((acc, c) => acc + c.prob, 0);
  const normalizedCars = cars.map((c) => ({
    car_no: c.car_no,
    prob: sumP > 0 ? c.prob / sumP : 1.0 / cars.length,
  }));

  const exactaMap = computeExactaProbs(normalizedCars);
  const trifectaMap = computeTrifectaProbs(normalizedCars);
  const quinellaMap = computeQuinellaProbs(exactaMap, normalizedCars);
  const trioMap = computeTrioProbs(trifectaMap, normalizedCars);
  const wideMap = computeWideProbs(trifectaMap, normalizedCars);

  const mapToCombos = (map: Map<string, number>, bet_type: BetType): CombinationProb[] => {
    return Array.from(map.entries()).map(([combo, prob]) => ({
      bet_type,
      combo,
      prob,
      break_even_odds: prob > 0 ? Math.round((1.0 / prob) * 10) / 10 : 9999.0,
    }));
  };

  const byType: Record<BetType, CombinationProb[]> = {
    exacta: mapToCombos(exactaMap, 'exacta'),
    trifecta: mapToCombos(trifectaMap, 'trifecta'),
    quinella: mapToCombos(quinellaMap, 'quinella'),
    trio: mapToCombos(trioMap, 'trio'),
    wide: mapToCombos(wideMap, 'wide'),
  };

  const sumChecks: Record<BetType, number> = {
    exacta: byType.exacta.reduce((s, c) => s + c.prob, 0),
    trifecta: byType.trifecta.reduce((s, c) => s + c.prob, 0),
    quinella: byType.quinella.reduce((s, c) => s + c.prob, 0),
    trio: byType.trio.reduce((s, c) => s + c.prob, 0),
    wide: byType.wide.reduce((s, c) => s + c.prob, 0),
  };

  return { byType, sumChecks };
}
