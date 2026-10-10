/**
 * Data Management View (出走表・データ管理)
 * Provides two rich viewing modes:
 * 1. レース別 出走表・オッズ連動表示 (Interactive race selector, line diagram, full entries card, and bet-type odds)
 * 2. 全データ一括管理・CSV出力 (Global raw table search, filter, and CSV exports)
 */

import React, { useState, useMemo } from 'react';
import { BetType, Entry, OddsItem, RaceGroup } from '../types/keirin';
import { exportEntriesToCsv, exportOddsToCsv } from '../services/csvParser';
import { RaceLineDiagram, CAR_COLORS } from './RaceLineDiagram';
import { RaceSelectorBar } from './RaceSelectorBar';
import {
  Download,
  Search,
  Table,
  Filter,
  Eye,
  Layers,
  ArrowRight,
  CheckCircle2,
  ListFilter,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface DataManagementViewProps {
  races: RaceGroup[];
  selectedRaceId?: string;
  onSelectRace?: (raceId: string) => void;
  onSelectForPrediction?: (raceId: string) => void;
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({
  races,
  selectedRaceId: externalSelectedRaceId,
  onSelectRace,
  onSelectForPrediction,
}) => {
  // View mode: 'race-linked' (default) or 'raw-all'
  const [viewMode, setViewMode] = useState<'race-linked' | 'raw-all'>('race-linked');

  // Active race selection
  const [internalSelectedRaceId, setInternalSelectedRaceId] = useState<string>(
    externalSelectedRaceId || (races.length > 0 ? races[0].race_id : '')
  );

  const activeSelectedRaceId = externalSelectedRaceId || internalSelectedRaceId;

  const handleSelectRace = (raceId: string) => {
    setInternalSelectedRaceId(raceId);
    if (onSelectRace) {
      onSelectRace(raceId);
    }
  };

  // Selected race object
  const selectedRace = useMemo(() => {
    return races.find((r) => r.race_id === activeSelectedRaceId) || races[0];
  }, [races, activeSelectedRaceId]);

  // Bet type filter for selected race's odds
  const [selectedBetType, setSelectedBetType] = useState<BetType>('exacta');

  // Filtered odds for the selected race
  const selectedRaceOdds = useMemo(() => {
    if (!selectedRace) return [];
    return selectedRace.odds.filter((o) => o.bet_type === selectedBetType);
  }, [selectedRace, selectedBetType]);

  // Raw dataset search & filter states
  const [rawTab, setRawTab] = useState<'entries' | 'odds'>('entries');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');

  // Flatten all entries for raw view
  const allEntries = useMemo(() => {
    return races.flatMap((r) => r.entries);
  }, [races]);

  // Flatten all odds for raw view
  const allOdds = useMemo(() => {
    return races.flatMap((r) => r.odds);
  }, [races]);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      const matchSearch =
        searchTerm === '' ||
        e.race_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (e.rider_name && e.rider_name.includes(searchTerm));
      const matchGrade = selectedGrade === 'all' || e.grade === selectedGrade;
      return matchSearch && matchGrade;
    });
  }, [allEntries, searchTerm, selectedGrade]);

  const filteredOdds = useMemo(() => {
    return allOdds.filter((o) => {
      return (
        searchTerm === '' ||
        o.race_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.combo.includes(searchTerm)
      );
    });
  }, [allOdds, searchTerm]);

  const handleDownloadEntries = () => {
    const csv = exportEntriesToCsv(allEntries);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'entries.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadOdds = () => {
    const csv = exportOddsToCsv(allOdds);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'odds.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const betTypeNames: Record<BetType, string> = {
    exacta: '2車単 (Exacta)',
    trifecta: '3連単 (Trifecta)',
    quinella: '2車複 (Quinella)',
    trio: '3連複 (Trio)',
    wide: 'ワイド (Wide)',
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Main Mode Switcher Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Table className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                出走表・オッズデータ管理センター
              </h2>
              <p className="text-xs text-slate-400">
                レース一覧と完全連動した詳細出走表・オッズの閲覧、並び予想、および全データCSV出力
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs & CSV Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-slate-950 p-1 rounded border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('race-linked')}
                className={`px-3 py-1.5 rounded font-semibold transition-all flex items-center gap-1.5 ${
                  viewMode === 'race-linked'
                    ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>レース別 詳細出走表・オッズ連動</span>
              </button>
              <button
                onClick={() => setViewMode('raw-all')}
                className={`px-3 py-1.5 rounded font-semibold transition-all flex items-center gap-1.5 ${
                  viewMode === 'raw-all'
                    ? 'bg-slate-800 text-blue-400 shadow-sm border border-slate-700/80'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>全データ一覧 (CSV出力)</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 ml-1">
              <button
                onClick={handleDownloadEntries}
                className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 rounded text-xs flex items-center gap-1.5 border border-slate-800 transition-colors"
                title="entries.csv エクスポート"
              >
                <Download className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">entries.csv</span>
              </button>
              <button
                onClick={handleDownloadOdds}
                className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 rounded text-xs flex items-center gap-1.5 border border-slate-800 transition-colors"
                title="odds.csv エクスポート"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">odds.csv</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODE 1: RACE-LINKED DETAILED CARD & ODDS */}
      {viewMode === 'race-linked' && (
        <div className="space-y-4">
          {/* Synchronized Race Selector Bar */}
          <RaceSelectorBar
            races={races}
            selectedRaceId={activeSelectedRaceId}
            onSelectRace={handleSelectRace}
            title="レース一覧 ＆ 出走表・オッズ連動選択"
          />

          {selectedRace && (
            <>
              {/* Selected Race Banner & Quick Predictor Jump */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-100">
                    【出走表】{selectedRace.venue}競輪 {selectedRace.race_no}R
                  </span>
                  <span className="text-xs text-slate-300">
                    {selectedRace.raceTitle || `${selectedRace.grade} 特選`}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    ({selectedRace.date} / {selectedRace.entries.length}車立)
                  </span>
                </div>

                {onSelectForPrediction && (
                  <button
                    onClick={() => onSelectForPrediction(selectedRace.race_id)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm self-start sm:self-auto"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>このレースのAI予想を開く</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Line Diagram for Selected Race */}
              <RaceLineDiagram entries={selectedRace.entries} />

              {/* Complete Race Card (出走表) Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-200">
                      公式出走表・選手データ (出走 {selectedRace.entries.length}名)
                    </h3>
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>レース一覧と完全同期</span>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    レースID: <strong className="font-mono text-slate-300">{selectedRace.race_id}</strong>
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-2 text-center">車番</th>
                        <th className="py-2.5 px-2">選手名</th>
                        <th className="py-2.5 px-2 text-right">競走得点</th>
                        <th className="py-2.5 px-2 text-center">脚質</th>
                        <th className="py-2.5 px-2 text-center">ライン構成</th>
                        <th className="py-2.5 px-2 text-right">ギヤ倍数</th>
                        <th className="py-2.5 px-2 text-right">勝率</th>
                        <th className="py-2.5 px-2 text-right">2連対率</th>
                        <th className="py-2.5 px-2 text-right">3連対率</th>
                        <th className="py-2.5 px-2 text-right">バック(B数)</th>
                        <th className="py-2.5 px-2 text-center">着順</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {selectedRace.entries.map((e) => {
                        const carColor = CAR_COLORS[e.car_no] || CAR_COLORS[1];

                        return (
                          <tr key={e.car_no} className="hover:bg-slate-800/40 transition-colors">
                            {/* Car Number with Official Color Badge */}
                            <td className="py-2 px-2 text-center font-sans">
                              <span
                                className={`inline-block w-6 h-6 rounded-full font-bold text-xs leading-6 text-center shadow-sm border ${carColor.bg} ${carColor.text} ${carColor.border}`}
                              >
                                {e.car_no}
                              </span>
                            </td>

                            {/* Rider Name */}
                            <td className="py-2 px-2 font-sans font-medium text-slate-100">
                              {e.rider_name || `車番 ${e.car_no}`}
                            </td>

                            {/* Score */}
                            <td className="py-2 px-2 text-right text-slate-100 font-bold">
                              {e.score.toFixed(1)}
                            </td>

                            {/* Style */}
                            <td className="py-2 px-2 text-center font-sans">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  e.style === '逃'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : e.style === '捲'
                                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {e.style}
                              </span>
                            </td>

                            {/* Line */}
                            <td className="py-2 px-2 text-center font-sans text-slate-300">
                              <span className="font-semibold">{e.line_id}番ライン</span>
                              <span className="text-slate-400 text-[11px] ml-1">
                                ({e.line_pos === 1 ? '先頭' : `${e.line_pos}番手`})
                              </span>
                            </td>

                            {/* Gear */}
                            <td className="py-2 px-2 text-right text-slate-400">
                              {e.gear_ratio.toFixed(2)}
                            </td>

                            {/* Win Rate */}
                            <td className="py-2 px-2 text-right text-slate-300">
                              {(e.win_rate * 100).toFixed(1)}%
                            </td>

                            {/* Top 2 Rate */}
                            <td className="py-2 px-2 text-right text-slate-300">
                              {(e.top2_rate * 100).toFixed(1)}%
                            </td>

                            {/* Top 3 Rate */}
                            <td className="py-2 px-2 text-right text-slate-300">
                              {(e.top3_rate * 100).toFixed(1)}%
                            </td>

                            {/* Back Count */}
                            <td className="py-2 px-2 text-right text-slate-400">
                              {e.back_count}
                            </td>

                            {/* Finish */}
                            <td className="py-2 px-2 text-center font-sans">
                              {e.finish ? (
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                    e.finish === 1
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : e.finish <= 3
                                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {e.finish}着
                                </span>
                              ) : (
                                <span className="text-slate-500 text-[11px]">未発走</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected Race Odds Explorer by Bet Type */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-slate-200">
                      このレースのオッズ一覧 ({betTypeNames[selectedBetType]} / 全{selectedRaceOdds.length}件)
                    </h3>
                  </div>

                  {/* Bet Type Tabs */}
                  <div className="flex flex-wrap gap-1 bg-slate-950 p-1 rounded border border-slate-800 text-xs">
                    {(['exacta', 'trifecta', 'quinella', 'trio', 'wide'] as BetType[]).map((bt) => (
                      <button
                        key={bt}
                        onClick={() => setSelectedBetType(bt)}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                          selectedBetType === bt
                            ? 'bg-slate-800 text-emerald-400 shadow-sm border border-slate-700'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {bt === 'exacta'
                          ? '2車単'
                          : bt === 'trifecta'
                          ? '3連単'
                          : bt === 'quinella'
                          ? '2車複'
                          : bt === 'trio'
                          ? '3連複'
                          : 'ワイド'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto max-h-80">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0">
                      <tr>
                        <th className="py-2 px-3">券種</th>
                        <th className="py-2 px-3">組合せ (買い目)</th>
                        <th className="py-2 px-3 text-right">オッズ (倍率)</th>
                        <th className="py-2 px-3 text-right">100円購入時の払戻例</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {selectedRaceOdds.map((o) => (
                        <tr key={`${o.combo}`} className="hover:bg-slate-800/40">
                          <td className="py-1.5 px-3 uppercase text-slate-400 text-[11px]">
                            {o.bet_type}
                          </td>
                          <td className="py-1.5 px-3 font-bold text-slate-100 text-sm">
                            {o.combo}
                          </td>
                          <td className="py-1.5 px-3 text-right text-emerald-400 font-bold text-sm">
                            {o.odds.toFixed(1)}倍
                          </td>
                          <td className="py-1.5 px-3 text-right text-slate-300">
                            {Math.round(o.odds * 100).toLocaleString()}円
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* MODE 2: RAW ALL-DATA INSPECTOR (ENTRIES & ODDS CSV BATCH) */}
      {viewMode === 'raw-all' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex bg-slate-950 p-1 rounded border border-slate-800 text-xs">
                <button
                  onClick={() => setRawTab('entries')}
                  className={`px-3 py-1.5 rounded font-medium transition-colors ${
                    rawTab === 'entries'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  出走表データ ({allEntries.length}行)
                </button>
                <button
                  onClick={() => setRawTab('odds')}
                  className={`px-3 py-1.5 rounded font-medium transition-colors ${
                    rawTab === 'odds'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  オッズデータ ({allOdds.length}行)
                </button>
              </div>

              <div className="text-xs text-slate-400">
                総レース数: <strong className="text-slate-100">{races.length}R</strong>
              </div>
            </div>

            {/* Filter / Search Bar */}
            <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="レースID または 選手名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-100 w-full focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              {rawTab === 'entries' && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">グレード:</span>
                  <select
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                  >
                    <option value="all">全グレード</option>
                    <option value="GP">GP</option>
                    <option value="G1">G1</option>
                    <option value="G2">G2</option>
                    <option value="G3">G3</option>
                    <option value="F1">F1</option>
                    <option value="F2">F2</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Table Content */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            {rawTab === 'entries' ? (
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-2">レースID</th>
                      <th className="py-2.5 px-2">日付</th>
                      <th className="py-2.5 px-2 text-center">グレード</th>
                      <th className="py-2.5 px-2 text-center">車番</th>
                      <th className="py-2.5 px-2">選手名</th>
                      <th className="py-2.5 px-2 text-right">競走得点</th>
                      <th className="py-2.5 px-2 text-center">脚質</th>
                      <th className="py-2.5 px-2 text-center">ライン</th>
                      <th className="py-2.5 px-2 text-right">ギヤ</th>
                      <th className="py-2.5 px-2 text-right">勝率</th>
                      <th className="py-2.5 px-2 text-right">2連対率</th>
                      <th className="py-2.5 px-2 text-right">3連対率</th>
                      <th className="py-2.5 px-2 text-right">B数</th>
                      <th className="py-2.5 px-2 text-center">着順</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredEntries.slice(0, 150).map((e) => {
                      const carColor = CAR_COLORS[e.car_no] || CAR_COLORS[1];

                      return (
                        <tr
                          key={`${e.race_id}-${e.car_no}`}
                          className="hover:bg-slate-800/40 cursor-pointer"
                          onClick={() => {
                            handleSelectRace(e.race_id);
                            setViewMode('race-linked');
                          }}
                        >
                          <td className="py-1.5 px-2 text-slate-300 font-sans">{e.race_id}</td>
                          <td className="py-1.5 px-2 text-slate-400">{e.date}</td>
                          <td className="py-1.5 px-2 text-center font-sans font-semibold text-slate-300">
                            {e.grade}
                          </td>
                          <td className="py-1.5 px-2 text-center font-sans">
                            <span
                              className={`inline-block w-5 h-5 rounded-full font-bold text-[11px] leading-5 text-center shadow-sm border ${carColor.bg} ${carColor.text} ${carColor.border}`}
                            >
                              {e.car_no}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 font-sans text-slate-200">
                            {e.rider_name || `車番 ${e.car_no}`}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-200 font-bold">
                            {e.score.toFixed(1)}
                          </td>
                          <td className="py-1.5 px-2 text-center font-sans text-slate-300">
                            {e.style}
                          </td>
                          <td className="py-1.5 px-2 text-center text-slate-400">
                            {e.line_id}-{e.line_pos}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-400">
                            {e.gear_ratio.toFixed(2)}
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-300">
                            {(e.win_rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-300">
                            {(e.top2_rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-300">
                            {(e.top3_rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-1.5 px-2 text-right text-slate-400">
                            {e.back_count}
                          </td>
                          <td className="py-1.5 px-2 text-center font-sans">
                            {e.finish ? (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  e.finish === 1
                                    ? 'bg-amber-500/20 text-amber-300'
                                    : e.finish <= 3
                                    ? 'bg-blue-500/20 text-blue-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                {e.finish}着
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">レースID</th>
                      <th className="py-2.5 px-3">券種</th>
                      <th className="py-2.5 px-3">買い目</th>
                      <th className="py-2.5 px-3 text-right">確定オッズ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {filteredOdds.slice(0, 200).map((o) => (
                      <tr
                        key={`${o.race_id}-${o.bet_type}-${o.combo}`}
                        className="hover:bg-slate-800/40 cursor-pointer"
                        onClick={() => {
                          handleSelectRace(o.race_id);
                          setViewMode('race-linked');
                        }}
                      >
                        <td className="py-1.5 px-3 text-slate-300">{o.race_id}</td>
                        <td className="py-1.5 px-3 text-slate-400 uppercase">{o.bet_type}</td>
                        <td className="py-1.5 px-3 text-slate-200 font-bold">{o.combo}</td>
                        <td className="py-1.5 px-3 text-right text-emerald-400 font-bold">
                          {o.odds.toFixed(1)}倍
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
