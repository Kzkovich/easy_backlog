import { useEffect, useMemo, useRef, useState } from 'react';
import type { Epic, EpicStatus, Plan, RoleId, Segment } from '../types';
import type { RoleDef } from '../types';
import { roleColor as roleColorOf } from '../lib/roles';
import { loadKey, scopesForEpicRole, type LoadResult, type LoadStatus } from '../lib/load';
import { epicSpan, roleDurationSprints } from '../lib/duration';
import { clampMoveDelta, clampResizeLeft, clampResizeRight, clampEpicMoveDelta, segmentOverlapsRoleInEpic } from '../lib/dnd';
import { sprintNumbersLabel, teamsBadge } from '../lib/teams';
import type { LoadHighlight } from './LoadPanel';
import SegmentBar from './SegmentBar';
import SegmentEditorPopover from './SegmentEditorPopover';

interface Props {
  plan: Plan;
  visibleEpics: Epic[];
  teamFilter: string; // 'ALL' или id команды
  colWidth: number;
  mode: 'detailed' | 'management';
  cutoffIndex: number;
  currentSprint: number;
  load: LoadResult;
  highlight: LoadHighlight | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  onHScroll: (x: number) => void;
  updatePlan: (fn: (p: Plan) => Plan) => void;
  onEditEpic: (epicId: string) => void;
  onSegmentDeleted: (epicId: string, segment: Segment) => void;
}

type LivePreview =
  | { type: 'segment'; segmentId: string; from: number; to: number }
  | { type: 'epic'; epicId: string; deltaSprints: number }
  | null;

type PopoverState = { epicId: string; segmentId: string; sprintIndex: number; x: number; y: number } | null;

type ReorderState = { draggedId: string; targetId: string } | null;
type RoleMenuState = { epicId: string; x: number; y: number } | null;
type EpicDragMotion = { epicId: string; offsetPx: number } | null;
type PointerSession = { cleanup: () => void; cancel: () => void };

const CLICK_MOVE_THRESHOLD = 4;
const LABEL_WIDTH = 260; // держим в синхроне с --label-width в styles.css

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function formatMoney(v: number | null): string {
  if (v == null) return '—';
  return (v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽';
}

const STATUS_LABELS: Record<EpicStatus, string> = {
  бэклог: 'В бэклоге',
  дискавери: 'Исследование',
  разработка: 'В разработке',
  тест: 'Тестирование',
  раскатка: 'Запуск',
  готово: 'Готово',
  перенесён: 'Перенесено',
};

function sprintWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'спринт';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'спринта';
  return 'спринтов';
}

function effectSummary(epic: Epic): string | null {
  if (epic.effectYear == null && epic.effect2026 == null) return null;
  if (epic.effectYear != null && epic.effect2026 != null) {
    return `Эффект ${formatMoney(epic.effectYear)} / ${formatMoney(epic.effect2026)} в этом году`;
  }
  return `Эффект ${formatMoney(epic.effectYear ?? epic.effect2026)}`;
}

function activeRolesOf(epic: Epic, roles: RoleDef[]): RoleDef[] {
  if (!epic.visibleRoles) return roles;
  const byId = new Map(roles.map((role) => [role.id, role]));
  return epic.visibleRoles.map((id) => byId.get(id)).filter((role): role is RoleDef => !!role);
}

export default function Grid({
  plan,
  visibleEpics,
  teamFilter,
  colWidth,
  mode,
  cutoffIndex,
  currentSprint,
  load,
  highlight,
  scrollRef,
  onHScroll,
  updatePlan,
  onEditEpic,
  onSegmentDeleted,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [livePreview, setLivePreview] = useState<LivePreview>(null);
  const [popover, setPopover] = useState<PopoverState>(null);
  const [reorderState, setReorderState] = useState<ReorderState>(null);
  const [roleMenu, setRoleMenu] = useState<RoleMenuState>(null);
  const [epicDragMotion, setEpicDragMotion] = useState<EpicDragMotion>(null);
  const pointerSessionRef = useRef<PointerSession | null>(null);

  const sprints = plan.sprints;
  const visibleSprints = useMemo(() => sprints.slice(cutoffIndex), [sprints, cutoffIndex]);
  const n = visibleSprints.length;
  const maxIndex = sprints.length - 1;

  const quarterGroups = useMemo(() => {
    const groups: { quarter: string; start: number; len: number; freeze: boolean }[] = [];
    for (const s of visibleSprints) {
      const last = groups[groups.length - 1];
      if (last && last.quarter === s.quarter) {
        last.len += 1;
        if (s.flags.freeze) last.freeze = true;
      } else {
        groups.push({ quarter: s.quarter, start: groups.length === 0 ? 0 : last!.start + last!.len, len: 1, freeze: !!s.flags.freeze });
      }
    }
    return groups;
  }, [visibleSprints]);

  const freezeRealIdx = useMemo(() => sprints.find((s) => s.flags.freeze)?.index ?? null, [sprints]);
  const holidayRealIdxs = useMemo(() => sprints.filter((s) => s.flags.holiday).map((s) => s.index), [sprints]);

  function toDisplayCol(realIdx: number): number {
    return realIdx - cutoffIndex;
  }

  useEffect(() => {
    if (!roleMenu) return;
    const handler = (e: MouseEvent) => {
      const el = document.querySelector('.role-menu');
      if (el && !el.contains(e.target as Node)) setRoleMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [roleMenu]);

  useEffect(() => () => pointerSessionRef.current?.cleanup(), []);

  function beginPointerSession(
    onMove: (event: PointerEvent) => void,
    onUp: (event: PointerEvent) => void,
    onCancel: () => void
  ) {
    pointerSessionRef.current?.cancel();
    let session: PointerSession;
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      if (pointerSessionRef.current === session) pointerSessionRef.current = null;
    };
    const handleUp = (event: PointerEvent) => {
      cleanup();
      onUp(event);
    };
    const handleCancel = () => {
      cleanup();
      onCancel();
    };
    session = { cleanup, cancel: handleCancel };
    pointerSessionRef.current = session;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
  }

  function toggleEpic(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function liveRealRange(epic: Epic, seg: Segment): { from: number; to: number } {
    if (livePreview?.type === 'segment' && livePreview.segmentId === seg.id) {
      return { from: livePreview.from, to: livePreview.to };
    }
    if (livePreview?.type === 'epic' && livePreview.epicId === epic.id) {
      return { from: seg.from + livePreview.deltaSprints, to: seg.to + livePreview.deltaSprints };
    }
    return { from: seg.from, to: seg.to };
  }

  function toDisplayRange(realFrom: number, realTo: number): { from: number; to: number } | null {
    const dTo = realTo - cutoffIndex;
    if (dTo < 0) return null;
    const dFrom = Math.max(0, realFrom - cutoffIndex);
    return { from: dFrom, to: dTo };
  }

  function segmentLoadStatus(epic: Epic, seg: Segment): LoadStatus | null {
    const scopes = scopesForEpicRole(plan, epic.teams, seg.role);
    let worst: LoadStatus | null = null;
    for (let s = seg.from; s <= seg.to; s++) {
      for (const scope of scopes) {
        const cell = load.map.get(loadKey(seg.role, scope, s));
        if (!cell) continue;
        if (cell.status === 'over' || cell.status === 'nocap') worst = cell.status;
        else if (cell.status === 'tight' && worst !== 'over' && worst !== 'nocap') worst = 'tight';
      }
    }
    return worst === 'tight' || worst === 'over' || worst === 'nocap' ? worst : null;
  }

  function isSpotlit(epic: Epic, seg: Segment): boolean {
    if (!highlight) return false;
    return (
      highlight.role === seg.role &&
      highlight.epicIds.includes(epic.id) &&
      seg.from <= highlight.sprintIndex &&
      seg.to >= highlight.sprintIndex
    );
  }

  function mutateEpic(epicId: string, fn: (epic: Epic) => Epic) {
    updatePlan((p) => ({ ...p, epics: p.epics.map((ep) => (ep.id === epicId ? fn(ep) : ep)) }));
  }

  function mutateSegment(epicId: string, segId: string, fn: (seg: Segment) => Segment) {
    mutateEpic(epicId, (ep) => ({ ...ep, segments: ep.segments.map((s) => (s.id === segId ? fn(s) : s)) }));
  }

  function addRole(epicId: string, roleId: RoleId) {
    mutateEpic(epicId, (ep) => {
      const current = ep.visibleRoles ?? plan.roles.map((r) => r.id);
      if (current.includes(roleId)) return ep;
      return { ...ep, visibleRoles: [...current, roleId] };
    });
  }

  function removeRole(epicId: string, roleId: RoleId) {
    mutateEpic(epicId, (ep) => {
      const current = ep.visibleRoles ?? plan.roles.map((r) => r.id);
      return { ...ep, visibleRoles: current.filter((id) => id !== roleId) };
    });
  }

  function moveRoleWithinEpic(epicId: string, roleId: RoleId, direction: -1 | 1) {
    mutateEpic(epicId, (ep) => {
      const current = (ep.visibleRoles ?? plan.roles.map((role) => role.id)).filter((id) => plan.roles.some((role) => role.id === id));
      const index = current.indexOf(roleId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return ep;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...ep, visibleRoles: next };
    });
  }

  function openSegmentEditor(epicId: string, segmentId: string, sprintIndex: number, x: number, y: number) {
    setPopover({ epicId, segmentId, sprintIndex, x, y });
  }

  function startSegmentMove(e: React.PointerEvent, epic: Epic, seg: Segment) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const trigger = (e.currentTarget as HTMLElement).closest('.segment-bar') as HTMLElement | null;
    let moved = false;
    let curFrom = seg.from;
    let curTo = seg.to;

    function onMove(ev: PointerEvent) {
      const deltaPx = ev.clientX - startX;
      if (Math.abs(deltaPx) > CLICK_MOVE_THRESHOLD) moved = true;
      const rawDelta = Math.round(deltaPx / colWidth);
      const clamped = clampMoveDelta(epic, seg, rawDelta, maxIndex);
      curFrom = seg.from + clamped;
      curTo = seg.to + clamped;
      setLivePreview({ type: 'segment', segmentId: seg.id, from: curFrom, to: curTo });
    }
    function onUp(ev: PointerEvent) {
      setLivePreview(null);
      if (moved && (curFrom !== seg.from || curTo !== seg.to)) {
        mutateSegment(epic.id, seg.id, (s) => ({ ...s, from: curFrom, to: curTo }));
      } else if (!moved) {
        trigger?.focus({ preventScroll: true });
        const offsetX = ev.clientX - rect.left;
        const sprintIndex = Math.max(seg.from, Math.min(seg.to, seg.from + Math.floor(offsetX / colWidth)));
        openSegmentEditor(epic.id, seg.id, sprintIndex, ev.clientX, ev.clientY);
      }
    }
    beginPointerSession(onMove, onUp, () => setLivePreview(null));
  }

  function startResizeLeft(e: React.PointerEvent, epic: Epic, seg: Segment) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let curFrom = seg.from;
    function onMove(ev: PointerEvent) {
      const deltaPx = ev.clientX - startX;
      const rawDelta = Math.round(deltaPx / colWidth);
      curFrom = clampResizeLeft(epic, seg, seg.from + rawDelta);
      setLivePreview({ type: 'segment', segmentId: seg.id, from: curFrom, to: seg.to });
    }
    function onUp() {
      setLivePreview(null);
      if (curFrom !== seg.from) mutateSegment(epic.id, seg.id, (s) => ({ ...s, from: curFrom }));
    }
    beginPointerSession(onMove, onUp, () => setLivePreview(null));
  }

  function startResizeRight(e: React.PointerEvent, epic: Epic, seg: Segment) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let curTo = seg.to;
    function onMove(ev: PointerEvent) {
      const deltaPx = ev.clientX - startX;
      const rawDelta = Math.round(deltaPx / colWidth);
      curTo = clampResizeRight(epic, seg, seg.to + rawDelta, maxIndex);
      setLivePreview({ type: 'segment', segmentId: seg.id, from: seg.from, to: curTo });
    }
    function onUp() {
      setLivePreview(null);
      if (curTo !== seg.to) mutateSegment(epic.id, seg.id, (s) => ({ ...s, to: curTo }));
    }
    beginPointerSession(onMove, onUp, () => setLivePreview(null));
  }

  function startEpicMove(e: React.PointerEvent, epic: Epic) {
    if (e.button !== 0) return;
    if (epic.segments.length === 0) {
      onEditEpic(epic.id);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let moved = false;
    let curDelta = 0;
    setLivePreview({ type: 'epic', epicId: epic.id, deltaSprints: 0 });
    setEpicDragMotion({ epicId: epic.id, offsetPx: 0 });
    function onMove(ev: PointerEvent) {
      const deltaPx = ev.clientX - startX;
      if (Math.abs(deltaPx) > CLICK_MOVE_THRESHOLD) moved = true;
      const rawDelta = Math.round(deltaPx / colWidth);
      curDelta = clampEpicMoveDelta(epic, rawDelta, maxIndex);
      const remainder = deltaPx - curDelta * colWidth;
      const offsetPx = Math.max(-colWidth * 0.48, Math.min(colWidth * 0.48, remainder));
      setLivePreview({ type: 'epic', epicId: epic.id, deltaSprints: curDelta });
      setEpicDragMotion({ epicId: epic.id, offsetPx });
    }
    function onUp() {
      setLivePreview(null);
      setEpicDragMotion(null);
      if (moved && curDelta !== 0) {
        mutateEpic(epic.id, (ep) => ({
          ...ep,
          segments: ep.segments.map((s) => ({ ...s, from: s.from + curDelta, to: s.to + curDelta })),
        }));
      } else if (!moved) {
        onEditEpic(epic.id);
      }
    }
    beginPointerSession(onMove, onUp, () => {
      setLivePreview(null);
      setEpicDragMotion(null);
    });
  }

  function startEpicReorder(e: React.PointerEvent, epic: Epic) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rects = visibleEpics.map((ep) => {
      const el = document.querySelector(`[data-epic-header="${ep.id}"]`) as HTMLElement | null;
      const r = el?.getBoundingClientRect();
      return { id: ep.id, centerY: r ? r.top + r.height / 2 : 0 };
    });
    let targetId: string | null = null;

    function onMove(ev: PointerEvent) {
      let nearest = rects[0];
      let nearestDist = Infinity;
      for (const r of rects) {
        const d = Math.abs(r.centerY - ev.clientY);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = r;
        }
      }
      targetId = nearest.id === epic.id ? null : nearest.id;
      setReorderState(targetId ? { draggedId: epic.id, targetId } : null);
    }
    function onUp() {
      setReorderState(null);
      if (targetId) {
        const finalTargetId = targetId;
        updatePlan((p) => {
          const dragged = p.epics.find((e) => e.id === epic.id);
          if (!dragged) return p;
          const rest = p.epics.filter((e) => e.id !== epic.id);
          const anchorIdx = rest.findIndex((e) => e.id === finalTargetId);
          if (anchorIdx === -1) return p;
          const next = [...rest];
          next.splice(anchorIdx, 0, dragged);
          return { ...p, epics: next };
        });
      }
    }
    beginPointerSession(onMove, onUp, () => setReorderState(null));
  }

  function availableSprint(epic: Epic, role: RoleDef): number | null {
    if (visibleSprints.length === 0) return null;
    const preferred = currentSprint >= cutoffIndex && currentSprint <= maxIndex ? currentSprint : cutoffIndex;
    const candidates = [preferred, ...visibleSprints.map((s) => s.index)].filter((index) => index >= cutoffIndex && index <= maxIndex);
    return (
      candidates.find(
        (index, position) => candidates.indexOf(index) === position && !segmentOverlapsRoleInEpic(epic, role.id, index, index)
      ) ?? null
    );
  }

  function createSegmentAt(epic: Epic, role: RoleDef, sprintIndex: number, x: number, y: number) {
    const newSeg: Segment = {
      id: `${epic.id}-${role.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      role: role.id,
      from: sprintIndex,
      to: sprintIndex,
      label: '',
      color: null,
      flag: null,
    };
    mutateEpic(epic.id, (ep) => ({ ...ep, segments: [...ep.segments, newSeg] }));
    openSegmentEditor(epic.id, newSeg.id, sprintIndex, x, y);
  }

  function handleTrackDoubleClick(e: React.MouseEvent, epic: Epic, role: RoleDef) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const sprintIndex = Math.max(cutoffIndex, Math.min(maxIndex, cutoffIndex + Math.floor(offsetX / colWidth)));
    if (segmentOverlapsRoleInEpic(epic, role.id, sprintIndex, sprintIndex)) return;
    (e.currentTarget as HTMLElement).focus({ preventScroll: true });
    createSegmentAt(epic, role, sprintIndex, e.clientX, e.clientY);
  }

  let rowCounter = 3;

  return (
    <div
      className="grid-scroll"
      ref={scrollRef}
      onScroll={(e) => onHScroll(e.currentTarget.scrollLeft)}
      role="region"
      aria-label="План по фичам, ролям и спринтам"
      tabIndex={0}
    >
      <div className="grid" style={{ ['--n-cols' as any]: n, ['--col-width' as any]: `${colWidth}px` }}>
        <svg className="lens-filter-defs" aria-hidden="true" focusable="false" width="0" height="0">
          <defs>
            <filter id="kolbaski-lens" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB">
              <feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves="2" seed="11" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
        </svg>
        {Array.from({ length: n + 1 }, (_, i) => (
          <div key={`sl-${i}`} className="grid-marker sprint-line" style={{ left: LABEL_WIDTH + i * colWidth }} />
        ))}
        {holidayRealIdxs.map((idx) => {
          const col = toDisplayCol(idx);
          if (col < 0 || col >= n) return null;
          return <div key={`hb-${idx}`} className="grid-marker holiday-block" style={{ left: LABEL_WIDTH + col * colWidth, width: colWidth }} />;
        })}
        {currentSprint >= 0 && toDisplayCol(currentSprint) >= 0 && toDisplayCol(currentSprint) < n && (
          <div
            className="grid-marker current-block"
            style={{ left: LABEL_WIDTH + toDisplayCol(currentSprint) * colWidth, width: colWidth }}
          />
        )}
        {currentSprint >= 0 && toDisplayCol(currentSprint) >= 0 && toDisplayCol(currentSprint) < n && (
          <div
            className="grid-marker current-lens"
            style={{ left: LABEL_WIDTH + toDisplayCol(currentSprint) * colWidth, width: colWidth }}
            aria-hidden="true"
          />
        )}
        {quarterGroups.map((g) => (
          <div key={`ql-${g.start}`} className="grid-marker quarter-line" style={{ left: LABEL_WIDTH + g.start * colWidth }} />
        ))}
        {freezeRealIdx !== null &&
          toDisplayCol(freezeRealIdx) >= 0 &&
          toDisplayCol(freezeRealIdx) < n && (
            <div className="grid-marker freeze-line" style={{ left: LABEL_WIDTH + toDisplayCol(freezeRealIdx) * colWidth }} />
          )}

        <div className="cell label-cell corner-quarter" style={{ gridColumn: '1 / 2', gridRow: 1 }} aria-hidden="true" />
        {quarterGroups.map((g) => (
          <div
            key={g.quarter + g.start}
            className={`quarter-cell${g.freeze ? ' freeze-q' : ''}`}
            style={{ gridColumn: `${g.start + 2} / ${g.start + 2 + g.len}`, gridRow: 1 }}
          >
            {g.quarter}
            {g.freeze ? ' — ФРИЗ' : ''}
          </div>
        ))}

        <div className="cell label-cell corner-legend" style={{ gridColumn: '1 / 2', gridRow: 2 }}>
          <span>Фича / роль</span>
          <span className="corner-teams" title="Порядок номеров спринта в шапке">
            спринт: {(teamFilter === 'ALL' ? plan.teams : plan.teams.filter((t) => t.id === teamFilter)).map((t) => t.shortName).join(' / ')}
          </span>
        </div>
        {visibleSprints.map((s, i) => (
          <div
            key={s.index}
            className={`cell sprint-header-cell${s.index === currentSprint ? ' current' : ''}`}
            style={{ gridColumn: `${i + 2} / ${i + 3}`, gridRow: 2 }}
          >
            {s.index === currentSprint && <span className="now-chip">СЕЙЧАС</span>}
            <span className="nums">{sprintNumbersLabel(plan.teams, s.index, teamFilter === 'ALL' ? undefined : teamFilter)}</span>
            <span className="dates">{formatDateShort(s.dateFrom)}</span>
          </div>
        ))}

        {visibleEpics.map((epic) => {
          const isCollapsed = collapsed.has(epic.id);
          const headerRow = rowCounter++;
          const span = epicSpan(epic);
          const isEpicDragging = livePreview?.type === 'epic' && livePreview.epicId === epic.id;
          const epicDragOffsetPx = epicDragMotion?.epicId === epic.id ? epicDragMotion.offsetPx : 0;
          const displaySpan =
            span && isEpicDragging && livePreview?.type === 'epic'
              ? toDisplayRange(span.from + livePreview.deltaSprints, span.to + livePreview.deltaSprints)
              : span
                ? toDisplayRange(span.from, span.to)
                : null;
          const trueSpan =
            span && isEpicDragging && livePreview?.type === 'epic'
              ? { from: span.from + livePreview.deltaSprints, to: span.to + livePreview.deltaSprints, lengthSprints: span.lengthSprints }
              : span;

          const showRollup = isCollapsed || mode === 'management';
          const showRoleRows = !isCollapsed && mode === 'detailed';
          const activeRoles = activeRolesOf(epic, plan.roles);
          const hiddenRoles = plan.roles.filter((r) => !activeRoles.includes(r));

          const roleRows = showRoleRows
            ? activeRoles.map((role, roleIndex) => {
                const row = rowCounter++;
                const segs = epic.segments.filter((s) => s.role === role.id);
                return { role, roleIndex, row, segs };
              })
            : [];
          const roleAddRow = showRoleRows && hiddenRoles.length > 0 ? rowCounter++ : null;
          const rollupRow = showRollup ? rowCounter++ : null;

          return (
            <div key={epic.id} style={{ display: 'contents' }}>
              <div
                className={`cell label-cell epic-header-label${reorderState?.targetId === epic.id ? ' reorder-target' : ''}${isEpicDragging ? ' epic-dragging' : ''}`}
                style={{ gridColumn: '1 / 2', gridRow: headerRow }}
                data-epic-header={epic.id}
              >
                <span className="reorder-handle" onPointerDown={(e) => startEpicReorder(e, epic)} title="Перетащить, чтобы изменить порядок">
                  ⠿
                </span>
                {epic.teams.length > 0 && (
                  <span className="epic-team-chips" aria-hidden="true" title={teamsBadge(plan.teams, epic.teams)}>
                    {epic.teams.map((teamId) => {
                      const team = plan.teams.find((t) => t.id === teamId);
                      return team ? <span key={teamId} className="epic-team-chip" style={{ background: team.color }} /> : null;
                    })}
                  </span>
                )}
                <button
                  type="button"
                  className={`collapse-arrow epic-collapse${isCollapsed ? ' collapsed' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEpic(epic.id);
                  }}
                  aria-expanded={!isCollapsed}
                  aria-label={`${isCollapsed ? 'Развернуть' : 'Свернуть'} фичу «${epic.title}»`}
                >
                  ▾
                </button>
                <button
                  type="button"
                  className="epic-title"
                  onPointerDown={(e) => startEpicMove(e, epic)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    onEditEpic(epic.id);
                  }}
                  aria-label={`Открыть фичу «${epic.title}». Перетаскивание меняет срок`}
                >
                  {epic.title}
                </button>
              </div>
              <div
                className={`cell epic-header-track${isEpicDragging ? ' epic-dragging' : ''}`}
                style={{ gridColumn: `2 / span ${n}`, gridRow: headerRow, position: 'relative' }}
                onPointerDown={(e) => startEpicMove(e, epic)}
              >
                {isEpicDragging && displaySpan && livePreview?.type === 'epic' && (
                  <div
                    className="epic-drag-landing"
                    style={{
                      left: displaySpan.from * colWidth + 3,
                      width: (displaySpan.to - displaySpan.from + 1) * colWidth - 6,
                    }}
                    aria-hidden="true"
                  >
                    <span>{livePreview.deltaSprints === 0 ? 'сюда' : `${livePreview.deltaSprints > 0 ? '+' : ''}${livePreview.deltaSprints} спр.`}</span>
                  </div>
                )}
                <div className="epic-info-overlay">
                  <span className="epic-badge epic-team-badge">{teamsBadge(plan.teams, epic.teams)}</span>
                  <span className="epic-badge epic-status-badge">{STATUS_LABELS[epic.status]}</span>
                  {effectSummary(epic) && <span className="epic-effect">{effectSummary(epic)}</span>}
                  {trueSpan && (
                    <span className="epic-badge duration-badge">
                      {trueSpan.lengthSprints} {sprintWord(trueSpan.lengthSprints)} · {formatDateShort(sprints[Math.min(trueSpan.from, sprints.length - 1)]?.dateFrom ?? sprints[0].dateFrom)}–
                      {formatDateShort(sprints[Math.min(trueSpan.to, sprints.length - 1)]?.dateTo ?? sprints[sprints.length - 1].dateTo)}
                    </span>
                  )}
                </div>
              </div>

              {roleRows.map(({ role, roleIndex, row, segs }) => (
                <div key={role.id} style={{ display: 'contents' }}>
                  <div className="cell label-cell role-label-cell" style={{ gridColumn: '1 / 2', gridRow: row }}>
                    <span className="role-label-text">{role.label}</span>
                    {segs.length > 0 && <span className="role-duration">{roleDurationSprints(segs)} спр.</span>}
                    <span className="role-order-controls">
                      <button
                        type="button"
                        disabled={roleIndex === 0}
                        aria-label={`Переместить роль «${role.label}» выше в фиче «${epic.title}»`}
                        title="Выше только в этой фиче"
                        onClick={() => moveRoleWithinEpic(epic.id, role.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={roleIndex === activeRoles.length - 1}
                        aria-label={`Переместить роль «${role.label}» ниже в фиче «${epic.title}»`}
                        title="Ниже только в этой фиче"
                        onClick={() => moveRoleWithinEpic(epic.id, role.id, 1)}
                      >
                        ↓
                      </button>
                    </span>
                    {segs.length === 0 && (
                      <button
                        className="role-remove-btn"
                        aria-label={`Убрать роль «${role.label}» из фичи «${epic.title}»`}
                        title="Убрать роль"
                        onClick={() => removeRole(epic.id, role.id)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <div
                    className="cell role-track"
                    style={{ gridColumn: `2 / span ${n}`, gridRow: row, position: 'relative' }}
                    onDoubleClick={(e) => handleTrackDoubleClick(e, epic, role)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                      const sprintIndex = availableSprint(epic, role);
                      if (sprintIndex === null) return;
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.min(rect.right - 12, rect.left + (sprintIndex - cutoffIndex + 0.5) * colWidth);
                      createSegmentAt(epic, role, sprintIndex, x, rect.top + rect.height / 2);
                    }}
                    role="group"
                    tabIndex={0}
                    aria-label={`${role.label}, фича «${epic.title}». Enter или пробел — добавить колбаску в ближайший свободный спринт`}
                    title="Двойной клик по свободному месту — добавить колбаску"
                  >
                    {(epic.plannedSegments ?? [])
                      .filter((p) => p.role === role.id)
                      .map((p) => {
                        const disp = toDisplayRange(p.from, p.to);
                        if (!disp) return null;
                        const left = disp.from * colWidth;
                        const width = (disp.to - disp.from + 1) * colWidth;
                        const planColor = roleColorOf(plan.roles, role.id);
                        return (
                          <div
                            key={p.id}
                            className="planned-ghost"
                            style={{ left, width, ['--plan-color' as string]: planColor }}
                            title={`План: ${p.label || role.label} · спринты ${p.from}–${p.to}`}
                            aria-hidden="true"
                          />
                        );
                      })}
                    {segs.map((seg) => {
                      const real = liveRealRange(epic, seg);
                      const disp = toDisplayRange(real.from, real.to);
                      if (!disp) return null;
                      const mergeLeft = segs.some((other) => other.id !== seg.id && liveRealRange(epic, other).to === real.from - 1);
                      const mergeRight = segs.some((other) => other.id !== seg.id && liveRealRange(epic, other).from === real.to + 1);
                      return (
                        <SegmentBar
                          key={seg.id}
                          segment={seg}
                          roleLabel={role.label}
                          roleColor={roleColorOf(plan.roles, role.id)}
                          colWidth={colWidth}
                          from={disp.from}
                          to={disp.to}
                          mergeLeft={mergeLeft}
                          mergeRight={mergeRight}
                          status={segmentLoadStatus(epic, seg)}
                          spotlight={isSpotlit(epic, seg)}
                          isDragging={(livePreview?.type === 'segment' && livePreview.segmentId === seg.id) || !!isEpicDragging}
                          dragOffsetX={isEpicDragging ? epicDragOffsetPx : null}
                          cutoffIndex={cutoffIndex}
                          onBodyPointerDown={(e) => startSegmentMove(e, epic, seg)}
                          onLeftHandlePointerDown={(e) => startResizeLeft(e, epic, seg)}
                          onRightHandlePointerDown={(e) => startResizeRight(e, epic, seg)}
                          onEdit={(x, y) => openSegmentEditor(epic.id, seg.id, seg.from, x, y)}
                          onEditNote={(sprintIndex, x, y) => openSegmentEditor(epic.id, seg.id, sprintIndex, x, y)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}

              {roleAddRow !== null && (
                <div style={{ display: 'contents' }}>
                  <div className="cell label-cell role-add-row" style={{ gridColumn: '1 / 2', gridRow: roleAddRow }}>
                    <button
                      className="role-add-btn"
                      onClick={(e) => setRoleMenu({ epicId: epic.id, x: e.clientX, y: e.clientY })}
                    >
                      + Роль
                    </button>
                  </div>
                  <div className="cell" style={{ gridColumn: `2 / span ${n}`, gridRow: roleAddRow }} />
                </div>
              )}

              {rollupRow !== null && displaySpan && (
                <div style={{ display: 'contents' }}>
                  <div className="cell label-cell role-label-cell" style={{ gridColumn: '1 / 2', gridRow: rollupRow }}>
                    срок фичи
                  </div>
                  <div className="cell" style={{ gridColumn: `2 / span ${n}`, gridRow: rollupRow, position: 'relative' }}>
                    <div
                      className="segment-bar management-bar"
                      style={{
                        left: displaySpan.from * colWidth + 3,
                        width: (displaySpan.to - displaySpan.from + 1) * colWidth - 6,
                        transform: isEpicDragging ? `translateX(${epicDragOffsetPx}px)` : undefined,
                      }}
                    >
                      <span className="seg-label">
                        {epic.title} · {trueSpan?.lengthSprints} спр.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {roleMenu &&
        (() => {
          const epic = plan.epics.find((e) => e.id === roleMenu.epicId);
          if (!epic) return null;
          const active = new Set(epic.visibleRoles ?? plan.roles.map((r) => r.id));
          const hidden = plan.roles.filter((r) => !active.has(r.id));
          if (hidden.length === 0) return null;
          return (
            <div className="role-menu" style={{ left: roleMenu.x, top: roleMenu.y }}>
              {hidden.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    addRole(epic.id, r.id);
                    setRoleMenu(null);
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          );
        })()}

      {popover &&
        (() => {
          const epic = plan.epics.find((e) => e.id === popover.epicId);
          const seg = epic?.segments.find((s) => s.id === popover.segmentId);
          if (!epic || !seg) return null;
          const sprint = sprints[popover.sprintIndex];
          return (
            <SegmentEditorPopover
              x={popover.x}
              y={popover.y}
              sprintLabel={`Спринт ${sprintNumbersLabel(plan.teams, sprint.index)} · ${formatDateShort(sprint.dateFrom)}`}
              roleColor={roleColorOf(plan.roles, seg.role)}
              initialLabel={seg.label}
              initialNote={seg.notes?.[popover.sprintIndex] ?? ''}
              initialColor={seg.color}
              onSave={({ label, note, color }) => {
                mutateSegment(epic.id, seg.id, (s) => {
                  const notes = { ...(s.notes ?? {}) };
                  if (note.trim()) notes[popover.sprintIndex] = note.trim();
                  else delete notes[popover.sprintIndex];
                  return { ...s, label, color, notes };
                });
                setPopover(null);
              }}
              onDelete={() => {
                onSegmentDeleted(epic.id, seg);
                mutateEpic(epic.id, (ep) => ({ ...ep, segments: ep.segments.filter((s) => s.id !== seg.id) }));
                setPopover(null);
              }}
              onClose={() => setPopover(null)}
            />
          );
        })()}
    </div>
  );
}
