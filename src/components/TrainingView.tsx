/**
 * Training and Backtest Dashboard (train_backtest.py)
 * Executes model fitting, optimal temperature T calibration, strategy selection,
 * and test evaluation with 2,000 bootstrap iterations.
 */

import React, { useState } from 'react';
import { BacktestSummary, RaceGroup } from '../types/keirin';
import { TrainedModel } from '../services/modelEngine';
import { FEATURE_NAMES } from '../services/features';
import {
  Play,
  RotateCcw,
  CheckCircle,
  AlertOctagon,
  Percent,
  Layers,
  Award,
  BarChart3,
  Flame,
} from 'lucide-react';

interface TrainingViewProps {
  races: RaceGroup[];
  model: TrainedModel;
  summary: BacktestSummary;
  onRetrain: (minBets: number, minHitRate: number) => void;
  isTraining: boolean;
}

export const TrainingView: React.FC<TrainingViewProps> = ({
  races,
  model,
  summary,
  onRetrain,
  isTraining,
}) => {
  const [minBets, setMinBets] = useState<number>(50);
  const [minHitRate, setMinHitRate] = useState<number>(0.0);

  const handleStartTraining = () => {
    onRetrain(minBets, minHitRate);
  };

  // Sort feature importances
  const sortedFeatures = FEATURE_NAMES.map((name, idx) => ({
    name,
    weight: model.featureWeights[idx] || 0,
  })).sort((a, b) => b.weight - a.weight);

  const maxWeight = Math.max(...sortedFeatures.map((f) => f.weight), 0.01);

  return (
    <div className="flex flex-col space-y-4">
      {/* Configuration & Training Action Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>機械学習モデル学習 ＆ 期間分割バックテスト</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              時系列順に 学習60% ({summary.train_races}レース) / 検証20% ({summary.val_races}レース) / テスト20% ({summary.test_races}レース) に厳密分割。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-400">最小投票数 (--min-bets):</span>
              <input
                type="number"
                value={minBets}
                onChange={(e) => setMinBets(Math.max(10, parseInt(e.target.value) || 10))}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-300">
              <span className="text-slate-400">最低的中率 (--min-hit-rate):</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={minHitRate}
                onChange={(e) => setMinHitRate(parseFloat(e.target.value) || 0)}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 font-mono"
              />
            </div>
            <button
              onClick={handleStartTraining}
              disabled={isTraining}
              className={`px-4 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-all shadow-sm ${
                isTraining
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isTraining ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>モデル学習中...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>学習・探索・テスト実行</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Backtest Test Evaluation Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Recovery Rate with 95% CI */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>テスト期間 回収率</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-mono font-extrabold text-slate-100">
              {summary.test_performance.recovery_rate.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1 font-mono">
              95%信頼区間: [{summary.test_performance.ci_95_low.toFixed(1)}% ~ {summary.test_performance.ci_95_high.toFixed(1)}%]
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-800/80 pt-1.5">
            2,000回レース単位ブートストラップ算出
          </div>
        </div>

        {/* Metric 2: Hit Rate */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>テスト期間 レース的中率</span>
            <Percent className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-mono font-extrabold text-slate-100">
              {summary.test_performance.hit_rate.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              購入レース数: {summary.test_performance.races_bought} / {summary.test_performance.total_races}R
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-800/80 pt-1.5">
            見送り率: {(((summary.test_performance.total_races - summary.test_performance.races_bought) / Math.max(1, summary.test_performance.total_races)) * 100).toFixed(0)}%
          </div>
        </div>

        {/* Metric 3: Total Bets & Stakes */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>購入点数 / 収支</span>
            <BarChart3 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-mono font-bold text-slate-100">
              {summary.test_performance.total_bets} 点 ({summary.test_performance.total_cost.toLocaleString()}円)
            </div>
            <div className="text-[11px] font-mono mt-1 text-slate-300">
              払戻計: {summary.test_performance.total_return.toLocaleString()}円
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-800/80 pt-1.5">
            1点100円均等買い基準
          </div>
        </div>

        {/* Metric 4: Optimal Temperature */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>温度補正 T (尤度最大化)</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-mono font-extrabold text-slate-100">
              T = {summary.optimal_temperature.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              探索範囲: [0.50 ~ 2.50] (刻み 0.05)
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500 border-t border-slate-800/80 pt-1.5">
            検証期間の対数尤度最大化
          </div>
        </div>
      </div>

      {/* Selected Optimal Strategy Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-200 mb-3 flex items-center justify-between">
          <span>検証期間で選択された最適戦略パラメータ (検証 回収率−標準誤差 最大化)</span>
          <span className="text-[11px] text-emerald-400 font-mono">
            スコア: {summary.val_performance.criterion_score.toFixed(1)}
          </span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950 p-3 rounded border border-slate-800">
          <div>
            <span className="text-slate-500 block text-[11px]">推奨券種:</span>
            <strong className="text-emerald-400 text-sm font-mono uppercase">
              {summary.best_strategy.bet_type}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">期待値しきい値:</span>
            <strong className="text-slate-100 text-sm font-mono">
              EV ≧ {summary.best_strategy.ev_threshold.toFixed(1)}
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">最低確率しきい値:</span>
            <strong className="text-slate-100 text-sm font-mono">
              {(summary.best_strategy.min_prob * 100).toFixed(0)}% 以上
            </strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">1レース最大購入点数:</span>
            <strong className="text-slate-100 text-sm font-mono">
              最大 {summary.best_strategy.max_bets_per_race} 点
            </strong>
          </div>
        </div>
      </div>

      {/* Baseline Comparisons & Statistical Profitability Judgement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Baselines Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <h3 className="text-xs font-semibold text-slate-200 mb-2">
            比較対象モデルとの成績対比 (テスト期間)
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">
            控除率25%（回収率75%水準）に対するAIモデル優位性の検証
          </p>

          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-2 px-2">戦略モデル</th>
                <th className="py-2 px-2 text-right">回収率</th>
                <th className="py-2 px-2 text-right">的中率</th>
                <th className="py-2 px-2 text-center">判定</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              <tr className="bg-emerald-950/20 font-bold">
                <td className="py-2 px-2 text-emerald-300 font-sans">
                  AI期待値最適化戦略 (本モデル)
                </td>
                <td className="py-2 px-2 text-right text-emerald-400">
                  {summary.test_performance.recovery_rate.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-right text-emerald-400">
                  {summary.test_performance.hit_rate.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-center text-emerald-400 text-[11px]">
                  基準適合
                </td>
              </tr>
              <tr>
                <td className="py-2 px-2 text-slate-300 font-sans">
                  1番人気均等買い (市場最高支持)
                </td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {summary.baselines.favorite1_recovery_rate.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {summary.baselines.favorite1_hit_rate.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-center text-slate-500 text-[11px]">
                  比較対象
                </td>
              </tr>
              <tr>
                <td className="py-2 px-2 text-slate-300 font-sans">
                  AI最高確率買い (期待値無視)
                </td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {summary.baselines.ai_top_prob_recovery_rate.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-right text-slate-300">
                  {summary.baselines.ai_top_prob_hit_rate.toFixed(1)}%
                </td>
                <td className="py-2 px-2 text-center text-slate-500 text-[11px]">
                  比較対象
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Statistical Profitability Warning & Discipline */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <span>仕様書セクション 7: 利益判定基準</span>
            </h3>
            <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-2">
              <p className="text-slate-300">
                『テスト期間の回収率の95%信頼区間が100%を安定して超えない限り、「利益が出る」とは結論づけない。競輪の投票控除率は約25%である。』
              </p>
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">95%区間 下限値判定:</span>
                <span
                  className={`font-mono font-bold ${
                    summary.test_performance.is_statistically_profitable
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }`}
                >
                  {summary.test_performance.ci_95_low.toFixed(1)}%{' '}
                  {summary.test_performance.is_statistically_profitable
                    ? '(100%超: 統計的優位)'
                    : '(100%以下: 利益保証なし)'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            合成データおよび過去データによるバックテスト結果は、将来のレースでの利益を約束するものではありません。
          </div>
        </div>
      </div>

      {/* 25 Features Importance Bar Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <h3 className="text-xs font-semibold text-slate-200 mb-2">
          特徴量重要度 (全25個の特徴量)
        </h3>
        <p className="text-[11px] text-slate-400 mb-3">
          勾配ブースティング木において分岐利得に寄与した特徴量の正規化重要度
        </p>

        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-2">
          {sortedFeatures.map((feat, idx) => {
            const pct = (feat.weight / maxWeight) * 100;

            return (
              <div key={feat.name} className="flex items-center text-xs gap-3">
                <span className="w-6 text-slate-500 font-mono text-right text-[11px]">
                  #{idx + 1}
                </span>
                <span className="w-40 truncate text-slate-300 font-mono text-[11px]">
                  {feat.name}
                </span>
                <div className="flex-1 bg-slate-950 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <span className="w-14 text-right font-mono text-slate-400 text-[11px]">
                  {(feat.weight * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
