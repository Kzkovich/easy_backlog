# Evidence

## Method

The authenticated planner was inspected in source and as a production build. Counts below describe authored interaction sites rather than a fixture-dependent DOM count. Authentication is outside the audit scope.

## Structure and interaction

- 60 unique authored interaction sites across the authenticated surface: App 7, Grid 8, LoadPanel 5, SettingsMenu 3, EpicFormPanel 12, TeamsPanel 18, SegmentBar 3, TextPopover 4 (`src/App.tsx:193-332`; `src/components/Grid.tsx:479-664`; `src/components/LoadPanel.tsx:122-251`).
- Maximum custom-component depth is three: `App → Grid → SegmentBar`, `App → Grid → TextPopover`, and `App → SettingsMenu → Seg` (`src/App.tsx:236-296`; `src/components/Grid.tsx:537-664`).
- Three duplicated affordance groups exist: opening team composition in two places, two feature move/edit targets, and two equivalent form-dismiss controls (`src/App.tsx:233-235`; `src/components/LoadPanel.tsx:161-163`; `src/components/Grid.tsx:496-504`; `src/components/EpicFormPanel.tsx:53-59,132-144`).
- Core direct manipulation is useful and distinctive: whole-feature movement, vertical reorder, per-segment movement, two-sided resizing, and capacity-to-grid highlighting (`src/components/Grid.tsx:211-385`; `src/components/LoadPanel.tsx:191-210`).
- The feature header competes with the schedule by showing team, status, effects, knowledge-base state, and duration simultaneously (`src/components/Grid.tsx:500-519`).
- Settings exposes three zoom levels, four themes, two past-quarter choices, and two background patterns (`src/components/SettingsMenu.tsx:60-108`).

## Copy and information model

- “Детально” and “Для менеджмента” describe audiences or density, not the actual views. “По ролям” and “Сводно” are more literal (`src/App.tsx:203-208`).
- Capacity is fractional FTE but is labelled as people (`чел.`), which makes the load table less honest and harder to interpret (`src/components/LoadPanel.tsx:72-120`).
- “Нужна статья в Базу Знаний” adds persistent metadata but is not material to the planning task (`src/components/EpicFormPanel.tsx:116-119`; `src/components/Grid.tsx:511`).
- “Состав команд” opens a broader editor containing teams, roles, capacity and people; “Команды и ресурсы” is a more accurate label (`src/components/TeamsPanel.tsx:153-352`).
- Several abbreviations and internal terms add avoidable friction: `спр.`, `дискавери`, `раскатка`, `ФРИЗ`, and labels such as “чужая ёмкость”.
- Save state and destructive-action copy are honest: saving/dirty/saved states are distinct, and destructive operations are confirmed or blocked when in use (`src/App.tsx:163-168,224-232`; `src/components/TeamsPanel.tsx:55-100`).

## Typography, color and motion

- A 1280×720 ceramic render used 14 distinct spacing values (`1,2,3,4,5,6,7,8,9,10,11,12,14,22px`) and 11 computed type sizes concentrated between 8.5 and 13px. This is finer-grained than the hierarchy needs.
- The rendered viewport referenced 112 distinct computed colors across text, fills, borders, gradients, shadows and pseudo-elements.
- The 331px load section occupied 52.5% of the main slab and was taller than the 297px primary planning grid. The secondary analysis therefore outweighed the editing surface.
- Product title and body text are both 13px; hierarchy currently depends on gradient and tracking instead of a stable type scale. Detailed rows are 30px tall and their 20px capsule bars leave only 5px clearance above and below.
- The ceramic theme's primary text passes AA: `#14272c` on `#f4faf9` is 14.66:1; dim text on panel is 4.88:1 (`src/styles.css:42-75`).
- Several small-text combinations fail AA: dim text on `#d5e2e5` is 3.89:1; accent text is 2.73:1; the current sprint color is 3.21:1; white text on active gradients ranges from 2.88:1 to 3.82:1 (`src/styles.css:251-262,509-565`).
- Load status text ranges from 3.44:1 to 3.77:1 at 9.5–12 px (`src/styles.css:895-915,946-969,1000-1046`).
- Three current fixture segment colors fail AA with the generated foreground: Front iOS 3.84:1, Front Web/Mob 4.05:1, and EK 3.15:1 (`src/lib/color.ts:10-18`; `data/plan.json:1261-1303`).
- The audited 1280×720 viewport rendered 19 continuously animated elements/pseudo-elements, including nine bar glints; source counting across the complete current fixture can reach 29 simultaneous infinite loops when all 19 segments are visible (`src/styles.css`). `prefers-reduced-motion` correctly collapses them (`src/styles.css:2242-2250`).
- Production build output is 570,901 bytes raw / 189,064 bytes gzip of JavaScript in one chunk. Estimated cold start makes six document/static/API requests and about 580 ms to interactive in a normal local/network profile; this timing is an estimate, not a field measurement.

## Accessibility and resilience

- The authenticated planner exposes zero named ARIA landmarks and no skip link (`src/App.tsx:193-335`).
- Creation, view switching, filtering, save, settings and form editing are keyboard reachable through native controls.
- Core work is not keyboard reachable: feature collapse/edit/reorder, segment create/move/resize/edit, load-cell highlight and load-row expansion use non-focusable `div` or `span` targets (`src/components/Grid.tsx:484-536`; `src/components/SegmentBar.tsx:46-73`; `src/components/LoadPanel.tsx:173-210`).
- The authenticated UI has no authored focus style; a role-removal button can receive focus while remaining at `opacity: 0` (`src/styles.css:688-706,2104`).
- Team/resource inputs rely on adjacent visual headings rather than programmatic labels (`src/components/TeamsPanel.tsx:155-190,213-245,292-328`).
- Side panels and popovers lack dialog semantics, focus containment and focus restoration (`src/components/EpicFormPanel.tsx:52-147`; `src/components/TextPopover.tsx:13-69`).
- Loading, error, empty, saving and disabled states exist, and Escape/outside-click dismissal exists for settings and text popovers (`src/App.tsx:57-89,178-190,224-277`; `src/components/SettingsMenu.tsx:41-53`).

## State coverage

- Covered in source: loading, error, empty plan, empty filter, dirty, saving, saved, disabled, import warning/error, hover and reduced motion.
- Not confirmed in a browser during this audit: 320/768/1440 px rendering, high-contrast mode, actual focus appearance, screen-reader announcements and animation frame rate.

## Evidence gaps

- Runtime counts depend on plan size; the 60-control count is static JSX-site evidence.
- Contrast over translucent gradients varies by pixel; ratios use declared tokens and documented alpha compositing.
- Time-to-interactive is an engineering estimate. No real-user monitoring data was available.
