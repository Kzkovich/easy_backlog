import type { Sprint } from '../types';

// Справочник спринтов — раздел 2 спеки. Один и тот же двухнедельный интервал
// имеет два номера: Johnny Debt (JHD) и AM Collection (AMCLCT).
// Захардкожено по факту из таблицы, дальше — автогенерация с шагом 2 недели.

interface SeedRow {
  jhd: number;
  amclct: number;
  dateFrom: string;
  dateTo: string;
  quarter: string;
  freeze?: boolean;
  holiday?: boolean;
}

const SEED: SeedRow[] = [
  { jhd: 10, amclct: 70, dateFrom: '2025-11-28', dateTo: '2025-12-11', quarter: 'Q4 2025' },
  { jhd: 11, amclct: 71, dateFrom: '2025-12-12', dateTo: '2025-12-30', quarter: 'Q4 2025' },
  { jhd: 12, amclct: 72, dateFrom: '2026-01-12', dateTo: '2026-01-22', quarter: 'Q1 2026' },
  { jhd: 13, amclct: 73, dateFrom: '2026-01-23', dateTo: '2026-02-05', quarter: 'Q1 2026' },
  { jhd: 14, amclct: 74, dateFrom: '2026-02-06', dateTo: '2026-02-19', quarter: 'Q1 2026' },
  { jhd: 15, amclct: 75, dateFrom: '2026-02-20', dateTo: '2026-03-05', quarter: 'Q1 2026' },
  { jhd: 16, amclct: 76, dateFrom: '2026-03-06', dateTo: '2026-03-19', quarter: 'Q1 2026' },
  { jhd: 17, amclct: 77, dateFrom: '2026-03-20', dateTo: '2026-04-02', quarter: 'Q1 2026' },
  { jhd: 18, amclct: 78, dateFrom: '2026-04-03', dateTo: '2026-04-16', quarter: 'Q2 2026' },
  { jhd: 19, amclct: 79, dateFrom: '2026-04-17', dateTo: '2026-04-30', quarter: 'Q2 2026' },
  { jhd: 20, amclct: 80, dateFrom: '2026-05-01', dateTo: '2026-05-14', quarter: 'Q2 2026' },
  { jhd: 21, amclct: 81, dateFrom: '2026-05-15', dateTo: '2026-05-28', quarter: 'Q2 2026' },
  { jhd: 22, amclct: 82, dateFrom: '2026-05-29', dateTo: '2026-06-11', quarter: 'Q2 2026' },
  { jhd: 23, amclct: 83, dateFrom: '2026-06-12', dateTo: '2026-06-25', quarter: 'Q2 2026' },
  { jhd: 24, amclct: 84, dateFrom: '2026-06-26', dateTo: '2026-07-09', quarter: 'Q3 2026' },
  { jhd: 25, amclct: 85, dateFrom: '2026-07-10', dateTo: '2026-07-23', quarter: 'Q3 2026' },
  { jhd: 26, amclct: 86, dateFrom: '2026-07-24', dateTo: '2026-08-06', quarter: 'Q3 2026' },
  { jhd: 27, amclct: 87, dateFrom: '2026-08-07', dateTo: '2026-08-20', quarter: 'Q3 2026' },
  { jhd: 28, amclct: 88, dateFrom: '2026-08-21', dateTo: '2026-09-03', quarter: 'Q3 2026' },
  { jhd: 29, amclct: 89, dateFrom: '2026-09-04', dateTo: '2026-09-17', quarter: 'Q3 2026' },
  { jhd: 30, amclct: 90, dateFrom: '2026-09-18', dateTo: '2026-10-01', quarter: 'Q3 2026' },
  { jhd: 31, amclct: 91, dateFrom: '2026-10-02', dateTo: '2026-10-15', quarter: 'Q4 2026' },
  { jhd: 32, amclct: 92, dateFrom: '2026-10-16', dateTo: '2026-10-29', quarter: 'Q4 2026' },
  { jhd: 33, amclct: 93, dateFrom: '2026-10-30', dateTo: '2026-11-12', quarter: 'Q4 2026' },
  { jhd: 34, amclct: 94, dateFrom: '2026-11-13', dateTo: '2026-11-26', quarter: 'Q4 2026' },
  { jhd: 35, amclct: 95, dateFrom: '2026-11-27', dateTo: '2026-12-10', quarter: 'Q4 2026' },
  { jhd: 36, amclct: 96, dateFrom: '2026-12-11', dateTo: '2026-12-24', quarter: 'Q4 2026', freeze: true },
  { jhd: 37, amclct: 97, dateFrom: '2026-12-25', dateTo: '2026-12-31', quarter: 'Q4 2026', holiday: true },
  { jhd: 38, amclct: 98, dateFrom: '2027-01-01', dateTo: '2027-01-14', quarter: 'Q1 2027' },
  { jhd: 39, amclct: 99, dateFrom: '2027-01-15', dateTo: '2027-01-28', quarter: 'Q1 2027' },
];

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function quarterOf(date: Date): string {
  const q = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${q} ${date.getUTCFullYear()}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Строит справочник спринтов: захардкоженные строки + автогенерация вперёд
 * (шаг 2 недели, номера команд +1 на каждый шаг) до horizonSprints индексов.
 */
export function buildSprints(horizonSprints = 80): Sprint[] {
  const sprints: Sprint[] = SEED.map((row, index) => ({
    index,
    jhd: row.jhd,
    amclct: row.amclct,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    quarter: row.quarter,
    flags: {
      freeze: row.freeze ?? false,
      holiday: row.holiday ?? false,
      custom: null,
    },
  }));

  let last = sprints[sprints.length - 1];
  while (sprints.length < horizonSprints) {
    const dateFrom = addDaysIso(last.dateTo, 1);
    const dateTo = addDaysIso(dateFrom, 13);
    const next: Sprint = {
      index: sprints.length,
      jhd: (last.jhd ?? 0) + 1,
      amclct: (last.amclct ?? 0) + 1,
      dateFrom,
      dateTo,
      quarter: quarterOf(new Date(dateFrom + 'T00:00:00Z')),
      flags: { freeze: false, holiday: false, custom: null },
    };
    sprints.push(next);
    last = next;
  }
  return sprints;
}

export function freezeIndex(sprints: Sprint[]): number | null {
  const s = sprints.find((x) => x.flags.freeze);
  return s ? s.index : null;
}

/** Индекс спринта, в котором мы сейчас. Если попали в промежуток — ближайший будущий. */
export function currentSprintIndex(sprints: Sprint[]): number {
  const today = new Date().toISOString().slice(0, 10);
  const inside = sprints.find((s) => s.dateFrom <= today && today <= s.dateTo);
  if (inside) return inside.index;
  const upcoming = sprints.find((s) => s.dateFrom > today);
  return upcoming ? upcoming.index : -1;
}

// Индекс первого спринта текущего квартала — всё раньше считается «прошедшим».
export function currentQuarterCutoffIndex(sprints: Sprint[]): number {
  const label = quarterOf(new Date());
  const idx = sprints.findIndex((s) => s.quarter === label);
  return idx === -1 ? 0 : idx;
}
