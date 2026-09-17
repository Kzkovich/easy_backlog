import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Epic, Plan } from './types';
import Grid from './components/Grid';
import EpicFormPanel from './components/EpicFormPanel';
import TeamsPanel from './components/TeamsPanel';
import LoadPanel, { type LoadHighlight } from './components/LoadPanel';
import { parsePlanWorkbook } from './lib/xlsxImport';
import { computeLoad } from './lib/load';
import { currentQuarterCutoffIndex, currentSprintIndex } from './lib/calendar';

type ZoomLevel = 'compact' | 'normal' | 'large';
const ZOOM_WIDTH: Record<ZoomLevel, number> = { compact: 64, normal: 92, large: 130 };
type ViewMode = 'detailed' | 'management';
type TeamFilter = 'ALL' | 'AMCLCT' | 'JHD';
type Theme = 'light' | 'dark' | 'auto';

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zoom, setZoom] = useState<ZoomLevel>('normal');
  const [mode, setMode] = useState<ViewMode>('detailed');
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('ALL');
  const [hidePast, setHidePast] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('kolbaski-theme') as Theme) || 'light');
  const [showLoad, setShowLoad] = useState(true);
  const [showTeams, setShowTeams] = useState(false);
  const [highlight, setHighlight] = useState<LoadHighlight | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [panelTarget, setPanelTarget] = useState<string | 'new' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const loadScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('kolbaski-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch('/api/plan')
      .then((r) => {
        if (!r.ok) throw new Error(`Сервер вернул ${r.status}`);
        return r.json();
      })
      .then((data: Plan) => {
        setPlan(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(`Не удалось загрузить data/plan.json: ${e.message}. Запущен ли мини-сервер (npm run dev)?`);
        setLoading(false);
      });
  }, []);

  const updatePlan = useCallback((fn: (p: Plan) => Plan) => {
    setPlan((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }, []);

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !plan) return;
      if (
        !window.confirm(
          `Импортировать "${file.name}"? Текущий список эпиков (${plan.epics.length}) будет заменён импортированными данными. Это можно отменить только вручную, восстановив предыдущий data/plan.json из data/backups.`
        )
      ) {
        return;
      }
      try {
        const buf = await file.arrayBuffer();
        const result = parsePlanWorkbook(buf, plan.sprints);
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

  const visibleEpics: Epic[] =
    plan?.epics.filter((e) => teamFilter === 'ALL' || e.team === teamFilter || e.team === 'BOTH') ?? [];

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
    updatePlan((p) => ({ ...p, epics: p.epics.filter((e) => e.id !== panelEpic.id) }));
    setPanelTarget(null);
  }

  const themeLabel = theme === 'light' ? '☼' : theme === 'dark' ? '☾' : '◐';

  return (
    <div className="app">
      <div className="toolbar">
        <h1>Колбаски</h1>
        <button className="btn" onClick={handleImportClick}>
          Импорт из Excel
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xlsm" style={{ display: 'none' }} onChange={handleFileChange} />
        <button className="btn" onClick={() => setPanelTarget('new')} disabled={!plan}>
          + Новая фича
        </button>
        <button className="btn primary" onClick={handleSave} disabled={!plan || saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <div className="zoom-group">
          {(['detailed', 'management'] as ViewMode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
              {m === 'detailed' ? 'подробно' : 'для менеджмента'}
            </button>
          ))}
        </div>
        <div className="zoom-group">
          {(['ALL', 'AMCLCT', 'JHD'] as TeamFilter[]).map((t) => (
            <button key={t} className={teamFilter === t ? 'active' : ''} onClick={() => setTeamFilter(t)}>
              {t === 'ALL' ? 'все команды' : t === 'AMCLCT' ? 'AM Collection' : 'Johnny Debt'}
            </button>
          ))}
        </div>
        <div className="zoom-group">
          {(['compact', 'normal', 'large'] as ZoomLevel[]).map((z) => (
            <button key={z} className={zoom === z ? 'active' : ''} onClick={() => setZoom(z)}>
              {z === 'compact' ? 'компактно' : z === 'normal' ? 'обычно' : 'крупно'}
            </button>
          ))}
        </div>
        <button className={`btn${hidePast ? ' active' : ''}`} onClick={() => setHidePast((v) => !v)}>
          {hidePast ? 'прошедшие скрыты' : 'показать прошедшие'}
        </button>
        <button className={`btn${showTeams ? ' active' : ''}`} onClick={() => setShowTeams((v) => !v)} disabled={!plan}>
          Команды
        </button>
        <button className={`btn${showLoad ? ' active' : ''}`} onClick={() => setShowLoad((v) => !v)}>
          Загрузка
        </button>
        <button
          className="btn icon"
          title={`Тема: ${theme === 'light' ? 'светлая' : theme === 'dark' ? 'тёмная' : 'системная'}`}
          onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light')}
        >
          {themeLabel}
        </button>
        <div className="spacer" />
        <span className={`status-line${error ? ' error' : ''}`}>
          {error ?? (dirty ? 'есть несохранённые изменения' : plan ? 'сохранено' : '')}
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="warnings-panel">
          <strong>Предупреждения импорта ({warnings.length}):</strong>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="main-area">
        <div className="center-column">
          {loading && <div className="empty-state">Загрузка…</div>}
          {!loading && error && !plan && <div className="empty-state">{error}</div>}
          {!loading && plan && plan.epics.length === 0 && (
            <div className="empty-state">Эпиков пока нет. Импортируйте план из Excel или нажмите «+ Новая фича».</div>
          )}
          {!loading && plan && plan.epics.length > 0 && visibleEpics.length === 0 && (
            <div className="empty-state">Нет фич для выбранной команды.</div>
          )}
          {!loading && plan && load && visibleEpics.length > 0 && (
            <Grid
              plan={plan}
              visibleEpics={visibleEpics}
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
            />
          )}

          {!loading && plan && load && showLoad && (
            <LoadPanel
              plan={plan}
              load={load}
              visibleSprints={visibleSprints}
              colWidth={ZOOM_WIDTH[zoom]}
              currentSprint={currentSprint}
              scrollRef={loadScrollRef}
              highlight={highlight}
              onHighlight={setHighlight}
              onOpenTeams={() => setShowTeams(true)}
              onClose={() => setShowLoad(false)}
            />
          )}
        </div>

        {showTeams && plan && (
          <TeamsPanel plan={plan} updatePlan={updatePlan} cutoffIndex={cutoffIndex} onClose={() => setShowTeams(false)} />
        )}

        {panelTarget && (
          <EpicFormPanel
            epic={panelTarget === 'new' ? null : panelEpic}
            onSave={handleSaveEpic}
            onDelete={panelTarget !== 'new' ? handleDeleteEpic : undefined}
            onClose={() => setPanelTarget(null)}
          />
        )}
      </div>
    </div>
  );
}
