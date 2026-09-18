import { useState } from 'react';
import type { Person, Plan, RoleDef, RoleId, Team, TeamId } from '../types';
import { nextRoleColor } from '../lib/roles';
import { isSharedRole } from '../lib/load';
import { nextTeamColor, sprintNumbersLabel } from '../lib/teams';

interface Props {
  plan: Plan;
  updatePlan: (fn: (p: Plan) => Plan) => void;
  cutoffIndex: number;
  currentSprint: number;
  onClose: () => void;
}

const SHARES = [0, 0.25, 0.5, 0.75, 1];

function shareOf(person: Person, team: TeamId): number {
  return person.allocations.find((a) => a.team === team)?.share ?? 0;
}

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function fmtCap(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function capacityWord(n: number): string {
  if (!Number.isInteger(n)) return 'ставки';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'ставка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'ставки';
  return 'ставок';
}

function capacityLabel(n: number): string {
  return `${fmtCap(n)} ${capacityWord(n)}`;
}

export default function TeamsPanel({ plan, updatePlan, cutoffIndex, currentSprint, onClose }: Props) {
  const [absenceFor, setAbsenceFor] = useState<string | null>(null);
  const teams = plan.teams;
  const refSprint = currentSprint >= 0 ? currentSprint : 0;

  // ——— команды ———

  function mutateTeam(id: string, fn: (t: Team) => Team) {
    updatePlan((p) => ({ ...p, teams: p.teams.map((t) => (t.id === id ? fn(t) : t)) }));
  }

  function moveTeamUp(index: number) {
    if (index <= 0) return;
    updatePlan((p) => {
      const next = [...p.teams];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return { ...p, teams: next };
    });
  }

  function addTeam() {
    const base = teams[0]?.sprintBase ?? 1;
    const team: Team = { id: uid('team'), name: 'Новая команда', shortName: 'НОВ', sprintBase: base, color: nextTeamColor(teams) };
    updatePlan((p) => ({ ...p, teams: [...p.teams, team] }));
  }

  function removeTeam(team: Team) {
    if (teams.length <= 1) return;
    const epicsCount = plan.epics.filter((e) => e.teams.includes(team.id)).length;
    const peopleCount = plan.people.filter((p) => p.allocations.some((a) => a.team === team.id)).length;
    const details = epicsCount || peopleCount ? `\n\nОна указана у фич: ${epicsCount}, у людей: ${peopleCount} — у них эта команда пропадёт.` : '';
    if (!window.confirm(`Удалить команду «${team.name}»?${details}`)) return;
    updatePlan((p) => ({
      ...p,
      teams: p.teams.filter((t) => t.id !== team.id),
      epics: p.epics.map((e) => ({ ...e, teams: e.teams.filter((id) => id !== team.id) })),
      people: p.people.map((x) => ({ ...x, allocations: x.allocations.filter((a) => a.team !== team.id) })),
    }));
  }

  // ——— роли ———

  function mutateRole(id: string, fn: (r: RoleDef) => RoleDef) {
    updatePlan((p) => ({ ...p, roles: p.roles.map((r) => (r.id === id ? fn(r) : r)) }));
  }

  function addRoleDef() {
    const role: RoleDef = { id: uid('role'), label: 'Новая роль', color: nextRoleColor(plan.roles), capacityTracked: true, shared: false };
    updatePlan((p) => ({ ...p, roles: [...p.roles, role] }));
  }

  function moveRole(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= plan.roles.length) return;
    updatePlan((p) => {
      const next = [...p.roles];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...p, roles: next };
    });
  }

  function roleUsage(roleId: string) {
    const epics = plan.epics.filter((e) => e.segments.some((s) => s.role === roleId)).length;
    const people = plan.people.filter((p) => p.role === roleId).length;
    return { epics, people };
  }

  function removeRoleDef(role: RoleDef) {
    const usage = roleUsage(role.id);
    if (usage.epics > 0 || usage.people > 0) {
      window.alert(
        `Роль «${role.label}» используется: колбасок — ${usage.epics}, людей — ${usage.people}.\n\nСначала уберите их (удалите колбаски этой роли и людей на ней), потом можно будет удалить роль.`
      );
      return;
    }
    if (!window.confirm(`Удалить роль «${role.label}»?`)) return;
    updatePlan((p) => ({
      ...p,
      roles: p.roles.filter((r) => r.id !== role.id),
      epics: p.epics.map((e) => (e.visibleRoles ? { ...e, visibleRoles: e.visibleRoles.filter((id) => id !== role.id) } : e)),
    }));
  }

  // ——— люди ———

  function mutatePerson(id: string, fn: (p: Person) => Person) {
    updatePlan((p) => ({ ...p, people: p.people.map((x) => (x.id === id ? fn(x) : x)) }));
  }

  function setShare(person: Person, team: TeamId, share: number) {
    mutatePerson(person.id, (p) => {
      const others = p.allocations.filter((a) => a.team !== team);
      const next = share > 0 ? [...others, { team, share }] : others;
      const order = teams.map((t) => t.id);
      next.sort((a, b) => order.indexOf(a.team) - order.indexOf(b.team));
      return { ...p, allocations: next };
    });
  }

  function addPerson(role: RoleId) {
    const person: Person = {
      id: uid(`p-${role}`),
      name: 'Новый человек',
      role,
      allocations: teams.length ? [{ team: teams[0].id, share: 1 }] : [],
      absences: [],
    };
    updatePlan((p) => ({ ...p, people: [...p.people, person] }));
  }

  function removePerson(person: Person) {
    if (!window.confirm(`Убрать «${person.name}» из состава?`)) return;
    updatePlan((p) => ({ ...p, people: p.people.filter((x) => x.id !== person.id) }));
  }

  function toggleAbsence(person: Person, sprintIndex: number) {
    mutatePerson(person.id, (p) => {
      const cur = p.absences ?? [];
      const next = cur.includes(sprintIndex) ? cur.filter((i) => i !== sprintIndex) : [...cur, sprintIndex].sort((a, b) => a - b);
      return { ...p, absences: next };
    });
  }

  const absenceSprints = plan.sprints.slice(cutoffIndex, cutoffIndex + 26);

  return (
    <div id="teams-panel" className="side-panel wide" role="dialog" aria-modal="false" aria-labelledby="teams-panel-title">
      <div className="side-panel-header">
        <h2 id="teams-panel-title">Команды и ресурсы</h2>
        <button className="btn small" onClick={onClose} aria-label="Закрыть настройки команд и ресурсов">
          ✕
        </button>
      </div>
      <div className="side-panel-body">
        <section className="team-section">
          <div className="section-title">Команды</div>
          <div className="team-table">
            <div className="team-table-head">
              <span />
              <span />
              <span>Название</span>
              <span>Кратко</span>
              <span title="Номер текущего спринта у этой команды">№ спринта сейчас</span>
              <span />
            </div>
            {teams.map((team, i) => (
              <div className="team-table-row" key={team.id}>
                <button
                  className="icon-btn"
                  title="Выше — номер этой команды будет раньше в шапке"
                  aria-label={`Переместить команду «${team.name}» выше`}
                  disabled={i === 0}
                  onClick={() => moveTeamUp(i)}
                >
                  ↑
                </button>
                <input
                  type="color"
                  className="color-swatch"
                  value={team.color}
                  title="Метка команды на карточках фич"
                  aria-label={`Цвет метки команды «${team.name}»`}
                  onChange={(e) => mutateTeam(team.id, (t) => ({ ...t, color: e.target.value }))}
                />
                <input
                  type="text"
                  value={team.name}
                  autoFocus={i === 0}
                  aria-label={`Название команды ${i + 1}`}
                  onChange={(e) => mutateTeam(team.id, (t) => ({ ...t, name: e.target.value }))}
                />
                <input
                  type="text"
                  value={team.shortName}
                  aria-label={`Краткое название команды «${team.name}»`}
                  onChange={(e) => mutateTeam(team.id, (t) => ({ ...t, shortName: e.target.value }))}
                />
                <input
                  type="number"
                  value={team.sprintBase + refSprint}
                  aria-label={`Номер текущего спринта команды «${team.name}»`}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) mutateTeam(team.id, (t) => ({ ...t, sprintBase: v - refSprint }));
                  }}
                />
                <button
                  className="icon-btn"
                  title={teams.length <= 1 ? 'Должна остаться хотя бы одна команда' : 'Удалить команду'}
                  aria-label={`Удалить команду «${team.name}»`}
                  disabled={teams.length <= 1}
                  onClick={() => removeTeam(team)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="role-add-btn" onClick={addTeam}>
            + команда
          </button>
        </section>

        <section className="team-section">
          <div className="section-title">Роли</div>
          <p className="hint">
            Порядок отсюда используют все фичи без собственной сортировки. Роли можно переименовать, перекрасить или
            добавить; удалить — только когда роль нигде не используется (нет колбасок и людей).
          </p>
          <div className="team-table role-table">
            <div className="team-table-head role-table-head">
              <span>Порядок</span>
              <span />
              <span>Название</span>
              <span title="Учитывать эту роль в загрузке команд">Считать</span>
              <span />
            </div>
            {plan.roles.map((role, roleIndex) => {
              const usage = roleUsage(role.id);
              const inUse = usage.epics > 0 || usage.people > 0;
              return (
                <div className="team-table-row role-table-row" key={role.id}>
                  <span className="global-role-order-controls">
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={roleIndex === 0}
                      aria-label={`Переместить роль «${role.label}» выше глобально`}
                      title="Выше во всех фичах без собственного порядка"
                      onClick={() => moveRole(roleIndex, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={roleIndex === plan.roles.length - 1}
                      aria-label={`Переместить роль «${role.label}» ниже глобально`}
                      title="Ниже во всех фичах без собственного порядка"
                      onClick={() => moveRole(roleIndex, 1)}
                    >
                      ↓
                    </button>
                  </span>
                  <input
                    type="color"
                    className="color-swatch"
                    value={role.color}
                    onChange={(e) => mutateRole(role.id, (r) => ({ ...r, color: e.target.value }))}
                    title="Цвет роли"
                    aria-label={`Цвет роли «${role.label}»`}
                  />
                  <input
                    type="text"
                    value={role.label}
                    aria-label="Название роли"
                    onChange={(e) => mutateRole(role.id, (r) => ({ ...r, label: e.target.value }))}
                  />
                  <input
                    type="checkbox"
                    checked={role.capacityTracked}
                    onChange={(e) => mutateRole(role.id, (r) => ({ ...r, capacityTracked: e.target.checked }))}
                    title="Учитывать в загрузке команд"
                    aria-label={`Учитывать роль «${role.label}» в загрузке команд`}
                  />
                  <button
                    className="icon-btn"
                    title={inUse ? `Занята: колбасок ${usage.epics}, людей ${usage.people}` : 'Удалить роль'}
                    aria-label={`Удалить роль «${role.label}»`}
                    onClick={() => removeRoleDef(role)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button className="role-add-btn" onClick={addRoleDef}>
            + роль
          </button>
        </section>

        <section className="team-section">
          <div className="section-title">Люди и их доли</div>
          <p className="hint">
            Доля — какую часть времени человек отдаёт команде. Если у человека доли в нескольких командах, его загрузка
            считается суммарно по всем ним, и порог для него строже. Отпуска вычитаются из ёмкости спринта.
          </p>

          {plan.roles.map((role) => {
            const people = plan.people.filter((p) => p.role === role.id);
            const shared = isSharedRole(plan, role.id);
            const caps = teams.map((t) => people.reduce((acc, p) => acc + shareOf(p, t.id), 0));
            const total = caps.reduce((a, b) => a + b, 0);
            return (
              <div className="team-role-group" key={role.id}>
                <div className="team-role-head">
                  <span className="role-dot" style={{ background: role.color }} />
                  {role.label}
                  <span className="team-role-cap">
                    {people.length === 0
                      ? 'нет ставок'
                      : shared
                        ? `общий пул ${capacityLabel(total)}`
                        : teams.map((t, i) => `${t.shortName} ${capacityLabel(caps[i])}`).join(' · ')}
                  </span>
                </div>

                {people.length > 0 && (
                  <div className="team-col-head">
                    {teams.map((t) => (
                      <span key={t.id} title={t.name}>
                        {t.shortName}
                      </span>
                    ))}
                    <span style={{ width: 52 }} />
                  </div>
                )}

                {people.map((person) => (
                  <div key={person.id}>
                    <div className="team-person-row">
                      <input
                        type="text"
                        value={person.name}
                        aria-label={`Имя ресурса роли «${role.label}»`}
                        onChange={(e) => mutatePerson(person.id, (p) => ({ ...p, name: e.target.value }))}
                      />
                      {teams.map((team) => {
                        const v = shareOf(person, team.id);
                        return (
                          <select
                            key={team.id}
                            className={`share-select${v === 0 ? ' zero' : ''}`}
                            value={v}
                            aria-label={`Доля ${person.name || 'ресурса'} в команде «${team.name}»`}
                            onChange={(e) => setShare(person, team.id, Number(e.target.value))}
                            title={team.name}
                          >
                            {SHARES.map((s) => (
                              <option key={s} value={s}>
                                {s === 0 ? '—' : String(s).replace('.', ',')}
                              </option>
                            ))}
                          </select>
                        );
                      })}
                      <button
                        className={`icon-btn${absenceFor === person.id ? ' active' : ''}`}
                        title="Отпуска и отсутствия"
                        aria-label={`Отпуска и отсутствия: ${person.name || 'ресурс'}`}
                        onClick={() => setAbsenceFor(absenceFor === person.id ? null : person.id)}
                      >
                        отп{person.absences?.length ? ` ${person.absences.length}` : ''}
                      </button>
                      <button
                        className="icon-btn"
                        title="Убрать из состава"
                        aria-label={`Убрать ${person.name || 'ресурс'} из состава`}
                        onClick={() => removePerson(person)}
                      >
                        ✕
                      </button>
                    </div>
                    {absenceFor === person.id && (
                      <div className="absence-editor">
                        <div className="absence-title">Отметьте спринты, когда человека нет:</div>
                        <div className="absence-chips">
                          {absenceSprints.map((s) => (
                            <button
                              key={s.index}
                              className={`absence-chip${person.absences?.includes(s.index) ? ' on' : ''}`}
                              onClick={() => toggleAbsence(person, s.index)}
                            >
                              {sprintNumbersLabel(teams, s.index)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div className="team-person-row">
                  <button className="role-add-btn" onClick={() => addPerson(role.id)}>
                    + человек
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
