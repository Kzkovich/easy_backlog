import * as XLSX from 'xlsx';
import type { Epic, EpicTeam, Sprint } from '../types';
import { matchRoleFromExcelLabel } from './roles';

// Импорт из Excel — раздел 7 спеки. Лист "Планирование 2026".
// Источник истины для колбасок — заливка ячейки, не текст в E/F.

const SHEET_NAME = 'Планирование 2026';
const HEADER_ROW_JHD = 4; // строка 5, 0-индекс
const HEADER_ROW_AMCLCT = 5; // строка 6, 0-индекс
const FIRST_DATA_ROW = 6; // строка 7 и далее
const COL_B = 1; // название эпика
const COL_C = 2; // этап (роль)
const HEADER_SCAN_MAX_COL = 100; // с запасом — где искать столбцы спринтов

const GRAY_FILLS = new Set(['D9D9D9', 'BFBFBF', 'A6A6A6', 'F2F2F2', 'E7E6E6', 'D0CECE', 'FFFFFF']);
const RISK_FILLS = new Set(['E06666', 'F4CCCC', 'FCE5CD']);

// Порядок соответствует стандартной палитре темы Office (индексация Excel UI,
// а не порядок <clrScheme> в theme1.xml): lt1, dk1, lt2, dk2, accent1..accent6.
const OFFICE_THEME_FALLBACK = [
  'FFFFFF',
  '000000',
  'E7E6E6',
  '44546A',
  '4472C4',
  'ED7D31',
  'A5A5A5',
  'FFC000',
  '5B9BD5',
  '70AD47',
];

function normalizeRgb(rgb?: string): string | null {
  if (!rgb) return null;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  return hex.toUpperCase();
}

function applyTint(hex: string, tint?: number): string {
  if (!tint) return hex;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const adj = (c: number) => (tint < 0 ? Math.round(c * (1 + tint)) : Math.round(c * (1 - tint) + 255 * tint));
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0').toUpperCase();
  return toHex(adj(r)) + toHex(adj(g)) + toHex(adj(b));
}

function getFillHex(cell: XLSX.CellObject | undefined): string | null {
  const s = (cell as any)?.s;
  if (!s) return null;
  const fg = s.fgColor || s.bgColor;
  if (!fg) return null;
  if (fg.rgb) return normalizeRgb(fg.rgb);
  if (typeof fg.theme === 'number') {
    const base = OFFICE_THEME_FALLBACK[fg.theme];
    if (!base) return null;
    return applyTint(base, fg.tint);
  }
  return null;
}

function detectTeam(title: string): EpicTeam {
  const norm = title.toUpperCase();
  const isJhd = /^JHD\b|JOHNNY DEBT/.test(norm);
  const isAm = /^AM\b|AMCLCT|AM COLLECTION/.test(norm);
  if (isJhd && !isAm) return 'JHD';
  if (isAm && !isJhd) return 'AMCLCT';
  return 'BOTH';
}

export interface ImportResult {
  epics: Epic[];
  warnings: string[];
}

export function parsePlanWorkbook(data: ArrayBuffer, sprints: Sprint[]): ImportResult {
  const wb = XLSX.read(data, { type: 'array', cellStyles: true, cellDates: true });
  const warnings: string[] = [];
  const sheetName = wb.SheetNames.find((n) => n.trim() === SHEET_NAME) ?? wb.SheetNames[0];
  if (sheetName.trim() !== SHEET_NAME) {
    warnings.push(`Лист "${SHEET_NAME}" не найден, использован первый лист: "${sheetName}"`);
  }
  const ws = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  // Сопоставляем столбцы со спринтами по номерам из строк 5/6, а не по
  // фиксированным буквам столбцов — так надёжнее, если разметка листа слегка отличается.
  const colToSprintIndex = new Map<number, number>();
  const maxCol = Math.min(range.e.c, HEADER_SCAN_MAX_COL);
  for (let c = 0; c <= maxCol; c++) {
    const amclctCell = ws[XLSX.utils.encode_cell({ r: HEADER_ROW_AMCLCT, c })];
    const jhdCell = ws[XLSX.utils.encode_cell({ r: HEADER_ROW_JHD, c })];
    const amclctNum = typeof amclctCell?.v === 'number' ? amclctCell.v : null;
    const jhdNum = typeof jhdCell?.v === 'number' ? jhdCell.v : null;
    let sprint = amclctNum != null ? sprints.find((s) => s.amclct === amclctNum) : undefined;
    if (!sprint && jhdNum != null) sprint = sprints.find((s) => s.jhd === jhdNum);
    if (sprint) colToSprintIndex.set(c, sprint.index);
  }

  if (colToSprintIndex.size === 0) {
    warnings.push(
      `Не удалось найти столбцы спринтов по строкам ${HEADER_ROW_JHD + 1}/${HEADER_ROW_AMCLCT + 1} — проверьте, что номера спринтов в файле совпадают со справочником календаря.`
    );
  } else {
    const cols = [...colToSprintIndex.keys()].sort((a, b) => a - b);
    const first = cols[0];
    const last = cols[cols.length - 1];
    const isContiguous = cols.length === last - first + 1;
    if (!isContiguous) {
      warnings.push('Столбцы спринтов не идут подряд — часть колбасок может импортироваться некорректно.');
    }
  }

  const epics: Epic[] = [];
  let currentEpic: Epic | null = null;
  let epicCounter = 0;

  const sortedCols = [...colToSprintIndex.keys()].sort((a, b) => a - b);

  for (let r = FIRST_DATA_ROW; r <= range.e.r; r++) {
    const titleCell = ws[XLSX.utils.encode_cell({ r, c: COL_B })];
    const roleCell = ws[XLSX.utils.encode_cell({ r, c: COL_C })];
    const titleRaw = titleCell?.v != null ? String(titleCell.v).trim() : '';
    const roleRaw = roleCell?.v != null ? String(roleCell.v).trim() : '';

    if (titleRaw) {
      epicCounter += 1;
      currentEpic = {
        id: `epic-${epicCounter}`,
        title: titleRaw.replace(/\s*\n\s*/g, ' ').trim(),
        team: detectTeam(titleRaw),
        enabled: true,
        status: 'разработка',
        effectYear: null,
        effect2026: null,
        effectKind: null,
        needsKb: false,
        notes: '',
        links: [],
        segments: [],
      };
      epics.push(currentEpic);
    }

    if (!roleRaw) continue;
    if (!currentEpic) {
      warnings.push(`Строка ${r + 1}: роль "${roleRaw}" без эпика над ней, строка пропущена`);
      continue;
    }

    const role = matchRoleFromExcelLabel(roleRaw);
    if (!role) {
      warnings.push(`Строка ${r + 1}: не распознана роль "${roleRaw}", строка пропущена`);
      continue;
    }

    let runStartSprint: number | null = null;
    let runEndSprint: number | null = null;
    let runTexts: string[] = [];
    let runRisk = false;
    let segCounter = 0;

    const flushRun = () => {
      if (runStartSprint === null || runEndSprint === null) return;
      segCounter += 1;
      currentEpic!.segments.push({
        id: `${currentEpic!.id}-${role}-${segCounter}`,
        role,
        from: runStartSprint,
        to: runEndSprint,
        label: runTexts.filter(Boolean).join(' ').trim(),
        color: null,
        flag: runRisk ? 'risk' : null,
      });
      runStartSprint = null;
      runEndSprint = null;
      runTexts = [];
      runRisk = false;
    };

    for (let i = 0; i < sortedCols.length; i++) {
      const c = sortedCols[i];
      const sprintIdx = colToSprintIndex.get(c)!;
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const hex = getFillHex(cell);
      const filled = !!hex && !GRAY_FILLS.has(hex);
      const prevSprintIdx = i > 0 ? colToSprintIndex.get(sortedCols[i - 1])! : null;
      const isAdjacentToRun = runEndSprint !== null && prevSprintIdx === runEndSprint;

      if (filled) {
        if (runStartSprint !== null && !isAdjacentToRun) flushRun();
        if (runStartSprint === null) runStartSprint = sprintIdx;
        runEndSprint = sprintIdx;
        if (hex && RISK_FILLS.has(hex)) runRisk = true;
        const text = cell?.v != null ? String(cell.v).trim() : '';
        if (text) runTexts.push(text);
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  return { epics, warnings };
}
