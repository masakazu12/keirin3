/**
 * Keirin Race Line Diagram Component (並び予想)
 * Renders official Japanese Keirin car colors, line groupings, and rider positions.
 */

import React from 'react';
import { Entry } from '../types/keirin';

export const CAR_COLORS: Record<number, { bg: string; text: string; border: string; name: string }> = {
  1: { bg: 'bg-white', text: 'text-slate-900', border: 'border-slate-300', name: '白' },
  2: { bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-700', name: '黒' },
  3: { bg: 'bg-red-600', text: 'text-white', border: 'border-red-500', name: '赤' },
  4: { bg: 'bg-blue-600', text: 'text-white', border: 'border-blue-500', name: '青' },
  5: { bg: 'bg-amber-400', text: 'text-slate-950', border: 'border-amber-300', name: '黄' },
  6: { bg: 'bg-emerald-600', text: 'text-white', border: 'border-emerald-500', name: '緑' },
  7: { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-400', name: '橙' },
  8: { bg: 'bg-pink-400', text: 'text-slate-950', border: 'border-pink-300', name: '桃' },
  9: { bg: 'bg-purple-600', text: 'text-white', border: 'border-purple-500', name: '紫' },
};

interface RaceLineDiagramProps {
  entries: Entry[];
  className?: string;
}

export const RaceLineDiagram: React.FC<RaceLineDiagramProps> = ({ entries, className = '' }) => {
  // Group entries by line_id
  const lineGroups = new Map<number, Entry[]>();
  entries.forEach((e) => {
    const lid = e.line_id || e.car_no;
    if (!lineGroups.has(lid)) {
      lineGroups.set(lid, []);
    }
    lineGroups.get(lid)!.push(e);
  });

  // Sort riders inside each line by line_pos
  const lines = Array.from(lineGroups.values()).map((riders) =>
    [...riders].sort((a, b) => (a.line_pos || 1) - (b.line_pos || 1))
  );

  // Sort lines so the front-running style line appears first
  lines.sort((a, b) => {
    const styleScore = (s?: string) => (s === '逃' ? 3 : s === '捲' ? 2 : 1);
    return styleScore(b[0]?.style) - styleScore(a[0]?.style);
  });

  return (
    <div className={`bg-slate-900/80 border border-slate-800 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">並び予想 (ライン構成)</span>
          <span className="text-slate-500 text-[11px]">← 先頭方向 (周回・展開)</span>
        </div>
        <div className="text-[11px] text-slate-400">
          構成: {lines.length}ライン {lines.some((l) => l.length === 1) ? '(単騎あり)' : ''}
        </div>
      </div>

      {/* Visual Lines Display */}
      <div className="flex flex-wrap items-center gap-y-3 gap-x-4 py-1">
        {lines.map((lineRiders, lIdx) => {
          const isSolo = lineRiders.length === 1;

          return (
            <React.Fragment key={lIdx}>
              <div className="flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded border border-slate-800">
                {lineRiders.map((rider, posIdx) => {
                  const carColor = CAR_COLORS[rider.car_no] || CAR_COLORS[1];
                  const posLabel = isSolo
                    ? '単騎'
                    : posIdx === 0
                    ? '先頭'
                    : posIdx === 1
                    ? '番手'
                    : `${posIdx + 1}番手`;

                  return (
                    <div key={rider.car_no} className="flex items-center gap-1">
                      {posIdx > 0 && <span className="text-slate-600 font-mono text-xs">─</span>}
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shadow-sm border ${carColor.bg} ${carColor.text} ${carColor.border}`}
                          title={`${rider.car_no}号車: ${rider.rider_name || ''} (競走得点: ${rider.score})`}
                        >
                          {rider.car_no}
                        </div>
                        <div className="text-[10px] text-slate-300 font-medium mt-1 truncate max-w-[56px] text-center">
                          {rider.rider_name?.split(' ')[0] || `車番${rider.car_no}`}
                        </div>
                        <div className="flex items-center gap-0.5 text-[9px] text-slate-400">
                          <span
                            className={
                              rider.style === '逃'
                                ? 'text-amber-400 font-semibold'
                                : rider.style === '捲'
                                ? 'text-cyan-400'
                                : 'text-slate-400'
                            }
                          >
                            {rider.style}
                          </span>
                          <span>·</span>
                          <span className="text-slate-500">{posLabel}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {lIdx < lines.length - 1 && (
                <div className="text-slate-600 font-bold text-sm tracking-widest px-1">
                  ／
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
