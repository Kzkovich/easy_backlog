import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  mergeLeft: boolean;
  mergeRight: boolean;
  status: LoadStatus | null;
  spotlight: boolean;
  isDragging: boolean;
  dragOffsetX: number | null;
  cutoffIndex: number;
  overflowLeft: number;
  overflowRight: number;
  onBodyPointerDown: (e: React.PointerEvent) => void;
  onLeftHandlePointerDown: (e: React.PointerEvent) => void;
  onRightHandlePointerDown: (e: React.PointerEvent) => void;
  onEdit: (x: number, y: number) => void;
  onEditNote: (sprintIndex: number, x: number, y: number) => void;
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
  mergeLeft,
  mergeRight,
  status,
  spotlight,
  isDragging,
  dragOffsetX,
  cutoffIndex,
  overflowLeft,
  overflowRight,
  onBodyPointerDown,
  onLeftHandlePointerDown,
  onRightHandlePointerDown,
  onEdit,
  onEditNote,
}: Props) {
  const bg = segment.color ?? roleColor;
  const left = from * colWidth + (mergeLeft ? 0 : GAP);
  const width = (to - from + 1) * colWidth - (mergeLeft ? 0 : GAP) - (mergeRight ? 0 : GAP);

  const noteMarkers = useMemo(() => {
    if (!segment.notes) return [];
    return Object.entries(segment.notes)
      .map(([key, text]) => ({ sprintIndex: Number(key), text }))
      .filter((n) => Number.isInteger(n.sprintIndex) && typeof n.text === 'string' && n.text.trim().length > 0)
      .filter((n) => n.sprintIndex - cutoffIndex >= from && n.sprintIndex - cutoffIndex <= to);
  }, [segment.notes, cutoffIndex, from, to]);

  const [justMerged, setJustMerged] = useState(false);
  const prevMergeRef = useRef({ left: mergeLeft, right: mergeRight });
  useEffect(() => {
    const prev = prevMergeRef.current;
    if ((mergeLeft && !prev.left) || (mergeRight && !prev.right)) {
      setJustMerged(true);
      const timer = window.setTimeout(() => setJustMerged(false), 420);
      prevMergeRef.current = { left: mergeLeft, right: mergeRight };
      return () => window.clearTimeout(timer);
    }
    prevMergeRef.current = { left: mergeLeft, right: mergeRight };
  }, [mergeLeft, mergeRight]);

  const classes = ['segment-bar'];
  if (segment.flag === 'risk') classes.push('risk');
  if (status) classes.push(`overlap-${status}`);
  if (spotlight) classes.push('spotlight');
  if (isDragging) classes.push('dragging');
  if (mergeLeft) classes.push('merge-left');
  if (mergeRight) classes.push('merge-right');
  if (justMerged) classes.push('just-merged');

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
      </div>
      <div
        className="seg-handle seg-handle-right"
        style={{ width: HANDLE_W }}
        onPointerDown={onRightHandlePointerDown}
      />
      {overflowLeft > 0 && (
        <span className="seg-overflow seg-overflow-left" style={{ width: overflowLeft }} aria-hidden="true" />
      )}
      {overflowRight > 0 && (
        <span className="seg-overflow seg-overflow-right" style={{ width: overflowRight }} aria-hidden="true" />
      )}
      {noteMarkers.map((n) => (
        <button
          key={n.sprintIndex}
          type="button"
          className="seg-note-marker"
          style={{ left: (n.sprintIndex - cutoffIndex - from + 0.5) * colWidth }}
          title={n.text}
          aria-label={`Заметка к спринту: ${n.text}`}
          onClick={(event) => {
            event.stopPropagation();
            onEditNote(n.sprintIndex, event.clientX, event.clientY);
          }}
        >
          <span aria-hidden="true">❝</span>
        </button>
      ))}
    </div>
  );
}
