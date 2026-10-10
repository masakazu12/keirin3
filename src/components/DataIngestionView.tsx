/**
 * Data Ingestion & HTML Parser View
 * Handles:
 * 1. CSV Data Ingestion (entries.csv / odds.csv) with Japanese column validation
 * 2. Phase 1 Manual HTML Ingestion Parser (user-saved race card HTML from KEIRIN.JP / OddsPark)
 * 3. Synthetic Data Generator
 */

import React, { useState } from 'react';
import { Entry, OddsItem, RaceGroup } from '../types/keirin';
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
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'html' | 'csv' | 'synthetic'>('html');

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
              <Database className="w-4 h-4 text-emerald-400" />
              <span>データ取込 ＆ HTMLパーサ (フェーズ1)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              規約に準拠した手動保存HTML解析、CSV一括インポート、および動作確認用合成データの生成。
            </p>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-slate-950 p-1 rounded border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('html')}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeTab === 'html'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              手動保存HTML解析 (フェーズ1)
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeTab === 'csv'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              CSVファイル取込 (entries/odds)
            </button>
            <button
              onClick={() => setActiveTab('synthetic')}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                activeTab === 'synthetic'
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              合成データ生成 (generate_sample_data)
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
