import type { Epic, Segment } from '../types';

export function segmentLength(seg: Segment): number {
  return seg.to - seg.from + 1;
}

// Суммарная длительность колбаски роли — сумма всех отрезков, разрывы не считаем.
export function roleDurationSprints(segments: Segment[]): number {
  return segments.reduce((acc, s) => acc + segmentLength(s), 0);
}

export interface EpicSpan {
  from: number;
  to: number;
  lengthSprints: number;
}

// Менеджерская оценка: от старта самой ранней колбаски до финиша самой поздней.
export function epicSpan(epic: Epic): EpicSpan | null {
  if (epic.segments.length === 0) return null;
  let from = Infinity;
  let to = -Infinity;
  for (const s of epic.segments) {
    if (s.from < from) from = s.from;
    if (s.to > to) to = s.to;
  }
  return { from, to, lengthSprints: to - from + 1 };
}
