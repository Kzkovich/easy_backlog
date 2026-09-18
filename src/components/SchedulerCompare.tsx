import { useMemo, useRef, useState } from 'react';
import type { Epic, Plan, ScenarioSnapshot } from '../types';
import type { SchedulerMode } from '../lib/scheduler';
import { movedSegmentIds } from '../lib/scheduler';
import { computeLoad } from '../lib/load';
import Grid from './Grid';

interface Props {
  plan: Plan;
  mode: SchedulerMode;
  snapshot: ScenarioSnapshot;
  viewMode: 'detailed' | 'management';
  colWidth: number;
  cutoffIndex: number;
  currentSprint: number;
  teamFilter: string;
  onApply: (draftEpics: Epic[], selectedIds: Set<string>) => void;
  onDiscard: () => void;
}

export default function SchedulerCompare({
  plan,
  mode,
  snapshot,
  viewMode,
  colWidth,
  cutoffIndex,
  currentSprint,
  teamFilter,
  onApply,
  onDiscard,
}: Props) {
  const [draft, setDraft] = useState<Epic[]>(() => snapshot.epics);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(snapshot.epics.filter((e) => e.enabled !== false).map((e) => e.id))
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const draftPlan: Plan = useMemo(() => ({ ...plan, epics: draft }), [plan, draft]);
  const load = useMemo(() => computeLoad(draftPlan), [draftPlan]);
  const highlightSegments = useMemo(() => movedSegmentIds(plan, { ...snapshot, epics: draft }), [plan, snapshot, draft]);
  const visibleDraftEpics = useMemo(
    () => draft.filter((e) => teamFilter === 'ALL' || e.teams.includes(teamFilter)),
    [draft, teamFilter]
  );

  function updateDraft(fn: (p: Plan) => Plan) {
    setDraft((prev) => fn({ ...plan, epics: prev }).epics);
  }

  function toggleEpic(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allChecked = draft.length > 0 && selected.size === draft.length;

  return (
    <div className="scheduler-overlay" role="dialog" aria-modal="true" aria-labelledby="scheduler-compare-title">
      <div className="scheduler-compare-header">
        <h2 id="scheduler-compare-title">Планировщик · {mode === 'comfortable' ? 'Комфортно' : 'Экстренно'}</h2>
        <div className="spacer" />
        <button className="btn" onClick={onDiscard}>
          Отмена
        </button>
      </div>

      <div className="scheduler-compare-body">
        <aside className="scheduler-epic-list" aria-label="Фичи для применения">
          <div className="section-title">Фичи</div>
          <label className="scheduler-epic-check all">
            <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(draft.map((e) => e.id)))} />
            Все
          </label>
          {draft.map((epic) => (
            <label key={epic.id} className="scheduler-epic-check">
              <input type="checkbox" checked={selected.has(epic.id)} onChange={() => toggleEpic(epic.id)} />
              {epic.title}
            </label>
          ))}
        </aside>

        <div className="scheduler-grid-area">
          <Grid
            plan={draftPlan}
            visibleEpics={visibleDraftEpics}
            teamFilter={teamFilter}
            colWidth={colWidth}
            mode={viewMode}
            cutoffIndex={cutoffIndex}
            currentSprint={currentSprint}
            load={load}
            highlight={null}
            highlightSegments={highlightSegments}
            scrollRef={scrollRef}
            onHScroll={() => {}}
            updatePlan={updateDraft}
            onEditEpic={() => {}}
            onSegmentDeleted={() => {}}
          />
        </div>
      </div>

      <div className="scheduler-compare-footer">
        <span className="scheduler-compare-hint">
          Жёлтым подсвечены сдвинутые колбаски. Черновик можно двигать — изменения попадут в итог.
        </span>
        <div className="spacer" />
        <button className="btn" onClick={() => onApply(draft, new Set(selected))} disabled={selected.size === 0}>
          Применить выбранные
        </button>
        <button className="btn primary" onClick={() => onApply(draft, new Set(draft.map((e) => e.id)))}>
          Применить все
        </button>
        <button className="btn" onClick={onDiscard}>
          Отменить
        </button>
      </div>
    </div>
  );
}
