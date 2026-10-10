/**
 * Race Prediction Interface (predict.py)
 * Computes calibrated 1st place probabilities, Harville combination odds,
 * Expected Value (EV = P * Odds), and outputs the definitive "BUY" / "SKIP" verdict.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  BetType,
  CombinationProb,
  RaceGroup,
  StrategyParams,
} from '../types/keirin';
import { TrainedModel, predictRiderWinProbabilities } from '../services/modelEngine';
import { computeAllCombinations } from '../services/harville';
import { RaceLineDiagram, CAR_COLORS } from './RaceLineDiagram';
import { RaceSelectorBar } from './RaceSelectorBar';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  DollarSign,
  ChevronRight,
  Info,
} from 'lucide-react';

export interface EvaluatedCombination extends CombinationProb {
  odds: number;
  ev: number;
  isQualifying: boolean;
}

interface PredictorViewProps {
  races: RaceGroup[];
  model: TrainedModel;
  activeStrategy: StrategyParams;
  onUpdateStrategy: (strategy: StrategyParams) => void;
  initialRaceId?: string;
  selectedRaceId?: string;
  onSelectRace?: (raceId: string) => void;
}

export const PredictorView: React.FC<PredictorViewProps> = ({
  races,
  model,
  activeStrategy,
  onUpdateStrategy,
  initialRaceId,
  selectedRaceId: externalSelectedRaceId,
  onSelectRace,
}) => {
  const [internalSelectedRaceId, setInternalSelectedRaceId] = useState<string>(
    externalSelectedRaceId || initialRaceId || (races.length > 0 ? races[0].race_id : '')
  );

  const activeSelectedRaceId = externalSelectedRaceId || internalSelectedRaceId;

  const handleSelectRace = (raceId: string) => {
    setInternalSelectedRaceId(raceId);
    if (onSelectRace) {
      onSelectRace(raceId);
    }
  };

  useEffect(() => {
    if (initialRaceId) {
      handleSelectRace(initialRaceId);
    }
  }, [initialRaceId]);

  useEffect(() => {
    if (externalSelectedRaceId) {
      setInternalSelectedRaceId(externalSelectedRaceId);
    }
  }, [externalSelectedRaceId]);
  const [selectedBetType, setSelectedBetType] = useState<BetType>(activeStrategy.bet_type);
  const [evThreshold, setEvThreshold] = useState<number>(activeStrategy.ev_threshold);
  const [minProb, setMinProb] = useState<number>(activeStrategy.min_prob);
  const [maxBets, setMaxBets] = useState<number>(activeStrategy.max_bets_per_race);
  const [showAllCombos, setShowAllCombos] = useState<boolean>(false);

  const selectedRace = useMemo(() => {
    return races.find((r) => r.race_id === activeSelectedRaceId) || races[0];
  }, [races, activeSelectedRaceId]);

  // Compute rider probabilities
  const riderPredictions = useMemo(() => {
    if (!selectedRace || !selectedRace.entries.length) return [];
    const rawProbs = predictRiderWinProbabilities(model, selectedRace.entries);
    const sorted = [...rawProbs].sort((a, b) => b.prob - a.prob);

    return selectedRace.entries.map((entry) => {
      const pred = rawProbs.find((p) => p.car_no === entry.car_no);
      const prob = pred ? pred.prob : 1.0 / selectedRace.entries.length;
      const rank = sorted.findIndex((p) => p.car_no === entry.car_no) + 1;
      return {
        ...entry,
        win_prob: prob,
        break_even_odds: prob > 0 ? Math.round((1.0 / prob) * 10) / 10 : 9999.0,
        rank,
      };
    });
  }, [selectedRace, model]);

  // Compute Harville combinations
  const allCombinations: {
    byType: Record<BetType, CombinationProb[]>;
    sumChecks: Record<BetType, number>;
  } = useMemo(() => {
    if (!riderPredictions.length) {
      return {
        byType: {
          exacta: [],
          trifecta: [],
          quinella: [],
          trio: [],
          wide: [],
        },
        sumChecks: {
          exacta: 0,
          trifecta: 0,
          quinella: 0,
          trio: 0,
          wide: 0,
        },
      };
    }
    const cars = riderPredictions.map((r) => ({ car_no: r.car_no, prob: r.win_prob }));
    return computeAllCombinations(cars);
  }, [riderPredictions]);

  // Odds lookup map for active bet type
  const oddsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!selectedRace) return map;
    selectedRace.odds
      .filter((o) => o.bet_type === selectedBetType)
      .forEach((o) => map.set(o.combo, o.odds));
    return map;
  }, [selectedRace, selectedBetType]);

  // Evaluated combos with EV
  const evaluatedCombos: EvaluatedCombination[] = useMemo(() => {
    const combos = allCombinations.byType[selectedBetType] || [];
    return combos
      .map((c: CombinationProb): EvaluatedCombination => {
        const odds = oddsMap.get(c.combo) || 0;
        const ev = odds > 0 ? c.prob * odds : 0;
        return {
          ...c,
          odds,
          ev,
          isQualifying: ev >= evThreshold && c.prob >= minProb,
        };
      })
      .sort((a: EvaluatedCombination, b: EvaluatedCombination) => (b.ev || 0) - (a.ev || 0));
  }, [allCombinations, selectedBetType, oddsMap, evThreshold, minProb]);

  // Recommended bets based on active parameters
  const recommendedBets: EvaluatedCombination[] = useMemo(() => {
    const qualifying = evaluatedCombos.filter((c: EvaluatedCombination) => c.isQualifying);
    return qualifying.slice(0, maxBets);
  }, [evaluatedCombos, maxBets]);

  const isBuy = recommendedBets.length > 0;

  const betTypeNames: Record<BetType, string> = {
    exacta: '2車単 (Exacta)',
    trifecta: '3連単 (Trifecta)',
    quinella: '2車複 (Quinella)',
    trio: '3連複 (Trio)',
    wide: 'ワイド (Wide)',
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Race Selector Bar with full Venue and 1R-12R selection */}
      <RaceSelectorBar
        races={races}
        selectedRaceId={activeSelectedRaceId}
        onSelectRace={handleSelectRace}
        title="レース一覧 ＆ AI予想・出走表連動選択"
      />

      {selectedRace && (
        <>
          {/* Line Formation Diagram */}
          <RaceLineDiagram entries={selectedRace.entries} />

          {/* Core Decision Verdict Banner (Buy / Skip) */}
          <div
            className={`border rounded-lg p-4 transition-all ${
              isBuy
                ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100 shadow-lg shadow-emerald-950/20'
                : 'bg-amber-950/30 border-amber-600/60 text-amber-100 shadow-lg shadow-amber-950/20'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isBuy ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                  }`}
                >
                  {isBuy ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <AlertTriangle className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-75">
                      AI期待値判定
                    </span>
                    <span
                      className={`text-lg font-bold px-2 py-0.5 rounded text-xs ${
                        isBuy ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {isBuy ? '【 買う (BUY) 】' : '【 見送り (SKIP) 】'}
                    </span>
                  </div>
                  <p className="text-xs mt-1 text-slate-300">
                    {isBuy
                      ? `券種「${betTypeNames[selectedBetType]}」において、期待値しきい値 EV ≧ ${evThreshold.toFixed(
                          1
                        )} を満たす上位 ${recommendedBets.length} 点の買い目を抽出しました。`
                      : `券種「${betTypeNames[selectedBetType]}」において、期待値 EV ≧ ${evThreshold.toFixed(
                          1
                        )} または最低確率 ≧ ${(minProb * 100).toFixed(
                          0
                        )}% を満たす買い目が存在しないため、回収率防衛のため見送りを判定します。`}
                  </p>
                </div>
              </div>

              {/* Quick Strategy Parameters inline */}
              <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-2 rounded border border-slate-800 text-xs text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400">券種:</span>
                  <select
                    value={selectedBetType}
                    onChange={(e) => setSelectedBetType(e.target.value as BetType)}
                    className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200"
                  >
                    <option value="exacta">2車単</option>
                    <option value="trifecta">3連単</option>
                    <option value="quinella">2車複</option>
                    <option value="trio">3連複</option>
                    <option value="wide">ワイド</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-slate-400">EV閾値:</span>
                  <select
                    value={evThreshold}
                    onChange={(e) => setEvThreshold(parseFloat(e.target.value))}
                    className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 font-mono"
                  >
                    {[1.0, 1.1, 1.2, 1.3, 1.5, 2.0].map((v) => (
                      <option key={v} value={v}>
                        {v.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 ml-2">
                  <span className="text-slate-400">上限点数:</span>
                  <select
                    value={maxBets}
                    onChange={(e) => setMaxBets(parseInt(e.target.value, 10))}
                    className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-200 font-mono"
                  >
                    {[1, 2, 3, 5, 8].map((v) => (
                      <option key={v} value={v}>
                        {v}点
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Recommended Bets Cards (if BUY) */}
            {isBuy && (
              <div className="mt-4 pt-3 border-t border-emerald-800/40">
                <div className="text-xs font-semibold text-emerald-200 mb-2 flex items-center justify-between">
                  <span>推奨買い目一覧 (1点100円 均等買い)</span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    購入金額: {recommendedBets.length * 100}円
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {recommendedBets.map((bet, idx) => (
                    <div
                      key={bet.combo}
                      className="bg-slate-900/90 border border-emerald-600/50 rounded p-2.5 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-100 bg-slate-800 px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <span className="text-sm font-mono font-bold text-emerald-400 tracking-wider">
                          {bet.combo}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11px]">
                        <div className="flex justify-between text-slate-400">
                          <span>推定確率:</span>
                          <span className="font-mono text-slate-200">
                            {(bet.prob * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>確定オッズ:</span>
                          <span className="font-mono text-slate-200 font-semibold">
                            {bet.odds?.toFixed(1) || '-'}倍
                          </span>
                        </div>
                        <div className="flex justify-between border-t border-slate-800 pt-1 text-emerald-300 font-medium">
                          <span>期待値 (EV):</span>
                          <span className="font-mono font-bold">
                            {bet.ev?.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Rider Analysis Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-200">
                出走選手・AI推定1着確率一覧 (温度補正 T={model.optimalTemperature.toFixed(2)})
              </h3>
              <span className="text-[11px] text-slate-400">
                損益分岐オッズ = 1 / 推定確率
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-2 px-2 text-center">車番</th>
                    <th className="py-2 px-2">選手名</th>
                    <th className="py-2 px-2 text-right">競走得点</th>
                    <th className="py-2 px-2 text-center">脚質</th>
                    <th className="py-2 px-2 text-center">ライン</th>
                    <th className="py-2 px-2 text-right">ギヤ</th>
                    <th className="py-2 px-2 text-right">勝率</th>
                    <th className="py-2 px-2 text-right">3連対率</th>
                    <th className="py-2 px-2 text-right">B数</th>
                    <th className="py-2 px-2 text-right text-emerald-400 font-bold">
                      1着確率 P(1st)
                    </th>
                    <th className="py-2 px-2 text-right text-amber-400 font-bold">
                      損益分岐オッズ
                    </th>
                    <th className="py-2 px-2 text-center">着順(実績)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {riderPredictions.map((r) => {
                    const carColor = CAR_COLORS[r.car_no] || CAR_COLORS[1];

                    return (
                      <tr
                        key={r.car_no}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-1.5 px-2 text-center font-sans">
                          <span
                            className={`inline-block w-5 h-5 rounded-full font-bold text-[11px] leading-5 text-center shadow-sm border ${carColor.bg} ${carColor.text} ${carColor.border}`}
                          >
                            {r.car_no}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-sans font-medium text-slate-200">
                          {r.rider_name || `車番 ${r.car_no}`}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-200 font-bold">
                          {r.score.toFixed(1)}
                        </td>
                        <td className="py-1.5 px-2 text-center font-sans">
                          <span
                            className={
                              r.style === '逃'
                                ? 'text-amber-400 font-semibold'
                                : r.style === '捲'
                                ? 'text-cyan-400'
                                : 'text-slate-400'
                            }
                          >
                            {r.style}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-400">
                          {r.line_id} ({r.line_pos}番手)
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-400">
                          {r.gear_ratio.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-300">
                          {(r.win_rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-300">
                          {(r.top3_rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-400">
                          {r.back_count}
                        </td>
                        <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">
                          {(r.win_prob * 100).toFixed(2)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-amber-400 font-bold">
                          {r.break_even_odds.toFixed(1)}倍
                        </td>
                        <td className="py-1.5 px-2 text-center font-sans">
                          {r.finish ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                r.finish === 1
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : r.finish <= 3
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'text-slate-500'
                              }`}
                            >
                              {r.finish}着
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Full Combination Odds & Expected Value Explorer */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-200">
                  {betTypeNames[selectedBetType]} 全買い目・期待値一覧 ({evaluatedCombos.length}通り)
                </h3>
                <span className="text-[11px] text-slate-500">
                  確率合計: {allCombinations.sumChecks[selectedBetType]?.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => setShowAllCombos(!showAllCombos)}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {showAllCombos ? '上位15件のみ表示' : '全件展開表示'}
              </button>
            </div>

            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0">
                  <tr>
                    <th className="py-2 px-2">買い目</th>
                    <th className="py-2 px-2 text-right">推定確率 (Harville)</th>
                    <th className="py-2 px-2 text-right">損益分岐オッズ</th>
                    <th className="py-2 px-2 text-right">確定オッズ</th>
                    <th className="py-2 px-2 text-right">期待値 (EV)</th>
                    <th className="py-2 px-2 text-center">判定</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(showAllCombos ? evaluatedCombos : evaluatedCombos.slice(0, 15)).map((combo: EvaluatedCombination) => {
                    const isHighEV = combo.ev >= evThreshold;

                    return (
                      <tr
                        key={combo.combo}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          combo.isQualifying ? 'bg-emerald-950/20' : ''
                        }`}
                      >
                        <td className="py-1.5 px-2 font-bold text-slate-200">
                          {combo.combo}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-300">
                          {(combo.prob * 100).toFixed(2)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-400">
                          {combo.break_even_odds.toFixed(1)}倍
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-100 font-semibold">
                          {combo.odds > 0 ? `${combo.odds.toFixed(1)}倍` : '未登録'}
                        </td>
                        <td
                          className={`py-1.5 px-2 text-right font-bold ${
                            isHighEV ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {combo.ev.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-center font-sans text-[11px]">
                          {combo.isQualifying ? (
                            <span className="text-emerald-400 font-semibold">
                              購入候補
                            </span>
                          ) : (
                            <span className="text-slate-500">条件外</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
