import { describe, it, expect } from 'vitest';
import type { Plan, Epic } from '../types';
import { buildSprints, currentSprintIndex } from './calendar';
import { computeLoad } from './load';
import { defaultPipeline, pipelineForEpic, stageFloor, runScheduler, distributeEpic } from './scheduler';
import { normalizePlan } from './teams';

describe('defaultPipeline', () => {
  it('has six stages in the documented order', () => {
    const p = defaultPipeline();
    expect(p.stages.map((s) => s.id)).toEqual(['grooming', 'design', 'analytics', 'dev', 'testing', 'rollout']);
  });

  it('marks dev roles parallel and testing earliest', () => {
    const p = defaultPipeline();
    const dev = p.stages.find((s) => s.id === 'dev')!;
    const testing = p.stages.find((s) => s.id === 'testing')!;
    expect(dev.roles).toEqual(['midl', 'android', 'ios', 'web']);
    expect(testing.linkType).toBe('earliest');
    expect(p.stages.every((s) => s.id !== 'testing' || s.linkType === 'earliest')).toBe(true);
  });
});

describe('pipelineForEpic', () => {
  const plan = { settings: { pipeline: defaultPipeline() } } as Plan;
  const epic = { id: 'e1', pipelineOverride: undefined } as Epic;
  it('falls back to settings pipeline', () => {
    expect(pipelineForEpic(plan, epic).stages.length).toBe(6);
  });
  it('prefers epic override', () => {
    const over = { ...epic, pipelineOverride: { stages: [{ id: 'a', roles: ['design'], linkType: 'sequential' as const }] } };
    expect(pipelineForEpic(plan, over).stages[0].id).toBe('a');
  });
});

describe('stageFloor', () => {
  it('sequential waits for every predecessor', () => {
    expect(stageFloor([3, 5, 4], 'sequential')).toBe(5);
  });
  it('earliest starts at the first predecessor finish', () => {
    expect(stageFloor([3, 5, 4], 'earliest')).toBe(3);
  });
  it('first stage has no floor', () => {
    expect(stageFloor([], 'sequential')).toBe(-1);
  });
});

function makePlan(overrides: Partial<Plan> = {}): Plan {
  const sprints = buildSprints(80);
  const cur = 30;
  return {
    version: 1,
    sprints,
    teams: [{ id: 'team-1', name: 'К1', shortName: 'К1', sprintBase: 1, color: '#0AA2C0' }],
    roles: [
      { id: 'grooming', label: 'Груминг', color: '#CBD5E1', capacityTracked: false, shared: false },
      { id: 'design', label: 'Дизайн', color: '#00E5A0', capacityTracked: true, shared: false },
      { id: 'midl', label: 'Мидл', color: '#FF7A45', capacityTracked: true, shared: false },
      { id: 'testing', label: 'Тест', color: '#FFD23F', capacityTracked: true, shared: false },
    ],
    people: [{ id: 'p1', name: 'A', role: 'midl', allocations: [{ team: 'team-1', share: 1 }], absences: [] }],
    epics: [
      {
        id: 'e1', title: 'Фича 1', teams: ['team-1'], enabled: true, status: 'разработка',
        effectYear: null, effect2026: null, effectKind: null, needsKb: false, notes: '', links: [],
        segments: [
          { id: 's1', role: 'grooming', from: cur, to: cur + 1, label: '', color: null, flag: null },
          { id: 's2', role: 'design', from: cur + 2, to: cur + 3, label: '', color: null, flag: null },
          { id: 's3', role: 'midl', from: cur + 4, to: cur + 6, label: '', color: null, flag: null },
          { id: 's4', role: 'testing', from: cur + 7, to: cur + 8, label: '', color: null, flag: null },
        ],
      },
    ],
    scenarios: [],
    settings: { thresholds: { okPerPerson: 2, okPerPersonShared: 1 }, rolloutDeadlineOffsetFromFreeze: 0, pipeline: defaultPipeline() },
    ...overrides,
  };
}

describe('scenario compatibility', () => {
  it('normalizes a legacy scenario snapshot as an immutable base', () => {
    const plan = normalizePlan({
      ...makePlan(),
      scenarios: [{ id: 'old', name: 'Старый', snapshot: { epics: [], people: [] } }],
    });

    expect(plan.scenarios[0].baseSnapshot).toEqual({ epics: [], people: [] });
    expect(plan.scenarios[0].baseSnapshot).not.toBe(plan.scenarios[0].snapshot);
    expect(plan.scenarios[0].createdAt).toEqual(expect.any(String));
  });
});

describe('runScheduler comfortable', () => {
  it('does not move past segments', () => {
    const plan = makePlan();
    const past = { ...plan.epics[0], id: 'e2', segments: [{ id: 's0', role: 'midl', from: 10, to: 12, label: '', color: null, flag: null }] };
    const snap = runScheduler({ ...plan, epics: [...plan.epics, past] }, 'comfortable', { currentSprint: 30 });
    const e2 = snap.epics.find((e) => e.id === 'e2')!;
    expect(e2.segments[0]).toEqual({ id: 's0', role: 'midl', from: 10, to: 12, label: '', color: null, flag: null });
  });

  it('orders stages by pipeline dependency', () => {
    const plan = makePlan();
    const snap = runScheduler(plan, 'comfortable', { currentSprint: 30 });
    const e1 = snap.epics[0];
    const byRole = Object.fromEntries(e1.segments.map((s) => [s.role, s]));
    // design should start only after grooming finishes (same-sprint allowed: >=)
    expect(byRole.design.from).toBeGreaterThanOrEqual(byRole.grooming.to);
    expect(byRole.midl.from).toBeGreaterThanOrEqual(byRole.design.to);
    expect(byRole.testing.from).toBeGreaterThanOrEqual(byRole.midl.to);
  });

  it('resolves midl overload by sliding later epics forward', () => {
    const base = makePlan();
    const mk = (id: string, from: number, to: number): Epic => ({
      ...base.epics[0],
      id,
      segments: [{ id: `${id}-s`, role: 'midl', from, to, label: '', color: null, flag: null }],
    });
    const plan = { ...base, epics: [mk('e1', 30, 31), mk('e2', 30, 31), mk('e3', 30, 31)] };
    const snap = runScheduler(plan, 'comfortable', { currentSprint: 30 });
    const load = computeLoad({ ...plan, epics: snap.epics });
    const midlCells = load.rows.filter((r) => r.role.id === 'midl').flatMap((r) => r.cells);
    expect(midlCells.some((c) => c.status === 'over')).toBe(false);
    const e3 = snap.epics.find((e) => e.id === 'e3')!;
    expect(e3.segments[0].from).toBeGreaterThanOrEqual(31);
  });

  it('preserves disabled epic future segments verbatim', () => {
    const base = makePlan();
    const disabled: Epic = {
      ...base.epics[0],
      id: 'e-disabled',
      enabled: false,
      segments: [
        { id: 'sd1', role: 'grooming', from: 30, to: 32, label: '', color: null, flag: null },
        { id: 'sd2', role: 'midl', from: 35, to: 40, label: '', color: null, flag: null },
      ],
    };
    const plan = { ...base, epics: [...base.epics, disabled] };
    const snap = runScheduler(plan, 'comfortable', { currentSprint: 30 });
    const ed = snap.epics.find((e) => e.id === 'e-disabled')!;
    expect(ed.segments).toEqual([
      { id: 'sd1', role: 'grooming', from: 30, to: 32, label: '', color: null, flag: null },
      { id: 'sd2', role: 'midl', from: 35, to: 40, label: '', color: null, flag: null },
    ]);
  });

  it('never clamps from below the dependency floor (comfortable)', () => {
    const base = makePlan();
    const epic: Epic = {
      ...base.epics[0],
      id: 'e1',
      segments: [
        { id: 's1', role: 'design', from: 30, to: 35, label: '', color: null, flag: null },
        { id: 's2', role: 'midl', from: 40, to: 100, label: '', color: null, flag: null },
      ],
    };
    const plan = { ...base, epics: [epic] };
    const snap = runScheduler(plan, 'comfortable', { currentSprint: 30 });
    const midl = snap.epics[0].segments.find((s) => s.role === 'midl')!;
    expect(midl.from).toBeGreaterThanOrEqual(35);
  });
});

describe('distributeEpic', () => {
  it('fits inside the window when there is room', () => {
    const plan = makePlan();
    const epic = plan.epics[0];
    const from = 30;
    const to = 50;
    const durations: Record<string, number> = {
      grooming: 2, design: 2, analytics: 2, midl: 3, android: 3, ios: 3, web: 3, testing: 2, rollout: 1,
    };
    const res = distributeEpic(plan, epic, from, to, durations);
    expect(res.fits).toBe(true);
    expect(res.segments.length).toBe(9);
    for (const s of res.segments) {
      expect(s.from).toBeGreaterThanOrEqual(from);
      expect(s.to).toBeLessThanOrEqual(to);
    }
  });

  it('returns fits:false when a stage would exceed `to`', () => {
    const plan = makePlan();
    const epic = plan.epics[0];
    const durations: Record<string, number> = {
      grooming: 2, design: 2, analytics: 2, midl: 2, android: 2, ios: 2, web: 2, testing: 2, rollout: 1,
    };
    const res = distributeEpic(plan, epic, 30, 33, durations);
    expect(res.fits).toBe(false);
  });
});

describe('runScheduler emergency', () => {
  it('allows overload but never shortens duration', () => {
    const plan = makePlan();
    const src = plan.epics[0].segments.find((s) => s.role === 'midl')!;
    const snap = runScheduler(plan, 'emergency', { currentSprint: 30 });
    const midl = snap.epics[0].segments.find((s) => s.role === 'midl')!;
    // длительность (to - from) не сжимается: исходные 2 спринта (36 - 34) сохранены
    expect(midl.to - midl.from).toBe(src.to - src.from);
  });

  it('never clamps from below the dependency floor', () => {
    const base = makePlan();
    const epic: Epic = {
      ...base.epics[0],
      id: 'e1',
      segments: [
        { id: 's1', role: 'design', from: 30, to: 35, label: '', color: null, flag: null },
        { id: 's2', role: 'midl', from: 40, to: 100, label: '', color: null, flag: null },
      ],
    };
    const plan = { ...base, epics: [epic] };
    const snap = runScheduler(plan, 'emergency', { currentSprint: 30 });
    const midl = snap.epics[0].segments.find((s) => s.role === 'midl')!;
    // floor = design.to = 35; клэмп по горизонту не должен опускать from ниже floor
    expect(midl.from).toBeGreaterThanOrEqual(35);
  });
});
