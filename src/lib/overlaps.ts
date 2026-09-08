import type { Plan, TeamId } from '../types';
import { ROLE_BY_ID } from './roles';

// Правило ёмкости (раздел 5 спеки, п.1-3): считаем сколько разных фич
// одновременно занимают одну и ту же роль в одном спринте. Для совмещённых
// ролей (дизайн/iOS/веб) — суммарно по двум командам, для остальных — внутри команды.

export type OverlapStatus = 'warn' | 'red';

export interface OverlapInfo {
  count: number;
  status: OverlapStatus;
  epicTitles: string[];
}

export type OverlapScope = TeamId | 'SHARED';

function scopesForEpic(epicTeam: 'AMCLCT' | 'JHD' | 'BOTH', shared: boolean): OverlapScope[] {
  if (shared) return ['SHARED'];
  if (epicTeam === 'BOTH') return ['AMCLCT', 'JHD'];
  return [epicTeam];
}

export function overlapKey(role: string, scope: OverlapScope, sprintIndex: number): string {
  return `${role}|${scope}|${sprintIndex}`;
}

export function computeOverlaps(plan: Plan): Map<string, OverlapInfo> {
  const { thresholds } = plan.settings;
  const buckets = new Map<string, Map<string, string>>();

  for (const epic of plan.epics) {
    if (epic.enabled === false) continue;
    for (const seg of epic.segments) {
      const role = ROLE_BY_ID[seg.role];
      if (!role || !role.capacityTracked) continue;
      const scopes = scopesForEpic(epic.team, role.shared);
      for (let s = seg.from; s <= seg.to; s++) {
        for (const scope of scopes) {
          const key = overlapKey(seg.role, scope, s);
          let m = buckets.get(key);
          if (!m) {
            m = new Map();
            buckets.set(key, m);
          }
          m.set(epic.id, epic.title);
        }
      }
    }
  }

  const result = new Map<string, OverlapInfo>();
  for (const [key, epicMap] of buckets) {
    const count = epicMap.size;
    const scope = key.split('|')[1];
    const isShared = scope === 'SHARED';
    let status: OverlapStatus | null = null;
    if (isShared) {
      if (count >= thresholds.halfStakeRed) status = 'red';
    } else {
      if (count >= thresholds.fullStakeRed) status = 'red';
      else if (count >= thresholds.fullStakeWarn) status = 'warn';
    }
    if (status) result.set(key, { count, status, epicTitles: [...epicMap.values()] });
  }
  return result;
}

export function scopesForEpicRole(epicTeam: 'AMCLCT' | 'JHD' | 'BOTH', role: string): OverlapScope[] {
  const def = ROLE_BY_ID[role as keyof typeof ROLE_BY_ID];
  if (!def || !def.capacityTracked) return [];
  return scopesForEpic(epicTeam, def.shared);
}
