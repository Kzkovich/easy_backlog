import { useState } from 'react';
import type { Epic, EpicStatus, EpicTeam, EffectKind } from '../types';

interface Props {
  epic: Epic | null; // null = создание новой фичи
  onSave: (epic: Epic) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const STATUSES: EpicStatus[] = ['бэклог', 'дискавери', 'разработка', 'тест', 'раскатка', 'готово', 'перенесён'];
const EFFECT_KINDS: EffectKind[] = ['Балансы', 'Сборы', 'Экономия'];

function makeId() {
  return `epic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function EpicFormPanel({ epic, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(epic?.title ?? '');
  const [team, setTeam] = useState<EpicTeam>(epic?.team ?? 'AMCLCT');
  const [status, setStatus] = useState<EpicStatus>(epic?.status ?? 'бэклог');
  const [effectYear, setEffectYear] = useState(epic?.effectYear?.toString() ?? '');
  const [effect2026, setEffect2026] = useState(epic?.effect2026?.toString() ?? '');
  const [effectKind, setEffectKind] = useState<EffectKind>(epic?.effectKind ?? null);
  const [needsKb, setNeedsKb] = useState(epic?.needsKb ?? false);
  const [notes, setNotes] = useState(epic?.notes ?? '');

  const isNew = epic === null;

  function handleSave() {
    if (!title.trim()) return;
    const result: Epic = {
      id: epic?.id ?? makeId(),
      title: title.trim(),
      team,
      enabled: epic?.enabled ?? true,
      status,
      effectYear: effectYear.trim() ? Number(effectYear) : null,
      effect2026: effect2026.trim() ? Number(effect2026) : null,
      effectKind,
      needsKb,
      notes,
      links: epic?.links ?? [],
      segments: epic?.segments ?? [],
    };
    onSave(result);
  }

  return (
    <div className="side-panel">
      <div className="side-panel-header">
        <h2>{isNew ? 'Новая фича' : 'Фича'}</h2>
        <button className="btn small" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="side-panel-body">
        <label>
          Название
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: JHD. Витрина…" autoFocus />
        </label>
        <label>
          Команда
          <select value={team} onChange={(e) => setTeam(e.target.value as EpicTeam)}>
            <option value="AMCLCT">AM Collection</option>
            <option value="JHD">Johnny Debt</option>
            <option value="BOTH">Обе команды</option>
          </select>
        </label>
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
        <label className="checkbox-row">
          <input type="checkbox" checked={needsKb} onChange={(e) => setNeedsKb(e.target.checked)} />
          Нужна статья в Базу Знаний
        </label>
        <label>
          Заметки
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        {!isNew && (
          <p className="hint">
            Колбаски добавляются двойным кликом по пустой ячейке в строке роли прямо в сетке, двигаются и
            растягиваются мышью.
          </p>
        )}
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
