/**
 * Race Selector Bar Component (レース一覧セレクター)
 * Provides seamless venue switching, 1R-12R race button strip,
 * status badges (締切直前/発走中/確定済), and instant synchronization
 * across race cards (出走表), odds, and AI predictions.
 */

import React, { useMemo } from 'react';
import { RaceGroup } from '../types/keirin';
import { Calendar, MapPin, Clock, Search, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';

interface RaceSelectorBarProps {
  races: RaceGroup[];
  selectedRaceId: string;
  onSelectRace: (raceId: string) => void;
  title?: string;
  className?: string;
}

export const RaceSelectorBar: React.FC<RaceSelectorBarProps> = ({
  races,
  selectedRaceId,
  onSelectRace,
  title = 'レース一覧・出走表選択',
  className = '',
}) => {
  // Currently selected race object
  const selectedRace = useMemo(() => {
    return races.find((r) => r.race_id === selectedRaceId) || races[0];
  }, [races, selectedRaceId]);

  // Group all races by venue (normalize venue names by stripping trailing 競輪)
  const venueGroups = useMemo(() => {
    const map = new Map<string, RaceGroup[]>();
    races.forEach((r) => {
      const vName = r.venue ? r.venue.replace(/競輪$/, '').trim() : 'その他';
      if (!map.has(vName)) {
        map.set(vName, []);
      }
      map.get(vName)!.push(r);
    });

    // Sort races within each venue by race_no
    map.forEach((raceList) => {
      raceList.sort((a, b) => a.race_no - b.race_no);
    });

    return Array.from(map.entries()).map(([venueName, raceList]) => {
      // Find latest date or grade
      const sample = raceList[0];
      const hasLiveClosing = raceList.some((r) => r.status === 'closing_soon');
      return {
        venueName,
        races: raceList,
        grade: sample?.grade || 'F1',
        timeSlot: sample?.timeSlot,
        date: sample?.date,
        hasLiveClosing,
      };
    });
  }, [races]);

  // Active venue name (derived from selectedRace, normalized)
  const selectedRaceVenue = selectedRace?.venue ? selectedRace.venue.replace(/競輪$/, '').trim() : '';
  const activeVenueName = selectedRaceVenue || (venueGroups[0] ? venueGroups[0].venueName : '平塚');

  // Races in the active venue
  const activeVenueRaces = useMemo(() => {
    const vg = venueGroups.find((v) => v.venueName === activeVenueName);
    return vg ? vg.races : (venueGroups[0]?.races || []);
  }, [venueGroups, activeVenueName]);

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3 ${className}`}>
      {/* Top Header & Search / Direct Jump */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-100">{title}</h3>
          <span className="text-[11px] text-slate-400">
            (全{races.length}レース登録 / 選択したレースに出走表・オッズ・予想が即時連動)
          </span>
        </div>

        {/* Direct Dropdown Jump Selector */}
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-400 shrink-0">レース直接選択:</label>
          <select
            value={selectedRaceId}
            onChange={(e) => onSelectRace(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono max-w-[280px]"
          >
            {races.map((r) => (
              <option key={r.race_id} value={r.race_id}>
                {r.venue} {r.race_no}R [{r.grade}] ({r.date}) - {r.raceTitle || `${r.entries.length}車立`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1. Venue Tabs Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-400 shrink-0 mr-1">開催場:</span>
        {venueGroups.map((vg) => {
          const isCurrentVenue = vg.venueName === activeVenueName;
          const venueFirstRace = vg.races[0];

          return (
            <button
              key={vg.venueName}
              onClick={() => {
                // If switching venue, choose closing_soon race or 1st race of that venue
                const targetRace =
                  vg.races.find((r) => r.status === 'closing_soon') || vg.races[0];
                if (targetRace) {
                  onSelectRace(targetRace.race_id);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all border ${
                isCurrentVenue
                  ? 'bg-slate-800 border-emerald-500 text-slate-100 font-bold shadow-sm'
                  : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <span>{vg.venueName}</span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                  vg.grade === 'GP' || vg.grade === 'G1'
                    ? 'bg-amber-500/20 text-amber-300'
                    : vg.grade === 'G3'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {vg.grade}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {vg.races.length}R
              </span>
              {vg.hasLiveClosing && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Race Number Buttons Strip (1R .. 12R) */}
      <div>
        <div className="flex items-center justify-between mb-1.5 text-[11px] text-slate-400">
          <span>
            {activeVenueName}競輪 レース一覧 (クリックで出走表・オッズを即時切替):
          </span>
          <span className="text-[10px] text-slate-500">
            全{activeVenueRaces.length}レース
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5">
          {activeVenueRaces.map((r) => {
            const isSelected = r.race_id === selectedRaceId;
            const isClosing = r.status === 'closing_soon';
            const isFinished = r.status === 'finished';
            const isRacing = r.status === 'racing';
            // Fallback deadline calculation if not provided
            const dlTime = r.deadlineTime || `${10 + Math.floor((r.race_no * 25) / 60)}:${String((r.race_no * 25) % 60).padStart(2, '0')}`;
            const pTime = r.postTime || `${10 + Math.floor((r.race_no * 25 + 5) / 60)}:${String((r.race_no * 25 + 5) % 60).padStart(2, '0')}`;

            return (
              <button
                key={r.race_id}
                onClick={() => onSelectRace(r.race_id)}
                className={`p-1.5 rounded text-left transition-all border flex flex-col justify-between ${
                  isSelected
                    ? 'bg-emerald-950/70 border-emerald-500 text-slate-100 ring-1 ring-emerald-500/50 shadow-md'
                    : isClosing
                    ? 'bg-amber-950/40 border-amber-500 text-amber-200 animate-pulse'
                    : isRacing
                    ? 'bg-cyan-950/30 border-cyan-500 text-cyan-200'
                    : isFinished
                    ? 'bg-slate-950/80 border-slate-800 text-slate-400 hover:bg-slate-900'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-mono font-bold text-xs ${isSelected ? 'text-emerald-300' : ''}`}>
                    {r.race_no}R
                  </span>
                  <span className="text-[9px] font-mono text-slate-400" title={`発走予定: ${pTime}`}>
                    {pTime}
                  </span>
                </div>

                <div className="mt-1 text-[10px] truncate text-slate-300" title={r.raceTitle || '予選'}>
                  {r.raceTitle || `予選`}
                </div>

                <div className="mt-1 text-[9px] font-semibold flex items-center justify-between">
                  <span className="font-mono text-amber-300/90 text-[10px]" title="締切予定時刻">
                    {dlTime}締切
                  </span>
                  {isClosing ? (
                    <span className="text-amber-400 font-bold px-1 rounded bg-amber-950/80 border border-amber-800/80 text-[8px]">
                      直前
                    </span>
                  ) : isRacing ? (
                    <span className="text-cyan-400 font-bold px-1 rounded bg-cyan-950/80 border border-cyan-800/80 text-[8px]">
                      発走中
                    </span>
                  ) : isFinished ? (
                    <span className="text-slate-400 px-1 rounded bg-slate-900 border border-slate-800 text-[8px]">
                      確定
                    </span>
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

      {/* 3. Selected Race Summary Strip */}
      {selectedRace && (
        <div className="bg-slate-950/90 border border-slate-800 rounded p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold font-mono text-xs">
                選択中: {selectedRace.venue} {selectedRace.race_no}R
              </span>
              <span className="font-semibold text-slate-200">
                {selectedRace.raceTitle || `${selectedRace.grade} 競走`}
              </span>
            </div>

            <span className="text-slate-600">|</span>

            <div className="flex flex-wrap items-center gap-2.5 text-slate-400">
              <span>日付: <strong className="text-slate-200 font-mono">{selectedRace.date}</strong></span>
              <span>グレード: <strong className="text-slate-200 font-semibold">{selectedRace.grade}</strong></span>
              <span>頭数: <strong className="text-slate-200 font-mono">{selectedRace.entries.length}車立</strong></span>
              <span>オッズ: <strong className="text-slate-200 font-mono">{selectedRace.odds.length}件</strong></span>
              {selectedRace.deadlineTime && (
                <span className="flex items-center gap-1 text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 font-mono font-bold">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>〆切時刻: {selectedRace.deadlineTime}</span>
                </span>
              )}
              {selectedRace.postTime && (
                <span className="text-slate-300 font-mono">
                  発走: <strong className="text-slate-100">{selectedRace.postTime}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                selectedRace.status === 'closing_soon'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                  : selectedRace.status === 'finished'
                  ? 'bg-slate-800 text-slate-300'
                  : selectedRace.status === 'racing'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'bg-emerald-950/50 text-emerald-400 border border-emerald-900'
              }`}
            >
              {selectedRace.status === 'closing_soon'
                ? '締切直前'
                : selectedRace.status === 'finished'
                ? '確定済'
                : selectedRace.status === 'racing'
                ? '発走中'
                : '出走準備完了'}
            </span>
            <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>出走表・オッズ連動中</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
