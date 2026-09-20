# Scenario Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner save named planning variants, compare each with its immutable source plan and safely apply selected feature changes.

**Architecture:** Extend `Scenario` with snapshots and timestamps, normalize old plans in `teams.ts`, then calculate display-ready feature/segment changes in a pure module. `SchedulerCompare` becomes a persistent scenario workspace while retaining the existing scheduler draft and per-team filter.

**Tech Stack:** React 18, TypeScript, Vitest, existing Node JSON plan API, CSS.

**Spec:** `docs/superpowers/specs/2026-09-20-scenarios-sharing-management-design.md`

## Global Constraints

- Preserve feature → role → sprint editing and the current `Plan` API.
- A scenario never mutates the current plan until the owner explicitly applies selected feature changes.
- The existing team filter affects timeline, diff list and aggregates without discarding off-filter scenario data.
- Differences must not rely solely on colour or motion; respect `prefers-reduced-motion`.
- Run `npm test`, `npx tsc -b --force`, `npm run build`, and `git diff --check` before merging.

## Review Focus

- A scenario created before the schema change still opens without losing its proposal.
- A later edit to the current plan cannot silently rewrite a scenario's comparison base.
- A multi-team feature appears in each selected team, not only its first team.
- Applying a selection leaves unselected current-plan features untouched.
- A removed source segment is described as removal rather than crashing the overlay.

---

### Task 1: Persisted scenario model and compatibility

**Files:**
- Modify: `src/types.ts`, `src/lib/teams.ts`
- Create: `src/lib/scenarios.ts`
- Modify: `src/lib/scheduler.test.ts`

**Interfaces:**
- Produces `Scenario.baseSnapshot`, `createdAt`, `updatedAt` and `createScenario(plan, name)`.
- `normalizePlan(raw)` always returns scenarios with both snapshots.

- [ ] **Step 1: Write the failing compatibility test**

```ts
it('normalizes legacy scenario snapshot as an immutable base', () => {
  const plan = normalizePlan({ ...makePlan(), scenarios: [{ id: 'old', name: 'Старый', snapshot: { epics: [], people: [] } }] });
  expect(plan.scenarios[0].baseSnapshot).toEqual(plan.scenarios[0].snapshot);
  expect(plan.scenarios[0].createdAt).toEqual(expect.any(String));
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- src/lib/scheduler.test.ts`

Expected: FAIL because the normalized scenario has no `baseSnapshot`.

- [ ] **Step 3: Add the model and normalization**

```ts
export interface Scenario {
  id: string; name: string; createdAt: string; updatedAt: string;
  baseSnapshot: ScenarioSnapshot; snapshot: ScenarioSnapshot;
}
const snapshot = rawScenario.snapshot ?? { epics: [], people: [] };
return { ...rawScenario, snapshot, baseSnapshot: rawScenario.baseSnapshot ?? structuredClone(snapshot),
  createdAt: rawScenario.createdAt ?? new Date(0).toISOString(),
  updatedAt: rawScenario.updatedAt ?? new Date(0).toISOString() };
```

Keep `createScenario` in `src/lib/scenarios.ts`; it clones `plan.epics` and `plan.people` into both snapshots and creates an id with `crypto.randomUUID()`.

- [ ] **Step 4: Run focused verification**

Run: `npm test -- src/lib/scheduler.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/teams.ts src/lib/scenarios.ts src/lib/scheduler.test.ts
git commit -m "feat: persist immutable scenario bases"
```

### Task 2: Pure comparison engine

**Files:**
- Create: `src/lib/scenarioDiff.ts`, `src/lib/scenarioDiff.test.ts`

**Interfaces:**
- Produces `diffScenario(base, proposal): ScenarioDiff` and `filterDiffByTeam(diff, teamId)`.
- `SegmentChange.kind` is `added | removed | moved | resized | unchanged`; `FeatureChange` groups segment changes by epic.

- [ ] **Step 1: Write failing diff tests**

```ts
it('reports a right shift and its sprint delta', () => {
  const diff = diffScenario({ epics: [epicWith('s1', 2, 3)], people: [] }, { epics: [epicWith('s1', 4, 5)], people: [] });
  expect(diff.features[0].segments[0]).toMatchObject({ kind: 'moved', deltaFrom: 2, deltaTo: 2 });
});
it('keeps a two-team feature in either team filter', () => {
  const diff = diffScenario({ epics: [multiTeamEpic], people: [] }, { epics: [multiTeamEpic], people: [] });
  expect(filterDiffByTeam(diff, 'team-b').features).toHaveLength(1);
});
```

- [ ] **Step 2: Run them to verify failure**

Run: `npm test -- src/lib/scenarioDiff.test.ts`

Expected: FAIL because `scenarioDiff.ts` does not exist.

- [ ] **Step 3: Implement deterministic diffing**

Index epics and segments by id. Compare `from`/ `to` and team membership; create a feature change whenever a segment or membership differs. Return aggregate counts for moved left/right, added, removed and changed features. Do not compare object identity.

- [ ] **Step 4: Run the diff suite**

Run: `npm test -- src/lib/scenarioDiff.test.ts`

Expected: PASS for added, removed, resized, unchanged and multi-team cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scenarioDiff.ts src/lib/scenarioDiff.test.ts
git commit -m "feat: add scenario diff engine"
```

### Task 3: Scenario workspace and safe application

**Files:**
- Modify: `src/App.tsx`, `src/components/SchedulerCompare.tsx`
- Create: `src/components/ScenarioChangesList.tsx`, `src/lib/scenarios.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes `Scenario`, `diffScenario`, `teamFilter` and `onSavePlan`.
- Produces `applyScenarioEpics(current, proposed, epicIds)` which replaces only matching ids and preserves unselected epics.

- [ ] **Step 1: Write the selection test**

```ts
it('applies only checked feature proposals', () => {
  const actual = applyScenarioEpics([epic('a', 1), epic('b', 1)], [epic('a', 4), epic('b', 6)], new Set(['a']));
  expect(actual.map((e) => [e.id, e.segments[0].from])).toEqual([['a', 4], ['b', 1]]);
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- src/lib/scenarios.test.ts`

Expected: FAIL because `applyScenarioEpics` is not exported.

- [ ] **Step 3: Implement the workspace**

Add scenario create/open/save/duplicate/delete controls. Pass the selected team to `filterDiffByTeam`; render a labelled change list and summary. Render source bars with `scenario-base-bar`, proposed bars with `scenario-proposal-bar`, and an `aria-label` that states the delta. Apply through the tested helper, set `dirty`, and retain the saved scenario.

- [ ] **Step 4: Verify integration**

Run: `npm test && npx tsc -b --force && npm run build`

Expected: all commands exit 0. Browser smoke: create a scenario, filter a team, move one segment, verify its delta, apply only its feature, close and reopen the scenario.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/SchedulerCompare.tsx src/components/ScenarioChangesList.tsx src/lib/scenarios.ts src/lib/scenarios.test.ts src/styles.css
git commit -m "feat: compare and apply saved planning scenarios"
```

