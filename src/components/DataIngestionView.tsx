/**
 * Data Ingestion & HTML Parser View
 * Handles:
 * 1. CSV Data Ingestion (entries.csv / odds.csv) with Japanese column validation
 * 2. Phase 1 Manual HTML Ingestion Parser (user-saved race card HTML from KEIRIN.JP / OddsPark)
 * 3. Synthetic Data Generator
 */

import React, { useState, useEffect } from 'react';
import { Entry, OddsItem, RaceGroup, KaisaiMeet, KaisaiRaceOverview } from '../types/keirin';
import { parseEntriesCsv, parseOddsCsv, mergeRaces } from '../services/csvParser';
import { parseKeirinHtml, HtmlParseResult } from '../services/htmlParser';
import { generateSampleDataset } from '../services/sampleData';
import {
  FileSpreadsheet,
  Upload,
  Database,
  Code,
  CheckCircle,
  AlertTriangle,
  Sparkles,
  RotateCw,
  Globe,
  Radio,
  Terminal,
  ExternalLink,
  ShieldCheck,
  CheckCheck,
  TrendingUp,
  Trophy,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  Calendar,
  CalendarDays,
  Clock,
  MapPin,
  Zap,
  Sun,
  Moon,
  Sunrise,
} from 'lucide-react';
import {
  executeOfficialAutoSync,
  fetchOfficialKaisaiSchedule,
  convertKaisaiMeetToRaceGroups,
  convertAllMeetsToRaceGroups,
  OfficialSyncLog,
  OfficialSyncSummary,
  OFFICIAL_VENUES,
} from '../services/officialFetcher';
import { RaceLineDiagram, CAR_COLORS } from './RaceLineDiagram';

interface DataIngestionViewProps {
  onDataLoaded: (newRaces: RaceGroup[]) => void;
  currentRaceCount: number;
}

const SAMPLE_HTML_DEMO = `<!DOCTYPE html>
<html>
<head><title>2026年10月10日 平塚競輪 第11R Ｓ級決勝</title></head>
<body>
<h1>20261010-35-11 平塚競輪 11R 決勝</h1>
<div class="narabi">並び予想: ← ① ⑤ ⑦ / ② ⑧ / ③ ⑥ ④</div>
<table border="1">
  <tr><th>車番</th><th>選手名</th><th>競走得点</th><th>脚質</th><th>ギヤ</th><th>勝率</th><th>2連率</th><th>3連率</th><th>B数</th></tr>
  <tr><td>1</td><td>脇本 雄太</td><td>116.8</td><td>逃</td><td>3.92</td><td>48.5</td><td>65.2</td><td>78.0</td><td>14</td></tr>
  <tr><td>5</td><td>古性 優作</td><td>115.4</td><td>追</td><td>3.92</td><td>38.2</td><td>61.5</td><td>82.4</td><td>2</td></tr>
  <tr><td>7</td><td>南 修二</td><td>109.1</td><td>追</td><td>3.93</td><td>21.0</td><td>42.0</td><td>63.0</td><td>0</td></tr>
  <tr><td>2</td><td>眞杉 匠</td><td>113.5</td><td>逃</td><td>3.92</td><td>34.5</td><td>54.0</td><td>72.5</td><td>11</td></tr>
  <tr><td>8</td><td>吉田 拓矢</td><td>110.2</td><td>捲</td><td>3.93</td><td>26.5</td><td>48.0</td><td>68.0</td><td>4</td></tr>
  <tr><td>3</td><td>清水 裕友</td><td>114.2</td><td>捲</td><td>3.92</td><td>36.0</td><td>58.0</td><td>76.0</td><td>6</td></tr>
  <tr><td>6</td><td>松浦 悠士</td><td>112.8</td><td>追</td><td>3.92</td><td>29.0</td><td>52.0</td><td>74.0</td><td>1</td></tr>
  <tr><td>4</td><td>山田 庸平</td><td>107.5</td><td>追</td><td>3.93</td><td>18.0</td><td>38.0</td><td>59.0</td><td>0</td></tr>
</table>

<h2>2車単 オッズ</h2>
<table>
  <tr><td>1-5</td><td>3.8</td><td>1-2</td><td>12.4</td><td>1-7</td><td>18.5</td></tr>
  <tr><td>5-1</td><td>7.2</td><td>2-1</td><td>24.0</td><td>3-6</td><td>31.5</td></tr>
  <tr><td>2-8</td><td>15.2</td><td>3-1</td><td>28.5</td><td>5-7</td><td>22.0</td></tr>
</table>
</body>
</html>`;

export const DataIngestionView: React.FC<DataIngestionViewProps> = ({
  onDataLoaded,
  currentRaceCount,
}) => {
  const [activeTab, setActiveTab] = useState<'official' | 'html' | 'csv' | 'synthetic'>('official');

  // Official Auto-Sync State
  const [officialDate, setOfficialDate] = useState<string>('2026-10-10');
  const [officialVenue, setOfficialVenue] = useState<string>('all');
  const [isSyncingOfficial, setIsSyncingOfficial] = useState<boolean>(false);
  const [officialSyncLogs, setOfficialSyncLogs] = useState<OfficialSyncLog[]>([]);
  const [officialSummary, setOfficialSummary] = useState<OfficialSyncSummary | null>(null);
  const [officialPreviewRaces, setOfficialPreviewRaces] = useState<RaceGroup[]>([]);
  const [officialSelectedPreviewId, setOfficialSelectedPreviewId] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<number>(0);

  // Official Kaisai (開催データ) Schedule State
  const [kaisaiMeets, setKaisaiMeets] = useState<KaisaiMeet[]>([]);
  const [selectedKaisaiMeetCode, setSelectedKaisaiMeetCode] = useState<string>('34');
  const [isFetchingKaisai, setIsFetchingKaisai] = useState<boolean>(false);
  const [kaisaiSummary, setKaisaiSummary] = useState<{
    totalMeets: number;
    totalRaces: number;
    date: string;
    source: string;
  } | null>(null);

  // Official Data options
  const [includeEntries, setIncludeEntries] = useState<boolean>(true);
  const [includeLines, setIncludeLines] = useState<boolean>(true);
  const [includeOdds, setIncludeOdds] = useState<boolean>(true);
  const [includeResults, setIncludeResults] = useState<boolean>(true);

  // 自動取得は行わず、ユーザーによる手動取得操作のみを実行
  // (ユーザー設定: 「データーを自動取得しない」に完全準拠)
  // useEffect on mount was removed so no network requests run automatically

  // Fetch Kaisai Schedule
  const handleFetchKaisai = async (targetDateStr: string = officialDate) => {
    setIsFetchingKaisai(true);
    setOfficialSyncLogs([]);
    setCsvErrors([]);
    setOfficialDate(targetDateStr);

    try {
      const res = await fetchOfficialKaisaiSchedule(targetDateStr, (log) => {
        setOfficialSyncLogs((prev) => [...prev, log]);
      });
      setKaisaiMeets(res.meets);
      setKaisaiSummary({
        totalMeets: res.totalMeets,
        totalRaces: res.totalRaces,
        date: res.date,
        source: res.source,
      });
      if (res.meets.length > 0) {
        setSelectedKaisaiMeetCode(res.meets[0].venue_code);
      }
      setCsvSuccessMessage(
        `開催データ自動取得完了: ${res.date} の全国 ${res.totalMeets} 開催場 (全 ${res.totalRaces} レース) の開催情報・番組表を正常取得しました。`
      );
    } catch (err: any) {
      setCsvErrors([`開催データ自動取得中にエラーが発生しました: ${err?.message || '通信エラー'}`]);
    } finally {
      setIsFetchingKaisai(false);
    }
  };

  // Apply Single Kaisai Meet's Races
  const handleApplyKaisaiMeet = (meet: KaisaiMeet) => {
    const converted = convertKaisaiMeetToRaceGroups(meet);
    onDataLoaded(converted);
    setCsvSuccessMessage(
      `開催場 [${meet.venue_name}競輪 (${meet.grade} ${meet.time_slot})] の全${converted.length}レース (番組表・出走表・オッズ) をシステムに取り込みました。`
    );
  };

  // Apply All Kaisai Meets' Races
  const handleApplyAllKaisaiMeets = () => {
    if (kaisaiMeets.length === 0) return;
    const allConverted = convertAllMeetsToRaceGroups(kaisaiMeets);
    onDataLoaded(allConverted);
    setCsvSuccessMessage(
      `全国全開催場 (${kaisaiMeets.length}会場・全${allConverted.length}レース) の開催データを一括してシステムに取り込みました。各分析タブで即時照会可能です。`
    );
  };

  // HTML Parser State
  const [htmlInput, setHtmlInput] = useState<string>(SAMPLE_HTML_DEMO);
  const [htmlParseResult, setHtmlParseResult] = useState<HtmlParseResult | null>(null);

  // CSV Parser State
  const [entriesCsvInput, setEntriesCsvInput] = useState<string>('');
  const [oddsCsvInput, setOddsCsvInput] = useState<string>('');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvSuccessMessage, setCsvSuccessMessage] = useState<string | null>(null);

  // Synthetic Generator State
  const [synthRaces, setSynthRaces] = useState<number>(150);
  const [synthSeed, setSynthSeed] = useState<number>(20261010);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  // Parse HTML Action
  const handleParseHtml = () => {
    if (!htmlInput.trim()) return;
    const result = parseKeirinHtml(htmlInput);
    setHtmlParseResult(result);
  };

  // Import parsed HTML race into system
  const handleApplyHtmlRace = () => {
    if (!htmlParseResult || htmlParseResult.entries.length === 0) return;
    const raceGroup: RaceGroup = {
      race_id: htmlParseResult.raceId,
      date: htmlParseResult.entries[0]?.date || '2026-10-10',
      grade: htmlParseResult.entries[0]?.grade || 'F1',
      venue: htmlParseResult.venueName || '平塚',
      race_no: 11,
      entries: htmlParseResult.entries,
      odds: htmlParseResult.odds,
    };
    onDataLoaded([raceGroup]);
    setCsvSuccessMessage(
      `HTMLから解析したレース [${htmlParseResult.raceId}] (${htmlParseResult.entries.length}車立, オッズ${htmlParseResult.odds.length}件) を取り込みました。`
    );
  };

  // Parse CSV Action
  const handleParseCsv = () => {
    setCsvErrors([]);
    setCsvSuccessMessage(null);

    if (!entriesCsvInput.trim()) {
      setCsvErrors(['出走表 (entries.csv) のテキストを入力してください。']);
      return;
    }

    const entResult = parseEntriesCsv(entriesCsvInput);
    if (!entResult.success) {
      setCsvErrors(entResult.errors);
      return;
    }

    let oddsList: OddsItem[] = [];
    if (oddsCsvInput.trim()) {
      const oddsResult = parseOddsCsv(oddsCsvInput);
      if (!oddsResult.success) {
        setCsvErrors(oddsResult.errors);
        return;
      }
      oddsList = oddsResult.data;
    }

    const merged = mergeRaces(entResult.data, oddsList);
    onDataLoaded(merged);
    setCsvSuccessMessage(
      `CSVインポート成功: 出走表 ${entResult.data.length}行、オッズ ${oddsList.length}件、合計 ${merged.length} レースを取り込みました。`
    );
  };

  // Execute Official Auto Sync Action
  const handleExecuteOfficialSync = async () => {
    setIsSyncingOfficial(true);
    setOfficialSyncLogs([]);
    setOfficialSummary(null);
    setSyncProgress(15);
    setCsvErrors([]);
    setCsvSuccessMessage(null);

    try {
      const res = await executeOfficialAutoSync(
        officialDate,
        officialVenue,
        (log) => {
          setOfficialSyncLogs((prev) => [...prev, log]);
          setSyncProgress((prev) => Math.min(95, prev + 15));
        }
      );

      setSyncProgress(100);
      setOfficialSummary(res.summary);
      setOfficialPreviewRaces(res.races);
      if (res.races.length > 0) {
        setOfficialSelectedPreviewId(res.races[0].race_id);
      }

      // Automatically load into central application database
      onDataLoaded(res.races);

      setCsvSuccessMessage(
        `公式サイトからの必要データ自動取得が完了しました！ ${res.summary.venueCount}会場・全${res.summary.totalRaces}レース (出走表${res.summary.totalEntries}名, オッズ${res.summary.totalOdds.toLocaleString()}件, 確定結果${res.summary.finishedRaces}レース) をシステムに即時反映しました。`
      );
    } catch (err: any) {
      setCsvErrors([`公式サイト自動取得中にエラーが発生しました: ${err?.message || '通信タイムアウト'}`]);
    } finally {
      setIsSyncingOfficial(false);
    }
  };

  // Generate Synthetic Action
  const handleGenerateSynthetic = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const generated = generateSampleDataset(synthRaces, synthSeed);
      onDataLoaded(generated);
      setIsGenerating(false);
      setCsvSuccessMessage(
        `合成データ生成完了: ${generated.length} レース (乱数シード: ${synthSeed}) をシステムに登録しました。`
      );
    }, 150);
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>公式サイトデータ取得 ＆ データ管理センター</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              KEIRIN.JP / netkeirin 公式サイトからの手動同期取得、手動保存HTML解析、CSV一括取込、および合成データ生成。(※自動巡回取得はOFFです)
            </p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex flex-wrap bg-slate-950 p-1 rounded border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('official')}
              className={`px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === 'official'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-400 hover:text-emerald-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>公式サイト手動同期</span>
              <span className="bg-emerald-950 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded border border-emerald-700/60 font-mono">
                手動実行
              </span>
            </button>
            <button
              onClick={() => setActiveTab('html')}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeTab === 'html'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              手動保存HTML解析
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeTab === 'csv'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CSVファイル取込
            </button>
            <button
              onClick={() => setActiveTab('synthetic')}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeTab === 'synthetic'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              合成データ生成
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {csvSuccessMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-600/70 rounded text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{csvSuccessMessage}</span>
        </div>
      )}

      {csvErrors.length > 0 && (
        <div className="p-3 bg-red-950/40 border border-red-600/70 rounded text-xs text-red-200 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            <span>エラーが発生しました (仕様書セクション 8 準拠):</span>
          </div>
          <ul className="list-disc list-inside pl-2 space-y-0.5 font-mono text-[11px]">
            {csvErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* TAB 0: Official Auto Sync (公式サイト自動取得) */}
      {activeTab === 'official' && (
        <div className="space-y-4">
          {/* Main Control Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-emerald-950 border border-emerald-700/60 rounded-md text-emerald-400">
                    <Globe className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>公式サイト（KEIRIN.JP / netkeirin）データ連携基盤</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                        手動同期モード
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      公認競輪情報サイトから、指定日の出走表・並び予想・リアルタイムオッズ・公式確定結果を安全に手動同期取得します。（※自動巡回取得はOFFです）
                    </p>
                  </div>
                </div>
              </div>

              {/* Compliance Badges */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded border border-slate-800 text-slate-300">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>robots.txt 適合検査済</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded border border-slate-800 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>3.0秒礼儀待機遵守</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 rounded border border-slate-800 text-slate-300">
                  <Radio className="w-3.5 h-3.5 text-blue-400" />
                  <span>User-Agent認証</span>
                </div>
              </div>
            </div>

            {/* Fetch Configuration Form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              {/* Date Selection */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  開催日選択:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={officialDate}
                    onChange={(e) => setOfficialDate(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    onClick={() => setOfficialDate('2026-10-10')}
                    className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 rounded font-mono transition-colors"
                  >
                    本日
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 block">
                  ※ 2026-10-10 (平塚G3ナイター・前橋F1・小倉ミッドナイト開催日)
                </span>
              </div>

              {/* Venue Selection */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  取得対象競輪場:
                </label>
                <select
                  value={officialVenue}
                  onChange={(e) => setOfficialVenue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-medium focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">全会場一括自動取得 (5会場・48レース推奨)</option>
                  {OFFICIAL_VENUES.map((v) => (
                    <option key={v.code} value={v.code}>
                      {v.name}競輪 ({v.grade} {v.timeSlot} {v.bankLength})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 block">
                  平塚(35) / 前橋(22) / 小倉(81) / 奈良(53) / 川崎(34)
                </span>
              </div>

              {/* Data Category Checkboxes */}
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  自動取得データ項目:
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeEntries}
                      onChange={(e) => setIncludeEntries(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>出走表・選手得点</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeLines}
                      onChange={(e) => setIncludeLines(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>並び予想・ライン</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeOdds}
                      onChange={(e) => setIncludeOdds(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>オッズ全券種</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeResults}
                      onChange={(e) => setIncludeResults(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>確定着順・払戻金</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Action Buttons & Progress */}
            <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                User-Agent: <span className="font-mono text-slate-300 text-[11px]">KeirinAIResearchBot/0.1 (m.shirakawa1204@gmail.com)</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleFetchKaisai(officialDate)}
                  disabled={isFetchingKaisai || isSyncingOfficial}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-blue-900/30 disabled:opacity-50"
                  title="全国の競輪場ごとの開催データ（グレード・時間帯・全レース発走時刻番組表）を手動取得"
                >
                  <RotateCw className={`w-4 h-4 ${isFetchingKaisai ? 'animate-spin' : ''}`} />
                  <span>
                    {isFetchingKaisai ? '開催データを手動取得中...' : '開催データを手動取得'}
                  </span>
                </button>

                <button
                  onClick={handleExecuteOfficialSync}
                  disabled={isSyncingOfficial || isFetchingKaisai}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-emerald-900/30 disabled:opacity-50"
                  title="出走表・並び予想・オッズ全件・確定結果まで全てを一括手動同期してシステムに反映"
                >
                  <Database className={`w-4 h-4 ${isSyncingOfficial ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncingOfficial
                      ? '出走表・オッズ同期中...'
                      : '必要全データを手動同期'}
                  </span>
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            {(isSyncingOfficial || isFetchingKaisai) && (
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{isFetchingKaisai ? '全国開催データ手動取得中...' : '出走表・オッズ手動同期中...'}</span>
                  <span className="font-mono text-emerald-400">{isFetchingKaisai ? 85 : syncProgress}%</span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${isFetchingKaisai ? 85 : syncProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Empty state when manual fetch has not yet been triggered */}
          {kaisaiMeets.length === 0 && !isFetchingKaisai && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <CalendarDays className="w-6 h-6 text-slate-400" />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="text-sm font-semibold text-slate-200">
                  開催データ自動取得はOFFです (手動取得モード)
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  自動取得を行わない設定となっています。データが必要な際は、上の「開催データを手動取得」または「必要全データを手動同期」ボタンをクリックして手動で取得してください。
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => handleFetchKaisai(officialDate)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{officialDate} の開催データを手動取得する</span>
                </button>
              </div>
            </div>
          )}

          {/* SECTION: Fetched Kaisai Meets (全国開催データ一覧) */}
          {kaisaiMeets.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-blue-950 border border-blue-800/80 rounded text-blue-400">
                    <CalendarDays className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>取得済 全国開催データ ({officialDate})</span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                        全 {kaisaiMeets.length} 開催場 / {kaisaiMeets.reduce((acc, m) => acc + m.race_count, 0)} レース
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      KEIRIN.JP / netkeirin から自動取得した本日開催の全国競輪場一覧および番組表タイムテーブルです。
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleApplyAllKaisaiMeets}
                    className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>全開催データを一括システム反映</span>
                  </button>
                </div>
              </div>

              {/* Meets Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {kaisaiMeets.map((m) => {
                  const isSelected = selectedKaisaiMeetCode === m.venue_code;
                  return (
                    <div
                      key={m.venue_code}
                      onClick={() => setSelectedKaisaiMeetCode(m.venue_code)}
                      className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-slate-800/90 border-blue-500 shadow-md ring-1 ring-blue-500/40'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base text-slate-100">
                            {m.venue_name}競輪
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              m.grade === 'G1' || m.grade === 'GP'
                                ? 'bg-purple-950 text-purple-300 border border-purple-700'
                                : m.grade === 'G3'
                                ? 'bg-amber-950 text-amber-300 border border-amber-700'
                                : m.grade === 'F1'
                                ? 'bg-blue-950 text-blue-300 border border-blue-700'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {m.grade}
                          </span>
                        </div>

                        <span
                          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                            m.time_slot === 'ミッドナイト'
                              ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800'
                              : m.time_slot === 'ナイター'
                              ? 'bg-purple-950/80 text-purple-300 border border-purple-800'
                              : m.time_slot === 'モーニング'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          }`}
                        >
                          {m.time_slot === 'ミッドナイト' ? (
                            <Moon className="w-3 h-3" />
                          ) : m.time_slot === 'ナイター' ? (
                            <Moon className="w-3 h-3" />
                          ) : m.time_slot === 'モーニング' ? (
                            <Sunrise className="w-3 h-3" />
                          ) : (
                            <Sun className="w-3 h-3" />
                          )}
                          <span>{m.time_slot}</span>
                        </span>
                      </div>

                      <div className="text-xs text-slate-300 font-semibold truncate mb-1">
                        {m.meet_title}
                      </div>

                      <div className="text-[11px] text-slate-400 space-y-0.5 font-mono">
                        <div className="flex justify-between">
                          <span>バンク周長:</span>
                          <span className="text-slate-200">{m.bank_length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>レース数:</span>
                          <span className="text-emerald-400 font-bold">全 {m.race_count}R</span>
                        </div>
                        <div className="flex justify-between">
                          <span>開催日程:</span>
                          <span className="text-slate-300">{m.day_title || '開催中'}</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 truncate max-w-[140px]">
                          {m.weather}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApplyKaisaiMeet(m);
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 rounded text-[10px] font-semibold transition-colors"
                        >
                          この場を取込
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Selected Meet Timetable View */}
              {(() => {
                const currentMeet = kaisaiMeets.find((m) => m.venue_code === selectedKaisaiMeetCode) || kaisaiMeets[0];
                if (!currentMeet) return null;

                return (
                  <div className="mt-4 pt-4 border-t border-slate-800 bg-slate-950/60 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-2 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 text-sm">
                            {currentMeet.venue_name}競輪 レース番組表・タイムテーブル ({currentMeet.grade} {currentMeet.time_slot})
                          </span>
                          <span className="text-xs text-slate-400">
                            周長: {currentMeet.bank_length} ({currentMeet.bank_feature || '標準バンク'})
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {currentMeet.meet_title} · {currentMeet.weather}
                        </p>
                      </div>

                      <button
                        onClick={() => handleApplyKaisaiMeet(currentMeet)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>{currentMeet.venue_name}競輪の全{currentMeet.race_count}レースを取り込む</span>
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900 text-slate-400 text-[11px] font-semibold">
                          <tr>
                            <th className="py-2 px-3">R</th>
                            <th className="py-2 px-3">レース種別 / クラス</th>
                            <th className="py-2 px-3">発走時刻</th>
                            <th className="py-2 px-3">投票締切</th>
                            <th className="py-2 px-3">距離 / 車立</th>
                            <th className="py-2 px-3">進行状態</th>
                            <th className="py-2 px-3">オッズ / 結果</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {currentMeet.races.map((r) => (
                            <tr key={r.race_id} className="hover:bg-slate-900/50 transition-colors">
                              <td className="py-2 px-3 font-bold font-mono text-slate-200">
                                {r.race_no}R
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-100">
                                {r.race_name}
                              </td>
                              <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">
                                {r.post_time}
                              </td>
                              <td className="py-2 px-3 font-mono text-amber-300">
                                {r.deadline_time}
                              </td>
                              <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                                {r.distance || 2025}m · {r.car_count}車立
                              </td>
                              <td className="py-2 px-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.status === 'finished'
                                      ? 'bg-slate-800 text-slate-300'
                                      : r.status === 'closing_soon'
                                      ? 'bg-amber-950 text-amber-300 border border-amber-700 animate-pulse'
                                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  }`}
                                >
                                  {r.status === 'finished'
                                    ? '結果確定'
                                    : r.status === 'closing_soon'
                                    ? '締切直前'
                                    : '発売中'}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-slate-400 text-[11px]">
                                {r.status === 'finished' ? (
                                  <span className="text-emerald-400 font-medium">確定払戻金あり</span>
                                ) : (
                                  <span className="text-blue-400">オッズ公開中</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}


          {/* Real-time Inspection Terminal Logs */}
          {officialSyncLogs.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold">公式サイト取得ログモニター (collect.py コンプライアンス監査)</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  {officialSyncLogs.length} 件のログ記録
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto text-xs pr-1">
                {officialSyncLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded bg-slate-900/80 border border-slate-800/80 flex items-start gap-2.5"
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        log.type === 'SUCCESS'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : log.type === 'ROBOTS'
                          ? 'bg-blue-950 text-blue-400 border border-blue-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {log.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-200 text-[11px]">
                          ステップ {log.step}: {log.title}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {log.timestamp} ({log.latencyMs}ms)
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate mt-0.5">
                        URL: <span className="text-slate-300">{log.url}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 mt-1">{log.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sync Results Summary Cards */}
          {officialSummary && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCheck className="w-5 h-5 text-emerald-400" />
                  <h4 className="text-sm font-bold text-slate-100">
                    公式サイトデータ取得完了サマリー ({officialSummary.targetDate})
                  </h4>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  取得元: {officialSummary.sourceUrl} ({officialSummary.syncedAt})
                </span>
              </div>

              {/* 5-Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">対象競輪場</span>
                  <span className="text-lg font-bold text-slate-100 font-mono">
                    {officialSummary.venueCount}
                  </span>
                  <span className="text-[10px] text-slate-500 block">会場</span>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">取得レース数</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    {officialSummary.totalRaces}
                  </span>
                  <span className="text-[10px] text-slate-500 block">レース</span>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">登録選手数</span>
                  <span className="text-lg font-bold text-blue-400 font-mono">
                    {officialSummary.totalEntries}
                  </span>
                  <span className="text-[10px] text-slate-500 block">名</span>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">同期オッズ数</span>
                  <span className="text-lg font-bold text-purple-400 font-mono">
                    {officialSummary.totalOdds.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block">件</span>
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-center">
                  <span className="text-[11px] text-slate-400 block">確定レース結果</span>
                  <span className="text-lg font-bold text-amber-400 font-mono">
                    {officialSummary.finishedRaces}
                  </span>
                  <span className="text-[10px] text-slate-500 block">レース払戻金有</span>
                </div>
              </div>

              {/* Data Preview Explorer */}
              {officialPreviewRaces.length > 0 && (
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-200">
                      取得レースデータのプレビュー確認:
                    </span>
                    <select
                      value={officialSelectedPreviewId}
                      onChange={(e) => setOfficialSelectedPreviewId(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 font-mono"
                    >
                      {officialPreviewRaces.map((r) => (
                        <option key={r.race_id} value={r.race_id}>
                          {r.venue} {r.race_no}R ({r.grade} {r.raceTitle || '予選'}) - {r.status === 'finished' ? '【確定】' : r.status === 'closing_soon' ? '【締切間近】' : '【発走前】'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Selected Preview Race Card */}
                  {(() => {
                    const target =
                      officialPreviewRaces.find((r) => r.race_id === officialSelectedPreviewId) ||
                      officialPreviewRaces[0];
                    if (!target) return null;

                    return (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900 rounded border border-slate-800">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white">
                              {target.venue} {target.race_no}R
                            </span>
                            <span className="text-xs font-semibold text-slate-200">
                              {target.raceTitle || '決勝'} ({target.grade})
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              発走 {target.postTime || '16:30'}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              target.status === 'finished'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {target.status === 'finished' ? 'レース確定・払戻金取得済' : '出走前'}
                          </span>
                        </div>

                        {/* Line Diagram */}
                        <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80">
                          <RaceLineDiagram entries={target.entries} />
                        </div>

                        {/* Entries Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800">
                              <tr>
                                <th className="p-2 text-center w-12">車番</th>
                                <th className="p-2">選手名</th>
                                <th className="p-2 text-right">競走得点</th>
                                <th className="p-2 text-center">脚質</th>
                                <th className="p-2 text-right">ギヤ</th>
                                <th className="p-2 text-right">勝率</th>
                                <th className="p-2 text-right">2連対率</th>
                                <th className="p-2 text-right">3連対率</th>
                                <th className="p-2 text-right">B数</th>
                                {target.result && <th className="p-2 text-center text-amber-400">確定着順</th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                              {target.entries.map((entry) => {
                                const colors = CAR_COLORS[entry.car_no] || CAR_COLORS[1];
                                return (
                                  <tr key={entry.car_no} className="hover:bg-slate-900/50">
                                    <td className="p-2 text-center">
                                      <span
                                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${colors.bg} ${colors.text} ${colors.border} border`}
                                      >
                                        {entry.car_no}
                                      </span>
                                    </td>
                                    <td className="p-2 font-medium text-slate-200">
                                      {entry.rider_name}
                                    </td>
                                    <td className="p-2 text-right font-mono font-semibold text-slate-100">
                                      {entry.score.toFixed(1)}
                                    </td>
                                    <td className="p-2 text-center">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          entry.style === '逃'
                                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                            : entry.style === '捲'
                                            ? 'bg-blue-950 text-blue-400 border border-blue-800'
                                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                        }`}
                                      >
                                        {entry.style}
                                      </span>
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-300">
                                      {entry.gear_ratio?.toFixed(2) || '3.92'}
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-300">
                                      {((entry.win_rate || 0) * 100).toFixed(1)}%
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-300">
                                      {((entry.top2_rate || 0) * 100).toFixed(1)}%
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-300">
                                      {((entry.top3_rate || 0) * 100).toFixed(1)}%
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-300">
                                      {entry.back_count || 0}
                                    </td>
                                    {target.result && (
                                      <td className="p-2 text-center font-bold text-amber-400">
                                        {entry.finish ? `${entry.finish}着` : '-'}
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* If results exist, display payout highlights */}
                        {target.result && (
                          <div className="p-2.5 bg-amber-950/20 border border-amber-700/50 rounded flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-bold text-amber-400 flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5" />
                              <span>公式確定払戻金:</span>
                            </span>
                            <span className="text-slate-300">
                              2車単: <span className="font-mono font-bold text-amber-300">{target.result.payouts.find((p) => p.bet_type === 'exacta')?.combo}</span> (
                              {target.result.payouts.find((p) => p.bet_type === 'exacta')?.payout.toLocaleString()}円)
                            </span>
                            <span className="text-slate-300">
                              3連単: <span className="font-mono font-bold text-amber-300">{target.result.payouts.find((p) => p.bet_type === 'trifecta')?.combo}</span> (
                              {target.result.payouts.find((p) => p.bet_type === 'trifecta')?.payout.toLocaleString()}円)
                            </span>
                            {target.result.kimarite1st && (
                              <span className="text-slate-400 text-[11px]">
                                決まり手: <span className="text-slate-200">{target.result.kimarite1st}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 1: Phase 1 Manual HTML Parser */}
      {activeTab === 'html' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Code className="w-4 h-4 text-purple-400" />
                  <span>保存HTMLテキストの貼り付け</span>
                </h3>
                <button
                  onClick={() => setHtmlInput(SAMPLE_HTML_DEMO)}
                  className="text-[11px] text-purple-400 hover:text-purple-300"
                >
                  サンプルHTMLを再ロード
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                ブラウザで閲覧・ローカル保存したレースページ（出走表・並び予想・オッズ等）のHTMLをそのまま貼り付けて解析します。
              </p>
              <textarea
                value={htmlInput}
                onChange={(e) => setHtmlInput(e.target.value)}
                rows={14}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-purple-500"
                placeholder="<html>... 保存したHTMLソースをここに貼り付け ...</html>"
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                文字数: {htmlInput.length.toLocaleString()} 字
              </span>
              <button
                onClick={handleParseHtml}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
              >
                <span>HTML構造解析を実行</span>
              </button>
            </div>
          </div>

          {/* HTML Parse Results Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-semibold text-slate-200 mb-2">
                解析プレビュー ＆ 抽出結果
              </h3>
              {htmlParseResult ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">レースID:</span>
                      <span className="font-mono font-bold text-slate-200">
                        {htmlParseResult.raceId}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">並び予想表記:</span>
                      <span className="font-mono text-emerald-400">
                        {htmlParseResult.detectedLineStr || '自動推定'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">検出出走選手:</span>
                      <span className="font-mono text-slate-200 font-bold">
                        {htmlParseResult.entries.length}名
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">検出オッズ:</span>
                      <span className="font-mono text-slate-200">
                        {htmlParseResult.odds.length}件
                      </span>
                    </div>
                  </div>

                  {/* Parsed entries table preview */}
                  {htmlParseResult.entries.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-slate-800 rounded">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-950 text-slate-400 text-[10px] sticky top-0">
                          <tr>
                            <th className="py-1 px-2 text-center">車番</th>
                            <th className="py-1 px-2">選手名</th>
                            <th className="py-1 px-2 text-right">得点</th>
                            <th className="py-1 px-2 text-center">脚質</th>
                            <th className="py-1 px-2 text-center">ライン</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {htmlParseResult.entries.map((e) => (
                            <tr key={e.car_no}>
                              <td className="py-1 px-2 text-center font-bold text-slate-200">
                                {e.car_no}
                              </td>
                              <td className="py-1 px-2 font-sans text-slate-300">
                                {e.rider_name}
                              </td>
                              <td className="py-1 px-2 text-right text-slate-300">
                                {e.score.toFixed(1)}
                              </td>
                              <td className="py-1 px-2 text-center font-sans text-slate-400">
                                {e.style}
                              </td>
                              <td className="py-1 px-2 text-center text-slate-400">
                                {e.line_id}-{e.line_pos}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Parsing Logs */}
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono text-slate-400 max-h-24 overflow-y-auto space-y-0.5">
                    {htmlParseResult.log.map((l, idx) => (
                      <div key={idx}>▸ {l}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-slate-500 text-xs border border-dashed border-slate-800 rounded p-4 text-center">
                  <Database className="w-8 h-8 mb-2 opacity-50" />
                  <span>「HTML構造解析を実行」をクリックすると、</span>
                  <span>出走表テーブル・並び・オッズがここに展開されます。</span>
                </div>
              )}
            </div>

            {htmlParseResult && htmlParseResult.entries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={handleApplyHtmlRace}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-2"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>このレースをシステムに登録・予想対象にする</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CSV Data Ingestion */}
      {activeTab === 'csv' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div className="text-xs text-slate-300">
            <h3 className="font-semibold text-slate-200 mb-1">
              CSVテキストの直接貼り付け (仕様書セクション 4.1 & 4.2 準拠)
            </h3>
            <p className="text-[11px] text-slate-400">
              必須列が不足している場合は日本語エラーメッセージで通知され、同一 race_id は自動上書き（重複排除）されます。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                出走表 CSV (entries.csv)
              </label>
              <textarea
                value={entriesCsvInput}
                onChange={(e) => setEntriesCsvInput(e.target.value)}
                rows={10}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
                placeholder="race_id,date,grade,car_no,score,style,line_id,line_pos,gear_ratio,win_rate,top2_rate,top3_rate,back_count,finish&#10;20261010-35-05,2026-10-10,F1,1,88.5,逃,1,1,3.92,0.25,0.45,0.65,12,1"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                オッズ CSV (odds.csv, 任意)
              </label>
              <textarea
                value={oddsCsvInput}
                onChange={(e) => setOddsCsvInput(e.target.value)}
                rows={10}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500"
                placeholder="race_id,bet_type,combo,odds&#10;20261010-35-05,exacta,1-2,14.5&#10;20261010-35-05,trifecta,1-2-5,48.2"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleParseCsv}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-2"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>CSVデータをインポート＆検証</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: Synthetic Data Generator */}
      {activeTab === 'synthetic' && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>合成データ生成 (generate_sample_data.py 相当)</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              仕様書セクション 8 に基づき、乱数シードを固定して競走得点・脚質・ライン構成・控除率約25%のオッズ・着順を再現した合成レースを生成します。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg bg-slate-950 p-3 rounded border border-slate-800">
            <div>
              <label className="block text-xs text-slate-400 mb-1">生成レース数:</label>
              <select
                value={synthRaces}
                onChange={(e) => setSynthRaces(parseInt(e.target.value, 10))}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
              >
                <option value={50}>50 レース (クイック動作確認)</option>
                <option value={150}>150 レース (標準バックテスト規模)</option>
                <option value={300}>300 レース (高精度グリッド探索)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">乱数シード (seed):</label>
              <input
                type="number"
                value={synthSeed}
                onChange={(e) => setSynthSeed(parseInt(e.target.value, 10) || 42)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateSynthetic}
              disabled={isGenerating}
              className={`px-4 py-2 rounded text-xs font-semibold flex items-center gap-2 transition-colors ${
                isGenerating
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>合成データを再生成してシステムに適用</span>
            </button>
            <span className="text-xs text-slate-500">
              現在の保持レース数: {currentRaceCount} レース
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
