import { useEffect, useRef, useState } from 'react';
import type { Pipeline, RoleDef } from '../types';
import PipelineEditor from './PipelineEditor';

export type ZoomLevel = 'compact' | 'normal';
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
  pipeline?: Pipeline;
  roles: RoleDef[];
  onPipeline: (p: Pipeline) => void;
}

interface SegProps<T extends string> {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}

function Seg<T extends string>({ value, options, onChange, label }: SegProps<T>) {
  return (
    <div className="zoom-group" role="group" aria-label={label}>
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'active' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsMenu({ zoom, onZoom, hidePast, onHidePast, theme, onTheme, bgPattern, onBgPattern, onImport, pipeline, roles, onPipeline }: Props) {
  const [open, setOpen] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
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
      <button
        className={`btn icon${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Вид и настройки"
        aria-label="Вид и настройки"
        aria-expanded={open}
      >
        ⚙
      </button>
      {open && (
        <div className="settings-dropdown">
          <div className="settings-row">
            <span className="settings-label">Масштаб</span>
            <Seg
              label="Масштаб"
              value={zoom}
              onChange={onZoom}
              options={[
                ['compact', 'Компактно'],
                ['normal', 'Стандартно'],
              ]}
            />
          </div>
          <div className="settings-row">
            <span className="settings-label">Прошедшие кварталы</span>
            <Seg
              label="Прошедшие кварталы"
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
              label="Тема"
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
            <span className="settings-label">Подложка</span>
            <Seg
              label="Подложка"
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
          <div className="settings-divider" />
          <button
            className="settings-action"
            onClick={() => setShowPipeline((v) => !v)}
            aria-expanded={showPipeline}
          >
            Пайплайн этапов…
          </button>
          {showPipeline && pipeline && (
            <PipelineEditor pipeline={pipeline} roles={roles} onChange={onPipeline} />
          )}
        </div>
      )}
    </div>
  );
}
