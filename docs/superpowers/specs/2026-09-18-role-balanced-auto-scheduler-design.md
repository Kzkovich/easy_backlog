# Role-balanced auto-scheduler — design

## Problem

The plan is built manually: a PM drags segments ("колбаски") for each role
across sprint columns. Nothing enforces that a role isn't overbooked, or
that dependent stages (design → analytics → dev → test → rollout) stay in a
sane order. When a role is overloaded, the PM currently has to notice it in
`LoadPanel` and manually push every affected segment by hand, epic by epic.

Goal: add a scheduler that, without touching the current plan until the user
explicitly applies it, proposes an alternative arrangement of future
segments that respects role capacity and stage dependencies, lets the user
compare it against the current plan, and apply it selectively.

## Non-goals

- Does not touch segments that start before the current sprint
  (`currentSprintIndex` from `src/lib/calendar.ts`) — only future work moves.
- Does not change `Epic.teams`, people assignments, or anything outside
  `Epic.segments` (`from`/`to`/duration).
- Not a general constraint solver — see "Algorithm approach" for why a
  greedy priority-rule heuristic was chosen over an exact solver.
- Disabled epics (`Epic.enabled === false`) are excluded from a run.

## Vocabulary borrowed from project scheduling

The two run modes map directly onto established PM techniques, which is
useful for explaining scheduler output to users and for naming things in
code and UI:

- **Comfortable = Resource Leveling.** Segment durations are fixed; only
  start sprints move. A role is never left in `over` status
  (`src/lib/load.ts:20`). The project may finish later than today's plan.
- **Emergency ("Экстренно") = Crashing + Fast-tracking.** Overload
  (`over` status) is tolerated to keep dates earlier; segment durations may
  be compressed; `earliest`-type stage links (see below) are used
  aggressively instead of waiting for every predecessor role to finish.
- **Manual per-epic tool = Resource Smoothing.** The user fixes the overall
  window (deadline) for one epic up front; the tool only rearranges work
  inside that fixed window, and refuses to silently overflow it.

Both automatic modes use a **priority-rule scheduling heuristic** (serial
schedule generation scheme), the standard practical approach for
resource-constrained project scheduling (RCPSP) when an explainable,
fast, re-runnable schedule matters more than a globally optimal one. An
exact/ILP solver was considered and rejected: it would produce plans that
are hard to explain ("why did epic X move by exactly 3 sprints and not 2?"),
and this product's whole value is a legible, directly-manipulable Gantt
view — an opaque optimizer output would fight that.

## Data model changes

### Pipeline (stage graph)

```ts
export type StageLinkType = 'sequential' | 'earliest';
// sequential: this stage starts only after EVERY role in the previous
//             stage has finished its segment.
// earliest:   this stage starts as soon as ANY role in the previous
//             stage has finished its segment (e.g. testing can start on
//             the backend track before the frontend track is done).

export interface PipelineStage {
  id: string;
  roles: RoleId[];       // roles active in this stage, run in parallel
  linkType: StageLinkType; // how this stage depends on the previous one
}

export interface Pipeline {
  stages: PipelineStage[];
}
```

- `Settings.pipeline: Pipeline` — project-wide default. Suggested seed,
  mapped from the current `DEFAULT_ROLES` (`src/lib/roles.ts:6-19`):
  1. `grooming` (`sequential` from nothing — first stage)
  2. `design` (`sequential`)
  3. `analytics` (`sequential`)
  4. `midl`, `android`, `ios`, `web` (`sequential` — dev doesn't start until
     analytics is fully done; the four dev roles run in parallel with each
     other)
  5. `testing` (`earliest` — starts once any one dev role finishes)
  6. `rollout` (`sequential`, but see "same-sprint parallel start" below)

  This is only a seed; the whole pipeline is user-editable (new settings
  panel, see UI section).

- `Epic.pipelineOverride?: Pipeline` — optional per-epic replacement for
  cases where an epic doesn't follow the project default (e.g. no design
  work, or a different role set than `visibleRoles` implies). When absent,
  the epic uses `Settings.pipeline`.

**Same-sprint parallel start.** "Release cannot start before testing
finishes, but they may share a sprint when testing ends and rollout begins"
means the dependency check is `rollout.from >= testing.to` (inclusive of
the same sprint index), not `rollout.from > testing.to`. This applies to
every `sequential` link, not just rollout — it already matches how
`Segment.from`/`to` are inclusive sprint indices (`src/types.ts:69-70`).

### Reused, not new

- Role overload detection reuses `computeLoad` / `statusFor` from
  `src/lib/load.ts` as-is, including the shared-role (0.5 + 0.5 across two
  teams) handling in `isSharedRole` / `personShareIn`. No new per-role
  capacity field is introduced — the user confirmed capacity should follow
  real people (`src/lib/load.ts:70-96`), and today's global
  `okPerPerson`/`okPerPersonShared` thresholds already express "how many
  parallel tasks per role are fine" per the user's own examples (2 for most
  roles, tighter for shared roles).
- `Scenario` / `ScenarioSnapshot` (`src/types.ts:108-117`), currently
  unused dead weight, becomes the container for a proposed plan: a
  scheduler run produces a `ScenarioSnapshot` (`epics` + `people`), never
  mutates `Plan` directly.

## Algorithm

New module `src/lib/scheduler.ts`.

### Inputs

- `plan: Plan`
- `mode: 'comfortable' | 'emergency'`
- `epicIds?: string[]` — optional filter; defaults to all `enabled` epics
- `currentSprintIndex` (from `src/lib/calendar.ts`)

### Steps

1. **Freeze the past.** Any segment with `from < currentSprintIndex` is
   left untouched and still counts toward role demand for the sprints it
   covers (it's real, committed work).
2. **Order epics by priority.** Sort candidate epics by the current start
   sprint of their earliest (by `from`) future segment, ascending. Ties
   broken by `Epic.id` for determinism. This directly implements the "the
   feature that starts earliest today keeps its slot, others move" rule
   the user gave — a stability-preserving priority rule, which is also a
   well-established RCPSP priority heuristic (earliest-start-first).
3. **For each epic, in that order, walk its pipeline stages in order:**
   - Compute the stage's earliest allowed start sprint from the previous
     stage's end sprint(s) and its `linkType`.
   - For each role in the stage, place its segment at the earliest sprint
     that is `>=` both the stage's dependency floor and the sprint right
     after that role's own previous commitment in this epic (segments for
     the same role within one epic never overlap).
   - **Comfortable:** keep `to - from` (duration) fixed at its current
     value. If placing the segment at the floor sprint would push any
     covered sprint's role status to `over` (per `computeLoad`, recomputed
     incrementally as segments are placed), slide the start forward
     one sprint at a time until it doesn't.
   - **Emergency:** place at the dependency floor unconditionally (`over`
     is allowed). Then attempt compression: shrink duration toward a floor
     of 1 sprint while the role's cumulative demand in the freed-up
     sprints would still resolve to `ok`/`tight` for at least one
     alternative placement — in practice this means: only compress when
     doing so doesn't strictly worsen the finish sprint, since the
     duration a user set represents committed scope, not padding, and the
     spec deliberately doesn't invent a "velocity per compressed sprint"
     model. Compression here is therefore limited to closing gaps created
     by `earliest`-type links (e.g. testing starting on sprint N instead of
     N+2), not shortening a segment's total sprint count below what the
     user entered. (This narrows "crashing" to what the data actually
     supports — see Open question below.)
   - Record the resulting per-sprint-per-role demand so later epics in the
     priority order see it.
4. **Emit** a `ScenarioSnapshot` with the recomputed `epics` (only
   `segments` differ from the input) and unchanged `people`.

### Open question to confirm during implementation planning

Step 3's Emergency compression is deliberately conservative: nothing in
today's data model says how much work a segment represents independent of
its sprint span, so "shrink duration" can't be justified by a load
calculation — it can only close idle gaps from dependency slack. If actual
duration-shrinking (e.g. "3 sprints of dev, compressed to 2 by tolerating
more parallelism") is wanted, a size/effort field would need to be added to
`Segment`, which is a bigger data-model change than this spec assumes. This
spec ships without it; flag it explicitly to the user before the
implementation plan is written, so they can confirm the narrower behavior
is acceptable for v1.

## UI

### 1. Pipeline settings

New panel, reachable from `SettingsMenu.tsx` next to thresholds
(`src/components/SettingsMenu.tsx`): ordered list of stages, each stage a
chip group of roles (drag role chips between stages to reassign), a
per-stage toggle for `sequential`/`earliest`. Add/remove/reorder stages.
Changes write to `Plan.settings.pipeline`.

`EpicFormPanel.tsx` gains an optional "override pipeline for this feature"
section, same editor, writing to `Epic.pipelineOverride`.

### 2. Project-wide run: Comfortable / Emergency

Two toolbar buttons next to the existing actions
(`src/App.tsx:238` toolbar). Clicking either runs the scheduler
(`src/lib/scheduler.ts`) over all enabled epics and opens a **compare
view**:

- Current plan and proposed plan shown on the same sprint grid (reuse
  `Grid.tsx` rendering twice, or a toggle/overlay — implementation detail
  for the plan doc), diff-highlighted per moved segment.
- The proposed plan is a live draft: the user can drag/resize inside it
  like a normal plan (reusing existing drag/resize interactions), before
  deciding what to keep.
- Per-epic checkboxes + "Apply checked", "Apply all", "Discard". Applying
  merges only the checked epics' `segments` from the draft
  `ScenarioSnapshot` into the live `Plan`; unchecked epics keep their
  current segments untouched.

### 3. Per-epic manual tool: grey range → Distribute

On an epic's rows in `Grid.tsx`, a new drag handle sets/resizes an overall
grey envelope spanning that epic's row group across sprint columns
(independent from any individual segment). Once a range is set, a
"Распределить" button appears; clicking it opens a small form asking for
each role's duration (sprint count) that should appear in the range, then
lays out segments for those roles inside the envelope following
`epic.pipelineOverride ?? plan.settings.pipeline` (Resource Smoothing: the
window is fixed, segments are packed inside it, never pushed past it).

If the requested roles/durations don't fit the envelope under pipeline
rules, show a blocking dialog: "Не помещается — расширить диапазон на N
спринтов" / "Отменить". No silent compression here, unlike Emergency mode
— this tool's whole point is a deadline the user chose on purpose.

## Testing

- Unit tests for `src/lib/scheduler.ts`: pipeline dependency resolution
  (`sequential` vs `earliest`, same-sprint rollout-after-testing), past
  segments frozen, priority ordering under role contention, comfortable
  mode never produces an `over` cell, emergency mode allows `over` but
  never shortens a segment below its input duration.
- Unit tests for pipeline settings round-trip (default seed, per-epic
  override precedence).
- Manual verification in-browser: run Comfortable on a plan with a
  deliberately overloaded analytics sprint, confirm dependent dev/test
  segments shift correctly and past segments are untouched; run the grey-
  range tool on one epic and confirm the "doesn't fit" dialog appears when
  expected.

## Rollout

No new runtime dependency. `normalizePlan`-style migration (see existing
handling of `plannedSegments`/`visibleRoles` in `src/types.ts:104-105`)
needed for `Settings.pipeline` on old saved plans: seed the default
pipeline described above when absent, and leave `Epic.pipelineOverride`
undefined (falls back to project default) on epics that don't have one.
