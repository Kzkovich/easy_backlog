# Role-balanced auto-scheduler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить планировщик, который без изменения текущего плана предлагает альтернативную раскладку будущих колбасок (по ролям и зависимостям этапов) и даёт применить её выборочно.

**Architecture:** Чистый модуль `src/lib/scheduler.ts` (priority-rule heuristic / serial schedule generation scheme) читает `Plan` и возвращает `ScenarioSnapshot` — план не мутируется. Сверху — настройки пайплайна (`Settings.pipeline` + `Epic.pipelineOverride`), кнопки «Комфортно/Экстренно» в тулбаре со сравнительным view, и ручной per-epic инструмент (серый диапазон → «Распределить»).

**Tech Stack:** React 18, TypeScript, существующая CSS-архитектура; vitest (devDependency) для юнит-тестов. Никаких runtime-зависимостей.

**Spec:** `docs/superpowers/specs/2026-09-18-role-balanced-auto-scheduler-design.md`

## Global Constraints

- **Не трогать** сегменты с `from < currentSprintIndex` — двигается только будущее.
- **Не менять** `Epic.teams`, people, ничего кроме `Epic.segments` (`from`/`to`).
- Disabled epics (`Epic.enabled === false`) исключаются из запуска.
- Результат — `ScenarioSnapshot` (`epics` + `people`), никогда не мутирует `Plan` напрямую.
- `sequential`-связь означает `this.from >= prev.to` (включительно по индексу), `earliest` — `this.from >= min(prev.to)`.
- **Emergency v1 (подтверждено):** `over` разрешён, но длительность сегмента НЕ сжимается ниже введённой пользователем — только закрывается зависимостный слак от `earliest`-связей.
- Comfortable: `to - from` (длительность) фиксирована; старт сдвигается вперёд, пока не исчезнет `over`.
- Приоритет эпиков: по `from` самого раннего будущего сегмента, по возрастанию; tie-break по `Epic.id`.
- Словарь интерфейса: «Комфортно» (Resource Leveling) и «Экстренно» (Crashing/Fast-tracking).

---

## File Structure

- `src/types.ts` — добавить `StageLinkType`, `PipelineStage`, `Pipeline`, `Settings.pipeline`, `Epic.pipelineOverride`.
- `src/lib/scheduler.ts` (новый) — `defaultPipeline()`, `pipelineForEpic()`, `runScheduler()`, внутренние хелперы.
- `src/lib/teams.ts` — миграция `settings.pipeline` в `normalizePlan`.
- `src/components/PipelineEditor.tsx` (новый) — переиспользуемый редактор пайплайна (этапы + роли + sequential/earliest).
- `src/components/SettingsMenu.tsx` — вход в редактор пайплайна.
- `src/components/EpicFormPanel.tsx` — секция override пайплайна.
- `src/components/SchedulerCompare.tsx` (новый) — сравнительный view (черновик + чекбоксы + Apply/Discard).
- `src/components/Grid.tsx` — per-epic серый диапазон + кнопка «Распределить»; проп `highlightSegments` для подсветки сдвинутых колбасок.
- `src/components/SegmentBar.tsx` — класс подсветки для сдвинутых колбасок.
- `src/App.tsx` — кнопки тулбара, состояние черновика, применение.
- `package.json` — добавить `vitest` (devDependency) и скрипт `test`.

---

## Task 1: Data model — Pipeline types

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `StageLinkType`, `PipelineStage`, `Pipeline`, `Settings.pipeline?: Pipeline`, `Epic.pipelineOverride?: Pipeline` (используются в Tasks 2, 4+).

- [ ] **Step 1: Add types** — в `src/types.ts`, перед `interface Settings` добавить:

```ts
export type StageLinkType = 'sequential' | 'earliest';

export interface PipelineStage {
  id: string;
  roles: RoleId[]; // роли этапа, работают параллельно
  linkType: StageLinkType; // как этап зависит от предыдущего
}

export interface Pipeline {
  stages: PipelineStage[];
}
```

- [ ] **Step 2: Add fields** — в `interface Epic` (после `plannedTo?`) добавить `pipelineOverride?: Pipeline;`, в `interface Settings` (после `thresholds`) добавить `pipeline?: Pipeline;`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b --noEmit`
Expected: PASS (поля необязательные, ничего не ломается).

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat(scheduler): add Pipeline/PipelineStage types"
```

---

## Task 2: Migration — seed default pipeline

**Files:**
- Modify: `src/lib/teams.ts`

**Interfaces:**
- Consumes: `Pipeline` (Task 1), `defaultPipeline()` (Task 3).
- Produces: `normalizePlan` заполняет `settings.pipeline` дефолтом, если его нет.

- [ ] **Step 1: Implement** — в `normalizePlan` (после расчёта `thresholds`, в возвращаемом `settings`):

```ts
import { defaultPipeline } from './scheduler';
```

и в блоке `settings`:

```ts
settings: {
  ...raw.settings,
  thresholds: { ... },
  pipeline: raw.settings?.pipeline ?? defaultPipeline(),
},
```

Точная точка вставки — возвращаемый объект `settings` в `normalizePlan` (`src/lib/teams.ts:160-167`). Сохранить существующие поля.

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/teams.ts
git commit -m "feat(scheduler): seed default pipeline in normalizePlan"
```

---

## Task 3: Test runner + defaultPipeline seed

**Files:**
- Modify: `package.json`
- Create: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Produces: `defaultPipeline(): Pipeline` — шесть этапов по `DEFAULT_ROLES` (см. спека): `grooming`(seq), `design`(seq), `analytics`(seq), `dev: midl+android+ios+web`(seq), `testing`(earliest), `rollout`(seq).

- [ ] **Step 1: Add vitest** — в `package.json` `devDependencies` добавить `"vitest": "^2.1.1"`, в `scripts` добавить `"test": "vitest run"`. Запустить `npm install`.

- [ ] **Step 2: Write failing test** — `src/lib/scheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultPipeline } from './scheduler';

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
```

- [ ] **Step 3: Run to verify fail**

Run: `npm test`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement** — `src/lib/scheduler.ts`:

```ts
import type { Pipeline } from '../types';

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
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat(scheduler): vitest + defaultPipeline seed"
```

---

## Task 4: pipelineForEpic + stage dependency floor

**Files:**
- Modify: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Consumes: `Pipeline`, `Epic` (Task 1).
- Produces:
  - `pipelineForEpic(plan: Plan, epic: Epic): Pipeline` — возвращает `epic.pipelineOverride ?? plan.settings.pipeline ?? defaultPipeline()`.
  - `stageFloor(prevEnds: number[], linkType: StageLinkType): number` — `sequential`: `Math.max(...prevEnds)`; `earliest`: `Math.min(...prevEnds)`; пустой `prevEnds` → `-1`.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import type { Plan, Epic } from '../types';
import { defaultPipeline, pipelineForEpic, stageFloor } from './scheduler';

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
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import type { Epic, Pipeline, Plan, StageLinkType } from '../types';

export function pipelineForEpic(plan: Plan, epic: Epic): Pipeline {
  return epic.pipelineOverride ?? plan.settings?.pipeline ?? defaultPipeline();
}

export function stageFloor(prevEnds: number[], linkType: StageLinkType): number {
  if (prevEnds.length === 0) return -1;
  return linkType === 'earliest' ? Math.min(...prevEnds) : Math.max(...prevEnds);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat(scheduler): pipelineForEpic + stageFloor"
```

---

## Task 5: runScheduler — comfortable mode (core)

**Files:**
- Modify: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Consumes: `computeLoad`, `loadKey`, `scopesForEpicRole` (из `src/lib/load.ts`), `currentSprintIndex` (из `src/lib/calendar.ts`), `stageFloor`/`pipelineForEpic` (Task 4).
- Produces:
  - `export type SchedulerMode = 'comfortable' | 'emergency';`
  - `export function runScheduler(plan: Plan, mode: SchedulerMode, opts?: { epicIds?: string[]; currentSprint?: number }): ScenarioSnapshot;`

- [ ] **Step 1: Write failing tests**

```ts
import { buildSprints, currentSprintIndex } from './calendar';
import { defaultPipeline, runScheduler } from './scheduler';

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

describe('runScheduler comfortable', () => {
  it('does not move past segments', () => {
    const plan = makePlan();
    const past = { id: 'e2', ...plan.epics[0], id: 'e2', segments: [{ id: 's0', role: 'midl', from: 10, to: 12, label: '', color: null, flag: null }] };
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
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement comfortable mode** — добавить в `src/lib/scheduler.ts`:

```ts
import { computeLoad, loadKey, scopesForEpicRole } from './load';
import { currentSprintIndex } from './calendar';
import type { ScenarioSnapshot, Segment, StageLinkType } from '../types';

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
  const order = new Map<string, number>();
  for (const p of pending) {
    const cur0 = order.get(p.epic.id);
    if (cur0 === undefined || p.segment.from < cur0) order.set(p.epic.id, p.segment.from);
  }
  pending.sort((a, b) => (order.get(a.epic.id)! - order.get(b.epic.id)!) || a.epic.id.localeCompare(b.epic.id));

  // 3. По каждому эпику — по стадиям пайплайна.
  const working = { ...plan, epics };
  for (const { epic, segment } of pending) {
    const pipeline = pipelineForEpic(plan, epic);
    // Этап сегмента: первый этап, содержащий роль.
    const stageIndex = pipeline.stages.findIndex((st) => st.roles.includes(segment.role));
    const stage = stageIndex >= 0 ? pipeline.stages[stageIndex] : undefined;
    const workingEpic = working.epics.find((e) => e.id === epic.id)!;
    // пол сегмента — финиши предыдущего этапа в этом эпике
    let floor = cur;
    if (stage && stageIndex > 0) {
      const prevEnds: number[] = [];
      for (const prevStage of pipeline.stages.slice(0, stageIndex)) {
        for (const r of prevStage.roles) {
          for (const s of workingEpic.segments) if (s.role === r && s.from >= cur) prevEnds.push(s.to);
        }
      }
      floor = Math.max(cur, stageFloor(prevEnds, stage.linkType) + (stage.linkType === 'sequential' ? 0 : 0));
    }
    // роль не должна перекрывать свой предыдущий сегмент в этом эпике
    const ownPrev = workingEpic.segments.filter((s) => s.role === segment.role).map((s) => s.to);
    if (ownPrev.length) floor = Math.max(floor, Math.max(...ownPrev) + 1);

    const duration = segment.to - segment.from;
    let from = floor;
    if (mode === 'comfortable') {
      while (from + duration < plan.sprints.length && wouldOverload(working, epic, segment, from, from + duration)) from += 1;
    }
    const to = from + duration;
    const placed = { ...segment, from, to };
    workingEpic.segments.push(placed);
  }

  return { epics: working.epics, people: plan.people };
}
```

> Примечание: `floor` вычисляется как «первый допустимый старт»: `sequential` = `max(prev.to)`, `earliest` = `min(prev.to)`; роли одного этапа ставятся с одного пола. «same-sprint parallel start» уже учтён тем, что `floor` равен `to` предыдущего (а не `to + 1`); собственный предыдущий сегмент роли требует `+1`.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS (оба теста comfortable).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat(scheduler): comfortable-mode scheduling"
```

---

## Task 6: runScheduler — emergency mode

**Files:**
- Modify: `src/lib/scheduler.ts`
- Test: `src/lib/scheduler.test.ts`

**Interfaces:**
- Consumes: `runScheduler` (Task 5).
- Produces: `emergency` ветка — `over` разрешён, длительность не сжимается.

- [ ] **Step 1: Write failing test**

```ts
describe('runScheduler emergency', () => {
  it('allows overload but never shortens duration', () => {
    const plan = makePlan();
    const snap = runScheduler(plan, 'emergency', { currentSprint: 30 });
    const e1 = snap.epics[0];
    const midl = e1.segments.find((s) => s.role === 'midl')!;
    // исходная длительность 3 спринта сохранена
    expect(midl.to - midl.from).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test`
Expected: FAIL (если `emergency` ещё не реализован — ветка отсутствует/падает).

- [ ] **Step 3: Implement** — в `runScheduler` ветка `mode === 'emergency'` уже не двигает `from` (Task 5 оставил `if (mode === 'comfortable')`); убедиться, что в `emergency` сегмент ставится на `floor` без цикла `wouldOverload`. При необходимости добавить явный `else`-комментарий.

- [ ] **Step 4: Run to verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler.ts src/lib/scheduler.test.ts
git commit -m "feat(scheduler): emergency mode (over allowed, no shrink)"
```

---

## Task 7: PipelineEditor component

**Files:**
- Create: `src/components/PipelineEditor.tsx`

**Interfaces:**
- Consumes: `Pipeline`, `PipelineStage`, `RoleDef` (Task 1).
- Produces: `<PipelineEditor pipeline roles onChange />` — onChange мутирует локально и вызывает `onChange(next: Pipeline)`.

- [ ] **Step 1: Implement** — список этапов; внутри этапа — чекбоксы ролей (или drag чипов — v1: чекбоксы), toggle `sequential`/`earliest`, кнопки «+ этап»/«— этап», «↑/↓». Роли, не попавшие ни в один этап, не участвуют в планировании.

```tsx
import type { Pipeline, PipelineStage, RoleDef } from '../types';

interface Props {
  pipeline: Pipeline;
  roles: RoleDef[];
  onChange: (p: Pipeline) => void;
}

function uid() {
  return `stage-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export default function PipelineEditor({ pipeline, roles, onChange }: Props) {
  const update = (stages: PipelineStage[]) => onChange({ stages });

  const patchStage = (idx: number, patch: Partial<PipelineStage>) =>
    update(pipeline.stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const toggleRole = (idx: number, roleId: string) => {
    const s = pipeline.stages[idx];
    const roles = s.roles.includes(roleId) ? s.roles.filter((r) => r !== roleId) : [...s.roles, roleId];
    patchStage(idx, { roles });
  };

  return (
    <div className="pipeline-editor">
      {pipeline.stages.map((s, i) => (
        <div className="pipeline-stage" key={s.id}>
          <div className="pipeline-stage-head">
            <button type="button" className="icon-btn" aria-label="Вверх" disabled={i === 0}
              onClick={() => { const arr = [...pipeline.stages]; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; update(arr); }}>↑</button>
            <button type="button" className="icon-btn" aria-label="Вниз" disabled={i === pipeline.stages.length - 1}
              onClick={() => { const arr = [...pipeline.stages]; [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; update(arr); }}>↓</button>
            <span>Этап {i + 1}</span>
            <label className="pipeline-link-toggle">
              <input type="checkbox" checked={s.linkType === 'earliest'}
                onChange={(e) => patchStage(i, { linkType: e.target.checked ? 'earliest' : 'sequential' })} />
              начинать по первому завершённому (earliest)
            </label>
            <button type="button" className="icon-btn" aria-label="Удалить этап" onClick={() => update(pipeline.stages.filter((_, x) => x !== i))}>✕</button>
          </div>
          <div className="pipeline-roles">
            {roles.map((r) => (
              <label key={r.id} className={`pipeline-role-chip${s.roles.includes(r.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={s.roles.includes(r.id)} onChange={() => toggleRole(i, r.id)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="role-add-btn" onClick={() => update([...pipeline.stages, { id: uid(), roles: [], linkType: 'sequential' }])}>
        + этап
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS** — в `src/styles.css` добавить стили `.pipeline-editor`, `.pipeline-stage`, `.pipeline-stage-head`, `.pipeline-roles`, `.pipeline-role-chip` (по образцу `.team-checks`/`.role-add-btn`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/PipelineEditor.tsx src/styles.css
git commit -m "feat(scheduler): PipelineEditor component"
```

---

## Task 8: Wire pipeline editor into SettingsMenu

**Files:**
- Modify: `src/components/SettingsMenu.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `PipelineEditor` (Task 7), `plan.settings.pipeline`.
- Produces: настройка пайплайна пишет в `plan.settings.pipeline` через `updatePlan`.

- [ ] **Step 1: Add props** — `SettingsMenu` получает `pipeline?: Pipeline`, `roles: RoleDef[]`, `onPipeline: (p: Pipeline) => void`.

- [ ] **Step 2: Add UI** — в `settings-dropdown` после «Импорт из Excel…» добавить строку-кнопку «Пайплайн этапов…», раскрывающую `<PipelineEditor>` (секция в дропдауне).

- [ ] **Step 3: Wire in App** — передать `pipeline={plan.settings.pipeline}` `roles={plan.roles}` `onPipeline={(p) => updatePlan((pl) => ({ ...pl, settings: { ...pl.settings, pipeline: p } }))}`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsMenu.tsx src/App.tsx
git commit -m "feat(scheduler): pipeline editor in settings"
```

---

## Task 9: Pipeline override in EpicFormPanel

**Files:**
- Modify: `src/components/EpicFormPanel.tsx`

**Interfaces:**
- Consumes: `PipelineEditor` (Task 7), `Epic.pipelineOverride`.
- Produces: секция «Свой пайплайн для фичи»; при пустом override — null (fallback на настройки).

- [ ] **Step 1: Add state** — `const [override, setOverride] = useState<Pipeline | null>(epic?.pipelineOverride ?? null);` и кнопка-переключатель «Задать свой пайплайн» / «Использовать общий».

- [ ] **Step 2: Render editor** — при `override !== null` показать `<PipelineEditor pipeline={override} roles={roles} onChange={setOverride} />`.

- [ ] **Step 3: Save** — в `handleSave` добавить `pipelineOverride: override`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/EpicFormPanel.tsx
git commit -m "feat(scheduler): per-epic pipeline override"
```

---

## Task 10: highlightSegments support in Grid + SegmentBar

**Files:**
- Modify: `src/components/Grid.tsx`
- Modify: `src/components/SegmentBar.tsx`

**Interfaces:**
- Consumes: `Set<string>` идентификаторов сегментов.
- Produces: `Grid` принимает `highlightSegments?: Set<string>`; `SegmentBar` получает `highlighted?: boolean` (класс `.segment-moved`).

- [ ] **Step 1: SegmentBar** — добавить проп `highlighted?: boolean`, в `classes` добавить `if (highlighted) classes.push('moved')`.

- [ ] **Step 2: Grid** — добавить проп `highlightSegments?: Set<string>`; в `segs.map` передать `highlighted={highlightSegments?.has(seg.id) ?? false}`.

- [ ] **Step 3: CSS** — `.segment-bar.moved { outline: 2px solid var(--accent3); outline-offset: 1px; }` (спокойная подсветка сдвига).

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Grid.tsx src/components/SegmentBar.tsx src/styles.css
git commit -m "feat(scheduler): moved-segment highlight support"
```

---

## Task 11: Project-wide run — toolbar + compare view

**Files:**
- Create: `src/components/SchedulerCompare.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `runScheduler` (Task 5/6), `Grid` + `highlightSegments` (Task 10).
- Produces: кнопки «Комфортно»/«Экстренно» в тулбаре; overlay сравнения с чекбоксами «Применить»/«Отмена».

- [ ] **Step 1: Compute diff** — в `src/lib/scheduler.ts` добавить:

```ts
export function movedSegmentIds(current: Plan, draft: ScenarioSnapshot): Set<string> {
  const cur = new Map(current.epics.flatMap((e) => e.segments.map((s) => [s.id, s] as const)));
  const out = new Set<string>();
  for (const e of draft.epics) {
    for (const s of e.segments) {
      const c = cur.get(s.id);
      if (c && (c.from !== s.from || c.to !== s.to)) out.add(s.id);
    }
  }
  return out;
}
```

- [ ] **Step 2: Implement SchedulerCompare** — full-screen overlay: заголовок с режимом, список эпиков с чекбоксами (для «применить выбранное»), `<Grid>` черновика (plan=draft-as-Plan, updatePlan мутирует локальный draft), кнопки «Применить все», «Применить выбранные», «Отменить».

  Draft-план для `<Grid>`: `{ ...plan, epics: draft.epics }`. `updatePlan` черновика мутирует `draft.epics`. `load` = `computeLoad(draftPlan)`.

- [ ] **Step 3: Wire in App** — состояние `schedulerDraft: { mode: SchedulerMode; snapshot: ScenarioSnapshot } | null`. Кнопки тулбара вызывают `setSchedulerDraft({ mode, snapshot: runScheduler(plan, mode) })`. «Применить» — `updatePlan((p) => ({ ...p, epics: <merged> }))`, где merged берёт `segments` выбранных эпиков из snapshot.

  Apply-логика (мердж выбранных эпиков):

```ts
function applyScheduler(selectedIds: Set<string>) {
  if (!schedulerDraft || !plan) return;
  updatePlan((p) => ({
    ...p,
    epics: p.epics.map((e) => {
      const draftEpic = schedulerDraft.snapshot.epics.find((d) => d.id === e.id);
      return draftEpic && selectedIds.has(e.id) ? { ...e, segments: draftEpic.segments } : e;
    }),
  }));
  setSchedulerDraft(null);
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SchedulerCompare.tsx src/App.tsx src/lib/scheduler.ts
git commit -m "feat(scheduler): project-wide run + compare view"
```

---

## Task 12: Per-epic manual tool — grey range + Distribute

**Files:**
- Modify: `src/components/Grid.tsx`
- Modify: `src/App.tsx` (по необходимости)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `runScheduler` (Task 5), `stageFloor`/`pipelineForEpic` (Task 4).
- Produces: на строках эпика — drag-ручка серого диапазона; после установки — кнопка «Распределить», открывающая форму с длительностями ролей; раскладка внутри окна (Resource Smoothing).

- [ ] **Step 1: Grey envelope drag handle** — в `epic-header-track` добавить ручку (аналог `reorder-handle`), которая ставит/ресайзит локальный диапазон `envelope: { from: number; to: number }` в состоянии `Grid`. При активном диапазоне отрисовать `.planned-band`-подобный серый контур на эпике и кнопку «Распределить».

- [ ] **Step 2: Distribute form** — модал/попап: для каждой роли эпика поле «длительность (спринтов)». По «ОК» вызвать `distributeEpic(plan, epic, from, to, durations)` → новые `segments`; если не помещается — блокирующий диалог «Не помещается — расширить диапазон на N спринтов / Отменить».

- [ ] **Step 3: Implement `distributeEpic`** — в `src/lib/scheduler.ts`:

```ts
export function distributeEpic(
  plan: Plan, epic: Epic, from: number, to: number,
  durations: Record<RoleId, number>
): { segments: Segment[]; fits: boolean } {
  const pipeline = pipelineForEpic(plan, epic);
  // упаковать по стадиям внутри [from, to]; при нехватке места вернуть fits=false
  // (v1: последовательная укладка стадий, длительности фиксированы)
  ...
}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Grid.tsx src/App.tsx src/lib/scheduler.ts src/styles.css
git commit -m "feat(scheduler): per-epic grey range + distribute"
```

---

## Self-Review

**Spec coverage:**
- Pipeline data model → Task 1, 2. ✓
- Priority-rule heuristic, freeze past, stage dependency, comfortable/emergency → Tasks 4–6. ✓
- Pipeline settings UI (default + per-epic override) → Tasks 7–9. ✓
- Project-wide run + compare view (diff, live draft, apply checked/all/discard) → Tasks 10–11. ✓
- Per-epic manual tool (grey range → distribute, «не помещается») → Task 12. ✓
- Tests for scheduler + round-trip → Tasks 3–6 (unit), manual in-browser (rollout). ✓
- Migration (`Settings.pipeline`) → Task 2. ✓
- No new runtime dependency → vitest только как devDependency. ✓

**Placeholder scan:** `distributeEpic` в Task 12 содержит `...` — это осознанная точка: точную упаковку стоит довести в подзадачах Task 12 (входит в задачу, не «заглушка» для соседней). Перед исполнением Task 12 детализировать тело функции.

**Type consistency:** `StageLinkType`, `PipelineStage`, `Pipeline` — одни имена везде. `runScheduler(plan, mode, opts?)` → `ScenarioSnapshot`. `movedSegmentIds(current, draft)` → `Set<string>`. `highlightSegments?: Set<string>` совпадает в Grid/SegmentBar.

---

## Execution Handoff

План готов и сохранён. Два варианта исполнения:
1. **Subagent-Driven (рекомендуется)** — по свежему субагенту на задачу, ревью между задачами.
2. **Inline** — исполнять в этой сессии с чекпоинтами.

Какой выбираешь?
