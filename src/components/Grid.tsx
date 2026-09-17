import { useEffect, useMemo, useRef, useState } from 'react';
import type { Epic, Plan, RoleId, Segment } from '../types';
import type { RoleDef } from '../types';
import { ROLE_DEFS } from '../lib/roles';
import { computeOverlaps, overlapKey, scopesForEpicRole, type OverlapStatus } from '../lib/overlaps';
import { epicSpan, roleDurationSprints } from '../lib/duration';
import { clampMoveDelta, clampResizeLeft, clampResizeRight, clampEpicMoveDelta, segmentOverlapsRoleInEpic } from '../lib/dnd';
import { currentQuarterCutoffIndex } from '../lib/calendar';
import SegmentBar from './SegmentBar';
import TextPopover from './TextPopover';

interface Props {
  plan: Plan;
  visibleEpics: Epic[];
  colWidth: number;
  mode: 'detailed' | 'management';
  hidePast: boolean;
  updatePlan: (fn: (p: Plan) => Plan) => void;
  onEditEpic: (epicId: string) => void;
}

type LivePreview =
  | { type: 'segment'; segmentId: string; from: number; to: number }
  | { type: 'epic'; epicId: string; deltaSprints: number }
  | null;

type PopoverState =
  | { kind: 'label'; epicId: string; segmentId: string; x: number; y: number }
  | { kind: 'note'; epicId: string; segmentId: string; sprintIndex: number; x: number; y: number }
  | null;

type ReorderState = { draggedId: string; targetId: string } | null;
type RoleMenuState = { epicId: string; x: number; y: number } | null;

const CLICK_MOVE_THRESHOLD = 4;
const DOUBLE_CLICK_WINDOW = 300;
const LABEL_WIDTH = 260; // держим в синхроне с --label-width в styles.css

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

function formatMoney(v: number | null): string {
  if (v == null) return '—';
  return (v / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн ₽';
}

const TEAM_BADGE: Record<Epic['team'], string> = {
  AMCLCT: 'AMCLCT',
  JHD: 'JHD',
  BOTH: 'AMCLCT + JHD',
};

function activeRolesOf(epic: Epic): RoleDef[] {
  const ids = epic.visibleRoles ?? ROLE_DEFS.map((r) => r.id);
  const set = new Set(ids);
  return ROLE_DEFS.filter((r) => set.has(r.id));
}

export default function Grid({ plan, visibleEpics, colWidth, mode, hidePast, updatePlan, onEditEpic }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [livePreview, setLivePreview] = useState<LivePreview>(null);
  const [popover, setPopover] = useState<PopoverState>(null);
  const [reorderState, setReorderState] = useState<ReorderState>(null);
  const [roleMenu, setRoleMenu] = useState<RoleMenuState>(null);
  const clickPendingRef = useRef<{ segmentId: string; timer: number } | null>(null);

  const sprints = plan.sprints;
  const cutoffIndex = hidePast ? currentQuarterCutoffIndex(sprints) : 0;
  const visibleSprints = useMemo(() => sprints.slice(cutoffIndex), [sprints, cutoffIndex]);
  const n = visibleSprints.length;
  const maxIndex = sprints.length - 1;

  const overlapMap = useMemo(() => computeOverlaps(plan), [plan.epics, plan.settings]);

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

  function segmentOverlapStatus(epic: Epic, seg: Segment): OverlapStatus | null {
    const scopes = scopesForEpicRole(epic.team, seg.role);
    if (scopes.length === 0) return null;
    let worst: OverlapStatus | null = null;
    for (let s = seg.from; s <= seg.to; s++) {
      for (const scope of scopes) {
        const info = overlapMap.get(overlapKey(seg.role, scope, s));
        if (info) {
          if (info.status === 'red') worst = 'red';
          else if (info.status === 'warn' && worst !== 'red') worst = 'warn';
        }
      }
    }
    return worst;
  }

  function mutateEpic(epicId: string, fn: (epic: Epic) => Epic) {
    updatePlan((p) => ({ ...p, epics: p.epics.map((ep) => (ep.id === epicId ? fn(ep) : ep)) }));
  }

  function mutateSegment(epicId: string, segId: string, fn: (seg: Segment) => Segment) {
    mutateEpic(epicId, (ep) => ({ ...ep, segments: ep.segments.map((s) => (s.id === segId ? fn(s) : s)) }));
  }

  function addRole(epicId: string, roleId: RoleId) {
    mutateEpic(epicId, (ep) => {
      const current = ep.visibleRoles ?? ROLE_DEFS.map((r) => r.id);
      if (current.includes(roleId)) return ep;
      return { ...ep, visibleRoles: [...current, roleId] };
    });
  }

  function removeRole(epicId: string, roleId: RoleId) {
    mutateEpic(epicId, (ep) => {
      const current = ep.visibleRoles ?? ROLE_DEFS.map((r) => r.id);
      return { ...ep, visibleRoles: current.filter((id) => id !== roleId) };
    });
  }

  function openLabelPopover(epicId: string, segmentId: string, x: number, y: number) {
    setPopover({ kind: 'label', epicId, segmentId, x, y });
  }

  function handleSegmentClick(epic: Epic, seg: Segment, sprintIndex: number, clientX: number, clientY: number) {
    if (clickPendingRef.current && clickPendingRef.current.segmentId === seg.id) {
      window.clearTimeout(clickPendingRef.current.timer);
      clickPendingRef.current = null;
      openLabelPopover(epic.id, seg.id, clientX, clientY);
      return;
    }
    const timer = window.setTimeout(() => {
      clickPendingRef.current = null;
      setPopover({ kind: 'note', epicId: epic.id, segmentId: seg.id, sprintIndex, x: clientX, y: clientY });
    }, DOUBLE_CLICK_WINDOW);
    clickPendingRef.current = { segmentId: seg.id, timer };
  }

  function startSegmentMove(e: React.PointerEvent, epic: Epic, seg: Segment) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLivePreview(null);
      if (moved && (curFrom !== seg.from || curTo !== seg.to)) {
        mutateSegment(epic.id, seg.id, (s) => ({ ...s, from: curFrom, to: curTo }));
      } else if (!moved) {
        const offsetX = ev.clientX - rect.left;
        const sprintIndex = Math.max(seg.from, Math.min(seg.to, seg.from + Math.floor(offsetX / colWidth)));
        handleSegmentClick(epic, seg, sprintIndex, ev.clientX, ev.clientY);
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLivePreview(null);
      if (curFrom !== seg.from) mutateSegment(epic.id, seg.id, (s) => ({ ...s, from: curFrom }));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLivePreview(null);
      if (curTo !== seg.to) mutateSegment(epic.id, seg.id, (s) => ({ ...s, to: curTo }));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startEpicMove(e: React.PointerEvent, epic: Epic) {
    if (e.button !== 0) return;
    if (epic.segments.length === 0) {
      onEditEpic(epic.id);
      return;
    }
    e.preventDefault();
    const startX = e.clientX;
    let moved = false;
    let curDelta = 0;
    function onMove(ev: PointerEvent) {
      const deltaPx = ev.clientX - startX;
      if (Math.abs(deltaPx) > CLICK_MOVE_THRESHOLD) moved = true;
      const rawDelta = Math.round(deltaPx / colWidth);
      curDelta = clampEpicMoveDelta(epic, rawDelta, maxIndex);
      setLivePreview({ type: 'epic', epicId: epic.id, deltaSprints: curDelta });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setLivePreview(null);
      if (moved && curDelta !== 0) {
        mutateEpic(epic.id, (ep) => ({
          ...ep,
          segments: ep.segments.map((s) => ({ ...s, from: s.from + curDelta, to: s.to + curDelta })),
        }));
      } else if (!moved) {
        onEditEpic(epic.id);
      }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
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
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleTrackDoubleClick(e: React.MouseEvent, epic: Epic, role: RoleDef) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const sprintIndex = Math.max(cutoffIndex, Math.min(maxIndex, cutoffIndex + Math.floor(offsetX / colWidth)));
    if (segmentOverlapsRoleInEpic(epic, role.id, sprintIndex, sprintIndex)) return;
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
    setPopover({ kind: 'label', epicId: epic.id, segmentId: newSeg.id, x: e.clientX, y: e.clientY });
  }

  let rowCounter = 3;

  return (
    <div className="grid-scroll">
      <div className="grid" style={{ ['--n-cols' as any]: n, ['--col-width' as any]: `${colWidth}px` }}>
        {Array.from({ length: n + 1 }, (_, i) => (
          <div key={`sl-${i}`} className="grid-marker sprint-line" style={{ left: LABEL_WIDTH + i * colWidth }} />
        ))}
        {holidayRealIdxs.map((idx) => {
          const col = toDisplayCol(idx);
          if (col < 0 || col >= n) return null;
          return <div key={`hb-${idx}`} className="grid-marker holiday-block" style={{ left: LABEL_WIDTH + col * colWidth, width: colWidth }} />;
        })}
        {quarterGroups.map((g) => (
          <div key={`ql-${g.start}`} className="grid-marker quarter-line" style={{ left: LABEL_WIDTH + g.start * colWidth }} />
        ))}
        {freezeRealIdx !== null &&
          toDisplayCol(freezeRealIdx) >= 0 &&
          toDisplayCol(freezeRealIdx) < n && (
            <div className="grid-marker freeze-line" style={{ left: LABEL_WIDTH + toDisplayCol(freezeRealIdx) * colWidth }} />
          )}

        <div className="cell label-cell" style={{ gridColumn: '1 / 2', gridRow: 1 }} />
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

        <div className="cell label-cell" style={{ gridColumn: '1 / 2', gridRow: 2 }}>
          Эпик / роль
        </div>
        {visibleSprints.map((s, i) => (
          <div key={s.index} className="cell sprint-header-cell" style={{ gridColumn: `${i + 2} / ${i + 3}`, gridRow: 2 }}>
            <span className="nums">
              {s.jhd} / {s.amclct}
            </span>
            <span className="dates">{formatDateShort(s.dateFrom)}</span>
          </div>
        ))}

        {visibleEpics.map((epic) => {
          const isCollapsed = collapsed.has(epic.id);
          const headerRow = rowCounter++;
          const span = epicSpan(epic);
          const isEpicDragging = livePreview?.type === 'epic' && livePreview.epicId === epic.id;
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
          const activeRoles = activeRolesOf(epic);
          const hiddenRoles = ROLE_DEFS.filter((r) => !activeRoles.includes(r));

          const roleRows = showRoleRows
            ? activeRoles.map((role) => {
                const row = rowCounter++;
                const segs = epic.segments.filter((s) => s.role === role.id);
                return { role, row, segs };
              })
            : [];
          const roleAddRow = showRoleRows && hiddenRoles.length > 0 ? rowCounter++ : null;
          const rollupRow = showRollup ? rowCounter++ : null;

          return (
            <div key={epic.id} style={{ display: 'contents' }}>
              <div
                className={`cell label-cell epic-header-label${reorderState?.targetId === epic.id ? ' reorder-target' : ''}`}
                style={{ gridColumn: '1 / 2', gridRow: headerRow }}
                data-epic-header={epic.id}
              >
                <span className="reorder-handle" onPointerDown={(e) => startEpicReorder(e, epic)} title="Перетащить, чтобы изменить порядок">
                  ⠿
                </span>
                <span
                  className={`collapse-arrow${isCollapsed ? ' collapsed' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleEpic(epic.id);
                  }}
                >
                  ▾
                </span>
                <span className="epic-title" onPointerDown={(e) => startEpicMove(e, epic)}>
                  {epic.title}
                </span>
              </div>
              <div
                className="cell epic-header-track"
                style={{ gridColumn: `2 / span ${n}`, gridRow: headerRow, position: 'relative' }}
                onPointerDown={(e) => startEpicMove(e, epic)}
              >
                <div className="epic-info-overlay">
                  <span className="epic-badge">{TEAM_BADGE[epic.team]}</span>
                  <span className="epic-badge">{epic.status}</span>
                  <span>
                    эффект: {formatMoney(epic.effectYear)} / в этом году: {formatMoney(epic.effect2026)}
                  </span>
                  {epic.needsKb && <span className="epic-badge">нужна БЗ</span>}
                  {trueSpan && (
                    <span className="epic-badge duration-badge">
                      {trueSpan.lengthSprints} спр. итого ({formatDateShort(sprints[Math.min(trueSpan.from, sprints.length - 1)]?.dateFrom ?? sprints[0].dateFrom)}–
                      {formatDateShort(sprints[Math.min(trueSpan.to, sprints.length - 1)]?.dateTo ?? sprints[sprints.length - 1].dateTo)})
                    </span>
                  )}
                </div>
              </div>

              {roleRows.map(({ role, row, segs }) => (
                <div key={role.id} style={{ display: 'contents' }}>
                  <div className="cell label-cell role-label-cell" style={{ gridColumn: '1 / 2', gridRow: row }}>
                    <span className="role-label-text">{role.label}</span>
                    {segs.length > 0 && <span className="role-duration">{roleDurationSprints(segs)} спр.</span>}
                    {segs.length === 0 && (
                      <button className="role-remove-btn" title="Убрать роль" onClick={() => removeRole(epic.id, role.id)}>
                        ✕
                      </button>
                    )}
                  </div>
                  <div
                    className="cell"
                    style={{ gridColumn: `2 / span ${n}`, gridRow: row, position: 'relative' }}
                    onDoubleClick={(e) => handleTrackDoubleClick(e, epic, role)}
                  >
                    {segs.map((seg) => {
                      const real = liveRealRange(epic, seg);
                      const disp = toDisplayRange(real.from, real.to);
                      if (!disp) return null;
                      return (
                        <SegmentBar
                          key={seg.id}
                          segment={seg}
                          colWidth={colWidth}
                          from={disp.from}
                          to={disp.to}
                          overlapStatus={segmentOverlapStatus(epic, seg)}
                          isDragging={(livePreview?.type === 'segment' && livePreview.segmentId === seg.id) || !!isEpicDragging}
                          onBodyPointerDown={(e) => startSegmentMove(e, epic, seg)}
                          onLeftHandlePointerDown={(e) => startResizeLeft(e, epic, seg)}
                          onRightHandlePointerDown={(e) => startResizeRight(e, epic, seg)}
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
                      style={{ left: displaySpan.from * colWidth + 3, width: (displaySpan.to - displaySpan.from + 1) * colWidth - 6 }}
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
          const active = new Set(epic.visibleRoles ?? ROLE_DEFS.map((r) => r.id));
          const hidden = ROLE_DEFS.filter((r) => !active.has(r.id));
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
          if (popover.kind === 'label') {
            return (
              <TextPopover
                x={popover.x}
                y={popover.y}
                title="Название колбаски"
                initialText={seg.label}
                onSave={(text) => {
                  mutateSegment(epic.id, seg.id, (s) => ({ ...s, label: text }));
                  setPopover(null);
                }}
                onDelete={() => {
                  mutateEpic(epic.id, (ep) => ({ ...ep, segments: ep.segments.filter((s) => s.id !== seg.id) }));
                  setPopover(null);
                }}
                onClose={() => setPopover(null)}
              />
            );
          }
          const sprint = sprints[popover.sprintIndex];
          return (
            <TextPopover
              x={popover.x}
              y={popover.y}
              title={`Комментарий · спринт ${sprint.jhd}/${sprint.amclct} (${formatDateShort(sprint.dateFrom)})`}
              initialText={seg.notes?.[popover.sprintIndex] ?? ''}
              onSave={(text) => {
                mutateSegment(epic.id, seg.id, (s) => {
                  const notes = { ...(s.notes ?? {}) };
                  if (text.trim()) notes[popover.sprintIndex] = text;
                  else delete notes[popover.sprintIndex];
                  return { ...s, notes };
                });
                setPopover(null);
              }}
              onClose={() => setPopover(null)}
            />
          );
        })()}
    </div>
  );
}
