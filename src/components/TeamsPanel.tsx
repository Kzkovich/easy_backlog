import { useState } from 'react';
import type { Person, Plan, RoleDef, RoleId, Team, TeamId } from '../types';
import { nextRoleColor } from '../lib/roles';
import { isSharedRole } from '../lib/load';
import { sprintNumbersLabel } from '../lib/teams';

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
    const team: Team = { id: uid('team'), name: 'Новая команда', shortName: 'НОВ', sprintBase: base };
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
    <div className="side-panel wide">
      <div className="side-panel-header">
        <h2>Состав команд</h2>
        <button className="btn small" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="side-panel-body">
        <section className="team-section">
          <div className="section-title">Команды</div>
          <div className="team-table">
            <div className="team-table-head">
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
                  disabled={i === 0}
                  onClick={() => moveTeamUp(i)}
                >
                  ↑
                </button>
                <input
                  type="text"
                  value={team.name}
                  onChange={(e) => mutateTeam(team.id, (t) => ({ ...t, name: e.target.value }))}
                />
                <input
                  type="text"
                  value={team.shortName}
                  onChange={(e) => mutateTeam(team.id, (t) => ({ ...t, shortName: e.target.value }))}
                />
                <input
                  type="number"
                  value={team.sprintBase + refSprint}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) mutateTeam(team.id, (t) => ({ ...t, sprintBase: v - refSprint }));
                  }}
                />
                <button
                  className="icon-btn"
                  title={teams.length <= 1 ? 'Должна остаться хотя бы одна команда' : 'Удалить команду'}
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
            Роли, которые видны строками у каждой фичи. Переименовать, перекрасить или добавить можно здесь; удалить —
            только когда роль нигде не используется (нет колбасок и людей).
          </p>
          <div className="team-table role-table">
            <div className="team-table-head role-table-head">
              <span />
              <span>Название</span>
              <span title="Учитывать эту роль в загрузке команд">Считать</span>
              <span />
            </div>
            {plan.roles.map((role) => {
              const usage = roleUsage(role.id);
              const inUse = usage.epics > 0 || usage.people > 0;
              return (
                <div className="team-table-row role-table-row" key={role.id}>
                  <input
                    type="color"
                    className="color-swatch"
                    value={role.color}
                    onChange={(e) => mutateRole(role.id, (r) => ({ ...r, color: e.target.value }))}
                    title="Цвет роли"
                  />
                  <input type="text" value={role.label} onChange={(e) => mutateRole(role.id, (r) => ({ ...r, label: e.target.value }))} />
                  <input
                    type="checkbox"
                    checked={role.capacityTracked}
                    onChange={(e) => mutateRole(role.id, (r) => ({ ...r, capacityTracked: e.target.checked }))}
                    title="Учитывать в загрузке команд"
                  />
                  <button
                    className="icon-btn"
                    title={inUse ? `Занята: колбасок ${usage.epics}, людей ${usage.people}` : 'Удалить роль'}
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
                      ? 'никого'
                      : shared
                        ? `общий пул ${fmtCap(total)} чел.`
                        : teams.map((t, i) => `${t.shortName} ${fmtCap(caps[i])}`).join(' · ')}
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
                        onChange={(e) => mutatePerson(person.id, (p) => ({ ...p, name: e.target.value }))}
                      />
                      {teams.map((team) => {
                        const v = shareOf(person, team.id);
                        return (
                          <select
                            key={team.id}
                            className={`share-select${v === 0 ? ' zero' : ''}`}
                            value={v}
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
                        onClick={() => setAbsenceFor(absenceFor === person.id ? null : person.id)}
                      >
                        отп{person.absences?.length ? ` ${person.absences.length}` : ''}
                      </button>
                      <button className="icon-btn" title="Убрать из состава" onClick={() => removePerson(person)}>
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
