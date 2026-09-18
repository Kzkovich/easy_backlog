import { useEffect, useRef, useState } from 'react';

export type ZoomLevel = 'compact' | 'normal' | 'large';
export type Theme = 'light' | 'ceramic' | 'dark' | 'auto';
export type BgPattern = 'dots' | 'squares';

interface Props {
  zoom: ZoomLevel;
  onZoom: (z: ZoomLevel) => void;
  hidePast: boolean;
  onHidePast: (v: boolean) => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  bgPattern: BgPattern;
  onBgPattern: (p: BgPattern) => void;
  onImport: () => void;
}

interface SegProps<T extends string> {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}

function Seg<T extends string>({ value, options, onChange }: SegProps<T>) {
  return (
    <div className="zoom-group">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsMenu({ zoom, onZoom, hidePast, onHidePast, theme, onTheme, bgPattern, onBgPattern, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings-menu" ref={ref}>
      <button className={`btn icon${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)} title="Вид и настройки">
        ⚙
      </button>
      {open && (
        <div className="settings-dropdown">
          <div className="settings-row">
            <span className="settings-label">Масштаб</span>
            <Seg
              value={zoom}
              onChange={onZoom}
              options={[
                ['compact', 'мелко'],
                ['normal', 'обычно'],
                ['large', 'крупно'],
              ]}
            />
          </div>
          <div className="settings-row">
            <span className="settings-label">Прошедшие кварталы</span>
            <Seg
              value={hidePast ? 'hide' : 'show'}
              onChange={(v) => onHidePast(v === 'hide')}
              options={[
                ['hide', 'скрыть'],
                ['show', 'показать'],
              ]}
            />
          </div>
          <div className="settings-row">
            <span className="settings-label">Тема</span>
            <Seg
              value={theme}
              onChange={onTheme}
              options={[
                ['light', '☼ светлая'],
                ['ceramic', '✦ керамика'],
                ['dark', '☾ тёмная'],
                ['auto', 'как в системе'],
              ]}
            />
          </div>
          <div className="settings-row">
            <span className="settings-label">Фон сетки</span>
            <Seg
              value={bgPattern}
              onChange={onBgPattern}
              options={[
                ['dots', 'точки'],
                ['squares', 'клетка'],
              ]}
            />
          </div>
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => {
              setOpen(false);
              onImport();
            }}
          >
            Импорт из Excel…
          </button>
        </div>
      )}
    </div>
  );
}
