import type { Epic, Plan, RoleDef, Scenario, ScenarioSnapshot, Segment, Team } from '../types';
import { DEFAULT_ROLES } from './roles';
import { defaultPipeline } from './scheduler';

// Палитра меток команд — по кругу, отличается от палитры ролей, чтобы легче различать.
const TEAM_PALETTE = ['#0AA2C0', '#F97316', '#7C3AED', '#16A34A', '#DB2777', '#0EA5E9', '#CA8A04', '#DC2626'];

export function nextTeamColor(existing: Team[]): string {
  return TEAM_PALETTE[existing.length % TEAM_PALETTE.length];
}

export function sprintNumber(team: Team, sprintIndex: number): number {
  return team.sprintBase + sprintIndex;
}

/** «29 / 89» — номера спринта у всех команд, либо у одной, если выбран фильтр. */
export function sprintNumbersLabel(teams: Team[], sprintIndex: number, onlyTeamId?: string): string {
  const list = onlyTeamId ? teams.filter((t) => t.id === onlyTeamId) : teams;
  return list
    .map((t) => {
      const n = sprintNumber(t, sprintIndex);
      return n > 0 ? String(n) : '—'; // команды тогда ещё не было
    })
    .join(' / ');
}

export function teamsBadge(teams: Team[], ids: string[]): string {
  if (ids.length === 0) return 'без команды';
  if (teams.length > 1 && ids.length === teams.length) return 'все команды';
  return ids.map((id) => teams.find((t) => t.id === id)?.shortName ?? id).join(' + ');
}

export function teamName(teams: Team[], id: string): string {
  return teams.find((t) => t.id === id)?.name ?? id;
}

// ——— миграция старых plan.json ———

function legacySprintBase(raw: any, teamId: string): number {
  const s0 = raw.sprints?.[0];
  const key = String(teamId).toLowerCase();
  if (s0 && typeof s0[key] === 'number') return s0[key] - (s0.index ?? 0);
  return 1;
}

/**
 * Приводит план к актуальной схеме: у команд появляется sprintBase,
 * у фич вместо team: 'AMCLCT' | 'JHD' | 'BOTH' — список teams.
 */
// Раньше шапка показывала «JHD / AMCLCT» — при миграции сохраняем этот порядок.
const LEGACY_HEADER_ORDER = ['jhd', 'amclct'];

function normalizedRange(raw: any, maxIndex: number): { from: number; to: number } | null {
  if (maxIndex < 0) return null;
  const rawFrom = Number(raw?.from);
  const rawTo = Number(raw?.to);
  const hasFrom = Number.isFinite(rawFrom);
  const hasTo = Number.isFinite(rawTo);
  if (!hasFrom && !hasTo) return null;
  let from = Math.trunc(hasFrom ? rawFrom : rawTo);
  let to = Math.trunc(hasTo ? rawTo : rawFrom);
  if (from > to) [from, to] = [to, from];
  from = Math.max(0, Math.min(maxIndex, from));
  to = Math.max(0, Math.min(maxIndex, to));
  return { from, to };
}

function uniqueId(candidate: unknown, fallback: string, used: Set<string>): string {
  const base = String(candidate || fallback);
  let id = base;
  let suffix = 2;
  while (used.has(id)) id = `${base}-${suffix++}`;
  used.add(id);
  return id;
}

/** Плановый диапазон всей задачи: новый формат plannedFrom/plannedTo
 *  либо миграция из старых по-ролевых plannedSegments (min from / max to). */
function normalizePlannedRange(e: any, maxIndex: number): { plannedFrom?: number; plannedTo?: number } {
  if (Number.isFinite(Number(e?.plannedFrom)) || Number.isFinite(Number(e?.plannedTo))) {
    const range = normalizedRange({ from: e.plannedFrom, to: e.plannedTo }, maxIndex);
    if (range) return { plannedFrom: range.from, plannedTo: range.to };
    return {};
  }
  const legacy: any[] = Array.isArray(e?.plannedSegments) ? e.plannedSegments : [];
  const ranges: { from: number; to: number }[] = [];
  for (const s of legacy) {
    const r = normalizedRange(s, maxIndex);
    if (r) ranges.push(r);
  }
  if (ranges.length === 0) return {};
  return {
    plannedFrom: Math.min(...ranges.map((r) => r.from)),
    plannedTo: Math.max(...ranges.map((r) => r.to)),
  };
}

function normalizeScenario(raw: any): Scenario {
  const snapshot: ScenarioSnapshot = {
    epics: Array.isArray(raw?.snapshot?.epics) ? raw.snapshot.epics : [],
    people: Array.isArray(raw?.snapshot?.people) ? raw.snapshot.people : [],
  };
  const baseRaw = raw?.baseSnapshot ?? snapshot;
  const baseSnapshot: ScenarioSnapshot = {
    epics: Array.isArray(baseRaw?.epics) ? structuredClone(baseRaw.epics) : [],
    people: Array.isArray(baseRaw?.people) ? structuredClone(baseRaw.people) : [],
  };
  const createdAt = typeof raw?.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString();
  return {
    id: String(raw?.id || crypto.randomUUID()),
    name: typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Вариант без названия',
    snapshot,
    baseSnapshot,
    createdAt,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : createdAt,
  };
}

export function normalizePlan(raw: any): Plan {
  const rawTeams: any[] = raw.teams ?? [];
  const isLegacy = rawTeams.length > 0 && rawTeams.every((t) => typeof t.sprintBase !== 'number');
  const ordered = isLegacy
    ? [...rawTeams].sort(
        (a, b) =>
          LEGACY_HEADER_ORDER.indexOf(String(a.id).toLowerCase()) - LEGACY_HEADER_ORDER.indexOf(String(b.id).toLowerCase())
      )
    : rawTeams;
  const teams: Team[] = ordered.map((t: any, i: number) => ({
    id: String(t.id),
    name: t.name ?? String(t.id),
    shortName: t.shortName ?? String(t.id),
    sprintBase: typeof t.sprintBase === 'number' ? t.sprintBase : legacySprintBase(raw, t.id),
    color: typeof t.color === 'string' ? t.color : TEAM_PALETTE[i % TEAM_PALETTE.length],
  }));
  if (teams.length === 0) teams.push({ id: 'team-1', name: 'Команда', shortName: 'К1', sprintBase: 1, color: TEAM_PALETTE[0] });
  const teamIds = teams.map((t) => t.id);

  const rawRoles: any[] = Array.isArray(raw.roles) ? raw.roles : [];
  const roles: RoleDef[] =
    rawRoles.length > 0
      ? rawRoles.map((r: any) => ({
          id: String(r.id),
          label: r.label ?? String(r.id),
          color: r.color ?? '#999999',
          capacityTracked: r.capacityTracked ?? true,
          shared: r.shared ?? false,
        }))
      : DEFAULT_ROLES;

  const maxSprintIndex = Math.max(-1, ...(Array.isArray(raw.sprints) ? raw.sprints.map((s: any) => Number(s?.index)).filter(Number.isFinite) : []));
  const epics: Epic[] = (Array.isArray(raw.epics) ? raw.epics : []).map((e: any, epicIndex: number) => {
    let ids: string[];
    if (Array.isArray(e.teams)) ids = e.teams;
    else if (e.team === 'BOTH') ids = teamIds;
    else if (e.team) ids = [e.team];
    else ids = [];
    const { team: _legacy, teams: _t, ...rest } = e;
    const epicId = String(rest.id || `epic-${epicIndex + 1}`);
    const usedIds = new Set<string>();
    const segments: Segment[] = (Array.isArray(rest.segments) ? rest.segments : []).flatMap((segment: any, index: number) => {
      const range = normalizedRange(segment, maxSprintIndex);
      if (!range || segment?.role == null) return [];
      return [{
        ...segment,
        id: uniqueId(segment.id, `${epicId}-segment-${index + 1}`, usedIds),
        role: String(segment.role),
        ...range,
        label: typeof segment.label === 'string' ? segment.label : '',
        color: typeof segment.color === 'string' ? segment.color : null,
        flag: segment.flag ?? null,
      }];
    });
    const planned = normalizePlannedRange(rest, maxSprintIndex);
    return {
      ...rest,
      id: epicId,
      title: rest.title ?? epicId,
      teams: ids.filter((id) => teamIds.includes(id)),
      segments,
      ...planned,
    };
  });

  const thresholds = raw.settings?.thresholds ?? {};
  return {
    ...raw,
    teams,
    roles,
    epics,
    people: raw.people ?? [],
    scenarios: Array.isArray(raw.scenarios) ? raw.scenarios.map(normalizeScenario) : [],
    settings: {
      ...raw.settings,
      thresholds: {
        okPerPerson: thresholds.okPerPerson ?? 2,
        okPerPersonShared: thresholds.okPerPersonShared ?? 1,
      },
      pipeline: raw.settings?.pipeline ?? defaultPipeline(),
    },
  };
}
