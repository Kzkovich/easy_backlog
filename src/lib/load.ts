import type { Person, Plan, RoleDef, RoleId, TeamId } from '../types';
import { ROLE_BY_ID, ROLE_DEFS } from './roles';
import { teamName } from './teams';

// Модель загрузки.
//
// Спрос (demand) — сколько разных фич занимают роль в спринте.
// Ёмкость (capacity) — сумма долей людей этой роли (отпуска вычитаются).
// Задач на человека = спрос / ёмкость.
//
// Пороги опираются на эвристику Джеральда Вайнберга (Quality Software Management,
// vol. 1): когда человек ведёт несколько задач параллельно, часть времени уходит
// на переключение контекста — 2 задачи ≈ −20% полезного времени, 3 ≈ −40%,
// 4 ≈ −60%. Поэтому 1 задача на человека — комфортно, 2 — впритык, 3 и больше —
// перегруз. Для совмещённых людей (0,5 на две команды) порог строже: они уже
// переключаются между командами, поэтому вторая параллельная задача — уже красный.

export const SHARED_SCOPE = 'SHARED';
export type LoadScope = TeamId; // id команды или SHARED_SCOPE
export type LoadStatus = 'idle' | 'ok' | 'tight' | 'over' | 'nocap' | 'untracked';

const WEINBERG_EFFICIENCY = [1, 1, 0.8, 0.6, 0.4, 0.2];

export function switchingEfficiency(parallelTasks: number): number {
  if (parallelTasks <= 1) return 1;
  const i = Math.min(Math.round(parallelTasks), WEINBERG_EFFICIENCY.length - 1);
  return WEINBERG_EFFICIENCY[i] ?? 0.1;
}

export function switchingLossPct(parallelTasks: number): number {
  return Math.round((1 - switchingEfficiency(parallelTasks)) * 100);
}

export interface LoadCell {
  demand: number;
  capacity: number;
  headcount: number;
  perPerson: number;
  status: LoadStatus;
  epicIds: string[];
}

export interface PersonLoad {
  person: Person;
  share: number;
  cells: { tasks: number; absent: boolean }[];
}

export interface LoadRow {
  key: string;
  role: RoleDef;
  scope: LoadScope;
  shared: boolean;
  tracked: boolean;
  people: Person[];
  nominalCapacity: number; // без учёта отпусков
  cells: LoadCell[];
  persons: PersonLoad[];
}

export interface LoadResult {
  map: Map<string, LoadCell>;
  rows: LoadRow[];
}

export function loadKey(role: string, scope: LoadScope, sprintIndex: number): string {
  return `${role}|${scope}|${sprintIndex}`;
}

function personShareIn(p: Person, scope: LoadScope): number {
  if (scope === SHARED_SCOPE) return p.allocations.reduce((acc, a) => acc + a.share, 0);
  return p.allocations.filter((a) => a.team === scope).reduce((acc, a) => acc + a.share, 0);
}

/** Роль совмещённая, если хотя бы один человек этой роли работает на несколько команд. */
export function isSharedRole(plan: Plan, roleId: RoleId): boolean {
  if (plan.teams.length < 2) return false;
  const people = plan.people.filter((p) => p.role === roleId);
  if (people.length === 0) return ROLE_BY_ID[roleId]?.shared ?? false;
  return people.some((p) => new Set(p.allocations.filter((a) => a.share > 0).map((a) => a.team)).size > 1);
}

export function scopesForEpicRole(plan: Plan, epicTeams: TeamId[], roleId: RoleId): LoadScope[] {
  if (isSharedRole(plan, roleId)) return [SHARED_SCOPE];
  return epicTeams;
}

function statusFor(demand: number, capacity: number, okMax: number, tracked: boolean): LoadStatus {
  if (!tracked) return demand > 0 ? 'untracked' : 'idle';
  if (demand === 0) return 'idle';
  if (capacity <= 0) return 'nocap';
  const per = demand / capacity;
  if (per <= 1) return 'ok';
  if (per <= okMax) return 'tight';
  return 'over';
}

export function computeLoad(plan: Plan): LoadResult {
  const sprintCount = plan.sprints.length;
  const okPerPerson = plan.settings?.thresholds?.okPerPerson ?? 2;
  const okPerPersonShared = plan.settings?.thresholds?.okPerPersonShared ?? 1;

  // Спрос: ключ -> множество id фич
  const demandBuckets = new Map<string, Set<string>>();
  for (const epic of plan.epics) {
    if (epic.enabled === false) continue;
    for (const seg of epic.segments) {
      const scopes = scopesForEpicRole(plan, epic.teams, seg.role);
      for (let s = seg.from; s <= seg.to; s++) {
        if (s < 0 || s >= sprintCount) continue;
        for (const scope of scopes) {
          const key = loadKey(seg.role, scope, s);
          let set = demandBuckets.get(key);
          if (!set) {
            set = new Set();
            demandBuckets.set(key, set);
          }
          set.add(epic.id);
        }
      }
    }
  }

  const map = new Map<string, LoadCell>();
  const rows: LoadRow[] = [];

  for (const role of ROLE_DEFS) {
    const shared = isSharedRole(plan, role.id);
    const scopes: LoadScope[] = shared ? [SHARED_SCOPE] : plan.teams.map((t) => t.id);

    for (const scope of scopes) {
      const people = plan.people.filter((p) => p.role === role.id && personShareIn(p, scope) > 0);
      const tracked = role.capacityTracked || people.length > 0;

      const cells: LoadCell[] = [];
      let demandTotal = 0;

      for (let s = 0; s < sprintCount; s++) {
        const epicIds = [...(demandBuckets.get(loadKey(role.id, scope, s)) ?? [])];
        const present = people.filter((p) => !p.absences?.includes(s));
        const capacity = present.reduce((acc, p) => acc + personShareIn(p, scope), 0);
        const demand = epicIds.length;
        demandTotal += demand;
        const okMax = shared ? okPerPersonShared : okPerPerson;
        const cell: LoadCell = {
          demand,
          capacity,
          headcount: present.length,
          perPerson: capacity > 0 ? demand / capacity : 0,
          status: statusFor(demand, capacity, okMax, tracked),
          epicIds,
        };
        cells.push(cell);
        map.set(loadKey(role.id, scope, s), cell);
      }

      if (people.length === 0 && demandTotal === 0) continue;

      const persons: PersonLoad[] = plan.people
        .filter((p) => p.role === role.id && personShareIn(p, scope) > 0)
        .map((p) => {
          const share = personShareIn(p, scope);
          return {
            person: p,
            share,
            cells: cells.map((c, s) => ({
              tasks: c.capacity > 0 ? c.perPerson * share : 0,
              absent: !!p.absences?.includes(s),
            })),
          };
        });

      const nominalCapacity = people.reduce((acc, p) => acc + personShareIn(p, scope), 0);
      rows.push({ key: `${role.id}|${scope}`, role, scope, shared, tracked, people, nominalCapacity, cells, persons });
    }
  }

  return { map, rows };
}

export function scopeTitle(plan: Plan, scope: LoadScope): string {
  if (scope === SHARED_SCOPE) return 'Общие люди — работают на несколько команд';
  return teamName(plan.teams, scope);
}

export function scopeShort(plan: Plan, scope: LoadScope): string {
  if (scope === SHARED_SCOPE) return 'общие';
  return plan.teams.find((t) => t.id === scope)?.shortName ?? scope;
}
