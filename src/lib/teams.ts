import type { Epic, Plan, Team } from '../types';

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

export function normalizePlan(raw: any): Plan {
  const rawTeams: any[] = raw.teams ?? [];
  const isLegacy = rawTeams.length > 0 && rawTeams.every((t) => typeof t.sprintBase !== 'number');
  const ordered = isLegacy
    ? [...rawTeams].sort(
        (a, b) =>
          LEGACY_HEADER_ORDER.indexOf(String(a.id).toLowerCase()) - LEGACY_HEADER_ORDER.indexOf(String(b.id).toLowerCase())
      )
    : rawTeams;
  const teams: Team[] = ordered.map((t: any) => ({
    id: String(t.id),
    name: t.name ?? String(t.id),
    shortName: t.shortName ?? String(t.id),
    sprintBase: typeof t.sprintBase === 'number' ? t.sprintBase : legacySprintBase(raw, t.id),
  }));
  if (teams.length === 0) teams.push({ id: 'team-1', name: 'Команда', shortName: 'К1', sprintBase: 1 });
  const teamIds = teams.map((t) => t.id);

  const epics: Epic[] = (raw.epics ?? []).map((e: any) => {
    let ids: string[];
    if (Array.isArray(e.teams)) ids = e.teams;
    else if (e.team === 'BOTH') ids = teamIds;
    else if (e.team) ids = [e.team];
    else ids = [];
    const { team: _legacy, teams: _t, ...rest } = e;
    return { id: rest.id, title: rest.title, teams: ids.filter((id) => teamIds.includes(id)), ...rest };
  });

  const thresholds = raw.settings?.thresholds ?? {};
  return {
    ...raw,
    teams,
    epics,
    people: raw.people ?? [],
    scenarios: raw.scenarios ?? [],
    settings: {
      ...raw.settings,
      thresholds: {
        okPerPerson: thresholds.okPerPerson ?? 2,
        okPerPersonShared: thresholds.okPerPersonShared ?? 1,
      },
    },
  };
}
