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
  if (!Number.isInteger(n)) return 'фичи';
  return plural(n, 'фича', 'фичи', 'фич');
}

function capacityWord(n: number): string {
  return Number.isInteger(n) ? plural(n, 'ставка', 'ставки', 'ставок') : 'ставки';
}

function capacityLabel(n: number): string {
  return `${fmt(n)} ${capacityWord(n)}`;
}

function ThresholdLegend({ label, max }: { label: string; max: number }) {
  const effectiveMax = Math.max(1, max);
  return (
    <span className="legend-threshold">
      <span className="legend-threshold-label">{label}</span>
      <span className="legend-item ok">≤ 1</span>
      {effectiveMax > 1 && <span className="legend-item tight">≤ {fmt(effectiveMax)}</span>}
      <span className="legend-item over">&gt; {fmt(effectiveMax)}</span>
    </span>
  );
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
        const available = cell.capacity > 0 ? capacityLabel(cell.capacity) : 'нет доступных ставок';
        out.push({
          text: `${row.role.label} (${scopeShort(plan, row.scope)}): ${cell.demand} ${tasksWord(cell.demand)} на ${available}`,
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
      lines.push(`В работе ${cell.demand} ${tasksWord(cell.demand)}. Доступные ставки для этой роли не рассчитываются.`);
      return lines.join('\n');
    }
    lines.push(`В работе одновременно: ${cell.demand} ${tasksWord(cell.demand)}`);
    lines.push(`Доступно в спринте: ${capacityLabel(cell.capacity)}`);
    if (cell.capacity > 0 && cell.demand > 0) {
      lines.push(`На одну ставку: ${fmt(cell.perPerson)} ${tasksWord(cell.perPerson)}`);
      const loss = switchingLossPct(cell.perPerson);
      if (loss > 0) lines.push(`≈${loss}% времени уходит на переключение между задачами`);
    } else if (cell.demand > 0) {
      lines.push('Нет доступных ставок: ресурс не назначен или отсутствует');
    }
    const titles = cell.epicIds
      .map((id) => plan.epics.find((e) => e.id === id)?.title)
      .filter(Boolean)
      .slice(0, 6);
    if (titles.length) lines.push('', ...titles.map((t) => `• ${t}`), '', 'Клик — подсветить эти колбаски');
    return lines.join('\n');
  }

  return (
    <section className={`load-panel${open ? '' : ' collapsed'}`} aria-label="Загрузка команд">
      <div className="load-panel-header">
        <button
          className="load-toggle"
          onClick={toggleOpen}
          title={open ? 'Свернуть' : 'Развернуть'}
          aria-expanded={open}
          aria-label={`${open ? 'Свернуть' : 'Развернуть'} панель загрузки`}
        >
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
          <div className="load-legend" title="Цвет показывает количество одновременных фич на одну ставку">
            <span>фич на ставку:</span>
            <ThresholdLegend label="роль" max={plan.settings.thresholds.okPerPerson} />
            {plan.settings.thresholds.okPerPersonShared !== plan.settings.thresholds.okPerPerson && (
              <ThresholdLegend label="общая" max={plan.settings.thresholds.okPerPersonShared} />
            )}
          </div>
        )}
        {highlight && (
          <button className="btn small" onClick={() => onHighlight(null)}>
            снять подсветку
          </button>
        )}
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
                      <button
                        type="button"
                        className="load-label role"
                        onClick={() => toggle(row.key)}
                        title={isOpen ? 'Скрыть ресурсы' : 'Показать ресурсы'}
                        aria-expanded={isOpen}
                        aria-label={`${row.role.label}, ${scopeTitle(plan, row.scope)}. ${isOpen ? 'Скрыть' : 'Показать'} ресурсы`}
                      >
                        <span className="role-dot" style={{ background: row.role.color }} />
                        <span className={`collapse-arrow${isOpen ? '' : ' collapsed'}`}>▾</span>
                        <span className="role-label-text">{row.role.label}</span>
                        <span className="load-cap">{row.tracked ? capacityLabel(row.nominalCapacity) : 'без расчёта'}</span>
                      </button>
                      {visibleSprints.map((s) => {
                        const cell = row.cells[s.index];
                        const showPer = row.tracked && cell.demand > 0 && cell.capacity > 0 && cell.capacity !== 1;
                        const isHot =
                          highlight &&
                          highlight.role === row.role.id &&
                          highlight.scope === row.scope &&
                          highlight.sprintIndex === s.index;
                        return (
                          <button
                            type="button"
                            key={s.index}
                            className={`load-cell ${cell.status}${s.index === currentSprint ? ' current-col' : ''}${isHot ? ' hot' : ''}`}
                            title={cellTitle(row, s.index)}
                            aria-label={cellTitle(row, s.index).replace(/\n+/g, '. ')}
                            aria-pressed={!!isHot}
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
                                {row.tracked && cell.capacity === 0 && <span className="load-per">нет ставок</span>}
                              </>
                            )}
                          </button>
                        );
                      })}

                      {isOpen &&
                        row.persons.map((pl) => (
                          <div key={pl.person.id} style={{ display: 'contents' }}>
                            <div className="load-label person">
                              <span className="role-label-text">{pl.person.name}</span>
                              <span className="load-cap">{capacityLabel(pl.share)}</span>
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
                                  title={pc.absent ? 'Отпуск' : pc.tasks === 0 ? 'Свободен' : `${fmt(pc.tasks)} ${tasksWord(pc.tasks)}`}
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
    </section>
  );
}
