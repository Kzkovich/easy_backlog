import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Epic, Plan, ScenarioSnapshot, Segment } from './types';
import Grid from './components/Grid';
import EpicFormPanel from './components/EpicFormPanel';
import TeamsPanel from './components/TeamsPanel';
import LoadPanel, { type LoadHighlight } from './components/LoadPanel';
import SchedulerCompare from './components/SchedulerCompare';
import SettingsMenu, { type BgPattern, type Theme, type ZoomLevel } from './components/SettingsMenu';
import AuthScreen, { type AuthUser } from './components/AuthScreen';
import { parsePlanWorkbook } from './lib/xlsxImport';
import { computeLoad } from './lib/load';
import { normalizePlan } from './lib/teams';
import { runScheduler, type SchedulerMode } from './lib/scheduler';
import { currentQuarterCutoffIndex, currentSprintIndex } from './lib/calendar';

const ZOOM_WIDTH: Record<ZoomLevel, number> = { compact: 64, normal: 92 };
type ViewMode = 'detailed' | 'management';
type LastDeleted =
  | { type: 'epic'; epic: Epic; index: number }
  | { type: 'segment'; epicId: string; segment: Segment }
  | null;

function readLocal<T extends string>(key: string, fallback: T): T {
  return (localStorage.getItem(key) as T) || fallback;
}

function readZoom(): ZoomLevel {
  const stored = localStorage.getItem('kolbaski-zoom');
  return stored === 'compact' ? 'compact' : 'normal';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zoom, setZoom] = useState<ZoomLevel>(readZoom);
  const [mode, setMode] = useState<ViewMode>('detailed');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [hidePast, setHidePast] = useState(() => localStorage.getItem('kolbaski-hide-past') !== '0');
  const [theme, setTheme] = useState<Theme>(() => readLocal('kolbaski-theme', 'light'));
  const [bgPattern, setBgPattern] = useState<BgPattern>(() => readLocal('kolbaski-bg-pattern', 'dots'));
  const [showTeams, setShowTeams] = useState(false);
  const [highlight, setHighlight] = useState<LoadHighlight | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [panelTarget, setPanelTarget] = useState<string | 'new' | null>(null);
  const [schedulerDraft, setSchedulerDraft] = useState<{ mode: SchedulerMode; snapshot: ScenarioSnapshot } | null>(null);
  const [lastDeleted, setLastDeleted] = useState<LastDeleted>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const teamsButtonRef = useRef<HTMLButtonElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const loadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kolbaski-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-bg-pattern', bgPattern);
    localStorage.setItem('kolbaski-bg-pattern', bgPattern);
  }, [bgPattern]);

  useEffect(() => localStorage.setItem('kolbaski-zoom', zoom), [zoom]);
  useEffect(() => localStorage.setItem('kolbaski-hide-past', hidePast ? '1' : '0'), [hidePast]);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => {
        if (!r.ok) throw new Error(`Сервер вернул ${r.status}`);
        return r.json();
      })
      .then((data) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setPlan(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetch('/api/plan')
      .then((r) => {
        if (!r.ok) throw new Error(`Сервер вернул ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setPlan(normalizePlan(data));
        setLoading(false);
      })
      .catch((e) => {
        setError(`Не удалось загрузить план: ${e.message}. Запущен ли мини-сервер (npm run dev)?`);
        setLoading(false);
      });
  }, [user]);

  // Выбранная в фильтре команда могла быть удалена
  useEffect(() => {
    if (plan && teamFilter !== 'ALL' && !plan.teams.some((t) => t.id === teamFilter)) setTeamFilter('ALL');
  }, [plan, teamFilter]);

  const updatePlan = useCallback((fn: (p: Plan) => Plan) => {
    setPlan((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !plan) return;
      if (
        !window.confirm(
          `Импортировать "${file.name}"? Текущий список эпиков (${plan.epics.length}) будет заменён импортированными данными. Перед сохранением сервер создаст резервную копию вашего плана.`
        )
      ) {
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const result = parsePlanWorkbook(buf, plan.sprints, plan.teams, plan.roles);
        setPlan({ ...plan, epics: result.epics });
        setWarnings(result.warnings);
        setDirty(true);
      } catch (err: any) {
        setError(`Ошибка импорта: ${err.message ?? err}`);
      }
    },
    [plan]
  );

  const handleSave = useCallback(async () => {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
      if (!res.ok) throw new Error(`Сервер вернул ${res.status}`);
      setDirty(false);
    } catch (err: any) {
      setError(`Не удалось сохранить: ${err.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }, [plan]);

  const panelEpic: Epic | null =
    panelTarget && panelTarget !== 'new' ? plan?.epics.find((e) => e.id === panelTarget) ?? null : null;

  const visibleEpics: Epic[] = plan?.epics.filter((e) => teamFilter === 'ALL' || e.teams.includes(teamFilter)) ?? [];

  const load = useMemo(() => (plan ? computeLoad(plan) : null), [plan]);
  const cutoffIndex = plan ? (hidePast ? currentQuarterCutoffIndex(plan.sprints) : 0) : 0;
  const currentSprint = plan ? currentSprintIndex(plan.sprints) : -1;
  const visibleSprints = plan ? plan.sprints.slice(cutoffIndex) : [];

  function handleSaveEpic(epic: Epic) {
    updatePlan((p) => {
      const exists = p.epics.some((e) => e.id === epic.id);
      return { ...p, epics: exists ? p.epics.map((e) => (e.id === epic.id ? epic : e)) : [...p.epics, epic] };
    });
    setPanelTarget(null);
  }

  function handleDeleteEpic() {
    if (!panelEpic) return;
    if (!window.confirm(`Удалить фичу "${panelEpic.title}" вместе со всеми колбасками?`)) return;
    const index = plan?.epics.findIndex((e) => e.id === panelEpic.id) ?? -1;
    setLastDeleted({ type: 'epic', epic: panelEpic, index });
    updatePlan((p) => ({ ...p, epics: p.epics.filter((e) => e.id !== panelEpic.id) }));
    setPanelTarget(null);
  }

  function handleSegmentDeleted(epicId: string, segment: Segment) {
    setLastDeleted({ type: 'segment', epicId, segment });
  }

  function undoLastDelete() {
    if (!lastDeleted) return;
    if (lastDeleted.type === 'epic') {
      const { epic, index } = lastDeleted;
      updatePlan((p) => {
        if (p.epics.some((e) => e.id === epic.id)) return p;
        const next = [...p.epics];
        next.splice(Math.max(0, Math.min(index, next.length)), 0, epic);
        return { ...p, epics: next };
      });
    } else {
      const { epicId, segment } = lastDeleted;
      updatePlan((p) => ({
        ...p,
        epics: p.epics.map((e) =>
          e.id === epicId && !e.segments.some((s) => s.id === segment.id) ? { ...e, segments: [...e.segments, segment] } : e
        ),
      }));
    }
    setLastDeleted(null);
  }

  function applyScheduler(draftEpics: Epic[], selectedIds: Set<string>) {
    if (!plan) return;
    updatePlan((p) => ({
      ...p,
      epics: p.epics.map((e) => {
        const draftEpic = draftEpics.find((d) => d.id === e.id);
        return draftEpic && selectedIds.has(e.id) ? { ...e, segments: draftEpic.segments } : e;
      }),
    }));
    setSchedulerDraft(null);
  }

  async function handleLogout() {
    if (dirty && !window.confirm('Выйти без сохранения последних изменений?')) return;
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    setPlan(null);
    setDirty(false);
    setLastDeleted(null);
  }

  if (authLoading) {
    return <div className="auth-loading">Подготавливаем пространство…</div>;
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
          setLoading(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <a className="skip-link" href="#planner-main">
        Перейти к плану
      </a>
      <header className="toolbar" role="toolbar" aria-label="Основные действия планировщика">
        <h1>Колбаски</h1>
        <button className="btn" onClick={() => setPanelTarget('new')} disabled={!plan}>
          + Фича
        </button>

        <div className="toolbar-sep" />

        <div className="zoom-group" role="group" aria-label="Представление плана">
          {(['detailed', 'management'] as ViewMode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? 'active' : ''}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m === 'detailed' ? 'По ролям' : 'Сводно'}
            </button>
          ))}
        </div>

        {plan && plan.teams.length > 1 && (
          <select
            className="team-filter"
            value={teamFilter}
            aria-label="Фильтр по команде"
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="ALL">Все команды</option>
            {plan.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <div className="toolbar-sep" />
        <button
          className="btn"
          onClick={() => setSchedulerDraft({ mode: 'comfortable', snapshot: runScheduler(plan!, 'comfortable') })}
          disabled={!plan}
          title="Перепланировать будущие сегменты без перегрузок"
        >
          Комфортно
        </button>
        <button
          className="btn"
          onClick={() => setSchedulerDraft({ mode: 'emergency', snapshot: runScheduler(plan!, 'emergency') })}
          disabled={!plan}
          title="Перепланировать в максимально сжатые сроки (перегруз допускается)"
        >
          Экстренно
        </button>

        <div className="spacer" />

        {lastDeleted && (
          <button className="btn undo-btn" onClick={undoLastDelete} title="Вернуть последнее удалённое">
            ↺ Вернуть «{lastDeleted.type === 'epic' ? lastDeleted.epic.title : lastDeleted.segment.label || 'колбаску'}»
          </button>
        )}
        {error && <span className="status-line error" role="status">{error}</span>}
        <button
          className={`btn${dirty ? ' primary' : ' saved'}`}
          onClick={handleSave}
          disabled={!plan || saving || !dirty}
          title={dirty ? 'Есть несохранённые изменения' : 'Всё сохранено'}
        >
          {saving ? 'Сохранение…' : dirty ? 'Сохранить' : '✓ Сохранено'}
        </button>
        <button
          ref={teamsButtonRef}
          className={`btn${showTeams ? ' active' : ''}`}
          onClick={() => setShowTeams((v) => !v)}
          disabled={!plan}
          aria-expanded={showTeams}
          aria-controls="teams-panel"
        >
          Команды и ресурсы
        </button>
        <SettingsMenu
          zoom={zoom}
          onZoom={setZoom}
          hidePast={hidePast}
          onHidePast={setHidePast}
          theme={theme}
          onTheme={setTheme}
          bgPattern={bgPattern}
          onBgPattern={setBgPattern}
          onImport={() => fileInputRef.current?.click()}
          pipeline={plan?.settings.pipeline}
          roles={plan?.roles ?? []}
          onPipeline={(p) => updatePlan((pl) => ({ ...pl, settings: { ...pl.settings, pipeline: p } }))}
        />
        <div className="account-menu" title={`Вы вошли как ${user.username}`}>
          <span className="account-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <span className="account-name">{user.username}</span>
          <button className="account-logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" style={{ display: 'none' }} onChange={handleFileChange} />
      </header>

      {warnings.length > 0 && (
        <aside className="warnings-panel" aria-label="Предупреждения импорта">
          <strong>Предупреждения импорта ({warnings.length}):</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </aside>
      )}

      <main id="planner-main" className="main-area" tabIndex={-1}>
        <section className="center-column" aria-label="Рабочая область плана">
          {loading && <div className="empty-state">Загрузка…</div>}
          {!loading && error && !plan && <div className="empty-state">{error}</div>}
          {!loading && plan && plan.epics.length === 0 && (
            <div className="empty-state">Фич пока нет. Нажмите «+ Фича» или импортируйте план из Excel (⚙).</div>
          )}
          {!loading && plan && plan.epics.length > 0 && visibleEpics.length === 0 && (
            <div className="empty-state">У этой команды пока нет фич.</div>
          )}
          {!loading && plan && load && visibleEpics.length > 0 && (
            <Grid
              plan={plan}
              visibleEpics={visibleEpics}
              teamFilter={teamFilter}
              colWidth={ZOOM_WIDTH[zoom]}
              mode={mode}
              cutoffIndex={cutoffIndex}
              currentSprint={currentSprint}
              load={load}
              highlight={highlight}
              scrollRef={gridScrollRef}
              onHScroll={(x) => {
                if (loadScrollRef.current) loadScrollRef.current.scrollLeft = x;
              }}
              updatePlan={updatePlan}
              onEditEpic={setPanelTarget}
              onSegmentDeleted={handleSegmentDeleted}
            />
          )}

          {!loading && plan && load && (
            <LoadPanel
              plan={plan}
              load={load}
              visibleSprints={visibleSprints}
              colWidth={ZOOM_WIDTH[zoom]}
              currentSprint={currentSprint}
              scrollRef={loadScrollRef}
              highlight={highlight}
              onHighlight={setHighlight}
            />
          )}
        </section>

        {showTeams && plan && (
          <TeamsPanel
            plan={plan}
            updatePlan={updatePlan}
            cutoffIndex={cutoffIndex}
            currentSprint={currentSprint}
            onClose={() => {
              setShowTeams(false);
              requestAnimationFrame(() => teamsButtonRef.current?.focus());
            }}
          />
        )}

        {panelTarget && plan && (
          <EpicFormPanel
            key={panelTarget}
            epic={panelTarget === 'new' ? null : panelEpic}
            teams={plan.teams}
            roles={plan.roles}
            sprints={plan.sprints}
            defaultTeamIds={teamFilter === 'ALL' ? plan.teams.slice(0, 1).map((t) => t.id) : [teamFilter]}
            onSave={handleSaveEpic}
            onDelete={panelTarget !== 'new' ? handleDeleteEpic : undefined}
            onClose={() => setPanelTarget(null)}
          />
        )}
      </main>

      {schedulerDraft && plan && (
        <SchedulerCompare
          plan={plan}
          mode={schedulerDraft.mode}
          snapshot={schedulerDraft.snapshot}
          viewMode={mode}
          colWidth={ZOOM_WIDTH[zoom]}
          cutoffIndex={cutoffIndex}
          currentSprint={currentSprint}
          teamFilter={teamFilter}
          onApply={applyScheduler}
          onDiscard={() => setSchedulerDraft(null)}
        />
      )}
    </div>
  );
}
