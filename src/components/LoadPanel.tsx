import { useMemo, useState } from 'react';
import type { Plan, Sprint } from '../types';
import { SHARED_SCOPE, scopeShort, scopeTitle, switchingLossPct, type LoadResult, type LoadRow, type LoadScope } from '../lib/load';
import { sprintNumbersLabel } from '../lib/teams';

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
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function tasksWord(n: number): string {
  return plural(n, 'фича', 'фичи', 'фич');
}

const OPEN_KEY = 'kolbaski-load-open';

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
}: Props) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) !== '0');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const n = visibleSprints.length;

  function toggleOpen() {
    setOpen((v) => {
      localStorage.setItem(OPEN_KEY, v ? '0' : '1');
      return !v;
    });
  }

  const grouped = useMemo(() => {
    const scopes: LoadScope[] = [...plan.teams.map((t) => t.id), SHARED_SCOPE];
    return scopes
      .map((scope) => ({ scope, rows: load.rows.filter((r) => r.scope === scope) }))
      .filter((g) => g.rows.length > 0);
  }, [load.rows, plan.teams]);

  const alerts = useMemo(() => {
    if (currentSprint < 0) return [];
    const out: { text: string; status: 'over' | 'tight' }[] = [];
    for (const row of load.rows) {
      const cell = row.cells[currentSprint];
      if (!cell) continue;
      if (cell.status === 'over' || cell.status === 'nocap' || cell.status === 'tight') {
        const who = cell.capacity > 0 ? `${fmt(cell.capacity)} чел.` : 'никого нет';
        out.push({
          text: `${row.role.label} (${scopeShort(plan, row.scope)}): ${cell.demand} ${tasksWord(cell.demand)} на ${who}`,
          status: cell.status === 'tight' ? 'tight' : 'over',
        });
      }
    }
    return out.sort((a, b) => (a.status === b.status ? 0 : a.status === 'over' ? -1 : 1));
  }, [load.rows, currentSprint, plan]);

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
    const lines = [`${row.role.label} · ${scopeTitle(plan, row.scope)}`, `Спринт ${sprintNumbersLabel(plan.teams, sprintIdx)}`, ''];
    if (!row.tracked) {
      lines.push(`В работе ${cell.demand} ${tasksWord(cell.demand)}. Людей не считаем — это чужая команда.`);
      return lines.join('\n');
    }
    lines.push(`В работе одновременно: ${cell.demand} ${tasksWord(cell.demand)}`);
    lines.push(`Людей в спринте: ${fmt(cell.capacity)}`);
    if (cell.capacity > 0 && cell.demand > 0) {
      lines.push(`На одного человека: ${fmt(cell.perPerson)}`);
      const loss = switchingLossPct(cell.perPerson);
      if (loss > 0) lines.push(`≈${loss}% времени уходит на переключение между задачами`);
    } else if (cell.demand > 0) {
      lines.push('Делать некому: людей нет или все в отпуске');
    }
    const titles = cell.epicIds
      .map((id) => plan.epics.find((e) => e.id === id)?.title)
      .filter(Boolean)
      .slice(0, 6);
    if (titles.length) lines.push('', ...titles.map((t) => `• ${t}`), '', 'Клик — подсветить эти колбаски');
    return lines.join('\n');
  }

  return (
    <div className={`load-panel${open ? '' : ' collapsed'}`}>
      <div className="load-panel-header">
        <button className="load-toggle" onClick={toggleOpen} title={open ? 'Свернуть' : 'Развернуть'}>
          <span className={`collapse-arrow${open ? '' : ' collapsed'}`}>▾</span>
          <span className="load-panel-title">Загрузка</span>
        </button>

        <div className="load-alerts">
          {currentSprint < 0 ? null : alerts.length === 0 ? (
            <span className="load-alert-ok">сейчас перегрузов нет</span>
          ) : (
            <>
              <span>сейчас:</span>
              {alerts.slice(0, 3).map((a, i) => (
                <span key={i} className={`load-alert-chip${a.status === 'tight' ? ' tight' : ''}`}>
                  {a.text}
                </span>
              ))}
              {alerts.length > 3 && <span>+ ещё {alerts.length - 3}</span>}
            </>
          )}
        </div>

        <div className="spacer" style={{ flex: 1 }} />

        {open && (
          <div className="load-legend" title="Цвет показывает, сколько фич одновременно приходится на одного человека">
            <span>на человека:</span>
            <span className="legend-item ok">до 1</span>
            <span className="legend-item tight">2</span>
            <span className="legend-item over">3+</span>
          </div>
        )}
        {highlight && (
          <button className="btn small" onClick={() => onHighlight(null)}>
            снять подсветку
          </button>
        )}
        <button className="btn small" onClick={onOpenTeams}>
          Состав команд
        </button>
      </div>

      {open && (
        <div className="load-scroll" ref={scrollRef}>
          <div className="load-grid" style={{ ['--n-cols' as any]: n, ['--col-width' as any]: `${colWidth}px` }}>
            {grouped.map((group) => (
              <div key={group.scope} style={{ display: 'contents' }}>
                <div className="load-scope-row">{scopeTitle(plan, group.scope)}</div>
                {group.rows.map((row) => {
                  const isOpen = expanded.has(row.key);
                  return (
                    <div key={row.key} style={{ display: 'contents' }}>
                      <div className="load-label role" onClick={() => toggle(row.key)} title="Показать людей">
                        <span className="role-dot" style={{ background: row.role.color }} />
                        <span className={`collapse-arrow${isOpen ? '' : ' collapsed'}`}>▾</span>
                        <span className="role-label-text">{row.role.label}</span>
                        <span className="load-cap">{row.tracked ? `${fmt(row.nominalCapacity)} чел.` : 'чужая ёмкость'}</span>
                      </div>
                      {visibleSprints.map((s) => {
                        const cell = row.cells[s.index];
                        const showPer = row.tracked && cell.demand > 0 && cell.capacity > 0 && cell.capacity !== 1;
                        const isHot =
                          highlight &&
                          highlight.role === row.role.id &&
                          highlight.scope === row.scope &&
                          highlight.sprintIndex === s.index;
                        return (
                          <div
                            key={s.index}
                            className={`load-cell ${cell.status}${s.index === currentSprint ? ' current-col' : ''}${isHot ? ' hot' : ''}`}
                            title={cellTitle(row, s.index)}
                            onClick={() =>
                              cell.demand > 0
                                ? onHighlight({ role: row.role.id, scope: row.scope, sprintIndex: s.index, epicIds: cell.epicIds })
                                : onHighlight(null)
                            }
                          >
                            {cell.demand === 0 ? (
                              <span className="load-zero">·</span>
                            ) : (
                              <>
                                <span className="load-main">{cell.demand}</span>
                                {showPer && <span className="load-per">по {fmt(cell.perPerson)}</span>}
                                {row.tracked && cell.capacity === 0 && <span className="load-per">нет людей</span>}
                              </>
                            )}
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
                                ? plan.settings.thresholds.okPerPersonShared
                                : plan.settings.thresholds.okPerPerson;
                              let cls = '';
                              if (pc.absent) cls = 'absent';
                              else if (pc.tasks === 0) cls = 'free';
                              else if (pc.tasks > okMax) cls = 'over';
                              else if (pc.tasks > 1) cls = 'tight';
                              return (
                                <div
                                  key={s.index}
                                  className={`person-cell ${cls}`}
                                  title={pc.absent ? 'Отпуск' : pc.tasks === 0 ? 'Свободен' : `${fmt(pc.tasks)} ${tasksWord(Math.round(pc.tasks))}`}
                                >
                                  {pc.absent ? 'отп.' : pc.tasks === 0 ? '·' : fmt(pc.tasks)}
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
      )}
    </div>
  );
}
