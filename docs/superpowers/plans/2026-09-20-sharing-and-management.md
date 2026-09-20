# Sharing and Management Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver registered-user share links with comments and a compact management timeline that uses business timing rules.

**Architecture:** Keep owner plan JSON isolated per account; store token hashes and comments in a sibling JSON file guarded by server authorization. Client-side routes choose an owner editor, a read-only team grid, or a compact management timeline. Timing calculation remains a pure tested module.

**Tech Stack:** Node `http`, Node crypto/filesystem, React 18, TypeScript, Vitest, CSS.

**Spec:** `docs/superpowers/specs/2026-09-20-scenarios-sharing-management-design.md`

## Global Constraints

- Login remains username/password only; no email or anonymous share access.
- A share token is random, never stored raw, revocable immediately and scoped to exactly one owner plan.
- Participants can add comments; author or owner may resolve/delete according to the spec.
- Management timing excludes Business/Grooming by default, supports global role rules and per-segment overrides.
- All static and API responses involved in auth/share send no-store where applicable.

## Review Focus

- A valid session without a valid link cannot fetch another user's plan.
- A replaced link fails immediately while a new link works.
- Another participant cannot close or delete a comment they did not author.
- A feature with no included segments renders baseline plus «Факт не начат».
- Baseline has no effect on `computeLoad` or the detailed grid.

---

### Task 1: Server-side share state and authorization

**Files:**
- Modify: `server/index.mjs`
- Create: `server/shareStore.mjs`, `server/shareStore.test.mjs`

**Interfaces:**
- Produces `createShareLink(ownerId)`, `resolveShare(token)`, `revokeShare(ownerId)`, `listComments(ownerId, target)`, `createComment`, `setCommentResolved`, `deleteComment`.

- [ ] **Step 1: Write failing token and permission tests**

```js
it('invalidates the old token when a link is replaced', async () => {
  const first = await createShareLink('owner'); const second = await createShareLink('owner');
  expect(await resolveShare(first.token)).toBeNull();
  expect((await resolveShare(second.token)).ownerId).toBe('owner');
});
it('rejects comment deletion by another participant', async () => {
  const comment = await createComment('owner', { authorId: 'a', authorName: 'Анна', epicId: 'e', segmentId: 's', type: 'question', text: 'Когда?' });
  await expect(deleteComment('owner', comment.id, { id: 'b' })).rejects.toMatchObject({ statusCode: 403 });
});
```

- [ ] **Step 2: Run them to verify failure**

Run: `node --test server/shareStore.test.mjs`

Expected: FAIL because `shareStore.mjs` is absent.

- [ ] **Step 3: Implement isolated storage and routes**

Use `randomBytes(32).toString('base64url')`, `createHash('sha256')`, atomic writes and a timing-safe hash comparison. Store state at `userPaths(ownerId).share`. Add authenticated owner routes and authenticated `/api/shared/:token/*` routes before the owner-only `/api/plan` block. Return 404 for bad/revoked links and 403 for forbidden mutations; never accept `ownerId` from JSON.

- [ ] **Step 4: Verify API behaviour**

Run: `node --test server/shareStore.test.mjs && npm test`

Expected: PASS. Add a Node HTTP smoke test proving unauthenticated is 401, active linked session is 200 and owner plan PUT remains forbidden to a participant.

- [ ] **Step 5: Commit**

```bash
git add server/index.mjs server/shareStore.mjs server/shareStore.test.mjs
git commit -m "feat: add authenticated share links and comments api"
```

### Task 2: Read-only shared route and comment panel

**Files:**
- Modify: `src/main.tsx`, `src/App.tsx`, `src/components/AuthScreen.tsx`, `src/components/Grid.tsx`
- Create: `src/components/ShareSettingsPanel.tsx`, `src/components/SharedBacklogPage.tsx`, `src/components/SegmentCommentsPanel.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `SharedBacklogPage({ token })` fetches only `/api/shared/:token/plan` and exposes no write callbacks.
- `SegmentCommentsPanel({ token, epicId, segmentId, currentUser, ownerId? })` uses shared comment endpoints.

- [ ] **Step 1: Write the shared-view test**

```ts
it('does not offer drag or plan saving in shared mode', () => {
  render(<SharedBacklogPage token="valid" />);
  expect(screen.queryByRole('button', { name: /сохранить/i })).toBeNull();
  expect(screen.queryByText(/Комфортно/)).toBeNull();
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npm test -- src/components/SharedBacklogPage.test.tsx`

Expected: FAIL because the route component does not exist.

- [ ] **Step 3: Implement owner controls and shared view**

Add link create/copy/revoke controls to owner UI. Route `/share/<token>` before the owner app and preserve URL through login. Make `Grid` accept `readOnly`; disable drag, resize and edit handlers, but call `onSegmentSelect` for comments. Give comment type, state and action controls accessible names.

- [ ] **Step 4: Verify the complete shared flow**

Run: `npm test && npx tsc -b --force && npm run build`

Expected: exit 0. Browser smoke: two users, link, author comment, author resolve/delete, second-user deletion forbidden, then revoked link shows neutral invalid page.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx src/components/AuthScreen.tsx src/components/ShareSettingsPanel.tsx src/components/SharedBacklogPage.tsx src/components/SegmentCommentsPanel.tsx src/components/Grid.tsx src/styles.css
git commit -m "feat: add read-only shared backlog and comments"
```

### Task 3: Management timing and compact timeline

**Files:**
- Modify: `src/types.ts`, `src/lib/teams.ts`, `src/components/SegmentEditorPopover.tsx`, `src/App.tsx`, `src/components/Grid.tsx`
- Create: `src/lib/managementTiming.ts`, `src/lib/managementTiming.test.ts`, `src/components/ManagementTimeline.tsx`, `src/components/ManagementSettingsPanel.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `isManagementSegmentIncluded(segment, role, settings): boolean`
- `managementRange(epic, plan): { from: number; to: number } | null`
- `managementStatus(epic, plan, currentSprint): ManagementStatus`

- [ ] **Step 1: Write failing timing tests**

```ts
it('excludes grooming by default but lets a segment opt in', () => {
  expect(isManagementSegmentIncluded(segment('grooming'), groomingRole, defaults)).toBe(false);
  expect(isManagementSegmentIncluded({ ...segment('grooming'), managementTiming: 'include' }, groomingRole, defaults)).toBe(true);
});
it('returns no fact range when all segments are excluded', () => {
  expect(managementRange(excludedEpic, plan)).toBeNull();
});
```

- [ ] **Step 2: Run them to verify failure**

Run: `npm test -- src/lib/managementTiming.test.ts`

Expected: FAIL because `managementTiming.ts` is absent.

- [ ] **Step 3: Implement rules and timeline**

Normalize `settings.management.roleDefaults`; infer false only for normalized Business/Grooming ids/names, true otherwise. Add per-segment `inherit | include | exclude` and a role-level default switch. Group timeline rows by filtered team; render `plannedFrom/plannedTo` as grey outline and pure range/status as active bar. On risk show both dates.

- [ ] **Step 4: Verify timing isolation**

Run: `npm test && npx tsc -b --force && npm run build`

Expected: PASS. Add a test asserting `computeLoad(plan)` is identical when only `managementTiming` changes. Browser smoke: global default, one override, baseline-only feature, late fact Risk, filtered team.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/teams.ts src/lib/managementTiming.ts src/lib/managementTiming.test.ts src/components/ManagementTimeline.tsx src/components/ManagementSettingsPanel.tsx src/components/SegmentEditorPopover.tsx src/App.tsx src/components/Grid.tsx src/styles.css
git commit -m "feat: add management timeline and timing rules"
```

