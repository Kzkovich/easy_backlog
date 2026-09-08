import type { Epic, Segment } from '../types';

// Вспомогательные функции для перетаскивания/растягивания колбасок мышью.
// Пересечения с другими эпиками разрешены и специально подсвечиваются (см. overlaps.ts).
// Пересечения внутри одной роли одного эпика — запрещены (это разрыв, а не наложение).

function siblingsOfRole(epic: Epic, role: string, excludeSegId: string): Segment[] {
  return epic.segments.filter((s) => s.role === role && s.id !== excludeSegId);
}

export function clampMoveDelta(
  epic: Epic,
  seg: Segment,
  deltaSprints: number,
  maxIndex: number
): number {
  const siblings = siblingsOfRole(epic, seg.role, seg.id);
  const len = seg.to - seg.from;
  let minDelta = -seg.from;
  let maxDelta = maxIndex - seg.to;
  for (const sib of siblings) {
    if (sib.to < seg.from) {
      // сосед слева — нельзя сдвинуть новый from раньше, чем sib.to + 1
      minDelta = Math.max(minDelta, sib.to + 1 - seg.from);
    } else if (sib.from > seg.to) {
      // сосед справа — нельзя сдвинуть новый to позже, чем sib.from - 1
      maxDelta = Math.min(maxDelta, sib.from - 1 - seg.to);
    }
  }
  return Math.max(minDelta, Math.min(maxDelta, deltaSprints));
}

export function clampResizeLeft(epic: Epic, seg: Segment, proposedFrom: number): number {
  const siblings = siblingsOfRole(epic, seg.role, seg.id);
  let min = 0;
  for (const sib of siblings) {
    if (sib.to < seg.from) min = Math.max(min, sib.to + 1);
  }
  const max = seg.to; // минимум 1 спринт длиной
  return Math.max(min, Math.min(max, proposedFrom));
}

export function clampResizeRight(epic: Epic, seg: Segment, proposedTo: number, maxIndex: number): number {
  const siblings = siblingsOfRole(epic, seg.role, seg.id);
  let max = maxIndex;
  for (const sib of siblings) {
    if (sib.from > seg.to) max = Math.min(max, sib.from - 1);
  }
  const min = seg.from;
  return Math.max(min, Math.min(max, proposedTo));
}

export function clampEpicMoveDelta(epic: Epic, deltaSprints: number, maxIndex: number): number {
  if (epic.segments.length === 0) return 0;
  let minDelta = -Infinity;
  let maxDelta = Infinity;
  for (const s of epic.segments) {
    minDelta = Math.max(minDelta, -s.from);
    maxDelta = Math.min(maxDelta, maxIndex - s.to);
  }
  return Math.max(minDelta, Math.min(maxDelta, deltaSprints));
}

export function segmentOverlapsRoleInEpic(epic: Epic, role: string, from: number, to: number, excludeId?: string): boolean {
  return epic.segments.some(
    (s) => s.role === role && s.id !== excludeId && from <= s.to && to >= s.from
  );
}
