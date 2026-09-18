import type { CSSProperties } from 'react';
import type { Segment } from '../types';
import { contrastTextColor, hexToRgba } from '../lib/color';
import type { LoadStatus } from '../lib/load';

interface Props {
  segment: Segment;
  roleLabel: string;
  roleColor: string;
  colWidth: number;
  from: number; // отображаемая позиция (может отличаться от segment.from во время перетаскивания)
  to: number;
  status: LoadStatus | null;
  spotlight: boolean;
  isDragging: boolean;
  dragOffsetX: number | null;
  onBodyPointerDown: (e: React.PointerEvent) => void;
  onLeftHandlePointerDown: (e: React.PointerEvent) => void;
  onRightHandlePointerDown: (e: React.PointerEvent) => void;
  onEdit: (x: number, y: number) => void;
}

const GAP = 3;
const HANDLE_W = 7;

export default function SegmentBar({
  segment,
  roleLabel,
  roleColor,
  colWidth,
  from,
  to,
  status,
  spotlight,
  isDragging,
  dragOffsetX,
  onBodyPointerDown,
  onLeftHandlePointerDown,
  onRightHandlePointerDown,
  onEdit,
}: Props) {
  const bg = segment.color ?? roleColor;
  const left = from * colWidth + GAP;
  const width = (to - from + 1) * colWidth - GAP * 2;
  const noteCount = segment.notes ? Object.keys(segment.notes).length : 0;

  const classes = ['segment-bar'];
  if (segment.flag === 'risk') classes.push('risk');
  if (status) classes.push(`overlap-${status}`);
  if (spotlight) classes.push('spotlight');
  if (isDragging) classes.push('dragging');

  return (
    <div
      className={classes.join(' ')}
      style={{
        left,
        width,
        ['--segment-color' as string]: bg,
        ['--segment-glow' as string]: hexToRgba(bg, 0.42),
        color: contrastTextColor(bg),
        transform: dragOffsetX === null ? undefined : `translateX(${dragOffsetX}px) translateY(-3px) scale(1.01)`,
        transition: dragOffsetX === null ? undefined : 'none',
      } as CSSProperties}
      title={segment.label || undefined}
      role="button"
      tabIndex={0}
      aria-label={`Колбаска «${segment.label || 'без названия'}», роль ${roleLabel}. Enter — открыть настройки`}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onEdit(rect.left + rect.width / 2, rect.bottom + 6);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div
        className="seg-handle seg-handle-left"
        style={{ width: HANDLE_W }}
        onPointerDown={onLeftHandlePointerDown}
      />
      <div className="seg-body" onPointerDown={onBodyPointerDown}>
        <span className="seg-label">{segment.label}</span>
        {noteCount > 0 && <span className="seg-note-dot" title={`Комментариев: ${noteCount}`} />}
      </div>
      <div
        className="seg-handle seg-handle-right"
        style={{ width: HANDLE_W }}
        onPointerDown={onRightHandlePointerDown}
      />
    </div>
  );
}
