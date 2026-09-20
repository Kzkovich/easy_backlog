import { useEffect, useMemo, useRef, useState } from 'react';
import type { Epic, Plan, Scenario } from '../types';
import type { SchedulerMode } from '../lib/scheduler';
import { movedSegmentIds } from '../lib/scheduler';
import { computeLoad } from '../lib/load';
import { diffScenario, filterDiffByTeam } from '../lib/scenarioDiff';
import Grid from './Grid';
import ScenarioChangesList from './ScenarioChangesList';

interface Props {
  plan: Plan;
  mode: SchedulerMode;
  scenario: Scenario;
  viewMode: 'detailed' | 'management';
  colWidth: number;
  cutoffIndex: number;
  currentSprint: number;
  teamFilter: string;
  onApply: (draftEpics: Epic[], selectedIds: Set<string>, scenario: Scenario) => void;
  onSaveScenario: (scenario: Scenario) => void;
  onDiscard: () => void;
}

export default function SchedulerCompare({
  plan, mode, scenario, viewMode, colWidth, cutoffIndex, currentSprint, teamFilter, onApply, onSaveScenario, onDiscard,
}: Props) {
  const [draft, setDraft] = useState<Epic[]>(() => scenario.snapshot.epics);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(scenario.snapshot.epics.filter((e) => e.enabled !== false).map((e) => e.id)));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(scenario.snapshot.epics);
    setSelected(new Set(scenario.snapshot.epics.filter((e) => e.enabled !== false).map((e) => e.id)));
  }, [scenario.id]);

  const draftPlan: Plan = useMemo(() => ({ ...plan, epics: draft }), [plan, draft]);
  const load = useMemo(() => computeLoad(draftPlan), [draftPlan]);
  const highlightSegments = useMemo(
    () => movedSegmentIds({ ...plan, epics: scenario.baseSnapshot.epics, people: scenario.baseSnapshot.people }, { epics: draft, people: scenario.snapshot.people }),
    [plan, scenario, draft]
  );
  const visibleDraftEpics = useMemo(() => draft.filter((e) => teamFilter === 'ALL' || e.teams.includes(teamFilter)), [draft, teamFilter]);
  const diff = useMemo(
    () => filterDiffByTeam(diffScenario(scenario.baseSnapshot, { epics: draft, people: scenario.snapshot.people }), teamFilter),
    [scenario, draft, teamFilter]
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

  const visibleIds = visibleDraftEpics.map((epic) => epic.id);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const savedScenario = { ...scenario, snapshot: { ...scenario.snapshot, epics: structuredClone(draft) }, updatedAt: new Date().toISOString() };

  return (
    <div className="scheduler-overlay" role="dialog" aria-modal="true" aria-labelledby="scheduler-compare-title">
      <div className="scheduler-compare-header">
        <div>
          <h2 id="scheduler-compare-title">Вариант «{scenario.name}»</h2>
          <span className="scheduler-mode-label">{mode === 'comfortable' ? 'Комфортный расчёт' : 'Экстренный расчёт'} · исходник зафиксирован</span>
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => onSaveScenario(savedScenario)}>Сохранить вариант</button>
        <button className="btn" onClick={onDiscard}>Закрыть</button>
      </div>

      <div className="scheduler-compare-body">
        <div className="scheduler-sidebars">
          <ScenarioChangesList diff={diff} teamFilter={teamFilter} selected={selected} onToggle={toggleEpic} />
          <aside className="scheduler-epic-list" aria-label="Фичи для применения">
            <label className="scheduler-epic-check all">
              <input type="checkbox" checked={allChecked} onChange={() => setSelected((prev) => {
                const next = new Set(prev);
                visibleIds.forEach((id) => allChecked ? next.delete(id) : next.add(id));
                return next;
              })} />
              Все в фильтре
            </label>
          </aside>
        </div>

        <div className="scheduler-grid-area">
          <Grid plan={draftPlan} visibleEpics={visibleDraftEpics} teamFilter={teamFilter} colWidth={colWidth}
            mode={viewMode} cutoffIndex={cutoffIndex} currentSprint={currentSprint} load={load}
            highlight={null} highlightSegments={highlightSegments} scrollRef={scrollRef} onHScroll={() => {}}
            updatePlan={updateDraft} onEditEpic={() => {}} onSegmentDeleted={() => {}} />
        </div>
      </div>

      <div className="scheduler-compare-footer">
        <span className="scheduler-compare-hint">Слева — исходный контур и предложенная поверхность. Изменения сохраняются в варианте до применения.</span>
        <div className="spacer" />
        <button className="btn" onClick={() => onApply(draft, selected, savedScenario)} disabled={selected.size === 0}>Применить выбранные</button>
        <button className="btn primary" onClick={() => onApply(draft, new Set(draft.map((e) => e.id)), savedScenario)}>Применить все</button>
      </div>
    </div>
  );
}

