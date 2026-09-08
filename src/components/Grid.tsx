import { useMemo, useRef, useState } from 'react';
import type { Epic, Plan, Segment } from '../types';
import type { RoleDef } from '../types';
import { ROLE_DEFS } from '../lib/roles';
import { computeOverlaps, overlapKey, scopesForEpicRole, type OverlapStatus } from '../lib/overlaps';
import { epicSpan, roleDurationSprints } from '../lib/duration';
import { clampMoveDelta, clampResizeLeft, clampResizeRight, clampEpicMoveDelta, segmentOverlapsRoleInEpic } from '../lib/dnd';
import SegmentBar from './SegmentBar';
import TextPopover from './TextPopover';

interface Props {
  plan: Plan;
  colWidth: number;
  mode: 'detailed' | 'management';
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

const CLICK_MOVE_THRESHOLD = 4;
const DOUBLE_CLICK_WINDOW = 300;

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

export default function Grid({ plan, colWidth, mode, updatePlan, onEditEpic }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [livePreview, setLivePreview] = useState<LivePreview>(null);
  const [popover, setPopover] = useState<PopoverState>(null);
  const clickPendingRef = useRef<{ segmentId: string; timer: number } | null>(null);

  const sprints = plan.sprints;
  const n = sprints.length;
  const maxIndex = n - 1;

  const freezeIdx = useMemo(() => sprints.find((s) => s.flags.freeze)?.index ?? null, [sprints]);
  const holidayIdxs = useMemo(() => sprints.filter((s) => s.flags.holiday).map((s) => s.index), [sprints]);
  const overlapMap = useMemo(() => computeOverlaps(plan), [plan.epics, plan.settings]);

  const quarterGroups = useMemo(() => {
    const groups: { quarter: string; start: number; len: number; freeze: boolean }[] = [];
    for (const s of sprints) {
      const last = groups[groups.length - 1];
      if (last && last.quarter === s.quarter) {
        last.len += 1;
        if (s.flags.freeze) last.freeze = true;
      } else {
        groups.push({ quarter: s.quarter, start: s.index, len: 1, freeze: !!s.flags.freeze });
      }
    }
    return groups;
  }, [sprints]);

  function toggleEpic(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function displayRange(epic: Epic, seg: Segment): { from: number; to: number } {
    if (livePreview?.type === 'segment' && livePreview.segmentId === seg.id) {
      return { from: livePreview.from, to: livePreview.to };
    }
    if (livePreview?.type === 'epic' && livePreview.epicId === epic.id) {
      return { from: seg.from + livePreview.deltaSprints, to: seg.to + livePreview.deltaSprints };
    }
    return { from: seg.from, to: seg.to };
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

  function markers(rowKey: string) {
    return (
      <>
        {freezeIdx !== null && (
          <div key={`${rowKey}-freeze`} className="row-freeze-marker" style={{ left: freezeIdx * colWidth }} />
        )}
        {holidayIdxs.map((idx) => (
          <div key={`${rowKey}-holiday-${idx}`} className="row-holiday-marker" style={{ left: idx * colWidth, width: colWidth }} />
        ))}
      </>
    );
  }

  function mutateEpic(epicId: string, fn: (epic: Epic) => Epic) {
    updatePlan((p) => ({ ...p, epics: p.epics.map((ep) => (ep.id === epicId ? fn(ep) : ep)) }));
  }

  function mutateSegment(epicId: string, segId: string, fn: (seg: Segment) => Segment) {
    mutateEpic(epicId, (ep) => ({ ...ep, segments: ep.segments.map((s) => (s.id === segId ? fn(s) : s)) }));
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
      // нечего двигать — сразу открываем редактирование
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

  function handleTrackDoubleClick(e: React.MouseEvent, epic: Epic, role: RoleDef) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const sprintIndex = Math.max(0, Math.min(maxIndex, Math.floor(offsetX / colWidth)));
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
        {sprints.map((s) => (
          <div
            key={s.index}
            className={`cell sprint-header-cell${s.flags.holiday ? ' holiday' : ''}${s.flags.freeze ? ' freeze-col' : ''}`}
            style={{ gridColumn: `${s.index + 2} / ${s.index + 3}`, gridRow: 2 }}
          >
            <span className="nums">
              {s.jhd} / {s.amclct}
            </span>
            <span className="dates">{formatDateShort(s.dateFrom)}</span>
          </div>
        ))}

        {plan.epics.map((epic) => {
          const isCollapsed = collapsed.has(epic.id);
          const headerRow = rowCounter++;
          const span = epicSpan(epic);
          const isEpicDragging = livePreview?.type === 'epic' && livePreview.epicId === epic.id;
          const displaySpan =
            span && isEpicDragging && livePreview?.type === 'epic'
              ? { from: span.from + livePreview.deltaSprints, to: span.to + livePreview.deltaSprints, lengthSprints: span.lengthSprints }
              : span;

          const roleRows =
            !isCollapsed && mode === 'detailed'
              ? ROLE_DEFS.map((role) => {
                  const row = rowCounter++;
                  const segs = epic.segments.filter((s) => s.role === role.id);
                  return { role, row, segs };
                })
              : [];
          const managementRow = !isCollapsed && mode === 'management' ? rowCounter++ : null;

          return (
            <div key={epic.id} style={{ display: 'contents' }}>
              <div className="cell label-cell epic-header-label" style={{ gridColumn: '1 / 2', gridRow: headerRow }}>
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
                {markers(`epic-${epic.id}`)}
                <div className="epic-info-overlay">
                  <span className="epic-badge">{TEAM_BADGE[epic.team]}</span>
                  <span className="epic-badge">{epic.status}</span>
                  <span>
                    эффект: {formatMoney(epic.effectYear)} / в этом году: {formatMoney(epic.effect2026)}
                  </span>
                  {epic.needsKb && <span className="epic-badge">нужна БЗ</span>}
                  {displaySpan && (
                    <span className="epic-badge duration-badge">
                      {displaySpan.lengthSprints} спр. итого ({formatDateShort(sprints[displaySpan.from].dateFrom)}–
                      {formatDateShort(sprints[displaySpan.to].dateTo)})
                    </span>
                  )}
                </div>
              </div>

              {mode === 'detailed' &&
                roleRows.map(({ role, row, segs }) => (
                  <div key={role.id} style={{ display: 'contents' }}>
                    <div className="cell label-cell role-label-cell" style={{ gridColumn: '1 / 2', gridRow: row }}>
                      {role.label}
                      {segs.length > 0 && <span className="role-duration">{roleDurationSprints(segs)} спр.</span>}
                    </div>
                    <div
                      className="cell"
                      style={{ gridColumn: `2 / span ${n}`, gridRow: row, position: 'relative' }}
                      onDoubleClick={(e) => handleTrackDoubleClick(e, epic, role)}
                    >
                      {markers(`${epic.id}-${role.id}`)}
                      {segs.map((seg) => {
                        const disp = displayRange(epic, seg);
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

              {mode === 'management' && managementRow !== null && displaySpan && (
                <div style={{ display: 'contents' }}>
                  <div className="cell label-cell role-label-cell" style={{ gridColumn: '1 / 2', gridRow: managementRow }}>
                    срок фичи
                  </div>
                  <div className="cell" style={{ gridColumn: `2 / span ${n}`, gridRow: managementRow, position: 'relative' }}>
                    {markers(`${epic.id}-mgmt`)}
                    <div
                      className="segment-bar management-bar"
                      style={{
                        left: displaySpan.from * colWidth + 3,
                        width: (displaySpan.to - displaySpan.from + 1) * colWidth - 6,
                      }}
                    >
                      <span className="seg-label">
                        {epic.title} · {displaySpan.lengthSprints} спр.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
