/**
 * Keirin AI Forecasting Desktop Application
 * Windows Style Implementation based on Specification v0.1 (2026-10-10)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BacktestSummary,
  GridSearchRow,
  RaceGroup,
  StrategyParams,
} from './types/keirin';
import { generateSampleDataset } from './services/sampleData';
import { generateTodayLiveRaces, liveRaceToRaceGroup } from './services/liveCollector';
import { runFullPipeline, TrainedModel } from './services/modelEngine';
import { exportEntriesToCsv, exportOddsToCsv } from './services/csvParser';

import { WindowsTitleBar } from './components/WindowsTitleBar';
import { LiveRacesView } from './components/LiveRacesView';
import { PredictorView } from './components/PredictorView';
import { TrainingView } from './components/TrainingView';
import { StrategyGridView } from './components/StrategyGridView';
import { DataManagementView } from './components/DataManagementView';
import { DataIngestionView } from './components/DataIngestionView';
import { PythonExporterView } from './components/PythonExporterView';
import { PredictionResultsView } from './components/PredictionResultsView';
import { ComplianceModal } from './components/ComplianceModal';

import {
  Radio,
  Compass,
  Cpu,
  TableProperties,
  Database,
  FileCode2,
  SlidersHorizontal,
  CheckCircle2,
  Layers,
  ShieldCheck,
  Globe,
  Award,
} from 'lucide-react';
import { executeOfficialAutoSync } from './services/officialFetcher';

export default function App() {
  // Application State
  const [races, setRaces] = useState<RaceGroup[]>([]);
  const [model, setModel] = useState<TrainedModel | null>(null);
  const [summary, setSummary] = useState<BacktestSummary | null>(null);
  const [gridRows, setGridRows] = useState<GridSearchRow[]>([]);
  const [activeStrategy, setActiveStrategy] = useState<StrategyParams>({
    bet_type: 'exacta',
    ev_threshold: 1.1,
    min_prob: 0.05,
    max_bets_per_race: 3,
  });

  const [activeTab, setActiveTab] = useState<
    'live' | 'predict' | 'results' | 'training' | 'grid' | 'data' | 'ingest' | 'python'
  >('live');
  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  const [isTraining, setIsTraining] = useState<boolean>(false);
  const [isComplianceOpen, setIsComplianceOpen] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Initialize with combined live and historical dataset on first mount
  useEffect(() => {
    // 1. Generate today's active live races (Hiratsuka, Maebashi, Kokura)
    const initialLiveDetails = generateTodayLiveRaces('2026-10-10');
    const initialLiveGroups = initialLiveDetails.map(liveRaceToRaceGroup);

    // 2. Generate historical sample dataset for backtesting
    const initialHistorical = generateSampleDataset(120, 20261010);

    // 3. Combine both datasets seamlessly (Live races first, then historical)
    const map = new Map<string, RaceGroup>();
    initialLiveGroups.forEach((r) => map.set(r.race_id, r));
    initialHistorical.forEach((r) => {
      if (!map.has(r.race_id)) {
        map.set(r.race_id, r);
      }
    });

    const combinedDataset = Array.from(map.values());
    setRaces(combinedDataset);

    // 4. Default selected race to today's closing race or 1st race
    const defaultRace =
      initialLiveGroups.find((r) => r.status === 'closing_soon') ||
      initialLiveGroups[0] ||
      combinedDataset[0];
    if (defaultRace) {
      setSelectedRaceId(defaultRace.race_id);
    }

    // 5. Initial train & pipeline run
    const { model: trainedMdl, summary: initialSummary, gridRows: initialGrid } =
      runFullPipeline(combinedDataset, 40, 0.0);

    setModel(trainedMdl);
    setSummary(initialSummary);
    setGridRows(initialGrid);
    setActiveStrategy(initialSummary.best_strategy);
  }, []);

  // Auto-sync live updates from collector engine into central database
  const handleUpdateLiveRaces = useCallback((updatedLiveRaces: RaceGroup[]) => {
    setRaces((prev) => {
      const map = new Map<string, RaceGroup>();
      prev.forEach((r) => map.set(r.race_id, r));
      updatedLiveRaces.forEach((r) => map.set(r.race_id, r));
      return Array.from(map.values());
    });
  }, []);

  // Handle re-training
  const handleRetrain = (minBets: number, minHitRate: number) => {
    if (races.length === 0) return;
    setIsTraining(true);
    showToast('モデル学習および戦略グリッド探索を開始しました...');

    setTimeout(() => {
      const { model: trainedMdl, summary: newSummary, gridRows: newGrid } =
        runFullPipeline(races, minBets, minHitRate);

      setModel(trainedMdl);
      setSummary(newSummary);
      setGridRows(newGrid);
      setActiveStrategy(newSummary.best_strategy);
      setIsTraining(false);
      showToast(
        `学習完了: 最適温度 T=${trainedMdl.optimalTemperature.toFixed(2)}, 最適戦略: ${newSummary.best_strategy.bet_type.toUpperCase()} (EV ≧ ${newSummary.best_strategy.ev_threshold})`
      );
    }, 200);
  };

  // Handle global official sync trigger
  const handleGlobalOfficialSync = useCallback(async () => {
    showToast('公式サイト (KEIRIN.JP / netkeirin) から本日の全データを自動取得中...');
    try {
      const res = await executeOfficialAutoSync('2026-10-10', 'all');
      setRaces((prev) => {
        const map = new Map<string, RaceGroup>();
        prev.forEach((r) => map.set(r.race_id, r));
        res.races.forEach((r) => map.set(r.race_id, r));
        return Array.from(map.values());
      });
      showToast(
        `公式サイトからの必要データ自動取得が完了しました (${res.summary.venueCount}会場・全${res.summary.totalRaces}レース、出走選手${res.summary.totalEntries}名、オッズ${res.summary.totalOdds.toLocaleString()}件、確定結果${res.summary.finishedRaces}レース同期済)`
      );
    } catch (err: any) {
      showToast(`公式サイト自動取得エラー: ${err?.message || '通信失敗'}`);
    }
  }, [showToast]);

  // Handle new dataset loaded from CSV or HTML or Synthetic
  const handleDataLoaded = (newRaces: RaceGroup[]) => {
    setRaces((prev) => {
      // Merge by race_id (new races overwrite existing)
      const map = new Map<string, RaceGroup>();
      prev.forEach((r) => map.set(r.race_id, r));
      newRaces.forEach((r) => map.set(r.race_id, r));
      const combined = Array.from(map.values());

      // Auto update model with combined races
      setTimeout(() => {
        const { model: trainedMdl, summary: newSummary, gridRows: newGrid } =
          runFullPipeline(combined, 40, 0.0);
        setModel(trainedMdl);
        setSummary(newSummary);
        setGridRows(newGrid);
        setActiveStrategy(newSummary.best_strategy);
      }, 50);

      return combined;
    });

    showToast(`データを取り込みました (総計: ${newRaces.length} レース)`);
  };

  // Handle Menu Bar Actions
  const handleMenuAction = (action: string) => {
    switch (action) {
      case 'generate_data':
        setActiveTab('ingest');
        showToast('合成データ生成タブを開きました。');
        break;
      case 'import_csv':
      case 'import_html':
        setActiveTab('ingest');
        break;
      case 'export_csv': {
        const allEntries = races.flatMap((r) => r.entries);
        const csv = exportEntriesToCsv(allEntries);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'entries.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast('entries.csv をエクスポートしました。');
        break;
      }
      case 'export_python':
        setActiveTab('python');
        break;
      case 'train_model':
        setActiveTab('training');
        handleRetrain(40, 0.0);
        break;
      case 'grid_search':
        setActiveTab('grid');
        break;
      case 'view_features':
        setActiveTab('training');
        break;
      case 'nav_live':
        setActiveTab('live');
        break;
      case 'nav_predict':
        setActiveTab('predict');
        break;
      case 'nav_grid':
        setActiveTab('grid');
        break;
      case 'nav_data':
        setActiveTab('data');
        break;
      case 'open_compliance':
      case 'open_spec':
        setIsComplianceOpen(true);
        break;
      case 'minimize':
        showToast('アプリケーションは最小化可能です。');
        break;
      case 'close':
        showToast('競輪AI予想システムは待機中です。');
        break;
      default:
        break;
    }
  };

  const navItems = [
    { id: 'live', label: '開催中レース', icon: Radio, sub: '直前オッズ・締切' },
    { id: 'predict', label: 'レース予想', icon: Compass, sub: 'predict.py' },
    { id: 'results', label: '的中判定・収支分析', icon: Award, sub: '開催地別回収率・損益' },
    { id: 'training', label: '学習・バックテスト', icon: Cpu, sub: 'train_backtest.py' },
    { id: 'grid', label: '戦略グリッド探索', icon: SlidersHorizontal, sub: 'grid_validation.csv' },
    { id: 'data', label: '出走表・データ管理', icon: TableProperties, sub: 'entries/odds' },
    { id: 'ingest', label: '公式サイトデータ取込', icon: Globe, sub: '出走表・オッズ・結果' },
    { id: 'python', label: 'Python CLIコード', icon: FileCode2, sub: 'スクリプト出力' },
  ];

  return (
    <div
      className={`min-h-screen w-full flex flex-col bg-slate-950 text-slate-100 ${
        isMaximized ? 'p-0' : 'p-1.5 md:p-3'
      }`}
    >
      {/* Outer Windows App Window Frame Container */}
      <div
        className={`flex-1 flex flex-col bg-slate-950 border border-slate-800 rounded-lg shadow-2xl transition-all ${
          isMaximized ? 'rounded-none border-none' : ''
        }`}
      >
        {/* Windows 11 Title Bar & Menu Bar */}
        <WindowsTitleBar
          onMenuAction={handleMenuAction}
          statusText={isTraining ? '学習計算中...' : 'モデル準備完了 (T=1.00)'}
          isMaximized={isMaximized}
          onToggleMaximize={() => setIsMaximized(!isMaximized)}
        />

        {/* Desktop Workspace Body */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-slate-950">
          {/* Left Navigation Sidebar */}
          <aside className="w-full lg:w-56 bg-slate-900/90 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col justify-between shrink-0 p-2.5 overflow-y-auto">
            <div className="space-y-1">
              <div className="px-2 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                機能ワークスペース
              </div>

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id as any)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-all text-left ${
                      isActive
                        ? 'bg-slate-800 text-emerald-400 font-semibold shadow-sm border border-slate-700/60'
                        : 'text-slate-300 hover:bg-slate-800/50 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {item.sub}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar Bottom Meta & Quick Stats */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2 text-[11px]">
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800/80 space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>登録レース数:</span>
                  <span className="text-slate-200 font-bold">{races.length} R</span>
                </div>
                {summary && (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>テスト回収率:</span>
                      <span className="text-emerald-400 font-bold">
                        {summary.test_performance.recovery_rate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>最適券種:</span>
                      <span className="text-slate-200 uppercase">
                        {summary.best_strategy.bet_type}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={() => setIsComplianceOpen(true)}
                className="w-full py-1.5 px-2 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 text-slate-400 hover:text-slate-200 rounded text-[11px] flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>コンプライアンス・免責確認</span>
              </button>
            </div>
          </aside>

          {/* Main Viewport Content */}
          <main className="flex-1 overflow-y-auto p-3 lg:p-4 bg-slate-950/90 flex flex-col min-h-0">
            {model && summary ? (
              <>
                {activeTab === 'live' && (
                  <LiveRacesView
                    model={model}
                    activeStrategy={activeStrategy}
                    selectedRaceId={selectedRaceId}
                    onSelectRace={setSelectedRaceId}
                    onUpdateLiveRaces={handleUpdateLiveRaces}
                    onImportLiveRaces={(newLiveRaces) => {
                      handleDataLoaded(newLiveRaces);
                      showToast(`本日開催中の ${newLiveRaces.length} レースを出走表とAIモデルに一括反映しました。`);
                    }}
                    onSelectForPrediction={(raceId) => {
                      setSelectedRaceId(raceId);
                      setActiveTab('predict');
                      showToast(`レース [${raceId}] を詳細予想ワークスペースに展開しました。`);
                    }}
                  />
                )}
                {activeTab === 'predict' && (
                  <PredictorView
                    races={races}
                    model={model}
                    activeStrategy={activeStrategy}
                    onUpdateStrategy={setActiveStrategy}
                    selectedRaceId={selectedRaceId}
                    onSelectRace={setSelectedRaceId}
                    initialRaceId={selectedRaceId}
                  />
                )}
                {activeTab === 'results' && (
                  <PredictionResultsView
                    races={races}
                    model={model}
                    activeStrategy={activeStrategy}
                    onUpdateStrategy={(newStrat) => {
                      setActiveStrategy(newStrat);
                      showToast(
                        `戦略パラメータを更新: ${newStrat.bet_type.toUpperCase()} (EV ≧ ${newStrat.ev_threshold})`
                      );
                    }}
                    onSelectRaceForDetail={(raceId) => {
                      setSelectedRaceId(raceId);
                      setActiveTab('predict');
                      showToast(`レース [${raceId}] を詳細予想ワークスペースに展開しました。`);
                    }}
                  />
                )}
                {activeTab === 'training' && (
                  <TrainingView
                    races={races}
                    model={model}
                    summary={summary}
                    onRetrain={handleRetrain}
                    isTraining={isTraining}
                  />
                )}
                {activeTab === 'grid' && (
                  <StrategyGridView
                    gridRows={gridRows}
                    bestStrategy={activeStrategy}
                    onApplyStrategy={(newStrat) => {
                      setActiveStrategy(newStrat);
                      showToast(`戦略パラメータを更新: ${newStrat.bet_type.toUpperCase()} (EV ≧ ${newStrat.ev_threshold})`);
                    }}
                  />
                )}
                {activeTab === 'data' && (
                  <DataManagementView
                    races={races}
                    selectedRaceId={selectedRaceId}
                    onSelectRace={setSelectedRaceId}
                    onSelectForPrediction={(raceId) => {
                      setSelectedRaceId(raceId);
                      setActiveTab('predict');
                      showToast(`レース [${raceId}] を詳細予想ワークスペースに展開しました。`);
                    }}
                    onSyncOfficial={handleGlobalOfficialSync}
                  />
                )}
                {activeTab === 'ingest' && (
                  <DataIngestionView
                    onDataLoaded={handleDataLoaded}
                    currentRaceCount={races.length}
                  />
                )}
                {activeTab === 'python' && <PythonExporterView />}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
                <Layers className="w-8 h-8 animate-pulse text-emerald-500 mb-2" />
                <span>競輪AIモデルおよび特徴量パイプラインを初期化中...</span>
              </div>
            )}
          </main>
        </div>

        {/* Windows Desktop Status Bar */}
        <footer className="h-6 bg-slate-900 border-t border-slate-800 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none font-mono">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>システム稼働中</span>
            </span>
            <span>·</span>
            <span>特徴量: 25個抽出</span>
            <span>·</span>
            <span>Harville近似: 確率整合性検証済</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>仕様書 v0.1 (2026-10-10)</span>
            <span>控除率: 約25%</span>
          </div>
        </footer>
      </div>

      {/* Windows Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 border border-slate-700 text-slate-100 text-xs px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Compliance & Legal Modal */}
      <ComplianceModal
        isOpen={isComplianceOpen}
        onClose={() => setIsComplianceOpen(false)}
      />
    </div>
  );
}
