import { useEffect, useRef, useState } from 'react';

const COLOR_PALETTE = ['#00BFA6', '#347EC0', '#6366F1', '#8B5CF6', '#FF7A45', '#FFD23F', '#FF3860', '#2DD4FF'];

interface SegmentEditorValue {
  label: string;
  note: string;
  color: string | null;
}

interface Props {
  x: number;
  y: number;
  sprintLabel: string;
  roleColor: string;
  initialLabel: string;
  initialNote: string;
  initialColor: string | null;
  onSave: (value: SegmentEditorValue) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function SegmentEditorPopover({
  x,
  y,
  sprintLabel,
  roleColor,
  initialLabel,
  initialNote,
  initialColor,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [label, setLabel] = useState(initialLabel);
  const [note, setNote] = useState(initialNote);
  const [color, setColor] = useState<string | null>(initialColor);
  const ref = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  useEffect(
    () => () => {
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    },
    []
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        onSave({ label: label.trim(), note, color });
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [color, label, note, onClose, onSave]);

  const width = 340;
  const left = Math.max(12, Math.min(x, window.innerWidth - width - 12));
  const top = Math.max(12, Math.min(y, window.innerHeight - 390));
  const resolvedColor = color ?? roleColor;

  return (
    <div className="text-popover segment-editor-popover" ref={ref} style={{ left, top }} role="dialog" aria-label="Настройки колбаски">
      <div className="text-popover-title">
        <strong>Настройки колбаски</strong>
        <span>{sprintLabel}</span>
      </div>

      <label className="segment-editor-field">
        <span>Название</span>
        <input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Что делает эта роль" />
      </label>

      <label className="segment-editor-field">
        <span>Заметка к выбранному спринту <em>необязательно</em></span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Контекст, риск или результат" />
      </label>

      <fieldset className="segment-color-field">
        <legend>Цвет</legend>
        <div className="segment-color-row">
          {COLOR_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={`segment-color-swatch${color?.toLowerCase() === swatch.toLowerCase() ? ' active' : ''}`}
              style={{ backgroundColor: swatch }}
              aria-label={`Выбрать цвет ${swatch}`}
              aria-pressed={color?.toLowerCase() === swatch.toLowerCase()}
              onClick={() => setColor(swatch)}
            />
          ))}
          <label className="segment-color-custom" title="Свой цвет">
            <span aria-hidden="true">+</span>
            <input type="color" value={resolvedColor} aria-label="Свой цвет колбаски" onChange={(event) => setColor(event.target.value)} />
          </label>
        </div>
        <button type="button" className="segment-color-reset" disabled={color === null} onClick={() => setColor(null)}>
          Цвет роли
        </button>
      </fieldset>

      <div className="text-popover-actions">
        <button className="btn danger small" onClick={onDelete}>
          Удалить
        </button>
        <div className="spacer" />
        <button className="btn small" onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary small" onClick={() => onSave({ label: label.trim(), note, color })}>
          Сохранить
        </button>
      </div>
    </div>
  );
}
