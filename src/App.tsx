import { useCallback, useEffect, useRef, useState } from 'react';
import type { Epic, Plan } from './types';
import Grid from './components/Grid';
import EpicFormPanel from './components/EpicFormPanel';
import { parsePlanWorkbook } from './lib/xlsxImport';

type ZoomLevel = 'compact' | 'normal' | 'large';
const ZOOM_WIDTH: Record<ZoomLevel, number> = { compact: 64, normal: 92, large: 130 };
type ViewMode = 'detailed' | 'management';

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [zoom, setZoom] = useState<ZoomLevel>('normal');
  const [mode, setMode] = useState<ViewMode>('detailed');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [panelTarget, setPanelTarget] = useState<string | 'new' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          {(['compact', 'normal', 'large'] as ZoomLevel[]).map((z) => (
            <button key={z} className={zoom === z ? 'active' : ''} onClick={() => setZoom(z)}>
              {z === 'compact' ? 'компактно' : z === 'normal' ? 'обычно' : 'крупно'}
            </button>
          ))}
        </div>
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
        {loading && <div className="empty-state">Загрузка…</div>}
        {!loading && error && !plan && <div className="empty-state">{error}</div>}
        {!loading && plan && plan.epics.length === 0 && (
          <div className="empty-state">Эпиков пока нет. Импортируйте план из Excel или нажмите «+ Новая фича».</div>
        )}
        {!loading && plan && plan.epics.length > 0 && (
          <Grid plan={plan} colWidth={ZOOM_WIDTH[zoom]} mode={mode} updatePlan={updatePlan} onEditEpic={setPanelTarget} />
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
