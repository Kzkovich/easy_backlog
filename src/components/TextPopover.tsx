import { useEffect, useRef, useState } from 'react';

interface Props {
  x: number;
  y: number;
  title: string;
  initialText: string;
  onSave: (text: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function TextPopover({ x, y, title, initialText, onSave, onDelete, onClose }: Props) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        onSave(text);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [text, onClose, onSave]);

  const vw = window.innerWidth;
  const left = Math.min(x, vw - 280);

  return (
    <div className="text-popover" ref={ref} style={{ left, top: y }}>
      <div className="text-popover-title">{title}</div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Текст…"
      />
      <div className="text-popover-actions">
        {onDelete && (
          <button
            className="btn danger small"
            onClick={() => {
              onDelete();
            }}
          >
            Удалить колбаску
          </button>
        )}
        <div className="spacer" />
        <button className="btn small" onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary small" onClick={() => onSave(text)}>
          Сохранить
        </button>
      </div>
    </div>
  );
}
