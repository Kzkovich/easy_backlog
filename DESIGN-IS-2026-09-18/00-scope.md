# Scope

## Audited surface

- Product: «Колбаски» development planner
- Repository: `/Users/alfa/dev/kolbaski`
- Primary surface: authenticated planning screen — toolbar, sprint header, feature/role rows, segment bars, load table, settings and feature editor
- Target theme: `ceramic`, with regression checks for `light` and `dark`
- Authentication/onboarding screen is explicitly out of scope for this pass

## Primary user and task

Primary user: product or engineering manager coordinating multiple roles and teams.

Primary task: arrange feature work by role across dated sprints, understand sequencing at a glance, and identify capacity conflicts without losing context.

## Constraints

- Preserve the data and interaction model: feature → roles → sprint columns with dates.
- Preserve drag, resize, feature editing, team filtering, capacity calculation and persistence behavior.
- Keep React 18 + TypeScript + CSS architecture; avoid new runtime dependencies.
- Keep dark and light themes functional; ceramic remains the expressive theme.
- Respect `prefers-reduced-motion` and keyboard/focus accessibility.
- Simplify zoom to two choices: compact and normal.
- Remove the low-value knowledge-base flag from the visible feature-editing experience without breaking existing saved data.
- Use one unambiguous segment-edit action containing label, color and deletion; remove the split single-click/double-click behavior.
- Make feature dragging visibly lift and follow the pointer.
- Allow role reordering both in team settings and within each feature.
- Keep sprint/date headers visible during vertical scrolling.

## Reference direction

- Existing ceramic-spacecraft visual language and the user's supplied white ceramic / futuristic interface references.
- Dieter Rams' ten principles, with usefulness, understandability, thoroughness and “as little design as possible” prioritized over decoration.
