import { computeLoad, loadKey, scopesForEpicRole } from './load';
import { currentSprintIndex } from './calendar';
import type { Epic, Pipeline, Plan, ScenarioSnapshot, Segment, StageLinkType } from '../types';

/** Дефолтный пайплайн по DEFAULT_ROLES (seed, редактируется пользователем). */
export function defaultPipeline(): Pipeline {
  return {
    stages: [
      { id: 'grooming', roles: ['grooming'], linkType: 'sequential' },
      { id: 'design', roles: ['design'], linkType: 'sequential' },
      { id: 'analytics', roles: ['analytics'], linkType: 'sequential' },
      { id: 'dev', roles: ['midl', 'android', 'ios', 'web'], linkType: 'sequential' },
      { id: 'testing', roles: ['testing'], linkType: 'earliest' },
      { id: 'rollout', roles: ['rollout'], linkType: 'sequential' },
    ],
  };
}

export function pipelineForEpic(plan: Plan, epic: Epic): Pipeline {
  return epic.pipelineOverride ?? plan.settings?.pipeline ?? defaultPipeline();
}

export function stageFloor(prevEnds: number[], linkType: StageLinkType): number {
  if (prevEnds.length === 0) return -1;
  return linkType === 'earliest' ? Math.min(...prevEnds) : Math.max(...prevEnds);
}

export type SchedulerMode = 'comfortable' | 'emergency';

interface PendingSegment { epic: Epic; segment: Segment; }

function wouldOverload(plan: Plan, epic: Epic, segment: Segment, from: number, to: number): boolean {
  const working: Plan = {
    ...plan,
    epics: plan.epics.map((e) =>
      e.id === epic.id ? { ...e, segments: [...e.segments, { ...segment, from, to }] } : e
    ),
  };
  const load = computeLoad(working);
  const scopes = scopesForEpicRole(working, epic.teams, segment.role);
  for (let s = from; s <= to; s++) {
    for (const scope of scopes) {
      const cell = load.map.get(loadKey(segment.role, scope, s));
      if (cell && cell.status === 'over') return true;
    }
  }
  return false;
}

export function runScheduler(
  plan: Plan,
  mode: SchedulerMode,
  opts?: { epicIds?: string[]; currentSprint?: number }
): ScenarioSnapshot {
  const cur = opts?.currentSprint ?? currentSprintIndex(plan.sprints);
  const targetIds = opts?.epicIds ? new Set(opts.epicIds) : null;

  // 1. Рабочий план: оставляем только «прошлые» сегменты; будущие — в очередь.
  const epics = plan.epics.map((e) => ({ ...e, segments: e.segments.filter((s) => s.from < cur) }));
  const pending: PendingSegment[] = [];
  for (const epic of plan.epics) {
    if (epic.enabled === false) continue;
    if (targetIds && !targetIds.has(epic.id)) {
      // не перепланируем, но сегменты сохраняем как есть
      epics.find((x) => x.id === epic.id)!.segments = epic.segments;
      continue;
    }
    for (const seg of epic.segments) if (seg.from >= cur) pending.push({ epic, segment: seg });
  }

  // 2. Приоритет эпиков — по самому раннему будущему сегменту.
  const epicPriority = new Map<string, number>();
  for (const p of pending) {
    const c = epicPriority.get(p.epic.id);
    if (c === undefined || p.segment.from < c) epicPriority.set(p.epic.id, p.segment.from);
  }
  const orderedEpicIds = [...epicPriority.keys()].sort(
    (a, b) => (epicPriority.get(a)! - epicPriority.get(b)!) || a.localeCompare(b)
  );

  // 3. По каждому эпику (в порядке приоритета) — по стадиям пайплайна.
  const working = { ...plan, epics };
  const stageIndexOf = (pipeline: Pipeline, roleId: string) => {
    const idx = pipeline.stages.findIndex((st) => st.roles.includes(roleId));
    return idx < 0 ? Number.MAX_SAFE_INTEGER : idx;
  };

  for (const epicId of orderedEpicIds) {
    const epic = plan.epics.find((e) => e.id === epicId)!;
    const pipeline = pipelineForEpic(plan, epic);
    const workingEpic = working.epics.find((e) => e.id === epicId)!;
    const segs = pending
      .filter((p) => p.epic.id === epicId)
      .map((p) => p.segment)
      .sort((a, b) => stageIndexOf(pipeline, a.role) - stageIndexOf(pipeline, b.role) || a.role.localeCompare(b.role));

    for (const segment of segs) {
      const stageIndex = pipeline.stages.findIndex((st) => st.roles.includes(segment.role));
      const stage = stageIndex >= 0 ? pipeline.stages[stageIndex] : undefined;
      // пол — финиш предыдущего этапа (ближайший непустой, по linkType этапа).
      // sequential: ждём всех ролей предыдущего этапа; earliest: достаточно одной.
      let floor = cur;
      if (stage && stageIndex > 0) {
        const prevEnds: number[] = [];
        for (let i = stageIndex - 1; i >= 0 && prevEnds.length === 0; i--) {
          for (const r of pipeline.stages[i].roles) {
            for (const s of workingEpic.segments) if (s.role === r) prevEnds.push(s.to);
          }
        }
        if (prevEnds.length) floor = Math.max(cur, stageFloor(prevEnds, stage.linkType));
      }
      // роль не должна перекрывать свой предыдущий сегмент в этом эпике
      const ownPrev = workingEpic.segments.filter((s) => s.role === segment.role).map((s) => s.to);
      if (ownPrev.length) floor = Math.max(floor, Math.max(...ownPrev) + 1);

      const duration = segment.to - segment.from;
      let from = floor;
      if (mode === 'comfortable') {
        while (from + duration < plan.sprints.length && wouldOverload(working, epic, segment, from, from + duration)) from += 1;
      }
      workingEpic.segments.push({ ...segment, from, to: from + duration });
    }
  }

  return { epics: working.epics, people: plan.people };
}
