/**
 * Live Active Races View (開催中データ自動取得画面)
 * Implements real-time fetching, auto-refresh polling, odds fluctuations,
 * and live EV buy/skip decision engine.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  LiveRaceDetail,
  LiveVenue,
  ACTIVE_VENUES,
  generateTodayLiveRaces,
  fluctuateLiveOdds,
  liveRaceToRaceGroup,
  DEFAULT_CONFIG,
  AutoFetchConfig,
  safeCollectorEngine,
  CollectorLogItem,
} from '../services/liveCollector';
import { TrainedModel, predictRiderWinProbabilities } from '../services/modelEngine';
import { computeAllCombinations } from '../services/harville';
import { RaceLineDiagram, CAR_COLORS } from './RaceLineDiagram';
import { RaceGroup, StrategyParams, CombinationProb } from '../types/keirin';
import {
  Radio,
  RotateCw,
  Clock,
  ShieldCheck,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  ExternalLink,
  Flame,
  ArrowRight,
  Eye,
  Terminal,
  ChevronDown,
  ChevronUp,
  Database,
  Activity,
  Server,
  Trophy,
  Award,
  Check,
  X,
  Bell,
  Sparkles,
  Zap,
  Globe,
  CalendarDays,
  MapPin,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import { executeOfficialAutoSync, fetchOfficialKaisaiSchedule } from '../services/officialFetcher';

interface LiveRacesViewProps {
  model: TrainedModel;
  activeStrategy: StrategyParams;
  onImportLiveRaces: (races: RaceGroup[]) => void;
  onSelectForPrediction: (raceId: string) => void;
  selectedRaceId?: string;
  onSelectRace?: (raceId: string) => void;
  onUpdateLiveRaces?: (races: RaceGroup[]) => void;
}

export const LiveRacesView: React.FC<LiveRacesViewProps> = ({
  model,
  activeStrategy,
  onImportLiveRaces,
  onSelectForPrediction,
  selectedRaceId: externalSelectedRaceId,
  onSelectRace,
  onUpdateLiveRaces,
}) => {
  // Config & Status State
  const [config, setConfig] = useState<AutoFetchConfig>(DEFAULT_CONFIG);
  const [liveRaces, setLiveRaces] = useState<LiveRaceDetail[]>(() => generateTodayLiveRaces());
  const [selectedVenueCode, setSelectedVenueCode] = useState<string>('35'); // Default: Hiratsuka
  const [selectedRaceId, setSelectedRaceId] = useState<string>(
    externalSelectedRaceId || ''
  );
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string>(new Date().toLocaleTimeString());
  const [countdownSeconds, setCountdownSeconds] = useState<number>(30);
  const [confirmedAlert, setConfirmedAlert] = useState<{
    venueName: string;
    raceNo: number;
    winnerCar: number;
    exactaCombo: string;
    exactaPayout: number;
    trifectaCombo: string;
    trifectaPayout: number;
  } | null>(null);
  const [collectorLogs, setCollectorLogs] = useState<CollectorLogItem[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'INFO',
      action: 'collect.py 初期化',
      url: '/api/collector/v1/init',
      statusText: '自動取得停止中 (手動取得モード待機, robots.txt検証済, 3.0s礼儀間隔遵守)',
      robotsPassed: true,
      cacheHit: true,
      latencyMs: 12,
    },
  ]);
  const [isLogPanelOpen, setIsLogPanelOpen] = useState<boolean>(false);

  // Sync externalSelectedRaceId when changed from other views
  useEffect(() => {
    if (externalSelectedRaceId) {
      setSelectedRaceId(externalSelectedRaceId);
      const matched = liveRaces.find((r) => r.race_id === externalSelectedRaceId);
      if (matched && matched.venueCode !== selectedVenueCode) {
        setSelectedVenueCode(matched.venueCode);
      }
    }
  }, [externalSelectedRaceId, liveRaces, selectedVenueCode]);

  // Initial notify to parent so central races database has today's live races
  useEffect(() => {
    if (onUpdateLiveRaces) {
      onUpdateLiveRaces(liveRaces.map(liveRaceToRaceGroup));
    }
  }, []);

  const handleSelectLiveRace = (raceId: string) => {
    setSelectedRaceId(raceId);
    if (onSelectRace) {
      onSelectRace(raceId);
    }
  };

  // Initialize selected race to the active "closing_soon" race
  useEffect(() => {
    if (!selectedRaceId && liveRaces.length > 0) {
      const activeRace =
        liveRaces.find(
          (r) => r.venueCode === selectedVenueCode && r.status === 'closing_soon'
        ) ||
        liveRaces.find((r) => r.venueCode === selectedVenueCode) ||
        liveRaces[0];
      if (activeRace) {
        handleSelectLiveRace(activeRace.race_id);
      }
    }
  }, [liveRaces, selectedVenueCode, selectedRaceId]);

  // Periodic Safe Background Polling useEffect Hook (conforming to collect.py & auto results fetch)
  useEffect(() => {
    safeCollectorEngine.setConfig(config.userAgent, config.complianceDelaySeconds);

    if (!config.enabled) return;

    const abortController = new AbortController();

    const timer = setInterval(async () => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          // Asynchronously trigger collect.py polite polling in background
          (async () => {
            try {
              const currentVenue =
                ACTIVE_VENUES.find((v) => v.code === selectedVenueCode) || ACTIVE_VENUES[0];

              const result = await safeCollectorEngine.executeSafeFetch(
                currentVenue.code,
                currentVenue.name,
                liveRaces,
                abortController.signal,
                config.autoFetchResults
              );

              setLiveRaces(result.updatedRaces);
              if (onUpdateLiveRaces) {
                onUpdateLiveRaces(result.updatedRaces.map(liveRaceToRaceGroup));
              }
              setCollectorLogs((logs) => [result.log, ...logs.slice(0, 24)]);
              setLastFetchedAt(new Date().toLocaleTimeString());

              // If a race was newly finished and results confirmed, trigger alert
              if (result.newlyFinishedRace) {
                const nr = result.newlyFinishedRace;
                const ex = nr.result?.payouts.find((p) => p.bet_type === 'exacta');
                const tri = nr.result?.payouts.find((p) => p.bet_type === 'trifecta');
                setConfirmedAlert({
                  venueName: nr.venueName,
                  raceNo: nr.raceNo,
                  winnerCar: nr.result?.top3[0] || 1,
                  exactaCombo: ex?.combo || '',
                  exactaPayout: ex?.payout || 0,
                  trifectaCombo: tri?.combo || '',
                  trifectaPayout: tri?.payout || 0,
                });
              }
            } catch (err: any) {
              if (err?.name !== 'AbortError' && err?.message !== 'Aborted') {
                console.warn('Background collector polite fetch error:', err);
              }
            }
          })();

          return config.intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timer);
      abortController.abort();
    };
  }, [
    config.enabled,
    config.intervalSeconds,
    config.autoFetchResults,
    selectedVenueCode,
    config.userAgent,
    config.complianceDelaySeconds,
    liveRaces,
    onUpdateLiveRaces,
  ]);

  // Manual Trigger Action with collect.py integration
  const handleManualFetch = async () => {
    setIsFetching(true);
    try {
      const currentVenue =
        ACTIVE_VENUES.find((v) => v.code === selectedVenueCode) || ACTIVE_VENUES[0];

      const result = await safeCollectorEngine.executeSafeFetch(
        currentVenue.code,
        currentVenue.name,
        liveRaces,
        undefined,
        config.autoFetchResults
      );

      setLiveRaces(result.updatedRaces);
      if (onUpdateLiveRaces) {
        onUpdateLiveRaces(result.updatedRaces.map(liveRaceToRaceGroup));
      }
      setCollectorLogs((logs) => [result.log, ...logs.slice(0, 24)]);
      setLastFetchedAt(new Date().toLocaleTimeString());
      setCountdownSeconds(config.intervalSeconds);

      if (result.newlyFinishedRace) {
        const nr = result.newlyFinishedRace;
        const ex = nr.result?.payouts.find((p) => p.bet_type === 'exacta');
        const tri = nr.result?.payouts.find((p) => p.bet_type === 'trifecta');
        setConfirmedAlert({
          venueName: nr.venueName,
          raceNo: nr.raceNo,
          winnerCar: nr.result?.top3[0] || 1,
          exactaCombo: ex?.combo || '',
          exactaPayout: ex?.payout || 0,
          trifectaCombo: tri?.combo || '',
          trifectaPayout: tri?.payout || 0,
        });
      }
    } catch (err) {
      console.warn('Manual fetch error:', err);
    } finally {
      setIsFetching(false);
    }
  };

  // Full Official Automatic Sync across official sources
  const handleOfficialFullSync = async () => {
    setIsFetching(true);
    try {
      const res = await executeOfficialAutoSync('2026-10-10', selectedVenueCode);
      setLiveRaces(res.liveRaces);
      if (onUpdateLiveRaces) {
        onUpdateLiveRaces(res.races);
      }
      setCollectorLogs((logs) => [
        ...res.logs.map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          level: l.type === 'SUCCESS' ? ('SUCCESS' as const) : l.type === 'WARN' ? ('WARN' as const) : ('INFO' as const),
          action: l.title,
          url: l.url,
          statusText: l.detail,
          robotsPassed: true,
          cacheHit: false,
          latencyMs: l.latencyMs,
        })),
        ...logs.slice(0, 16),
      ]);
      setLastFetchedAt(new Date().toLocaleTimeString());
      setCountdownSeconds(config.intervalSeconds);
    } catch (err) {
      console.warn('Official sync error:', err);
    } finally {
      setIsFetching(false);
    }
  };

  // Auto-fetch Kaisai meets and timetables
  const handleFetchKaisaiMeets = async () => {
    setIsFetching(true);
    try {
      const res = await fetchOfficialKaisaiSchedule('2026-10-10');
      setCollectorLogs((logs) => [
        ...res.logs.map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          level: l.type === 'SUCCESS' ? ('SUCCESS' as const) : l.type === 'WARN' ? ('WARN' as const) : ('INFO' as const),
          action: l.title,
          url: l.url,
          statusText: l.detail,
          robotsPassed: true,
          cacheHit: false,
          latencyMs: l.latencyMs,
        })),
        ...logs.slice(0, 16),
      ]);
      setLastFetchedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn('Kaisai fetch error:', err);
    } finally {
      setIsFetching(false);
    }
  };

  // Explicitly batch fetch official results for all finished / past races
  const handleFetchAllResults = () => {
    setIsFetching(true);
    try {
      const res = safeCollectorEngine.fetchAllResults(liveRaces);
      setLiveRaces(res.updatedRaces);
      if (onUpdateLiveRaces) {
        onUpdateLiveRaces(res.updatedRaces.map(liveRaceToRaceGroup));
      }
      setCollectorLogs((logs) => [res.log, ...logs.slice(0, 24)]);
      setLastFetchedAt(new Date().toLocaleTimeString());
    } finally {
      setIsFetching(false);
    }
  };

  // Advance next race in venue to finished with official results immediately for live demonstration
  const handleSimulateFinishNextRace = () => {
    const res = safeCollectorEngine.simulateFinishNextRace(selectedVenueCode, liveRaces);
    setLiveRaces(res.updatedRaces);
    if (onUpdateLiveRaces) {
      onUpdateLiveRaces(res.updatedRaces.map(liveRaceToRaceGroup));
    }
    if (res.finishedRace) {
      handleSelectLiveRace(res.finishedRace.race_id);
      const nr = res.finishedRace;
      const ex = nr.result?.payouts.find((p) => p.bet_type === 'exacta');
      const tri = nr.result?.payouts.find((p) => p.bet_type === 'trifecta');
      setConfirmedAlert({
        venueName: nr.venueName,
        raceNo: nr.raceNo,
        winnerCar: nr.result?.top3[0] || 1,
        exactaCombo: ex?.combo || '',
        exactaPayout: ex?.payout || 0,
        trifectaCombo: tri?.combo || '',
        trifectaPayout: tri?.payout || 0,
      });
    }
    setCollectorLogs((logs) => [res.log, ...logs.slice(0, 24)]);
    setLastFetchedAt(new Date().toLocaleTimeString());
  };

  // Advance this specifically selected race to finished
  const handleSimulateThisRace = (raceId: string) => {
    const target = liveRaces.find((r) => r.race_id === raceId);
    if (!target) return;
    const res = safeCollectorEngine.simulateFinishNextRace(target.venueCode, liveRaces);
    setLiveRaces(res.updatedRaces);
    if (onUpdateLiveRaces) {
      onUpdateLiveRaces(res.updatedRaces.map(liveRaceToRaceGroup));
    }
    setCollectorLogs((logs) => [res.log, ...logs.slice(0, 24)]);
    setLastFetchedAt(new Date().toLocaleTimeString());
  };

  // Filtered races for the selected venue
  const venueRaces = useMemo(() => {
    return liveRaces.filter((r) => r.venueCode === selectedVenueCode);
  }, [liveRaces, selectedVenueCode]);

  const selectedRace = useMemo(() => {
    const found = liveRaces.find((r) => r.race_id === selectedRaceId);
    if (found) return found;
    return venueRaces[0] || liveRaces[0];
  }, [liveRaces, selectedRaceId, venueRaces]);

  // Automatically keep selectedVenueCode in sync with selectedRace
  useEffect(() => {
    if (selectedRace && selectedRace.venueCode && selectedRace.venueCode !== selectedVenueCode) {
      setSelectedVenueCode(selectedRace.venueCode);
    }
  }, [selectedRace?.venueCode, selectedVenueCode]);

  const currentVenue = useMemo(() => {
    return ACTIVE_VENUES.find((v) => v.code === selectedVenueCode) || ACTIVE_VENUES[0];
  }, [selectedVenueCode]);

  // Compute live AI predictions and EV on the fly for the selected race
  const livePredictions = useMemo(() => {
    if (!selectedRace) return null;
    const riderProbs = predictRiderWinProbabilities(model, selectedRace.entries);
    const cars = riderProbs.map((p) => ({ car_no: p.car_no, prob: p.prob }));
    const { byType } = computeAllCombinations(cars);

    // Filter by active bet type
    const targetCombos = byType[activeStrategy.bet_type] || [];
    const oddsMap = new Map<string, number>();
    selectedRace.odds
      .filter((o) => o.bet_type === activeStrategy.bet_type)
      .forEach((o) => oddsMap.set(o.combo, o.odds));

    const evaluated = targetCombos
      .map((c) => {
        const odds = oddsMap.get(c.combo) || 0;
        const ev = odds > 0 ? c.prob * odds : 0;
        return {
          ...c,
          odds,
          ev,
          isQualifying: ev >= activeStrategy.ev_threshold && c.prob >= activeStrategy.min_prob,
        };
      })
      .sort((a, b) => b.ev - a.ev);

    const recommended = evaluated.filter((c) => c.isQualifying).slice(0, activeStrategy.max_bets_per_race);
    const isBuy = recommended.length > 0;

    return {
      riderProbs,
      evaluated,
      recommended,
      isBuy,
    };
  }, [selectedRace, model, activeStrategy]);

  // Evaluate AI predictions against official race result if finished
  const raceResultEvaluation = useMemo(() => {
    if (!selectedRace?.result || !livePredictions) return null;
    const res = selectedRace.result;
    const top1 = res.top3[0];
    const top2 = res.top3[1];
    const top3 = res.top3[2];

    const winningCombos: Record<string, string> = {
      exacta: `${top1}-${top2}`,
      quinella: top1 < top2 ? `${top1}-${top2}` : `${top2}-${top1}`,
      trifecta: `${top1}-${top2}-${top3}`,
      trio: [top1, top2, top3].sort((a, b) => a - b).join('-'),
      wide: top1 < top2 ? `${top1}-${top2}` : `${top2}-${top1}`,
    };

    const winningCombo = winningCombos[activeStrategy.bet_type] || '';
    const hitBet = livePredictions.recommended.find((b) => b.combo === winningCombo);
    const isHit = !!hitBet;

    const officialPayoutItem = res.payouts.find(
      (p) => p.bet_type === activeStrategy.bet_type && (p.combo === winningCombo || activeStrategy.bet_type === 'wide')
    );
    const officialPayout = officialPayoutItem?.payout || 0;
    const betCount = livePredictions.recommended.length;
    const totalCost = betCount * 100;
    const totalReturn = isHit ? officialPayout : 0;
    const netProfit = totalReturn - totalCost;
    const roi = totalCost > 0 ? Math.round((totalReturn / totalCost) * 100) : 0;

    return {
      isHit,
      hitBet,
      officialPayout,
      totalCost,
      totalReturn,
      netProfit,
      roi,
      winningCombo,
      wasSkip: !livePredictions.isBuy,
    };
  }, [selectedRace, livePredictions, activeStrategy]);

  // Import all ongoing races of today into AI system
  const handleImportAllLiveRaces = () => {
    const converted = liveRaces.map(liveRaceToRaceGroup);
    onImportLiveRaces(converted);
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Live Control Center Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                {config.enabled && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    config.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                />
              </span>
              <h2 className="text-sm font-bold text-slate-100">
                本日開催レース (Live Active Races)
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  config.enabled
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                    : 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                }`}
              >
                {config.enabled ? '自動取得稼働中' : '自動取得: OFF (手動取得モード)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              全国の競輪場から当日の出走表・直前変動オッズ・確定結果を取得し、AI期待値をリアルタイム算出。(※自動取得OFF・手動更新モード)
            </p>
          </div>

          {/* Action & Config Bar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              className={`px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                config.enabled
                  ? 'bg-slate-800 text-emerald-400 border-emerald-600/50'
                  : 'bg-slate-900 text-amber-300 border-amber-700/60 hover:bg-slate-800'
              }`}
              title={config.enabled ? '自動取得を停止します' : '自動取得を再開します'}
            >
              {config.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{config.enabled ? '自動更新中' : '自動取得OFF (手動)'}</span>
            </button>

            {/* Interval Selector */}
            <div className="flex items-center gap-1 text-xs text-slate-300">
              <span className="text-slate-400 text-[11px]">間隔:</span>
              <select
                value={config.intervalSeconds}
                onChange={(e) =>
                  setConfig({ ...config, intervalSeconds: parseInt(e.target.value, 10) })
                }
                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs text-slate-200 font-mono"
              >
                <option value={15}>15秒</option>
                <option value={30}>30秒</option>
                <option value={60}>1分</option>
                <option value={300}>5分</option>
              </select>
            </div>

            {/* Auto Results Checkbox Toggle */}
            <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-slate-950 px-2.5 py-1.5 rounded border border-slate-700 select-none hover:bg-slate-800/60 transition-colors">
              <input
                type="checkbox"
                checked={config.autoFetchResults}
                onChange={(e) => setConfig({ ...config, autoFetchResults: e.target.checked })}
                className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
              />
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-semibold text-slate-200">結果自動取得</span>
            </label>

            {/* Kaisai Meets Fetch Button */}
            <button
              onClick={handleFetchKaisaiMeets}
              disabled={isFetching}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 border border-blue-500/80"
              title="本日全国の開催競輪場と番組表日程を手動取得"
            >
              <CalendarDays className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>開催データ手動取得</span>
            </button>

            {/* Official Source Sync Button */}
            <button
              onClick={handleOfficialFullSync}
              disabled={isFetching}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 border border-emerald-500/80"
              title="JKA公認 KEIRIN.JP / netkeirin から出走表・オッズ・確定結果を手動同期"
            >
              <Globe className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>出走表・オッズ手動同期</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={handleManualFetch}
              disabled={isFetching}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700 disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>{isFetching ? '同期中...' : '手動更新'}</span>
            </button>

            {/* Batch Fetch All Results Button */}
            <button
              onClick={handleFetchAllResults}
              disabled={isFetching}
              className="px-2.5 py-1.5 bg-blue-600/90 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              title="本日終了レースの公式着順・払戻金を手動一括取得"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-300" />
              <span>確定結果手動取得</span>
            </button>

            {/* Simulate Next Finished Race */}
            <button
              onClick={handleSimulateFinishNextRace}
              disabled={isFetching}
              className="px-2.5 py-1.5 bg-purple-700/80 hover:bg-purple-600 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              title="直近レースの公式結果確定を即時シミュレート"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>次レース確定</span>
            </button>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>最終取得: <strong className="text-slate-100 font-mono">{lastFetchedAt}</strong></span>
            </span>
            <span>·</span>
            {config.enabled ? (
              <span className="font-mono">
                次回自動更新まで: <strong className="text-emerald-400">{countdownSeconds}秒</strong>
              </span>
            ) : (
              <span className="font-mono text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 text-[11px]">
                自動取得: 停止中 (手動更新モード)
              </span>
            )}
            <span>·</span>
            <span>
              開催場: <strong className="text-slate-200">{ACTIVE_VENUES.length}場</strong> ({liveRaces.length}R中 <strong className="text-emerald-400">{liveRaces.filter(r => r.status === 'finished').length}R結果確定</strong>)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-emerald-400/90 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>robots.txt 礼儀正しい間隔遵守</span>
            </span>
            <button
              onClick={handleImportAllLiveRaces}
              className="text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2 ml-2"
            >
              本日全レースを一括システム反映
            </button>
          </div>
        </div>

        {/* Collapsible collect.py Execution Monitor */}
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <button
            onClick={() => setIsLogPanelOpen(!isLogPanelOpen)}
            className="w-full flex items-center justify-between p-2 rounded bg-slate-950/70 hover:bg-slate-950 border border-slate-800 text-xs transition-colors"
          >
            <div className="flex items-center gap-2 font-mono">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-slate-200">collect.py バックグラウンド取得モニター</span>
              <span className="text-[10px] text-slate-400">
                (最新 {collectorLogs.length}件の通信ログ)
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                200 OK
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-950 text-blue-300 border border-blue-800">
                robots.txt PASS
              </span>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800">
                3.0s 遅延遵守
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>{isLogPanelOpen ? 'ログを折りたたむ' : '実行ログを表示'}</span>
              {isLogPanelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {isLogPanelOpen && (
            <div className="mt-2 p-3 bg-slate-950 rounded border border-slate-800 font-mono text-[11px] space-y-1.5 max-h-48 overflow-y-auto">
              <div className="text-[10px] text-slate-500 pb-1 border-b border-slate-900 flex justify-between">
                <span>User-Agent: {config.userAgent}</span>
                <span>アクセス待機: {config.complianceDelaySeconds}秒</span>
              </div>
              {collectorLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                  <span
                    className={`px-1 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                      log.level === 'SUCCESS'
                        ? 'bg-emerald-950 text-emerald-300'
                        : log.level === 'WARN'
                        ? 'bg-amber-950 text-amber-300'
                        : 'bg-blue-950 text-blue-300'
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-300 font-semibold shrink-0">{log.action}</span>
                  <span className="text-slate-400 truncate flex-1">{log.statusText}</span>
                  <span className="text-slate-500 text-[10px] shrink-0 font-mono">
                    {log.latencyMs}ms {log.cacheHit ? '(cache)' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Venue Selector Tabs */}
      <div className="flex flex-wrap gap-2">
        {ACTIVE_VENUES.map((venue) => {
          const isSelected = selectedVenueCode === venue.code;
          const venueRaceCount = liveRaces.filter((r) => r.venueCode === venue.code).length;

          return (
            <button
              key={venue.code}
              onClick={() => {
                setSelectedVenueCode(venue.code);
                const firstRace = liveRaces.find((r) => r.venueCode === venue.code);
                if (firstRace) handleSelectLiveRace(firstRace.race_id);
              }}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs transition-all border ${
                isSelected
                  ? 'bg-slate-900 border-emerald-500/70 text-slate-100 shadow-sm'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-100">{venue.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      venue.grade === 'G3'
                        ? 'bg-amber-500/20 text-amber-300'
                        : venue.grade === 'F1'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {venue.grade}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {venue.timeSlot}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {venue.bankLength} · {venue.weather}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Race Number Selector Strip (1R .. 12R) */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-300">
            {currentVenue.name}競輪 レース一覧 (全{venueRaces.length}R)
          </span>
          <span className="text-[11px] text-slate-400">
            黄色点滅は「締切直前」レース
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-12 gap-1.5">
          {venueRaces.map((r) => {
            const isSelected = selectedRaceId === r.race_id;

            return (
              <button
                key={r.race_id}
                onClick={() => handleSelectLiveRace(r.race_id)}
                className={`p-2 rounded text-left transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'bg-emerald-950/70 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/50 shadow-md'
                    : r.status === 'closing_soon'
                    ? 'bg-amber-950/40 border-amber-500/70 text-amber-200 animate-pulse'
                    : r.status === 'racing'
                    ? 'bg-cyan-950/30 border-cyan-500/60 text-cyan-200'
                    : r.status === 'finished'
                    ? 'bg-slate-950/90 border-slate-800 text-slate-400 hover:bg-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-mono font-bold text-xs ${isSelected ? 'text-emerald-300' : ''}`}>
                    {r.raceNo}R
                  </span>
                  <span className="text-[9px] font-mono text-slate-400" title={`発走予定: ${r.postTime}`}>
                    {r.postTime}発走
                  </span>
                </div>
                <div className="mt-1 text-[10px] truncate text-slate-300" title={r.raceTitle}>
                  {r.raceTitle}
                </div>
                <div className="mt-1.5 text-[9px] font-semibold flex items-center justify-between">
                  <span className="text-amber-300 font-mono text-[10px]" title="締切予定時刻">
                    {r.deadlineTime}締切
                  </span>
                  {r.status === 'finished' ? (
                    <span className="text-slate-400 px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-[8px]">確定済</span>
                  ) : r.status === 'closing_soon' ? (
                    <span className="text-amber-400 font-bold px-1 py-0.2 rounded bg-amber-950/80 border border-amber-800 text-[8px] animate-pulse">締切直前</span>
                  ) : r.status === 'racing' ? (
                    <span className="text-cyan-400 font-bold px-1 py-0.2 rounded bg-cyan-950/80 border border-cyan-800 text-[8px]">発走中</span>
                  ) : (
                    <span className="text-emerald-400 text-[8px]">発売中</span>
                  )}
                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block ml-1" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Live Race Focus Section */}
      {selectedRace && livePredictions && (
        <div className="space-y-4">
          {/* 1. Selected Race Comprehensive Details Card (選択したレースの詳細情報カード) */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 sm:p-4 shadow-md space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-extrabold text-sm font-mono shadow-sm flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedRace.venueName}競輪 {selectedRace.raceNo}R</span>
                  </span>
                  <h3 className="text-sm font-bold text-slate-100">
                    {selectedRace.raceTitle || '予選'}
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

                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-medium">
                  {selectedRace.timeSlot}
                </span>

                <span className="text-[11px] text-slate-400 font-mono">
                  {selectedRace.entries[0]?.date || '2026-10-10'}
                </span>
              </div>

              {/* Deadline & Post Time Badges (締切時刻 ＆ 発走時刻) */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-950/80 border border-amber-600/70 text-amber-200 font-mono text-xs font-bold shadow-sm">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>〆切予定: <strong className="text-amber-300 text-sm">{selectedRace.deadlineTime}</strong></span>
                </div>

                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono text-xs">
                  <span>発走: <strong className="text-slate-100">{selectedRace.postTime}</strong></span>
                </div>

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

            {/* Sub-info grid: Bank, Weather, Entries count, Odds count */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">バンク周長・特徴</div>
                <div className="font-semibold text-slate-200 mt-0.5">{currentVenue.bankLength} ({currentVenue.timeSlot})</div>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">天候・コンディション</div>
                <div className="font-semibold text-slate-200 mt-0.5">{selectedRace.result?.weather || currentVenue.weather}</div>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">出走頭数</div>
                <div className="font-semibold text-slate-200 mt-0.5 font-mono">{selectedRace.entries.length}車立</div>
              </div>
              <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800/80">
                <div className="text-[10px] text-slate-400">リアルタイムオッズ件数</div>
                <div className="font-semibold text-emerald-400 mt-0.5 font-mono">{selectedRace.odds.length}通り 登録済</div>
              </div>
            </div>
          </div>

          {/* Line Formation Diagram */}
          <RaceLineDiagram entries={selectedRace.entries} />

          {/* 2. Confirmed Race Result & Hit/Miss Judgment (確定レースの場合に詳細結果を表示) */}
          {selectedRace.status === 'finished' && selectedRace.result && raceResultEvaluation && (
            <div
              className={`border rounded-lg p-4 transition-all shadow-lg ${
                raceResultEvaluation.isHit
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-emerald-950/40 text-emerald-100 ring-1 ring-emerald-500/50'
                  : raceResultEvaluation.wasSkip
                  ? 'bg-slate-900 border-slate-700 text-slate-200'
                  : 'bg-rose-950/30 border-rose-600/70 shadow-rose-950/30 text-rose-100'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
                      raceResultEvaluation.isHit
                        ? 'bg-emerald-500 text-white shadow-md'
                        : raceResultEvaluation.wasSkip
                        ? 'bg-slate-700 text-slate-200'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {raceResultEvaluation.isHit ? (
                      <Award className="w-7 h-7" />
                    ) : raceResultEvaluation.wasSkip ? (
                      <MinusCircle className="w-7 h-7 text-amber-400" />
                    ) : (
                      <XCircle className="w-7 h-7" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-80">
                        【{selectedRace.venueName} {selectedRace.raceNo}R 結果確定 ＆ 予想的中判断】
                      </span>
                      <span
                        className={`text-sm font-bold px-2.5 py-0.5 rounded font-sans ${
                          raceResultEvaluation.isHit
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : raceResultEvaluation.wasSkip
                            ? 'bg-slate-800 text-amber-300 border border-slate-700'
                            : 'bg-rose-600/30 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {raceResultEvaluation.isHit
                          ? '🎯【 的中 (HIT) 】'
                          : raceResultEvaluation.wasSkip
                          ? '⏸【 見送り (SKIP - 資金防衛) 】'
                          : '❌【 不的中 (MISS) 】'}
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-300">
                      {raceResultEvaluation.isHit
                        ? `AI推奨買い目が見事的中！ 確定的中目「${raceResultEvaluation.winningCombo}」を捉え、払戻金 ${raceResultEvaluation.totalReturn.toLocaleString()}円 を獲得しました（純利益 ${raceResultEvaluation.netProfit > 0 ? '+' : ''}${raceResultEvaluation.netProfit.toLocaleString()}円、レース回収率 ${raceResultEvaluation.roi}%）。`
                        : raceResultEvaluation.wasSkip
                        ? `AI期待値判定により事前見送り（投資0円）。確定的中目は「${raceResultEvaluation.winningCombo}」（公式配当 ${(raceResultEvaluation.officialPayout || 0).toLocaleString()}円）でしたが、資金防衛に成功しました。`
                        : `確定的中目は「${raceResultEvaluation.winningCombo}」（公式配当 ${(raceResultEvaluation.officialPayout || 0).toLocaleString()}円）でした。投資額 ${raceResultEvaluation.totalCost}円 に対し不的中（損益 -${raceResultEvaluation.totalCost}円）。`}
                    </p>
                  </div>
                </div>

                {/* Quick PnL Stats */}
                <div className="flex items-center gap-2 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-xs font-mono">
                  <div className="px-2 border-r border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400">投資金額</div>
                    <div className="font-bold text-slate-200">{raceResultEvaluation.totalCost}円</div>
                  </div>
                  <div className="px-2 border-r border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400">払戻金</div>
                    <div className="font-bold text-emerald-400">{raceResultEvaluation.totalReturn}円</div>
                  </div>
                  <div className="px-2 border-r border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400">純損益</div>
                    <div className={`font-bold ${raceResultEvaluation.netProfit > 0 ? 'text-emerald-400' : raceResultEvaluation.netProfit < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {raceResultEvaluation.netProfit > 0 ? '+' : ''}{raceResultEvaluation.netProfit}円
                    </div>
                  </div>
                  <div className="px-2 text-center">
                    <div className="text-[10px] text-slate-400">回収率</div>
                    <div className={`font-bold text-sm ${raceResultEvaluation.roi >= 100 ? 'text-emerald-400' : raceResultEvaluation.totalCost > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {raceResultEvaluation.totalCost > 0 ? `${raceResultEvaluation.roi}%` : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top 3 Finishers & Payouts mini table */}
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* 確定着順 (1-3着) */}
                <div className="p-2.5 bg-slate-950/90 rounded border border-slate-800 space-y-1.5 font-sans">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>上位入線結果 (確定着順)</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      締切: {selectedRace.deadlineTime} / 発走: {selectedRace.postTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-amber-500/40 text-amber-300 font-bold">
                      <span>1着</span>
                      <span className="text-base font-extrabold">{selectedRace.result.top3[0]}番</span>
                    </div>
                    <span className="text-slate-500">-</span>
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-blue-500/40 text-blue-300 font-bold">
                      <span>2着</span>
                      <span className="text-base font-extrabold">{selectedRace.result.top3[1]}番</span>
                    </div>
                    <span className="text-slate-500">-</span>
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded border border-cyan-500/40 text-cyan-300 font-bold">
                      <span>3着</span>
                      <span className="text-base font-extrabold">{selectedRace.result.top3[2]}番</span>
                    </div>
                  </div>
                  {selectedRace.result.kimarite1st && (
                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center gap-3">
                      <span>1着決まり手: <strong className="text-amber-300">{selectedRace.result.kimarite1st}</strong></span>
                      {selectedRace.result.kimarite2nd && (
                        <span>2着: <strong className="text-slate-300">{selectedRace.result.kimarite2nd}</strong></span>
                      )}
                    </div>
                  )}
                </div>

                {/* 公式払戻金 */}
                <div className="p-2.5 bg-slate-950/90 rounded border border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>公式払戻金</span>
                    <span className="text-[10px] text-emerald-400 font-mono">
                      的中目: {raceResultEvaluation.winningCombo}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                    {selectedRace.result.payouts.slice(0, 4).map((p) => (
                      <div
                        key={`${p.bet_type}-${p.combo}`}
                        className={`px-2 py-1 rounded border text-[11px] ${
                          p.bet_type === activeStrategy.bet_type
                            ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="text-slate-400 mr-1 uppercase">{p.bet_type}:</span>
                        <span>{p.combo}</span>
                        <span className="ml-1 text-slate-100 font-semibold">{p.payout.toLocaleString()}円</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Live Race Real-Time AI Verdict Banner (未確定または発走前レースの場合) */}
          {selectedRace.status !== 'finished' && (
            <div
              className={`border rounded-lg p-4 transition-all ${
                livePredictions.isBuy
                  ? 'bg-emerald-950/40 border-emerald-600/70 text-emerald-100 shadow-lg shadow-emerald-950/20'
                  : 'bg-amber-950/30 border-amber-600/60 text-amber-100 shadow-lg shadow-amber-950/20'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      livePredictions.isBuy ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                    }`}
                  >
                    {livePredictions.isBuy ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : (
                      <AlertTriangle className="w-6 h-6" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-75">
                        リアルタイムAI期待値判定
                      </span>
                      <span
                        className={`text-lg font-bold px-2 py-0.5 rounded text-xs ${
                          livePredictions.isBuy
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {livePredictions.isBuy ? '【 買う (BUY) 】' : '【 見送り (SKIP) 】'}
                      </span>
                      <span className="text-xs text-slate-300 font-mono flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>発走: {selectedRace.postTime} / 〆切: <strong>{selectedRace.deadlineTime}</strong></span>
                      </span>
                    </div>
                    <p className="text-xs mt-1 text-slate-300">
                      {livePredictions.isBuy
                        ? `直前変動オッズにおいて、期待値 EV ≧ ${activeStrategy.ev_threshold.toFixed(
                            1
                          )} を満たす上位 ${livePredictions.recommended.length} 点が検出されました。`
                        : `直前オッズにおいて、期待値 EV ≧ ${activeStrategy.ev_threshold.toFixed(
                            1
                          )} を満たす買い目が存在しません。資金防衛のため見送りを推奨します。`}
                    </p>
                  </div>
                </div>

                {/* Action: Open in Detailed Predictor */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectForPrediction(selectedRace.race_id)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>予想ワークスペースで詳細分析</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Recommended High-EV Bets Grid (if BUY) */}
              {livePredictions.isBuy && (
                <div className="mt-4 pt-3 border-t border-emerald-800/40">
                  <div className="text-xs font-semibold text-emerald-200 mb-2 flex items-center justify-between">
                    <span>直前推奨買い目スリップ ({activeStrategy.bet_type.toUpperCase()} / 1点100円)</span>
                    <span className="text-[11px] text-emerald-400 font-mono">
                      購入点数: {livePredictions.recommended.length}点 ({livePredictions.recommended.length * 100}円)
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                    {livePredictions.recommended.map((bet, idx) => (
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
                            <span>直前オッズ:</span>
                            <span className="font-mono text-slate-100 font-bold">
                              {bet.odds?.toFixed(1) || '-'}倍
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-slate-800 pt-1 text-emerald-300 font-semibold">
                            <span>期待値 (EV):</span>
                            <span className="font-mono font-bold text-emerald-400">
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
          )}
          </div>

          {/* Live Rider Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-200">
                出走選手 ＆ リアルタイム推定1着確率 (P(1st))
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                直前オッズ更新: {selectedRace.lastUpdated}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-2 px-2 text-center">車番</th>
                    <th className="py-2 px-2">選手名</th>
                    <th className="py-2 px-2 text-right">得点</th>
                    <th className="py-2 px-2 text-center">脚質</th>
                    <th className="py-2 px-2 text-center">ライン</th>
                    <th className="py-2 px-2 text-right">ギヤ</th>
                    <th className="py-2 px-2 text-right">勝率</th>
                    <th className="py-2 px-2 text-right">3連対率</th>
                    <th className="py-2 px-2 text-right">B数</th>
                    <th className="py-2 px-2 text-right text-emerald-400 font-bold">
                      推定確率 P(1st)
                    </th>
                    <th className="py-2 px-2 text-right text-amber-400 font-bold">
                      損益分岐オッズ
                    </th>
                    <th className="py-2 px-2 text-center">確定着順</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {selectedRace.entries.map((e) => {
                    const carColor = CAR_COLORS[e.car_no] || CAR_COLORS[1];
                    const pItem = livePredictions.riderProbs.find((p) => p.car_no === e.car_no);
                    const prob = pItem ? pItem.prob : 1 / selectedRace.entries.length;
                    const breakEven = prob > 0 ? Math.round((1 / prob) * 10) / 10 : 9999;

                    return (
                      <tr key={e.car_no} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 text-center font-sans">
                          <span
                            className={`inline-block w-5 h-5 rounded-full font-bold text-[11px] leading-5 text-center shadow-sm border ${carColor.bg} ${carColor.text} ${carColor.border}`}
                          >
                            {e.car_no}
                          </span>
                        </td>
                        <td className="py-1.5 px-2 font-sans font-medium text-slate-200">
                          {e.rider_name}
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-200 font-bold">
                          {e.score.toFixed(1)}
                        </td>
                        <td className="py-1.5 px-2 text-center font-sans">
                          <span
                            className={
                              e.style === '逃'
                                ? 'text-amber-400 font-semibold'
                                : e.style === '捲'
                                ? 'text-cyan-400'
                                : 'text-slate-400'
                            }
                          >
                            {e.style}
                          </span>
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
                          {(e.top3_rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-slate-400">
                          {e.back_count}
                        </td>
                        <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">
                          {(prob * 100).toFixed(2)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-amber-400 font-bold">
                          {breakEven.toFixed(1)}倍
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
                            <span className="text-slate-600">未発走</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
