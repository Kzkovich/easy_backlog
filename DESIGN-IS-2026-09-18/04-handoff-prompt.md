# Redesign handoff prompt

Redesign the authenticated “Колбаски” planning surface while preserving its core product model and behavior: a feature contains roles, role work appears as draggable/resizable segment bars across dated sprint columns, and the lower table explains capacity. Do not change persistence semantics, capacity math, filtering, drag/resize behavior or the dated sprint grid.

Primary user: a product or engineering manager arranging cross-functional work and detecting resource conflicts. Primary task: understand sequencing and capacity at a glance, then adjust the plan directly.

Preserve:

- Feature → roles → dated sprint columns.
- Whole-feature movement, vertical reordering, per-segment movement/resizing, team filters and capacity-to-grid highlighting.
- Ceramic-spacecraft identity, with functional light and dark themes.
- Static dots/squares paper background beneath the moving grid.
- Honest save states, safe deletion and reduced-motion behavior.

Discard or redesign:

- Per-segment infinite glints and the current 29-loop idle animation load.
- Simultaneous team/status/effect/KB/duration badge clutter in feature headers.
- The visible knowledge-base flag.
- Three zoom choices, ambiguous view names and duplicated “Состав команд” entry points.
- “People” wording for fractional capacity, generic load thresholds and low-contrast status labels.
- Pointer-only custom controls without focus or semantic equivalents.

Make the segment bars the visual hero. Give them a calm futuristic ceramic/spacecraft construction: layered shell, inset core, controlled specular highlight, tactile end grips and a slight lift on hover/focus/drag. Their shape and contrast must remain legible in dense rows. Animate only meaningful transitions—appearance, hover/focus, drag, resize, save/current-state change—and never run an infinite animation on every bar. Respect `prefers-reduced-motion`.

Use one clear segment editing gesture instead of different single-click and double-click outcomes. A single activation opens one editor containing label/comment, color, reset-to-role-color and deletion. Keep double-click on an empty role track for creation, and reveal a quiet “Двойной клик — создать этап” hint when that track is hovered. Deletion must remain available inside the editor.

Add per-segment color customization in its existing edit popover. Offer a compact curated palette plus a native custom color control and a “use role color” reset. Preserve `Segment.color: string | null`. Derive a foreground that achieves at least WCAG AA 4.5:1 for the 11px label against the rendered segment surface; color must not be the only state cue.

Clarify hierarchy and copy:

- Views: “По ролям” and “Сводно”.
- Scale: exactly “Компактно” and “Стандартно”; migrate a stored legacy `large` value to standard.
- “Состав команд” becomes “Команды и ресурсы”.
- Replace avoidable jargon such as “дискавери” and “раскатка” with “Исследование” and “Запуск” where these are product defaults.
- Remove the visible KB control/badge while preserving legacy stored values during edits.
- Keep a feature header to a dominant title plus a quiet, concise secondary line; reveal deeper details in editing rather than as permanent badges.

Redesign the load footer as analysis, not decoration. Use a crisp numeric hierarchy, sticky/scannable role labels, capacity units that describe fractional staff allocation (“ставки”), and a legend derived from the actual thresholds. Keep overload/tight/free states distinct in shape or text as well as color. Remove the duplicate route to team settings.

Make direct manipulation visible: the whole feature row must lift, cast a stronger shadow and follow the pointer while being moved, with a clear landing indication. Add role reordering controls in both the team/resource editor and each feature without changing role IDs or capacity calculations. Keep sprint numbers and dates sticky inside the planner while the user scrolls vertically.

Accessibility minimums: add a `main` landmark and labelled toolbar/regions, a skip target, visible `:focus-visible` styles, descriptive labels for icon controls and inputs, keyboard activation for feature collapse/edit, segment editing and load-cell highlighting, and dialog/popover semantics with sensible focus restoration. Full keyboard drag/resize is desirable but must not destabilize existing pointer mechanics.

Technical constraints: React 18 + TypeScript + existing CSS architecture; no new runtime dependency. Keep all three themes and both static background patterns. Verify typecheck/build, mouse drag/resize, persistence, responsive desktop layout, focus flow, contrast, reduced motion and absence of per-segment infinite animations.
