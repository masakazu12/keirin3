/**
 * Python CLI Code Exporter Component
 * Displays and allows one-click download / copy of all Python CLI scripts
 * described in Section 3 & 8 of the specification.
 */

import React, { useState } from 'react';
import { PYTHON_FILES } from '../services/pythonExporter';
import { Code2, Copy, Check, Download, FileCode2, Terminal } from 'lucide-react';

export const PythonExporterView: React.FC = () => {
  const fileKeys = Object.keys(PYTHON_FILES);
  const [selectedFileKey, setSelectedFileKey] = useState<string>(fileKeys[0]);
  const [copied, setCopied] = useState<boolean>(false);

  const currentFile = PYTHON_FILES[selectedFileKey];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingle = () => {
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    // Download each file with slight stagger
    fileKeys.forEach((key, idx) => {
      setTimeout(() => {
        const file = PYTHON_FILES[key];
        const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.filename;
        a.click();
        URL.revokeObjectURL(url);
      }, idx * 150);
    });
  };

  return (
    <div className="flex flex-col space-y-4">
      {/* Top Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-amber-400" />
              <span>Python CLI スクリプト出力 ＆ 連携コード</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              仕様書に定義された全 Python CLI スクリプト（機械学習共通モジュール、学習/検証、予想、収集クライアント）。
            </p>
          </div>

          <button
            onClick={handleDownloadAll}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>全スクリプトを一括ダウンロード</span>
          </button>
        </div>

        {/* File selector pill list */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
          {fileKeys.map((key) => {
            const f = PYTHON_FILES[key];
            const isSelected = selectedFileKey === key;

            return (
              <button
                key={key}
                onClick={() => setSelectedFileKey(key)}
                className={`px-3 py-1.5 rounded text-xs font-mono transition-colors flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 font-semibold'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>{f.filename}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Code Viewer Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col flex-1 min-h-[460px]">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
          <div>
            <span className="font-mono font-bold text-slate-200">
              {currentFile.filename}
            </span>
            <span className="text-slate-500 ml-2">
              — {currentFile.description}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1.5 border border-slate-700"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">コピー完了</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>コードをコピー</span>
                </>
              )}
            </button>
            <button
              onClick={handleDownloadSingle}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs flex items-center gap-1.5 border border-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>ダウンロード</span>
            </button>
          </div>
        </div>

        {/* Code Content Area */}
        <div className="mt-3 flex-1 bg-slate-950 rounded p-3 overflow-auto border border-slate-800/80">
          <pre className="font-mono text-xs text-slate-300 leading-relaxed select-text">
            <code>{currentFile.content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
