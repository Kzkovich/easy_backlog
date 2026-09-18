import * as XLSX from 'xlsx';
import type { Epic, RoleDef, Segment, Sprint, Team } from '../types';
import { matchRoleFromExcelLabel } from './roles';

// Импорт из Excel — раздел 7 спеки. Лист "Планирование 2026".
// Источник истины для колбасок — заливка ячейки, не текст в E/F.
// Серая заливка — не «игнорировать»: это плановые сроки, которые владелец
// продукта проставил в начале года (ориентир на фоне факта).

const SHEET_NAME = 'Планирование 2026';
const HEADER_ROW_JHD = 4; // строка 5, 0-индекс
const HEADER_ROW_AMCLCT = 5; // строка 6, 0-индекс
const FIRST_DATA_ROW = 6; // строка 7 и далее
const COL_B = 1; // название эпика
const COL_C = 2; // этап (роль)
const HEADER_SCAN_MAX_COL = 100; // с запасом — где искать столбцы спринтов

const EMPTY_FILLS = new Set(['FFFFFF']); // действительно пустая ячейка
const GRAY_FILLS = new Set(['D9D9D9', 'BFBFBF', 'A6A6A6', 'F2F2F2', 'E7E6E6', 'D0CECE']); // план на начало года
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

// Команда фичи — по префиксу в названии («JHD. …»). Не нашли однозначно — все команды.
function detectTeams(title: string, teams: Team[]): string[] {
  const norm = title.toUpperCase();
  const hits = teams.filter((t) => {
    const short = t.shortName.toUpperCase();
    const name = t.name.toUpperCase();
    return norm.startsWith(short) || (name.length > 3 && norm.includes(name));
  });
  return hits.length === 1 ? [hits[0].id] : teams.map((t) => t.id);
}

function sprintIndexByTeamNumber(teams: Team[], teamId: string, num: number, sprintCount: number): number | null {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return null;
  const idx = num - team.sprintBase;
  return idx >= 0 && idx < sprintCount ? idx : null;
}

export interface ImportResult {
  epics: Epic[];
  warnings: string[];
}

/** Копит подряд идущие закрашенные ячейки в один отрезок (разрыв — новый отрезок). */
function makeRunTracker(onFlush: (from: number, to: number, texts: string[], risk: boolean) => void) {
  let start: number | null = null;
  let end: number | null = null;
  let texts: string[] = [];
  let risk = false;
  function flush() {
    if (start === null || end === null) return;
    onFlush(start, end, texts, risk);
    start = null;
    end = null;
    texts = [];
    risk = false;
  }
  function feed(active: boolean, sprintIdx: number, prevSprintIdx: number | null, text: string, isRisk: boolean) {
    const isAdjacent = end !== null && prevSprintIdx === end;
    if (active) {
      if (start !== null && !isAdjacent) flush();
      if (start === null) start = sprintIdx;
      end = sprintIdx;
      if (isRisk) risk = true;
      if (text) texts.push(text);
    } else {
      flush();
    }
  }
  return { feed, flush };
}

export function parsePlanWorkbook(data: ArrayBuffer, sprints: Sprint[], teams: Team[], roles: RoleDef[]): ImportResult {
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
    let idx = amclctNum != null ? sprintIndexByTeamNumber(teams, 'AMCLCT', amclctNum, sprints.length) : null;
    if (idx === null && jhdNum != null) idx = sprintIndexByTeamNumber(teams, 'JHD', jhdNum, sprints.length);
    if (idx !== null) colToSprintIndex.set(c, idx);
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
        teams: detectTeams(titleRaw, teams),
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

    const role = matchRoleFromExcelLabel(roleRaw, roles);
    if (!role) {
      warnings.push(`Строка ${r + 1}: не распознана роль "${roleRaw}", строка пропущена`);
      continue;
    }

    let segCounter = 0;
    const epicForClosures = currentEpic;

    const realTracker = makeRunTracker((from, to, texts, risk) => {
      segCounter += 1;
      const seg: Segment = {
        id: `${epicForClosures.id}-${role}-${segCounter}`,
        role,
        from,
        to,
        label: texts.filter(Boolean).join(' ').trim(),
        color: null,
        flag: risk ? 'risk' : null,
      };
      epicForClosures.segments.push(seg);
    });
    const plannedTracker = makeRunTracker((from, to) => {
      epicForClosures.plannedFrom = Math.min(epicForClosures.plannedFrom ?? from, from);
      epicForClosures.plannedTo = Math.max(epicForClosures.plannedTo ?? to, to);
    });

    for (let i = 0; i < sortedCols.length; i++) {
      const c = sortedCols[i];
      const sprintIdx = colToSprintIndex.get(c)!;
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      const hex = getFillHex(cell);
      const isEmpty = !hex || EMPTY_FILLS.has(hex);
      const isGray = !isEmpty && GRAY_FILLS.has(hex);
      const isReal = !isEmpty && !isGray;
      const prevSprintIdx = i > 0 ? colToSprintIndex.get(sortedCols[i - 1])! : null;
      const text = cell?.v != null ? String(cell.v).trim() : '';
      const isRisk = !!hex && RISK_FILLS.has(hex);

      realTracker.feed(isReal, sprintIdx, prevSprintIdx, text, isRisk);
      plannedTracker.feed(isGray, sprintIdx, prevSprintIdx, text, false);
    }
    realTracker.flush();
    plannedTracker.flush();
  }

  return { epics, warnings };
}
