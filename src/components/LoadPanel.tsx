import { useMemo, useState } from 'react';
import type { Plan, Sprint } from '../types';
import { SCOPE_TITLE, switchingLossPct, type LoadResult, type LoadRow, type LoadScope } from '../lib/load';

export interface LoadHighlight {
  role: string;
  scope: LoadScope;
  sprintIndex: number;
  epicIds: string[];
}

interface Props {
  plan: Plan;
  load: LoadResult;
  visibleSprints: Sprint[];
  colWidth: number;
  currentSprint: number;
  scrollRef: React.RefObject<HTMLDivElement>;
  highlight: LoadHighlight | null;
  onHighlight: (h: LoadHighlight | null) => void;
  onOpenTeams: () => void;
  onClose: () => void;
}

type Unit = 'tasks' | 'perPerson';

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function tasksWord(n: number): string {
  return plural(n, 'задача', 'задачи', 'задач');
}

export default function LoadPanel({
  plan,
  load,
  visibleSprints,
  colWidth,
  currentSprint,
  scrollRef,
  highlight,
  onHighlight,
  onOpenTeams,
  onClose,
}: Props) {
  const [unit, setUnit] = useState<Unit>('tasks');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const n = visibleSprints.length;

  const grouped = useMemo(() => {
    const scopes: LoadScope[] = ['AMCLCT', 'JHD', 'SHARED'];
    return scopes
      .map((scope) => ({ scope, rows: load.rows.filter((r) => r.scope === scope) }))
      .filter((g) => g.rows.length > 0);
  }, [load.rows]);

  // Что перегружено прямо сейчас
  const alerts = useMemo(() => {
    if (currentSprint < 0) return [];
    const out: { text: string; status: 'over' | 'tight' }[] = [];
    for (const row of load.rows) {
      const cell = row.cells[currentSprint];
      if (!cell) continue;
      if (cell.status === 'over' || cell.status === 'nocap' || cell.status === 'tight') {
        const where = row.scope === 'SHARED' ? 'общие' : row.scope;
        out.push({
          text: `${row.role.label} · ${where} — ${cell.demand} ${tasksWord(cell.demand)} на ${fmt(cell.capacity)} чел.`,
          status: cell.status === 'tight' ? 'tight' : 'over',
        });
      }
    }
    return out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'over' ? -1 : 1));
  }, [load.rows, currentSprint]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function cellTitle(row: LoadRow, sprintIdx: number): string {
    const cell = row.cells[sprintIdx];
    const s = plan.sprints[sprintIdx];
    const lines = [`${row.role.label} · ${SCOPE_TITLE[row.scope]}`, `Спринт ${s.jhd}/${s.amclct}`];
    if (!row.tracked) {
      lines.push(`${cell.demand} ${tasksWord(cell.demand)} (ёмкость не считаем — чужая команда)`);
      return lines.join('\n');
    }
    lines.push(`Задач: ${cell.demand}`);
    lines.push(`Людей: ${fmt(cell.capacity)} (${cell.headcount} чел.)`);
    if (cell.capacity > 0) {
      lines.push(`На человека: ${fmt(cell.perPerson)}`);
      const loss = switchingLossPct(cell.perPerson);
      if (loss > 0) lines.push(`Потери на переключение контекста: ~${loss}%`);
    } else if (cell.demand > 0) {
      lines.push('Некому делать: людей нет или все в отпуске');
    }
    const titles = cell.epicIds
      .map((id) => plan.epics.find((e) => e.id === id)?.title)
      .filter(Boolean)
      .slice(0, 6);
    if (titles.length) lines.push('', ...titles.map((t) => `• ${t}`));
    return lines.join('\n');
  }

  return (
    <div className="load-panel">
      <div className="load-panel-header">
        <span className="load-panel-title">Загрузка команд</span>
        <div className="zoom-group">
          <button className={unit === 'tasks' ? 'active' : ''} onClick={() => setUnit('tasks')}>
            задачи
          </button>
          <button className={unit === 'perPerson' ? 'active' : ''} onClick={() => setUnit('perPerson')}>
            на человека
          </button>
        </div>
        <div className="load-alerts">
          {currentSprint < 0 ? null : alerts.length === 0 ? (
            <span className="load-alert-ok">в текущем спринте перегрузов нет</span>
          ) : (
            <>
              <span>сейчас:</span>
              {alerts.slice(0, 4).map((a, i) => (
                <span key={i} className={`load-alert-chip${a.status === 'tight' ? ' tight' : ''}`}>
                  {a.text}
                </span>
              ))}
              {alerts.length > 4 && <span>и ещё {alerts.length - 4}</span>}
            </>
          )}
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        {highlight && (
          <button className="btn small" onClick={() => onHighlight(null)}>
            снять подсветку
          </button>
        )}
        <button className="btn small" onClick={onOpenTeams}>
          Команды и люди
        </button>
        <button className="btn small" onClick={onClose}>
          скрыть
        </button>
      </div>

      <div className="load-scroll" ref={scrollRef}>
        <div className="load-grid" style={{ ['--n-cols' as any]: n, ['--col-width' as any]: `${colWidth}px` }}>
          {grouped.map((group) => (
            <div key={group.scope} style={{ display: 'contents' }}>
              <div className="load-scope-row">{SCOPE_TITLE[group.scope]}</div>
              {group.rows.map((row) => {
                const isOpen = expanded.has(row.key);
                return (
                  <div key={row.key} style={{ display: 'contents' }}>
                    <div className="load-label role" onClick={() => toggle(row.key)} title="Показать людей">
                      <span className="role-dot" style={{ background: row.role.color }} />
                      <span className={`collapse-arrow${isOpen ? '' : ' collapsed'}`}>▾</span>
                      <span className="role-label-text">{row.role.label}</span>
                      <span className="load-cap">
                        {row.tracked ? `${fmt(row.cells[0]?.capacity ?? 0)} чел.` : 'чужая ёмкость'}
                      </span>
                    </div>
                    {visibleSprints.map((s) => {
                      const cell = row.cells[s.index];
                      const value = !row.tracked
                        ? cell.demand
                        : unit === 'tasks'
                          ? cell.demand
                          : cell.capacity > 0
                            ? cell.perPerson
                            : cell.demand;
                      const isHot =
                        highlight &&
                        highlight.role === row.role.id &&
                        highlight.scope === row.scope &&
                        highlight.sprintIndex === s.index;
                      return (
                        <div
                          key={s.index}
                          className={`load-cell ${cell.status}${s.index === currentSprint ? ' current-col' : ''}${isHot ? ' spotlight' : ''}`}
                          title={cellTitle(row, s.index)}
                          onClick={() =>
                            cell.demand > 0
                              ? onHighlight({ role: row.role.id, scope: row.scope, sprintIndex: s.index, epicIds: cell.epicIds })
                              : onHighlight(null)
                          }
                        >
                          {cell.demand === 0 ? '·' : fmt(value)}
                        </div>
                      );
                    })}

                    {isOpen &&
                      row.persons.map((pl) => (
                        <div key={pl.person.id} style={{ display: 'contents' }}>
                          <div className="load-label person">
                            <span className="role-label-text">{pl.person.name}</span>
                            <span className="load-cap">{fmt(pl.share)}</span>
                          </div>
                          {visibleSprints.map((s) => {
                            const pc = pl.cells[s.index];
                            const okMax = row.shared
                              ? plan.settings?.thresholds?.okPerPersonShared ?? 1
                              : plan.settings?.thresholds?.okPerPerson ?? 2;
                            let cls = '';
                            if (pc.absent) cls = 'absent';
                            else if (pc.tasks === 0) cls = 'free';
                            else if (pc.tasks > okMax) cls = 'over';
                            else if (pc.tasks > 1) cls = 'tight';
                            return (
                              <div
                                key={s.index}
                                className={`person-cell ${cls}`}
                                title={pc.absent ? 'Отпуск' : `${fmt(pc.tasks)} ${tasksWord(Math.round(pc.tasks))}`}
                              >
                                {pc.absent ? '×' : pc.tasks === 0 ? '·' : fmt(pc.tasks)}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
