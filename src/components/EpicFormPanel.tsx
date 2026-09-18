import { useState } from 'react';
import type { Epic, EpicStatus, EffectKind, Pipeline, RoleDef, Sprint, Team, TeamId } from '../types';
import PipelineEditor from './PipelineEditor';
import { defaultPipeline } from '../lib/scheduler';

interface Props {
  epic: Epic | null; // null = создание новой фичи
  teams: Team[];
  roles: RoleDef[];
  sprints: Sprint[];
  defaultTeamIds: TeamId[];
  onSave: (epic: Epic) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function sprintDateHint(sprints: Sprint[], index: number): string {
  const s = sprints[index];
  if (!s) return '';
  const [, m, d] = s.dateFrom.split('-');
  return `${d}.${m}`;
}

const STATUSES: EpicStatus[] = ['бэклог', 'дискавери', 'разработка', 'тест', 'раскатка', 'готово', 'перенесён'];
const EFFECT_KINDS: EffectKind[] = ['Балансы', 'Сборы', 'Экономия'];

function makeId() {
  return `epic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EpicFormPanel({ epic, teams, roles, sprints, defaultTeamIds, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(epic?.title ?? '');
  const [teamIds, setTeamIds] = useState<TeamId[]>(epic?.teams ?? defaultTeamIds);
  const [status, setStatus] = useState<EpicStatus>(epic?.status ?? 'бэклог');
  const [effectYear, setEffectYear] = useState(epic?.effectYear?.toString() ?? '');
  const [effect2026, setEffect2026] = useState(epic?.effect2026?.toString() ?? '');
  const [effectKind, setEffectKind] = useState<EffectKind>(epic?.effectKind ?? null);
  const [notes, setNotes] = useState(epic?.notes ?? '');
  const [plannedFrom, setPlannedFrom] = useState(epic?.plannedFrom?.toString() ?? '');
  const [plannedTo, setPlannedTo] = useState(epic?.plannedTo?.toString() ?? '');
  const [override, setOverride] = useState<Pipeline | null>(epic?.pipelineOverride ?? null);

  const isNew = epic === null;
  const maxSprintIndex = Math.max(0, sprints.length - 1);

  function handleSave() {
    if (!title.trim()) return;
    const fromRaw = plannedFrom.trim() ? Number(plannedFrom) : NaN;
    const toRaw = plannedTo.trim() ? Number(plannedTo) : NaN;
    const hasPlan = Number.isFinite(fromRaw) && Number.isFinite(toRaw);
    const from = hasPlan ? Math.max(0, Math.min(maxSprintIndex, fromRaw)) : undefined;
    const to = hasPlan ? Math.max(0, Math.min(maxSprintIndex, toRaw)) : undefined;
    const result: Epic = {
      ...epic,
      id: epic?.id ?? makeId(),
      title: title.trim(),
      teams: teams.map((t) => t.id).filter((id) => teamIds.includes(id)),
      enabled: epic?.enabled ?? true,
      status,
      effectYear: effectYear.trim() ? Number(effectYear) : null,
      effect2026: effect2026.trim() ? Number(effect2026) : null,
      effectKind,
      needsKb: epic?.needsKb ?? false,
      notes,
      links: epic?.links ?? [],
      segments: epic?.segments ?? [],
      plannedFrom: from !== undefined && to !== undefined ? Math.min(from, to) : undefined,
      plannedTo: from !== undefined && to !== undefined ? Math.max(from, to) : undefined,
      pipelineOverride: override,
    };
    onSave(result);
  }

  return (
    <div className="side-panel" role="dialog" aria-modal="false" aria-labelledby="epic-panel-title">
      <div className="side-panel-header">
        <h2 id="epic-panel-title">{isNew ? 'Новая фича' : 'Фича'}</h2>
        <button className="btn small" onClick={onClose} aria-label="Закрыть редактор фичи">
          ✕
        </button>
      </div>
      <div className="side-panel-body">
        <label>
          Название
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: JHD. Витрина…" autoFocus />
        </label>
        <div className="field-group">
          <span className="field-label">Команды</span>
          <div className="team-checks">
            {teams.map((t) => (
              <label key={t.id} className={`team-check${teamIds.includes(t.id) ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={teamIds.includes(t.id)}
                  onChange={(e) =>
                    setTeamIds((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                  }
                />
                {t.name}
              </label>
            ))}
          </div>
        </div>
        <label>
          Статус
          <select value={status} onChange={(e) => setStatus(e.target.value as EpicStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label>
            Эффект в год, ₽
            <input value={effectYear} onChange={(e) => setEffectYear(e.target.value)} placeholder="0" inputMode="numeric" />
          </label>
          <label>
            Эффект в этом году, ₽
            <input value={effect2026} onChange={(e) => setEffect2026(e.target.value)} placeholder="0" inputMode="numeric" />
          </label>
        </div>
        <label>
          Вид эффекта
          <select
            value={effectKind ?? ''}
            onChange={(e) => setEffectKind((e.target.value || null) as EffectKind)}
          >
            <option value="">—</option>
            {EFFECT_KINDS.map((k) => (
              <option key={k} value={k ?? ''}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Заметки
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <div className="field-group">
          <span className="field-label">Плановый срок всей задачи</span>
          <p className="hint">
            Серый контур на фоне колбасок: когда задача должна начаться и закончиться по плану. Из Excel
            подтягивается серой заливкой автоматически; здесь можно поправить руками.
          </p>
          <div className="planned-row">
            <label className="planned-sprint-field">
              <span className="planned-sprint-caption">Начало</span>
              <input
                type="number"
                min={0}
                max={maxSprintIndex}
                value={plannedFrom}
                aria-label="Спринт начала по плану"
                onChange={(e) => setPlannedFrom(e.target.value)}
              />
              <span className="planned-sprint-date">{plannedFrom.trim() ? sprintDateHint(sprints, Number(plannedFrom)) : ''}</span>
            </label>
            <span aria-hidden="true">—</span>
            <label className="planned-sprint-field">
              <span className="planned-sprint-caption">Конец</span>
              <input
                type="number"
                min={0}
                max={maxSprintIndex}
                value={plannedTo}
                aria-label="Спринт конца по плану"
                onChange={(e) => setPlannedTo(e.target.value)}
              />
              <span className="planned-sprint-date">{plannedTo.trim() ? sprintDateHint(sprints, Number(plannedTo)) : ''}</span>
            </label>
          </div>
        </div>

        {!isNew && (
          <p className="hint">
            Двойной клик по пустой строке добавляет колбаску. Клик по колбаске открывает её настройки;
            перетаскивание и края меняют срок.
          </p>
        )}

        <div className="field-group">
          <span className="field-label">Свой пайплайн для фичи</span>
          <button
            type="button"
            className="btn small"
            onClick={() => setOverride((prev) => (prev ? null : defaultPipeline()))}
          >
            {override ? 'Использовать общий' : 'Задать свой пайплайн'}
          </button>
          {override !== null && <PipelineEditor pipeline={override} roles={roles} onChange={setOverride} />}
        </div>
      </div>
      <div className="side-panel-footer">
        {!isNew && onDelete && (
          <button className="btn danger" onClick={onDelete}>
            Удалить фичу
          </button>
        )}
        <div className="spacer" />
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary" onClick={handleSave} disabled={!title.trim()}>
          Сохранить
        </button>
      </div>
    </div>
  );
}
