/**
 * Phase 1 Manual HTML Ingestion Parser
 * Allows parsing user-saved HTML files from KEIRIN.JP / OddsPark for private analysis.
 * Adheres to Section 9: "私的利用の範囲に留め、保存データの再配布は行わない。"
 */

import { BetType, Entry, KeirinGrade, OddsItem, RiderStyle } from '../types/keirin';
import { normalizeRate } from './features';

export interface HtmlParseResult {
  raceId: string;
  venueName?: string;
  raceDate?: string;
  entries: Entry[];
  odds: OddsItem[];
  detectedLineStr?: string;
  log: string[];
}

/**
 * Parses raw HTML string and extracts race entries and odds tables.
 */
export function parseKeirinHtml(htmlContent: string, defaultDate: string = '2026-10-10'): HtmlParseResult {
  const log: string[] = [];
  const entries: Entry[] = [];
  const odds: OddsItem[] = [];

  // 1. Extract metadata (race_id, venue, date if present)
  let raceId = `${defaultDate.replace(/-/g, '')}-35-05`;
  const raceIdMatch = htmlContent.match(/(?:race_id|raceId|raceNo|koid)=["']?([0-9\-a-zA-Z]+)["']?/i);
  if (raceIdMatch && raceIdMatch[1]) {
    raceId = raceIdMatch[1];
    log.push(`レースIDを検出: ${raceId}`);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Try to find title or venue text
  const titleText = doc.title || '';
  log.push(`ページタイトル: ${titleText || '未設定'}`);

  // 2. Scan all tables for race entries
  const tables = doc.querySelectorAll('table');
  log.push(`HTML内のテーブル数: ${tables.length}`);

  let entriesFound = false;

  tables.forEach((table, tableIdx) => {
    const textContent = table.textContent || '';
    // Check if this table looks like an entry table
    const hasCarNo = textContent.includes('車番') || textContent.includes('車');
    const hasScore = textContent.includes('競走得点') || textContent.includes('得点');
    const hasRider = textContent.includes('選手名') || textContent.includes('選手');

    if ((hasCarNo && hasScore) || (hasCarNo && hasRider)) {
      log.push(`出走表テーブル #${tableIdx + 1} を解析中...`);

      const rows = table.querySelectorAll('tr');
      rows.forEach((row, rowIdx) => {
        const cells = Array.from(row.querySelectorAll('td, th')).map((c) =>
          c.textContent?.trim() || ''
        );

        if (cells.length < 4) return;

        // Try to identify car_no (single digit 1-9)
        const carNoCell = cells.find((c) => /^[1-9]$/.test(c));
        if (!carNoCell) return;

        const carNo = parseInt(carNoCell, 10);
        if (carNo < 1 || carNo > 9) return;

        // Try to find rider name
        const nameCell = cells.find(
          (c) => c.length >= 2 && c.length <= 10 && !/^[0-9.]+$/.test(c) && !['逃', '捲', '追', '両'].includes(c)
        );

        // Try to find score (e.g. 70.0 - 119.0)
        let score = 85.0;
        const scoreCell = cells.find((c) => {
          const val = parseFloat(c);
          return !isNaN(val) && val >= 60.0 && val <= 125.0;
        });
        if (scoreCell) {
          score = parseFloat(scoreCell);
        }

        // Style
        let style: RiderStyle = '追';
        if (cells.some((c) => c.includes('逃') || c.includes('先行'))) style = '逃';
        else if (cells.some((c) => c.includes('捲'))) style = '捲';
        else if (cells.some((c) => c.includes('追') || c.includes('差'))) style = '追';

        // Gear ratio
        let gearRatio = 3.92;
        const gearCell = cells.find((c) => {
          const val = parseFloat(c);
          return !isNaN(val) && val >= 3.5 && val <= 4.2;
        });
        if (gearCell) {
          gearRatio = parseFloat(gearCell);
        }

        // Back count
        let backCount = 0;
        const backCell = cells.find((c, i) => {
          const val = parseInt(c, 10);
          return !isNaN(val) && val >= 0 && val <= 35 && i > 3;
        });
        if (backCell) {
          backCount = parseInt(backCell, 10);
        }

        // Rates
        let winRate = 0.15;
        let top2Rate = 0.3;
        let top3Rate = 0.45;

        // Look for percentages
        const rateCandidates = cells
          .map((c) => parseFloat(c))
          .filter((v) => !isNaN(v) && v > 0 && v <= 100 && v !== score && v !== gearRatio);

        if (rateCandidates.length >= 1) winRate = normalizeRate(rateCandidates[0]);
        if (rateCandidates.length >= 2) top2Rate = normalizeRate(rateCandidates[1]);
        if (rateCandidates.length >= 3) top3Rate = normalizeRate(rateCandidates[2]);

        // Finish if present
        let finish: number | undefined;
        const finishCell = cells.find((c, i) => i === 0 || i === cells.length - 1);
        if (finishCell && /^[1-9]$/.test(finishCell)) {
          finish = parseInt(finishCell, 10);
        }

        // Avoid duplicate car_no
        if (!entries.some((e) => e.car_no === carNo)) {
          entries.push({
            race_id: raceId,
            date: defaultDate,
            grade: 'F1',
            car_no: carNo,
            rider_name: nameCell || `選手 ${carNo}番`,
            rider_id: `R${1000 + carNo}`,
            score,
            style,
            line_id: carNo, // default
            line_pos: 1,
            gear_ratio: gearRatio,
            win_rate: winRate,
            top2_rate: top2Rate,
            top3_rate: top3Rate,
            back_count: backCount,
            finish,
          });
        }
      });

      if (entries.length >= 4) {
        entriesFound = true;
      }
    }
  });

  // 3. Look for line formation string (e.g. "← 1 5 7 / 2 8 / 3 6 4" or "①⑤⑦ - ②⑧")
  let lineStr: string | undefined;
  const lineRegex = /(?:並び予想|ライン|並び|周回)[:：\s]*([①-⑨1-9\s\/\-─←→|]+)/i;
  const lineMatch = htmlContent.match(lineRegex);
  if (lineMatch && lineMatch[1]) {
    lineStr = lineMatch[1].trim();
    log.push(`並び予想表記を検出: ${lineStr}`);
    parseAndAssignLines(entries, lineStr);
  } else {
    // Group into fallback 2 or 3 lines
    assignDefaultLines(entries);
  }

  // 4. Scan odds tables
  tables.forEach((table) => {
    const textContent = table.textContent || '';
    if (textContent.includes('2車単') || textContent.includes('3連単') || textContent.includes('オッズ')) {
      const rows = table.querySelectorAll('tr');
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td, th')).map((c) =>
          c.textContent?.trim() || ''
        );
        for (let i = 0; i < cells.length - 1; i++) {
          const comboCandidate = cells[i];
          const oddsCandidate = parseFloat(cells[i + 1]);

          if (
            /^[1-9]-[1-9]$/.test(comboCandidate) &&
            !isNaN(oddsCandidate) &&
            oddsCandidate > 0
          ) {
            odds.push({
              race_id: raceId,
              bet_type: 'exacta',
              combo: comboCandidate,
              odds: oddsCandidate,
            });
          } else if (
            /^[1-9]-[1-9]-[1-9]$/.test(comboCandidate) &&
            !isNaN(oddsCandidate) &&
            oddsCandidate > 0
          ) {
            odds.push({
              race_id: raceId,
              bet_type: 'trifecta',
              combo: comboCandidate,
              odds: oddsCandidate,
            });
          }
        }
      });
    }
  });

  log.push(`抽出結果: 出走選手 ${entries.length}名, オッズ ${odds.length}件`);

  return {
    raceId,
    entries,
    odds,
    detectedLineStr: lineStr,
    log,
  };
}

function parseAndAssignLines(entries: Entry[], lineStr: string) {
  // Convert circled numbers ①-⑨ to 1-9
  const circledMap: Record<string, number> = {
    '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5,
    '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9,
  };
  let normalized = lineStr;
  Object.entries(circledMap).forEach(([k, v]) => {
    normalized = normalized.replaceAll(k, v.toString());
  });

  // Split by line separators: '/', '-', '─', '|', or whitespace sequences
  const segments = normalized
    .replace(/[←→]/g, '')
    .split(/[\/\-─|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let currentLineId = 1;
  segments.forEach((seg) => {
    const carNumbers = seg.match(/[1-9]/g);
    if (carNumbers) {
      carNumbers.forEach((cn, posIdx) => {
        const carNo = parseInt(cn, 10);
        const entry = entries.find((e) => e.car_no === carNo);
        if (entry) {
          entry.line_id = currentLineId;
          entry.line_pos = posIdx + 1;
        }
      });
      currentLineId++;
    }
  });
}

function assignDefaultLines(entries: Entry[]) {
  const n = entries.length;
  if (n <= 0) return;

  // Assign realistic lines: Front runners lead, chasers follow
  const leaders = entries.filter((e) => e.style === '逃' || e.style === '捲');
  const chasers = entries.filter((e) => e.style === '追');

  let lineIdx = 1;
  leaders.forEach((l) => {
    l.line_id = lineIdx;
    l.line_pos = 1;
    lineIdx++;
  });

  // Attach chasers to leaders
  chasers.forEach((c, idx) => {
    const targetLeader = leaders[idx % Math.max(1, leaders.length)];
    if (targetLeader) {
      c.line_id = targetLeader.line_id;
      c.line_pos = 2 + Math.floor(idx / Math.max(1, leaders.length));
    } else {
      c.line_id = lineIdx++;
      c.line_pos = 1;
    }
  });
}
