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
  XCircle,
  MinusCircle,
  Sliders,
  DollarSign,
  ChevronRight,
  Info,
  Award,
  Target,
  Clock,
  MapPin,
  Calendar,
} from 'lucide-react';
import { evaluateSingleRace } from '../services/predictionEvaluator';

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

  // Real-time evaluation against race results (的中・不的中・回収率・損益)
  const raceEvaluation = useMemo(() => {
    if (!selectedRace) return null;
    return evaluateSingleRace(
      selectedRace,
      model,
      {
        bet_type: selectedBetType,
        ev_threshold: evThreshold,
        min_prob: minProb,
        max_bets_per_race: maxBets,
      },
      100
    );
  }, [selectedRace, model, selectedBetType, evThreshold, minProb, maxBets]);

  const betTypeNames: Record<BetType, string> = {
    exacta: '2車単 (Exacta)',
    trifecta: '3連単 (Trifecta)',
    quinella: '2車複 (Quinella)',
    trio: '3連複 (Trio)',
    wide: 'ワイド (Wide)',
  };

  const isFinished = raceEvaluation?.status === 'finished' || !!selectedRace?.result;
  const isHit = raceEvaluation?.hitStatus === 'hit';
  const isMiss = raceEvaluation?.hitStatus === 'miss';
  const isSkip = raceEvaluation?.hitStatus === 'skip';

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
          {/* 選択レース総合詳細情報カード (Selected Race Information Card) */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-md space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-extrabold text-sm font-mono shadow-sm flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedRace.venue} {selectedRace.race_no}R</span>
                  </span>
                  <h3 className="text-sm font-bold text-slate-100">
                    {selectedRace.raceTitle || `${selectedRace.grade} 予選`}
                  </h3>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    selectedRace.grade === 'GP' || selectedRace.grade === 'G1'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : selectedRace.grade === 'G3'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  グレード: {selectedRace.grade}
                </span>

                {selectedRace.timeSlot && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-medium">
                    {selectedRace.timeSlot}
                  </span>
                )}

                <span className="text-[11px] text-slate-400 font-mono">
                  {selectedRace.date}
                </span>
              </div>

              {/* Deadline & Post Time Badges (〆切時刻 ＆ 発走予定時刻) */}
              <div className="flex flex-wrap items-center gap-2">
                {selectedRace.deadlineTime && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-950/80 border border-amber-600/70 text-amber-200 font-mono text-xs font-bold shadow-sm">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>〆切予定: <strong className="text-amber-300 text-sm">{selectedRace.deadlineTime}</strong></span>
                  </div>
                )}

                {selectedRace.postTime && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs">
                    <span>発走: <strong className="text-slate-100">{selectedRace.postTime}</strong></span>
                  </div>
                )}

                <span
                  className={`px-2.5 py-1 rounded text-xs font-bold border ${
                    selectedRace.status === 'closing_soon'
                      ? 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse'
                      : selectedRace.status === 'finished'
                      ? 'bg-slate-800 text-slate-300 border-slate-700'
                      : selectedRace.status === 'racing'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                      : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  }`}
                >
                  {selectedRace.status === 'closing_soon'
                    ? '締切直前 (発走待機中)'
                    : selectedRace.status === 'finished'
                    ? 'レース結果確定済'
                    : selectedRace.status === 'racing'
                    ? '発走中'
                    : '投票受付中 (発売中)'}
                </span>
              </div>
            </div>

            {/* Sub-info grid: Head count, Odds count, Weather */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">出走頭数</div>
                <div className="font-semibold text-slate-200 mt-0.5 font-mono">{selectedRace.entries.length}車立</div>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">オッズ登録数 ({selectedBetType.toUpperCase()})</div>
                <div className="font-semibold text-emerald-400 mt-0.5 font-mono">{oddsMap.size || selectedRace.odds.length}通り</div>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">天候・コンディション</div>
                <div className="font-semibold text-slate-200 mt-0.5">{selectedRace.result?.weather || '天候: 晴 / 風速 1.0m'}</div>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">レース識別ID</div>
                <div className="font-mono text-slate-400 mt-0.5 text-[11px] truncate">{selectedRace.race_id}</div>
              </div>
            </div>
          </div>

          {/* Line Formation Diagram */}
          <RaceLineDiagram entries={selectedRace.entries} />

          {/* Confirmed Race Result & Prediction Hit/Miss Judgment Box (If finished) */}
          {isFinished && raceEvaluation && (
            <div
              className={`border rounded-lg p-4 transition-all shadow-lg ${
                isHit
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-emerald-950/40 text-emerald-100 ring-1 ring-emerald-500/50'
                  : isMiss
                  ? 'bg-rose-950/30 border-rose-600/70 shadow-rose-950/30 text-rose-100'
                  : 'bg-slate-900 border-slate-700 text-slate-200'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
                      isHit
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/60'
                        : isMiss
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {isHit ? (
                      <Award className="w-7 h-7" />
                    ) : isMiss ? (
                      <XCircle className="w-7 h-7" />
                    ) : (
                      <MinusCircle className="w-7 h-7 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
                        【レース結果確定 ＆ 予想的中判断】
                      </span>
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded font-sans ${
                          isHit
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : isMiss
                            ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-800 text-amber-300 border border-slate-700'
                        }`}
                      >
                        {isHit
                          ? '🎯【 的中 (HIT) 】'
                          : isMiss
                          ? '❌【 不的中 (MISS) 】'
                          : '⏸【 見送り (SKIP - 資金防衛) 】'}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-300">
                      {isHit
                        ? `AI推奨買い目が見事的中！ 確定的中目「${raceEvaluation.winningCombo}」を捉え、払戻金 ${raceEvaluation.totalReturn.toLocaleString()}円 を獲得しました（純利益 +${raceEvaluation.profit.toLocaleString()}円、レース回収率 ${raceEvaluation.recoveryRate.toFixed(1)}%）。`
                        : isMiss
                        ? `確定的中目は「${raceEvaluation.winningCombo}」（公式配当 ${(raceEvaluation.officialPayout || 0).toLocaleString()}円）でした。投資額 ${raceEvaluation.betCost}円 に対し不的中（損益 -${raceEvaluation.betCost}円）。`
                        : `AIの期待値判定により事前見送りを適用。確定的中目は「${raceEvaluation.winningCombo}」でしたが、0円投資により損失を回避しました。`}
                    </p>
                  </div>
                </div>

                {/* Race Quick PnL Stats Badge */}
                <div className="flex items-center gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs font-mono">
                  <div className="px-2 border-r border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400">投資金額</div>
                    <div className="font-bold text-slate-200">
                      {raceEvaluation.betCost}円
                    </div>
                  </div>
                  <div className="px-2 border-r border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400">払戻金</div>
                    <div className="font-bold text-emerald-400">
                      {raceEvaluation.totalReturn}円
                    </div>
                  </div>
                  <div className="px-2 border-r border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400">純損益</div>
                    <div
                      className={`font-bold ${
                        raceEvaluation.profit > 0
                          ? 'text-emerald-400'
                          : raceEvaluation.profit < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {raceEvaluation.profit > 0 ? '+' : ''}
                      {raceEvaluation.profit}円
                    </div>
                  </div>
                  <div className="px-2 text-center">
                    <div className="text-[10px] text-slate-400">回収率</div>
                    <div
                      className={`font-bold text-sm ${
                        raceEvaluation.recoveryRate >= 100
                          ? 'text-emerald-400'
                          : raceEvaluation.betCost > 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {raceEvaluation.betCost > 0
                        ? `${raceEvaluation.recoveryRate.toFixed(1)}%`
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Confirmed Ranks & Payouts mini table */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* 確定着順 (1-3着) */}
                <div className="p-2.5 bg-slate-950/90 rounded border border-slate-800/80 space-y-1.5 font-sans">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>確定着順 (上位入線結果)</span>
                    {selectedRace.result?.weather && (
                      <span className="text-[10px] text-slate-500 font-normal">
                        天候: {selectedRace.result.weather}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    {raceEvaluation.top3 && (
                      <>
                        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-amber-500/40 text-amber-300 font-bold">
                          <span>1着</span>
                          <span className="text-base font-extrabold">{raceEvaluation.top3[0]}番</span>
                        </div>
                        <span className="text-slate-500">-</span>
                        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-blue-500/40 text-blue-300 font-bold">
                          <span>2着</span>
                          <span className="text-base font-extrabold">{raceEvaluation.top3[1]}番</span>
                        </div>
                        <span className="text-slate-500">-</span>
                        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-cyan-500/40 text-cyan-300 font-bold">
                          <span>3着</span>
                          <span className="text-base font-extrabold">{raceEvaluation.top3[2]}番</span>
                        </div>
                      </>
                    )}
                  </div>
                  {selectedRace.result?.kimarite1st && (
                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center gap-3">
                      <span>1着決まり手: <strong className="text-amber-300">{selectedRace.result.kimarite1st}</strong></span>
                      {selectedRace.result.kimarite2nd && (
                        <span>2着: <strong className="text-slate-300">{selectedRace.result.kimarite2nd}</strong></span>
                      )}
                    </div>
                  )}
                </div>

                {/* 公式払戻金リスト */}
                <div className="p-2.5 bg-slate-950/90 rounded border border-slate-800/80 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>公式払戻金 ({betTypeNames[selectedBetType]})</span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      的中目: {raceEvaluation.winningCombo}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    {selectedRace.result?.payouts?.slice(0, 4).map((p) => (
                      <div
                        key={`${p.bet_type}-${p.combo}`}
                        className={`px-2 py-1 rounded border text-[11px] ${
                          p.bet_type === selectedBetType
                            ? 'bg-emerald-950/50 border-emerald-500/80 text-emerald-200 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="text-slate-400 uppercase mr-1">{p.bet_type}:</span>
                        <span>{p.combo}</span>
                        <span className="ml-1.5 text-slate-100 font-semibold">{p.payout.toLocaleString()}円</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

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
                  {recommendedBets.map((bet, idx) => {
                    const evaluatedBet = raceEvaluation?.bets?.find((b) => b.combo === bet.combo);
                    const betIsHit = evaluatedBet?.isHit;

                    return (
                      <div
                        key={bet.combo}
                        className={`rounded p-2.5 flex flex-col justify-between transition-all ${
                          betIsHit
                            ? 'bg-emerald-950/80 border-2 border-emerald-400 shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-400/40'
                            : isFinished
                            ? 'bg-slate-900/90 border border-slate-800 opacity-80'
                            : 'bg-slate-900/90 border border-emerald-600/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold text-slate-100 bg-slate-800 px-1.5 py-0.5 rounded">
                              #{idx + 1}
                            </span>
                            <span className="text-sm font-mono font-bold text-emerald-400 tracking-wider">
                              {bet.combo}
                            </span>
                          </div>
                          {isFinished && (
                            <span
                              className={`text-[10px] font-sans font-bold px-1.5 py-0.2 rounded ${
                                betIsHit
                                  ? 'bg-emerald-500 text-white shadow-sm'
                                  : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {betIsHit ? '的中 🎯' : '不的中'}
                            </span>
                          )}
                        </div>

                        {betIsHit && evaluatedBet?.returnAmount && (
                          <div className="mt-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-bold px-2 py-0.5 rounded text-center">
                            払戻: +{evaluatedBet.returnAmount.toLocaleString()}円
                          </div>
                        )}

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
                    );
                  })}
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
