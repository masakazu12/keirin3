/**
 * Windows 11 Desktop Style Title Bar
 * Provides authentic desktop window chrome, menu dropdowns, and window controls.
 */

import React, { useState } from 'react';
import {
  Minus,
  Square,
  X,
  HelpCircle,
  FileSpreadsheet,
  Cpu,
  ShieldCheck,
  Code2,
  Database,
  Play,
  RotateCw,
} from 'lucide-react';

interface WindowsTitleBarProps {
  onMenuAction: (action: string) => void;
  statusText: string;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

export const WindowsTitleBar: React.FC<WindowsTitleBarProps> = ({
  onMenuAction,
  statusText,
  isMaximized,
  onToggleMaximize,
}) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const toggleMenu = (name: string) => {
    setOpenMenu(openMenu === name ? null : name);
  };

  const handleAction = (action: string) => {
    setOpenMenu(null);
    onMenuAction(action);
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 select-none text-xs text-slate-300">
      {/* Top Title Row */}
      <div className="flex items-center justify-between h-9 px-3">
        {/* App Icon & Title */}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-600 flex items-center justify-center text-white font-bold text-[10px]">
            輪
          </div>
          <span className="font-semibold text-slate-100 tracking-tight">
            競輪AI予想システム v0.1
          </span>
          <span className="text-slate-500 font-normal">
            — 機械学習・Harville近似・期待値最適化
          </span>
          <span className="ml-3 px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700/60 font-mono">
            {statusText}
          </span>
        </div>

        {/* Windows Window Controls */}
        <div className="flex items-center h-full">
          <button
            onClick={() => onMenuAction('minimize')}
            className="h-full px-3 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center"
            title="最小化"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleMaximize}
            className="h-full px-3 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center"
            title={isMaximized ? '元に戻す' : '最大化'}
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => onMenuAction('close')}
            className="h-full px-3 hover:bg-red-600 text-slate-400 hover:text-white transition-colors flex items-center justify-center"
            title="閉じる"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Menu Bar Row */}
      <div className="flex items-center gap-1 px-2 h-7 bg-slate-900/90 border-t border-slate-800/60 text-slate-300 text-[11px] relative">
        {/* ファイル(F) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('file')}
            className={`px-2 py-1 rounded hover:bg-slate-800 hover:text-slate-100 ${
              openMenu === 'file' ? 'bg-slate-800 text-slate-100' : ''
            }`}
          >
            ファイル(F)
          </button>
          {openMenu === 'file' && (
            <div className="absolute left-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded shadow-xl py-1 z-50">
              <button
                onClick={() => handleAction('generate_data')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <RotateCw className="w-3.5 h-3.5 text-emerald-400" />
                <span>合成データ生成 (150レース)</span>
              </button>
              <button
                onClick={() => handleAction('import_csv')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
                <span>CSVデータ取込 (entries / odds)</span>
              </button>
              <button
                onClick={() => handleAction('import_html')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <Database className="w-3.5 h-3.5 text-purple-400" />
                <span>手動保存HTML取込 (フェーズ1)</span>
              </button>
              <div className="h-px bg-slate-800 my-1" />
              <button
                onClick={() => handleAction('export_csv')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span>出走表・オッズCSVをエクスポート</span>
              </button>
              <button
                onClick={() => handleAction('export_python')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <Code2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Python CLIコードを出力</span>
              </button>
            </div>
          )}
        </div>

        {/* モデル・学習(M) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('model')}
            className={`px-2 py-1 rounded hover:bg-slate-800 hover:text-slate-100 ${
              openMenu === 'model' ? 'bg-slate-800 text-slate-100' : ''
            }`}
          >
            モデル(M)
          </button>
          {openMenu === 'model' && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-slate-900 border border-slate-700 rounded shadow-xl py-1 z-50">
              <button
                onClick={() => handleAction('train_model')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                <span>モデル学習＆温度補正Tの最適化</span>
              </button>
              <button
                onClick={() => handleAction('grid_search')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <Play className="w-3.5 h-3.5 text-cyan-400" />
                <span>戦略グリッド探索 (750通り)</span>
              </button>
              <button
                onClick={() => handleAction('view_features')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span>25個の特徴量重要度を確認</span>
              </button>
            </div>
          )}
        </div>

        {/* ツール(T) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('tools')}
            className={`px-2 py-1 rounded hover:bg-slate-800 hover:text-slate-100 ${
              openMenu === 'tools' ? 'bg-slate-800 text-slate-100' : ''
            }`}
          >
            ツール(T)
          </button>
          {openMenu === 'tools' && (
            <div className="absolute left-0 top-full mt-1 w-52 bg-slate-900 border border-slate-700 rounded shadow-xl py-1 z-50">
              <button
                onClick={() => handleAction('nav_live')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-emerald-400 flex items-center gap-1.5"
              >
                <span>開催中データ自動取得 (Live Feed)</span>
              </button>
              <button
                onClick={() => handleAction('nav_predict')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span>レース予想画面 (predict.py)</span>
              </button>
              <button
                onClick={() => handleAction('nav_grid')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span>検証結果グリッド (grid_validation)</span>
              </button>
              <button
                onClick={() => handleAction('nav_data')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200"
              >
                <span>データテーブル一覧</span>
              </button>
            </div>
          )}
        </div>

        {/* ヘルプ・規約(H) */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('help')}
            className={`px-2 py-1 rounded hover:bg-slate-800 hover:text-slate-100 ${
              openMenu === 'help' ? 'bg-slate-800 text-slate-100' : ''
            }`}
          >
            ヘルプ(H)
          </button>
          {openMenu === 'help' && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-slate-900 border border-slate-700 rounded shadow-xl py-1 z-50">
              <button
                onClick={() => handleAction('open_compliance')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>データ取得規約と免責事項</span>
              </button>
              <button
                onClick={() => handleAction('open_spec')}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-slate-200 flex items-center gap-2"
              >
                <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>仕様書 v0.1 の要件確認</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
