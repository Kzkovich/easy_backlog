# Verdict

## REDESIGN

The score is **14/30**, below the 20-point redesign threshold. This is a visual, semantic and interaction-layer redesign—not a change to the product's feature → role → sprint model.

## Keep

- Direct manipulation of feature work across dated sprints.
- Role-based colored segments and capacity-to-grid highlighting.
- The ceramic-spacecraft identity, theme choice, static paper pattern and reduced-motion support.
- Explicit save states, confirmation before destructive actions and the existing persistence model.

## Change first

1. Make the segment bar the visual hero: sculpted but readable form, clear end grips, useful hover/focus response, configurable safe color, and animation only when interaction or state warrants it.
2. Calm the surrounding chrome: remove low-value knowledge-base metadata, reduce the feature header to one primary and one secondary line, eliminate duplicate actions and keep ambient animation below six concurrent loops.
3. Make terminology literal: “По ролям / Сводно”, “Компактно / Стандартно”, “Команды и ресурсы”, and capacity in fractions of a staff allocation rather than “people”.
4. Rebuild the load section as a clear analytical footer: stronger numeric hierarchy, actual threshold legend, scannable row labels and restrained status surfaces.
5. Add a semantic/focus layer without changing mechanics: named landmarks, visible focus, keyboard entry to feature/segment editing and load highlighting, labelled icon controls, and accessible dialog/popover behavior.

## Acceptance targets

- No visible KB flag in feature editing or headers; saved legacy data remains intact.
- Exactly two zoom choices, with migration from a stored third value.
- User can assign or reset a segment color; foreground remains WCAG AA for small text.
- Zero infinite animation per segment; no more than six concurrent idle loops in ceramic mode.
- Core interactive states have visible hover and focus treatment; reduced motion remains supported.
- A segment has one obvious edit route containing rename, recolor and delete; an empty track advertises double-click creation only on hover.
- Feature drag has a visible lifted/following state, roles can be reordered in team settings and within a feature, and sprint dates stay visible while scrolling vertically.
- Load capacity terminology and displayed units match the underlying fractional model.
- Light, ceramic and dark themes remain usable at desktop widths, with no behavior regression to dragging, resizing, filtering, saving or capacity calculation.
