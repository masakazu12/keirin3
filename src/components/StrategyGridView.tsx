/**
 * Strategy Parameter Grid Explorer (grid_validation.csv)
 * Displays all 750 combinations tested in validation:
 * Bet Type x EV Threshold x Min Prob x Max Bets
 */

import React, { useState, useMemo } from 'react';
import { BetType, GridSearchRow, StrategyParams } from '../types/keirin';
import { Download, Filter, Search, Award } from 'lucide-react';

interface StrategyGridViewProps {
  gridRows: GridSearchRow[];
  bestStrategy: StrategyParams;
  onApplyStrategy: (strategy: StrategyParams) => void;
}

export const StrategyGridView: React.FC<StrategyGridViewProps> = ({
  gridRows,
  bestStrategy,
  onApplyStrategy,
}) => {
  const [filterBetType, setFilterBetType] = useState<string>('all');
  const [onlyMeetsConstraints, setOnlyMeetsConstraints] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<'criterion' | 'recovery' | 'hit' | 'bets'>('criterion');

  const filteredRows = useMemo(() => {
    let rows = gridRows;
    if (filterBetType !== 'all') {
      rows = rows.filter((r) => r.bet_type === filterBetType);
    }
    if (onlyMeetsConstraints) {
      rows = rows.filter((r) => r.meets_constraints);
    }

    return [...rows].sort((a, b) => {
      if (sortBy === 'criterion') return b.criterion_score - a.criterion_score;
      if (sortBy === 'recovery') return b.recovery_rate - a.recovery_rate;
      if (sortBy === 'hit') return b.hit_rate - a.hit_rate;
      if (sortBy === 'bets') return b.total_bets - a.total_bets;
      return 0;
    });
  }, [gridRows, filterBetType, onlyMeetsConstraints, sortBy]);

  const handleExportCsv = () => {
    const headers = [
      'bet_type',
      'ev_threshold',
      'min_prob',
      'max_bets_per_race',
      'total_bets',
      'total_races_bought',
      'hit_rate',
      'recovery_rate',
      'std_error',
      'criterion_score',
      'meets_constraints',
    ];
    const csvLines = [headers.join(',')];
    gridRows.forEach((r) => {
      csvLines.push(
        [
          r.bet_type,
          r.ev_threshold,
          r.min_prob,
          r.max_bets_per_race,
          r.total_bets,
          r.total_races_bought,
          r.hit_rate.toFixed(4),
          r.recovery_rate.toFixed(2),
          r.std_error.toFixed(2),
          r.criterion_score.toFixed(2),
          r.meets_constraints ? '1' : '0',
        ].join(',')
      );
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grid_validation.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Header & Filter Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-400" />
              <span>戦略グリッド探索結果 (grid_validation.csv)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              全 {gridRows.length} 通りのパラメータから「回収率 − 標準誤差」を最大化する戦略を選定。
            </p>
          </div>

          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-2 border border-slate-700"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>grid_validation.csv をダウンロード</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">券種絞り込み:</span>
            <select
              value={filterBetType}
              onChange={(e) => setFilterBetType(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
            >
              <option value="all">全券種 (All)</option>
              <option value="exacta">2車単 (exacta)</option>
              <option value="trifecta">3連単 (trifecta)</option>
              <option value="quinella">2車複 (quinella)</option>
              <option value="trio">3連複 (trio)</option>
              <option value="wide">ワイド (wide)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">並び順:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
            >
              <option value="criterion">選定基準スコア (回収率 - 標準誤差)</option>
              <option value="recovery">回収率 (降順)</option>
              <option value="hit">的中率 (降順)</option>
              <option value="bets">投票数 (降順)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={onlyMeetsConstraints}
              onChange={(e) => setOnlyMeetsConstraints(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span>制約条件適合のみ表示 (--min-bets 達成)</span>
          </label>

          <span className="text-slate-500 text-[11px] ml-auto">
            表示中: {filteredRows.length} 件 / {gridRows.length} 件
          </span>
        </div>
      </div>

      {/* Grid Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[520px]">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0">
              <tr>
                <th className="py-2.5 px-3">券種</th>
                <th className="py-2.5 px-3 text-right">EV閾値</th>
                <th className="py-2.5 px-3 text-right">最低確率</th>
                <th className="py-2.5 px-3 text-right">上限点数</th>
                <th className="py-2.5 px-3 text-right">総投票数</th>
                <th className="py-2.5 px-3 text-right">購入レース数</th>
                <th className="py-2.5 px-3 text-right">的中率</th>
                <th className="py-2.5 px-3 text-right font-bold text-slate-200">
                  回収率
                </th>
                <th className="py-2.5 px-3 text-right">標準誤差</th>
                <th className="py-2.5 px-3 text-right font-bold text-emerald-400">
                  選定スコア
                </th>
                <th className="py-2.5 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredRows.slice(0, 100).map((row, idx) => {
                const isSelected =
                  bestStrategy.bet_type === row.bet_type &&
                  bestStrategy.ev_threshold === row.ev_threshold &&
                  bestStrategy.min_prob === row.min_prob &&
                  bestStrategy.max_bets_per_race === row.max_bets_per_race;

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isSelected ? 'bg-emerald-950/30' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-sans font-medium text-slate-200 flex items-center gap-1.5">
                      {isSelected && (
                        <Award className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="uppercase">{row.bet_type}</span>
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      EV ≧ {row.ev_threshold.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {(row.min_prob * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {row.max_bets_per_race}点
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      {row.total_bets}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      {row.total_races_bought}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-200">
                      {(row.hit_rate * 100).toFixed(1)}%
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        row.recovery_rate >= 100
                          ? 'text-emerald-400'
                          : row.recovery_rate >= 75
                          ? 'text-slate-200'
                          : 'text-amber-400'
                      }`}
                    >
                      {row.recovery_rate.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">
                      ±{row.std_error.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-400">
                      {row.criterion_score.toFixed(1)}
                    </td>
                    <td className="py-2 px-3 text-center font-sans">
                      <button
                        onClick={() =>
                          onApplyStrategy({
                            bet_type: row.bet_type,
                            ev_threshold: row.ev_threshold,
                            min_prob: row.min_prob,
                            max_bets_per_race: row.max_bets_per_race,
                          })
                        }
                        className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {isSelected ? '採用中' : '適用'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
