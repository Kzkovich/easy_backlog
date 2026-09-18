# Implementation plan

## Documentation discovery

No third-party UI package is involved, so the authoritative documentation is the repository itself. A delegated documentation-discovery pass was attempted as required by the planning workflow, but the agent hit its account usage limit before returning. The implementation therefore follows these local contracts:

- `Segment.color: string | null`; null means inherit the role color (`src/types.ts:69-78`; `src/components/SegmentBar.tsx:35`).
- Feature-local role order is already representable by `Epic.visibleRoles?: RoleId[]`; undefined means the global role order (`src/types.ts:92`; `src/components/Grid.tsx:56-60`).
- Global role order is the order of `Plan.roles`; load and UI iterate that array (`src/types.ts:122`; `src/lib/load.ts:127`; `src/components/TeamsPanel.tsx:220`).
- Zoom is a local preference, with widths controlled exclusively by `ZOOM_WIDTH` (`src/App.tsx:13,28,54,283,303`).
- Capacity thresholds are stored in `plan.settings.thresholds`; load status derives from those values (`src/types.ts:106-115`; `src/lib/load.ts:88-103`).
- Reduced motion is a global CSS override and must remain the final animation safeguard (`src/styles.css:2242-2250`).

## Phase 1 — Simplify language and segment editing

Files: `src/App.tsx`, `src/components/SettingsMenu.tsx`, `src/components/EpicFormPanel.tsx`, `src/components/Grid.tsx`, `src/components/TextPopover.tsx`, `src/components/SegmentBar.tsx`, `src/lib/color.ts`, `src/styles.css`.

1. Narrow `ZoomLevel` to `compact | normal`; map any stored `large` value to `normal`. Expose “Компактно / Стандартно”.
2. Rename modes to “По ролям / Сводно”, “Состав команд” to “Команды и ресурсы”, and “Фон сетки” to “Подложка”.
3. Remove visible KB editing and badge rendering. When editing an existing feature, retain `epic.needsKb`; new features default it to false.
4. Remove delayed single-click note versus double-click rename. A single segment activation opens one editor with label/details, palette/custom color, reset to role color and delete.
5. Preserve drag/resize by opening the editor only when pointer movement remains below the click threshold.
6. Add a hover/focus hint to an empty track: “Двойной клик — создать этап”. Keep creation on double-click.
7. Replace luminance-only foreground choice with an AA-oriented black/white contrast comparison.

Verification: typecheck/build; one-click editor; drag does not open editor; create/delete/recolor/reset persist; no visible KB string; two zoom buttons only.

## Phase 2 — Direct manipulation and role order

Files: `src/components/Grid.tsx`, `src/components/TeamsPanel.tsx`, `src/styles.css`.

1. Add an explicit feature-drag state separate from the numeric preview. Apply it to all cells belonging to the feature, lift the row, strengthen its shadow and translate the moving layer with pointer delta between sprint snaps.
2. Preserve current snap/clamp calculation and only commit the existing sprint delta on pointer-up.
3. Show a clear landing indicator and pressed cursor/state immediately on pointer-down.
4. Add up/down controls to global role rows. Reorder `Plan.roles` without changing IDs.
5. Add up/down controls to feature role labels. Materialize `visibleRoles` from global order when absent, then reorder only that feature's array.
6. Keep existing segment ownership, people assignments and load calculations unchanged.

Verification: reorder global roles and confirm all default-order features/load rows follow; reorder one feature and confirm other features do not; drag feature with immediate visual feedback and correct saved sprint positions.

## Phase 3 — Sticky time axis and analytical footer

Files: `src/components/Grid.tsx`, `src/components/LoadPanel.tsx`, `src/App.tsx`, `src/styles.css`.

1. Make quarter and sprint/date header rows sticky at the top of the grid scroll container with correct z-index intersections for the left label column.
2. Ensure the header remains aligned while horizontal scrolling is synchronized with the load panel.
3. Rename capacity from people to fractional allocation (“ставка/ставки”), including alert text, tooltips, row summaries and empty states.
4. Derive legend labels from `okPerPerson` and `okPerPersonShared` instead of hard-coded 1/2/3+.
5. Remove the duplicate team-editor button from the load header; keep the toolbar route.
6. Make load row expansion and hot cells native keyboard-operable buttons without changing layout.
7. Reduce the default open height of the load section so the schedule remains the dominant surface.

Verification: dates remain visible through vertical scroll; horizontal columns align; thresholds and capacity units match data; keyboard Enter/Space highlights a cell; load calculation snapshots remain unchanged.

## Phase 4 — Visual system, accessibility and motion budget

Files: `src/components/SegmentBar.tsx`, `src/components/Grid.tsx`, `src/components/LoadPanel.tsx`, `src/components/EpicFormPanel.tsx`, `src/components/TeamsPanel.tsx`, `src/components/TextPopover.tsx`, `src/styles.css`.

1. Rebuild bars as layered ceramic shells with inset core, static specular highlight, visible end grips and clear risk/load encoding. Keep role color identity and compact density.
2. Run glint only as a finite hover/focus/creation reaction. Remove infinite per-segment animations and cap idle ceramic loops at six.
3. Consolidate feature metadata into a dominant title and one concise secondary line; use full words and correct pluralisation.
4. Establish a small type/spacing scale and improve status/current/freeze/load contrast to WCAG AA for small text.
5. Add `main`, toolbar/region names, a skip target, `:focus-visible`, descriptive close labels, labelled resource inputs and dialog/popover semantics with focus restoration where practical.
6. Maintain light, ceramic and dark token behavior and the static dots/squares paper layer.

Verification: build/typecheck; automated search confirms no infinite animation on `.segment-bar`; keyboard and reduced-motion smoke tests; visual inspection at 1280×720 and a narrower desktop width in ceramic/light/dark.

## Release

1. Run `npm run build` and any repository tests.
2. Exercise login, segment create/edit/move/resize/delete/recolor, feature drag, both role-order scopes, sticky dates, load highlight, save/reload and all themes locally.
3. Review the final diff for accidental data-model or capacity-math changes.
4. Commit on `main`, push to `origin/main`, monitor the existing CI/CD workflow, then smoke-test `https://kolbaski.kzkovich.ru/` without changing server Basic Auth.

