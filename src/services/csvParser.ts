/**
 * CSV Parser & Serializer for Keirin AI
 * Enforces mandatory columns with Japanese error messages as per Section 4 & 8.
 */

import { BetType, Entry, KeirinGrade, OddsItem, RaceGroup, RiderStyle } from '../types/keirin';
import { normalizeRate } from './features';

export const MANDATORY_ENTRY_COLUMNS = [
  'race_id',
  'date',
  'grade',
  'car_no',
  'score',
  'style',
  'line_id',
  'line_pos',
  'gear_ratio',
  'win_rate',
  'top2_rate',
  'top3_rate',
  'back_count',
];

export const MANDATORY_ODDS_COLUMNS = ['race_id', 'bet_type', 'combo', 'odds'];

export interface ParseResult<T> {
  success: boolean;
  data: T[];
  errors: string[];
  warning?: string;
}

/**
 * Parses raw CSV string to rows of key-value pairs.
 */
function parseRawCsv(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0]
    .split(',')
    .map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (rawCols.length < 2) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = rawCols[idx] !== undefined ? rawCols[idx] : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Parses entries.csv with column validation.
 */
export function parseEntriesCsv(csvContent: string): ParseResult<Entry> {
  const { headers, rows } = parseRawCsv(csvContent);
  const errors: string[] = [];

  if (headers.length === 0) {
    return {
      success: false,
      data: [],
      errors: ['CSVデータが空です。出走表データを入力してください。'],
    };
  }

  // Check missing mandatory columns
  const missingCols = MANDATORY_ENTRY_COLUMNS.filter((col) => !headers.includes(col));
  if (missingCols.length > 0) {
    errors.push(
      `出走表CSVの必須列が不足しています: [${missingCols.join(', ')}] を含めてください。`
    );
    return { success: false, data: [], errors };
  }

  const entries: Entry[] = [];

  rows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const raceId = row['race_id'];
    const carNo = parseInt(row['car_no'], 10);
    const score = parseFloat(row['score']);
    const lineId = parseInt(row['line_id'], 10);
    const linePos = parseInt(row['line_pos'], 10);
    const gearRatio = parseFloat(row['gear_ratio']);
    const winRate = normalizeRate(parseFloat(row['win_rate']));
    const top2Rate = normalizeRate(parseFloat(row['top2_rate']));
    const top3Rate = normalizeRate(parseFloat(row['top3_rate']));
    const backCount = parseFloat(row['back_count']);
    const finish = row['finish'] ? parseInt(row['finish'], 10) : undefined;

    let style = (row['style'] || '追') as RiderStyle;
    if (!['逃', '捲', '追'].includes(style)) {
      style = '追';
    }

    let grade = (row['grade'] || 'F1').toUpperCase() as KeirinGrade;
    if (!['F2', 'F1', 'G3', 'G2', 'G1', 'GP'].includes(grade)) {
      grade = 'F1';
    }

    if (!raceId || isNaN(carNo) || isNaN(score)) {
      errors.push(
        `${lineNum}行目: race_id, car_no, または score の形式が正しくありません。`
      );
      return;
    }

    entries.push({
      race_id: raceId,
      date: row['date'] || '2026-10-10',
      grade,
      car_no: carNo,
      rider_name: row['rider_name'] || row['name'] || `選手 ${carNo}番`,
      rider_id: row['rider_id'],
      score,
      style,
      line_id: isNaN(lineId) ? carNo : lineId,
      line_pos: isNaN(linePos) ? 1 : linePos,
      gear_ratio: isNaN(gearRatio) ? 3.92 : gearRatio,
      win_rate: isNaN(winRate) ? 0.1 : winRate,
      top2_rate: isNaN(top2Rate) ? 0.2 : top2Rate,
      top3_rate: isNaN(top3Rate) ? 0.3 : top3Rate,
      back_count: isNaN(backCount) ? 0 : backCount,
      finish: finish && !isNaN(finish) ? finish : undefined,
    });
  });

  return {
    success: errors.length === 0,
    data: entries,
    errors,
  };
}

/**
 * Parses odds.csv with column validation.
 */
export function parseOddsCsv(csvContent: string): ParseResult<OddsItem> {
  const { headers, rows } = parseRawCsv(csvContent);
  const errors: string[] = [];

  if (headers.length === 0) {
    return {
      success: false,
      data: [],
      errors: ['オッズCSVデータが空です。'],
    };
  }

  const missingCols = MANDATORY_ODDS_COLUMNS.filter((col) => !headers.includes(col));
  if (missingCols.length > 0) {
    errors.push(
      `オッズCSVの必須列が不足しています: [${missingCols.join(', ')}] を含めてください。`
    );
    return { success: false, data: [], errors };
  }

  const oddsList: OddsItem[] = [];
  const validBetTypes: BetType[] = ['wide', 'quinella', 'exacta', 'trio', 'trifecta'];

  rows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const raceId = row['race_id'];
    const betType = (row['bet_type'] || '').toLowerCase() as BetType;
    const combo = (row['combo'] || '').trim();
    const odds = parseFloat(row['odds']);

    if (!raceId || !combo || isNaN(odds) || odds <= 0) {
      errors.push(`${lineNum}行目: race_id, combo, または odds が無効です。`);
      return;
    }

    if (!validBetTypes.includes(betType)) {
      errors.push(`${lineNum}行目: 券種 '${betType}' は不正です。(wide, quinella, exacta, trio, trifecta のいずれか)`);
      return;
    }

    oddsList.push({
      race_id: raceId,
      bet_type: betType,
      combo,
      odds,
    });
  });

  return {
    success: errors.length === 0,
    data: oddsList,
    errors,
  };
}

/**
 * Merges entries and odds into deduplicated RaceGroup array.
 * If duplicate race_id exists, newer data overwrites old data as per Section 8.
 */
export function mergeRaces(entries: Entry[], odds: OddsItem[]): RaceGroup[] {
  const raceMap = new Map<string, RaceGroup>();

  // Group entries by race_id
  entries.forEach((e) => {
    if (!raceMap.has(e.race_id)) {
      const parts = e.race_id.split('-');
      const raceNo = parts.length > 2 ? parseInt(parts[2], 10) || 1 : 1;
      raceMap.set(e.race_id, {
        race_id: e.race_id,
        date: e.date,
        grade: e.grade,
        venue: '開催場',
        race_no: raceNo,
        entries: [],
        odds: [],
      });
    }
    raceMap.get(e.race_id)!.entries.push(e);
  });

  // Group odds by race_id
  odds.forEach((o) => {
    const r = raceMap.get(o.race_id);
    if (r) {
      r.odds.push(o);
    }
  });

  // Sort cars inside each race by car_no
  raceMap.forEach((rg) => {
    rg.entries.sort((a, b) => a.car_no - b.car_no);
  });

  return Array.from(raceMap.values());
}

/**
 * Converts entries to CSV string.
 */
export function exportEntriesToCsv(entries: Entry[]): string {
  const header = MANDATORY_ENTRY_COLUMNS.join(',') + ',rider_name,finish\n';
  const rows = entries.map((e) => {
    return [
      e.race_id,
      e.date,
      e.grade,
      e.car_no,
      e.score,
      e.style,
      e.line_id,
      e.line_pos,
      e.gear_ratio,
      e.win_rate,
      e.top2_rate,
      e.top3_rate,
      e.back_count,
      `"${e.rider_name || ''}"`,
      e.finish !== undefined ? e.finish : '',
    ].join(',');
  });

  return header + rows.join('\n');
}

/**
 * Converts odds to CSV string.
 */
export function exportOddsToCsv(odds: OddsItem[]): string {
  const header = MANDATORY_ODDS_COLUMNS.join(',') + '\n';
  const rows = odds.map((o) => {
    return [o.race_id, o.bet_type, o.combo, o.odds].join(',');
  });
  return header + rows.join('\n');
}
