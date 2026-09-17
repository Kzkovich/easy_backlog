import type { Segment } from '../types';
import { roleColor } from '../lib/roles';
import { contrastTextColor, hexToRgba } from '../lib/color';
import type { LoadStatus } from '../lib/load';

interface Props {
  segment: Segment;
  colWidth: number;
  from: number; // отображаемая позиция (может отличаться от segment.from во время перетаскивания)
  to: number;
  status: LoadStatus | null;
  spotlight: boolean;
  isDragging: boolean;
  onBodyPointerDown: (e: React.PointerEvent) => void;
  onLeftHandlePointerDown: (e: React.PointerEvent) => void;
  onRightHandlePointerDown: (e: React.PointerEvent) => void;
}

const GAP = 3;
const HANDLE_W = 7;

export default function SegmentBar({
  segment,
  colWidth,
  from,
  to,
  status,
  spotlight,
  isDragging,
  onBodyPointerDown,
  onLeftHandlePointerDown,
  onRightHandlePointerDown,
}: Props) {
  const bg = segment.color ?? roleColor(segment.role);
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
        background: bg,
        color: contrastTextColor(bg),
        boxShadow: `0 0 calc(9px * var(--glow-strength)) ${hexToRgba(bg, 0.65)}, 0 1px 2px rgba(0,0,0,0.15)`,
      }}
      title={segment.label || undefined}
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
