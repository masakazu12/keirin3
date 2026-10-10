/**
 * Prediction Results, Hit/Miss Judgment & PnL Analytics Interface
 * Displays:
 * 1. AI prediction Hit/Miss (的中・不的中) judgments
 * 2. Hit rate (的中率), Recovery rate (回収率), and Net profit/loss (損益)
 * 3. Venue-by-venue (各開催地毎) breakdown of hit rate, recovery rate, and profit/loss
 */

import React, { useState, useMemo } from 'react';
import {
  BetType,
  RaceGroup,
  StrategyParams,
  DatasetEvaluationSummary,
  RacePredictionEvaluation,
  VenueEvaluationStat,
} from '../types/keirin';
import { TrainedModel } from '../services/modelEngine';
import { evaluateDataset } from '../services/predictionEvaluator';
import {
  Award,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Percent,
  CheckCircle2,
  XCircle,
  MinusCircle,
  MapPin,
  Sliders,
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

interface PredictionResultsViewProps {
  races: RaceGroup[];
  model: TrainedModel;
  activeStrategy: StrategyParams;
  onUpdateStrategy?: (strategy: StrategyParams) => void;
  onSelectRaceForDetail?: (raceId: string) => void;
}

export const PredictionResultsView: React.FC<PredictionResultsViewProps> = ({
  races,
  model,
  activeStrategy,
  onUpdateStrategy,
  onSelectRaceForDetail,
}) => {
  // Strategy settings within the view
  const [betType, setBetType] = useState<BetType>(activeStrategy.bet_type);
  const [evThreshold, setEvThreshold] = useState<number>(activeStrategy.ev_threshold);
  const [minProb, setMinProb] = useState<number>(activeStrategy.min_prob);
  const [maxBets, setMaxBets] = useState<number>(activeStrategy.max_bets_per_race);
  const [unitBet, setUnitBet] = useState<number>(100); // 1点あたりの賭け金 (円)

  // Filtering states
  const [selectedVenueFilter, setSelectedVenueFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'hit' | 'miss' | 'skip' | 'bought'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [venueSortBy, setVenueSortBy] = useState<'recovery' | 'profit' | 'hitRate' | 'races'>('recovery');
  const [expandedRaceId, setExpandedRaceId] = useState<string | null>(null);

  // Compute dataset evaluation summary
  const currentStrategy: StrategyParams = useMemo(
    () => ({
      bet_type: betType,
      ev_threshold: evThreshold,
      min_prob: minProb,
      max_bets_per_race: maxBets,
    }),
    [betType, evThreshold, minProb, maxBets]
  );

  const summary: DatasetEvaluationSummary = useMemo(() => {
    return evaluateDataset(races, model, currentStrategy, unitBet);
  }, [races, model, currentStrategy, unitBet]);

  // Sync to parent strategy if changed
  const handleApplyStrategy = () => {
    if (onUpdateStrategy) {
      onUpdateStrategy(currentStrategy);
    }
  };

  // Sorted Venue statistics
  const sortedVenueStats: VenueEvaluationStat[] = useMemo(() => {
    const list = [...summary.venueStats];
    switch (venueSortBy) {
      case 'recovery':
        return list.sort((a, b) => b.recoveryRate - a.recoveryRate);
      case 'profit':
        return list.sort((a, b) => b.netProfit - a.netProfit);
      case 'hitRate':
        return list.sort((a, b) => b.hitRate - a.hitRate);
      case 'races':
        return list.sort((a, b) => b.totalRaces - a.totalRaces);
      default:
        return list;
    }
  }, [summary.venueStats, venueSortBy]);

  // Filtered race evaluations for ledger table
  const filteredEvaluations = useMemo(() => {
    return summary.evaluations.filter((item) => {
      // Venue filter
      if (selectedVenueFilter !== 'all' && item.venue !== selectedVenueFilter) {
        return false;
      }
      // Result filter
      if (resultFilter === 'hit' && item.hitStatus !== 'hit') return false;
      if (resultFilter === 'miss' && item.hitStatus !== 'miss') return false;
      if (resultFilter === 'skip' && item.hitStatus !== 'skip') return false;
      if (resultFilter === 'bought' && (item.hitStatus !== 'hit' && item.hitStatus !== 'miss')) return false;

      // Text query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchVenue = item.venue.toLowerCase().includes(query);
        const matchId = item.race_id.toLowerCase().includes(query);
        const matchTitle = (item.raceTitle || '').toLowerCase().includes(query);
        if (!matchVenue && !matchId && !matchTitle) return false;
      }

      return true;
    });
  }, [summary.evaluations, selectedVenueFilter, resultFilter, searchQuery]);

  // Download ledger CSV
  const handleExportLedgerCsv = () => {
    const headers = [
      'レースID',
      '日付',
      '開催地',
      'レース番号',
      'グレード',
      'ステータス',
      'AI判定',
      '的中判定',
      '確定着順(1-2-3)',
      '的中目',
      '推奨買い目',
      '購入点数',
      '投資金額(円)',
      '払戻金額(円)',
      '損益(円)',
      '回収率(%)',
    ];

    const rows = summary.evaluations.map((item) => [
      item.race_id,
      item.date,
      item.venue,
      `${item.race_no}R`,
      item.grade,
      item.status,
      item.verdict,
      item.hitStatus === 'hit'
        ? '的中'
        : item.hitStatus === 'miss'
        ? '不的中'
        : item.hitStatus === 'skip'
        ? '見送り'
        : '未確定',
      item.top3 ? item.top3.join('-') : '',
      item.winningCombo || '',
      item.bets.map((b) => b.combo).join(' / '),
      item.totalBets,
      item.betCost,
      item.totalReturn,
      item.profit,
      item.recoveryRate.toFixed(1),
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `keirin_prediction_results_${betType}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const betTypeNames: Record<BetType, string> = {
    exacta: '2車単 (Exacta)',
    trifecta: '3連単 (Trifecta)',
    quinella: '2車複 (Quinella)',
    trio: '3連複 (Trio)',
    wide: 'ワイド (Wide)',
  };

  const isNetProfit = summary.netProfit >= 0;

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Banner: Overview & Context */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">
                  予想結果 的中・不的中判定 ＆ 収支分析ダッシュボード
                </h2>
                <span className="text-[10px] bg-slate-800 text-emerald-400 px-2 py-0.5 rounded font-mono font-semibold border border-slate-700">
                  {betTypeNames[betType]}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                AIモデルの推奨買い目と公式確定結果（1着〜3着・払戻金）を自動照合し、的中率・回収率・損益および開催地別の運用実績をリアルタイム集計します。
              </p>
            </div>
          </div>

          {/* Quick Strategy Parameter Switcher */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">券種:</span>
              <select
                value={betType}
                onChange={(e) => setBetType(e.target.value as BetType)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-medium"
              >
                <option value="exacta">2車単</option>
                <option value="trifecta">3連単</option>
                <option value="quinella">2車複</option>
                <option value="trio">3連複</option>
                <option value="wide">ワイド</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">EV閾値:</span>
              <select
                value={evThreshold}
                onChange={(e) => setEvThreshold(parseFloat(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
              >
                {[1.0, 1.1, 1.2, 1.3, 1.5, 2.0].map((v) => (
                  <option key={v} value={v}>
                    ≧ {v.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">上限点数:</span>
              <select
                value={maxBets}
                onChange={(e) => setMaxBets(parseInt(e.target.value, 10))}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
              >
                {[1, 2, 3, 5, 8].map((v) => (
                  <option key={v} value={v}>
                    {v}点
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">1点賭金:</span>
              <select
                value={unitBet}
                onChange={(e) => setUnitBet(parseInt(e.target.value, 10))}
                className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
              >
                <option value="100">100円</option>
                <option value="200">200円</option>
                <option value="500">500円</option>
                <option value="1000">1,000円</option>
              </select>
            </div>

            <button
              onClick={handleApplyStrategy}
              title="この戦略設定をAI標準予想パラメータに適用"
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold transition-colors flex items-center gap-1 ml-auto"
            >
              <RefreshCw className="w-3 h-3" />
              <span>適用</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards: 的中率, 回収率, 損益, 投資額 & 払戻額 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {/* 1. 回収率 (ROI) */}
        <div
          className={`border rounded-lg p-3 flex flex-col justify-between transition-all ${
            summary.recoveryRate >= 100
              ? 'bg-emerald-950/30 border-emerald-500/50 shadow-sm shadow-emerald-950/40'
              : 'bg-rose-950/20 border-rose-500/40 shadow-sm shadow-rose-950/30'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              回収率 (ROI)
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                summary.recoveryRate >= 100
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {summary.recoveryRate >= 100 ? '黒字' : '赤字'}
            </span>
          </div>
          <div className="my-1.5">
            <div
              className={`text-2xl font-bold font-mono tracking-tight ${
                summary.recoveryRate >= 100 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {summary.recoveryRate.toFixed(1)}%
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex justify-between">
            <span>基準控除率 75%</span>
            <span>差: {(summary.recoveryRate - 75).toFixed(1)}%</span>
          </div>
        </div>

        {/* 2. 的中率 (Hit Rate) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold flex items-center gap-1">
              <Target className="w-3.5 h-3.5 text-cyan-400" />
              的中率
            </span>
            <span className="text-[10px] font-mono text-cyan-400">
              {summary.hitRaces}/{summary.boughtRaces} R
            </span>
          </div>
          <div className="my-1.5">
            <div className="text-2xl font-bold font-mono tracking-tight text-cyan-300">
              {summary.hitRate.toFixed(1)}%
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono flex justify-between">
            <span>不的中: {summary.missRaces} R</span>
            <span>見送り: {summary.skippedRaces} R</span>
          </div>
        </div>

        {/* 3. 純損益 (Net Profit / Loss) */}
        <div
          className={`border rounded-lg p-3 flex flex-col justify-between ${
            isNetProfit
              ? 'bg-emerald-950/20 border-emerald-600/40'
              : 'bg-rose-950/20 border-rose-600/40'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              純損益 (損益)
            </span>
            <span
              className={`text-[10px] px-1 rounded font-bold font-mono ${
                isNetProfit ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isNetProfit ? '+' : ''}
            </span>
          </div>
          <div className="my-1.5">
            <div
              className={`text-2xl font-bold font-mono tracking-tight ${
                isNetProfit ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isNetProfit ? '+' : ''}
              {summary.netProfit.toLocaleString()}円
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            1レース平均: {summary.boughtRaces > 0 ? `${Math.round(summary.netProfit / summary.boughtRaces).toLocaleString()}円` : '0円'}
          </div>
        </div>

        {/* 4. 総投資額 (Total Cost) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold">総投資額 (投入コスト)</span>
            <span className="text-[10px] font-mono text-slate-500">{summary.totalBets}点</span>
          </div>
          <div className="my-1.5">
            <div className="text-xl font-bold font-mono text-slate-200">
              {summary.totalCost.toLocaleString()}円
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            購入: {summary.boughtRaces}レース / 確定{summary.finishedRaces}R
          </div>
        </div>

        {/* 5. 総払戻額 (Total Return) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold text-emerald-400">総払戻金 (回収総額)</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-1.5">
            <div className="text-xl font-bold font-mono text-emerald-300">
              {summary.totalReturn.toLocaleString()}円
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            的中レース数: {summary.hitRaces} R
          </div>
        </div>

        {/* 6. 投資選別率 (Discipline / Filter Rate) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span className="font-semibold">選別見送り率</span>
            <MinusCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="my-1.5">
            <div className="text-xl font-bold font-mono text-amber-300">
              {summary.totalRaces > 0
                ? `${((summary.skippedRaces / summary.totalRaces) * 100).toFixed(1)}%`
                : '0.0%'}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            見送り防衛: {summary.skippedRaces} / 全{summary.totalRaces}R
          </div>
        </div>
      </div>

      {/* SECTION: 各開催地毎の的中率・回収率・損益集計 (Venue-by-Venue Performance) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-100">
              各開催地毎（競輪場別）の的中率・回収率・損益集計
            </h3>
            <span className="text-[11px] text-slate-400">
              (全国 {summary.venueStats.length} 開催地)
            </span>
          </div>

          {/* Venue Sort Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" />
              並び替え:
            </span>
            <div className="flex rounded border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
              <button
                onClick={() => setVenueSortBy('recovery')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  venueSortBy === 'recovery'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                回収率順
              </button>
              <button
                onClick={() => setVenueSortBy('profit')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  venueSortBy === 'profit'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                損益順
              </button>
              <button
                onClick={() => setVenueSortBy('hitRate')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  venueSortBy === 'hitRate'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                的中率順
              </button>
              <button
                onClick={() => setVenueSortBy('races')}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  venueSortBy === 'races'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                レース数順
              </button>
            </div>
          </div>
        </div>

        {/* Venue Cards Grid (Visual summary of top tracks) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {sortedVenueStats.map((vStat) => {
            const isProfitable = vStat.netProfit >= 0;
            const isSelected = selectedVenueFilter === vStat.venue;

            return (
              <div
                key={vStat.venue}
                onClick={() =>
                  setSelectedVenueFilter(isSelected ? 'all' : vStat.venue)
                }
                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-slate-800/90 border-emerald-500 shadow-md shadow-emerald-950/30 ring-1 ring-emerald-500'
                    : isProfitable
                    ? 'bg-slate-950/70 border-slate-800 hover:border-emerald-700/60 hover:bg-slate-900/60'
                    : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-100 text-sm">
                      {vStat.venue}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800 font-mono">
                      {vStat.bankLength}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold font-mono ${
                      vStat.recoveryRate >= 100
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : vStat.boughtRaces > 0
                        ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {vStat.recoveryRate >= 100 ? '回収率100%超' : vStat.boughtRaces > 0 ? '赤字' : '見送り'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  {/* 回収率 */}
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400 text-[11px]">回収率:</span>
                    <span
                      className={`text-base font-bold font-mono ${
                        vStat.recoveryRate >= 100 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {vStat.recoveryRate.toFixed(1)}%
                    </span>
                  </div>

                  {/* 損益 */}
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400 text-[11px]">損益:</span>
                    <span
                      className={`font-mono font-bold ${
                        isProfitable ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isProfitable ? '+' : ''}
                      {vStat.netProfit.toLocaleString()}円
                    </span>
                  </div>

                  {/* 的中率 */}
                  <div className="flex justify-between items-baseline">
                    <span className="text-slate-400 text-[11px]">的中率:</span>
                    <span className="font-mono text-cyan-300 font-semibold">
                      {vStat.hitRate.toFixed(1)}%
                      <span className="text-[10px] text-slate-400 font-normal ml-1">
                        ({vStat.hitRaces}/{vStat.boughtRaces}R)
                      </span>
                    </span>
                  </div>

                  {/* 投資 / 払戻 */}
                  <div className="pt-1.5 border-t border-slate-800/80 flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>投資: {vStat.totalCost.toLocaleString()}円</span>
                    <span className="text-slate-200">払戻: {vStat.totalReturn.toLocaleString()}円</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-2 pt-1 border-t border-emerald-500/40 text-[10px] text-emerald-400 text-center font-medium">
                    ✓ この開催地で絞り込み中 (解除するには再クリック)
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Detailed Venue Comparison Table */}
        <div className="mt-3 overflow-x-auto rounded border border-slate-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-2 px-3">開催地</th>
                <th className="py-2 px-2">バンク</th>
                <th className="py-2 px-2 text-right">確定数</th>
                <th className="py-2 px-2 text-right">投資レース</th>
                <th className="py-2 px-2 text-right">的中数</th>
                <th className="py-2 px-2 text-right text-cyan-400 font-bold">的中率</th>
                <th className="py-2 px-2 text-right">総投資額</th>
                <th className="py-2 px-2 text-right">総払戻金</th>
                <th className="py-2 px-3 text-right font-bold text-amber-400">純損益</th>
                <th className="py-2 px-3 text-right font-bold text-emerald-400">回収率</th>
                <th className="py-2 px-2 text-center">判定</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sortedVenueStats.map((vStat) => {
                const isProfitable = vStat.netProfit >= 0;
                return (
                  <tr
                    key={vStat.venue}
                    onClick={() =>
                      setSelectedVenueFilter(
                        selectedVenueFilter === vStat.venue ? 'all' : vStat.venue
                      )
                    }
                    className={`hover:bg-slate-800/50 cursor-pointer transition-colors ${
                      selectedVenueFilter === vStat.venue ? 'bg-slate-800/60' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-sans font-bold text-slate-200 flex items-center gap-1.5">
                      <span>{vStat.venue}</span>
                      {selectedVenueFilter === vStat.venue && (
                        <span className="text-[10px] bg-emerald-600 text-white px-1 py-0.2 rounded font-sans">
                          選択中
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-400 font-sans text-[11px]">
                      {vStat.bankLength}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {vStat.finishedRaces}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200 font-semibold">
                      {vStat.boughtRaces}
                    </td>
                    <td className="py-2 px-2 text-right text-emerald-400 font-bold">
                      {vStat.hitRaces}
                    </td>
                    <td className="py-2 px-2 text-right text-cyan-300 font-bold">
                      {vStat.hitRate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {vStat.totalCost.toLocaleString()}円
                    </td>
                    <td className="py-2 px-2 text-right text-slate-100 font-semibold">
                      {vStat.totalReturn.toLocaleString()}円
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        isProfitable ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isProfitable ? '+' : ''}
                      {vStat.netProfit.toLocaleString()}円
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold text-sm ${
                        vStat.recoveryRate >= 100 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {vStat.recoveryRate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 text-center font-sans">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          vStat.recoveryRate >= 100
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : vStat.boughtRaces > 0
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {vStat.recoveryRate >= 100 ? '黒字' : vStat.boughtRaces > 0 ? '赤字' : '見送り'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION: レース別 予想結果・的中判定明細台帳 (Race-by-Race Hit/Miss Ledger) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-3">
        {/* Ledger Toolbar & Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-slate-100">
              レース別 予想結果・的中不的中 明細台帳
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              ({filteredEvaluations.length} / 全{summary.evaluations.length}レース)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Result Filter Tabs */}
            <div className="flex rounded border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
              <button
                onClick={() => setResultFilter('all')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  resultFilter === 'all'
                    ? 'bg-slate-800 text-slate-100 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全レース
              </button>
              <button
                onClick={() => setResultFilter('hit')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  resultFilter === 'hit'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-emerald-400 hover:text-emerald-300'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                的中のみ ({summary.hitRaces})
              </button>
              <button
                onClick={() => setResultFilter('miss')}
                className={`px-2 py-0.5 rounded transition-colors flex items-center gap-1 ${
                  resultFilter === 'miss'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                <XCircle className="w-3 h-3" />
                不的中 ({summary.missRaces})
              </button>
              <button
                onClick={() => setResultFilter('bought')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  resultFilter === 'bought'
                    ? 'bg-slate-800 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                購入レース ({summary.boughtRaces})
              </button>
              <button
                onClick={() => setResultFilter('skip')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  resultFilter === 'skip'
                    ? 'bg-slate-800 text-amber-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                見送り ({summary.skippedRaces})
              </button>
            </div>

            {/* Venue Filter Dropdown */}
            <select
              value={selectedVenueFilter}
              onChange={(e) => setSelectedVenueFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-medium"
            >
              <option value="all">全開催地</option>
              {summary.venueStats.map((v) => (
                <option key={v.venue} value={v.venue}>
                  {v.venue} ({v.totalRaces}R)
                </option>
              ))}
            </select>

            {/* CSV Export */}
            <button
              onClick={handleExportLedgerCsv}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs flex items-center gap-1.5 transition-colors font-medium"
            >
              <Download className="w-3 h-3 text-emerald-400" />
              <span>台帳CSV出力</span>
            </button>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="overflow-x-auto rounded border border-slate-800 max-h-[520px]">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-2.5 px-3">レース情報</th>
                <th className="py-2.5 px-2 text-center">AI判定</th>
                <th className="py-2.5 px-2 text-center">的中・不的中判断</th>
                <th className="py-2.5 px-2 text-center">確定着順 (1-2-3)</th>
                <th className="py-2.5 px-2 text-center">的中目 / 公式払戻</th>
                <th className="py-2.5 px-2">推奨買い目 (点数)</th>
                <th className="py-2.5 px-2 text-right">投資金額</th>
                <th className="py-2.5 px-2 text-right text-emerald-400">払戻金</th>
                <th className="py-2.5 px-3 text-right font-bold text-amber-400">損益</th>
                <th className="py-2.5 px-3 text-right font-bold text-emerald-400">回収率</th>
                <th className="py-2.5 px-2 text-center">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredEvaluations.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 font-sans">
                    条件に一致するレース結果が存在しません。フィルターを変更してください。
                  </td>
                </tr>
              ) : (
                filteredEvaluations.map((item) => {
                  const isExpanded = expandedRaceId === item.race_id;
                  const isHit = item.hitStatus === 'hit';
                  const isMiss = item.hitStatus === 'miss';
                  const isSkip = item.hitStatus === 'skip';
                  const isPositiveProfit = item.profit > 0;

                  return (
                    <React.Fragment key={item.race_id}>
                      <tr
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isHit
                            ? 'bg-emerald-950/20'
                            : isExpanded
                            ? 'bg-slate-800/60'
                            : ''
                        }`}
                      >
                        {/* レース情報 */}
                        <td className="py-2 px-3 font-sans">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-100">
                              {item.venue}
                            </span>
                            <span className="font-mono text-cyan-400 font-semibold">
                              {item.race_no}R
                            </span>
                            <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              {item.grade}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {item.date} {item.raceTitle ? `· ${item.raceTitle}` : ''}
                          </div>
                        </td>

                        {/* AI判定 */}
                        <td className="py-2 px-2 text-center font-sans">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.verdict === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.verdict === 'BUY' ? '購入' : '見送り'}
                          </span>
                        </td>

                        {/* 的中・不的中判断 */}
                        <td className="py-2 px-2 text-center font-sans">
                          {isHit ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500 text-white shadow-sm shadow-emerald-950/50">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              的中 🎯
                            </span>
                          ) : isMiss ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <XCircle className="w-3 h-3" />
                              不的中
                            </span>
                          ) : isSkip ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800">
                              <MinusCircle className="w-3 h-3 text-amber-500" />
                              見送り
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">未確定</span>
                          )}
                        </td>

                        {/* 確定着順 (1-2-3) */}
                        <td className="py-2 px-2 text-center">
                          {item.top3 ? (
                            <span className="font-bold text-slate-100 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                              {item.top3[0]} - {item.top3[1]} - {item.top3[2]}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 的中目 / 公式払戻 */}
                        <td className="py-2 px-2 text-center font-bold">
                          {item.winningCombo ? (
                            <div>
                              <span
                                className={`text-xs ${
                                  isHit ? 'text-emerald-400 font-extrabold' : 'text-slate-300'
                                }`}
                              >
                                {item.winningCombo}
                              </span>
                              {item.officialPayout && (
                                <div className="text-[10px] text-slate-400 font-normal">
                                  {item.officialPayout.toLocaleString()}円
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 推奨買い目 */}
                        <td className="py-2 px-2">
                          {item.bets.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 max-w-xs">
                              {item.bets.map((bet) => (
                                <span
                                  key={bet.combo}
                                  className={`px-1.5 py-0.2 rounded text-[11px] font-bold ${
                                    bet.isHit
                                      ? 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-300'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                  title={`確率: ${(bet.prob * 100).toFixed(1)}%, EV: ${bet.ev.toFixed(2)}, オッズ: ${bet.odds.toFixed(1)}倍`}
                                >
                                  {bet.combo}
                                  {bet.isHit && ' 🎯'}
                                </span>
                              ))}
                              <span className="text-[10px] text-slate-500 font-sans ml-1">
                                ({item.bets.length}点)
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[11px] font-sans">
                              買い目なし (見送り)
                            </span>
                          )}
                        </td>

                        {/* 投資金額 */}
                        <td className="py-2 px-2 text-right text-slate-300">
                          {item.betCost > 0 ? `${item.betCost.toLocaleString()}円` : '0円'}
                        </td>

                        {/* 払戻金 */}
                        <td className="py-2 px-2 text-right font-bold text-emerald-400">
                          {item.totalReturn > 0
                            ? `${item.totalReturn.toLocaleString()}円`
                            : '0円'}
                        </td>

                        {/* 損益 */}
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            isPositiveProfit
                              ? 'text-emerald-400'
                              : item.profit < 0
                              ? 'text-rose-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.profit > 0 ? '+' : ''}
                          {item.profit.toLocaleString()}円
                        </td>

                        {/* 回収率 */}
                        <td
                          className={`py-2 px-3 text-right font-bold ${
                            item.recoveryRate >= 100
                              ? 'text-emerald-400 text-sm'
                              : item.betCost > 0
                              ? 'text-rose-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.betCost > 0 ? `${item.recoveryRate.toFixed(1)}%` : '-'}
                        </td>

                        {/* 詳細展開ボタン */}
                        <td className="py-2 px-2 text-center font-sans">
                          <button
                            onClick={() =>
                              setExpandedRaceId(isExpanded ? null : item.race_id)
                            }
                            className="p-1 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800 transition-colors"
                            title="買い目・払戻明細を展開"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Race Details Sub-Row */}
                      {isExpanded && (
                        <tr className="bg-slate-950/80">
                          <td colSpan={11} className="p-3 border-y border-slate-800 font-sans">
                            <div className="space-y-2 text-xs">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1.5 border-b border-slate-800/80">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-200">
                                    【{item.venue} {item.race_no}R】 AI予想および払戻検証明細
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-mono">
                                    Race ID: {item.race_id}
                                  </span>
                                </div>
                                {onSelectRaceForDetail && (
                                  <button
                                    onClick={() => onSelectRaceForDetail(item.race_id)}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors"
                                  >
                                    <ExternalLink className="w-3 h-3 text-emerald-400" />
                                    <span>詳細予想画面で開く</span>
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                {/* Left: Recommended Bets breakdown */}
                                <div>
                                  <div className="text-[11px] font-semibold text-slate-300 mb-1.5">
                                    推奨買い目一覧 ＆ 各目ごとの結果判定:
                                  </div>
                                  {item.bets.length === 0 ? (
                                    <div className="text-slate-500 text-[11px] p-2 bg-slate-900 rounded border border-slate-800">
                                      買い目なし（EVしきい値 EV ≧ {evThreshold} 未満のため見送り防衛）
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      {item.bets.map((b, bIdx) => (
                                        <div
                                          key={b.combo}
                                          className={`flex items-center justify-between p-1.5 rounded border text-xs font-mono ${
                                            b.isHit
                                              ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                                              : 'bg-slate-900 border-slate-800 text-slate-300'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] bg-slate-800 px-1 rounded text-slate-400">
                                              #{bIdx + 1}
                                            </span>
                                            <span className="font-bold text-sm">
                                              {b.combo}
                                            </span>
                                            {b.isHit && (
                                              <span className="bg-emerald-500 text-white font-sans text-[10px] font-bold px-1.5 py-0.2 rounded">
                                                的中 🎯
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 text-[11px]">
                                            <span className="text-slate-400">
                                              確率: {(b.prob * 100).toFixed(1)}%
                                            </span>
                                            <span className="text-slate-400">
                                              オッズ: {b.odds.toFixed(1)}倍
                                            </span>
                                            <span className="text-slate-400">
                                              EV: {b.ev.toFixed(2)}
                                            </span>
                                            <span className="font-bold text-slate-200 font-sans">
                                              {b.isHit
                                                ? `払戻: +${(b.returnAmount || 0).toLocaleString()}円`
                                                : `投資: ${unitBet}円`}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Right: Race result summary */}
                                <div className="p-2.5 bg-slate-900/90 rounded border border-slate-800 space-y-1.5">
                                  <div className="text-[11px] font-semibold text-slate-300">
                                    レース確定情報:
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="flex justify-between text-slate-400">
                                      <span>確定着順 (1-3着):</span>
                                      <span className="font-mono font-bold text-slate-200">
                                        {item.top3 ? item.top3.join(' - ') : '-'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                      <span>公式的中目:</span>
                                      <span className="font-mono font-bold text-emerald-400">
                                        {item.winningCombo || '-'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                      <span>公式払戻金 (100円):</span>
                                      <span className="font-mono text-slate-200">
                                        {item.officialPayout ? `${item.officialPayout.toLocaleString()}円` : '-'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between text-slate-400">
                                      <span>レース損益:</span>
                                      <span
                                        className={`font-mono font-bold ${
                                          item.profit > 0 ? 'text-emerald-400' : item.profit < 0 ? 'text-rose-400' : 'text-slate-400'
                                        }`}
                                      >
                                        {item.profit > 0 ? '+' : ''}{item.profit.toLocaleString()}円
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                                    判定理由: {item.verdictReason}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
