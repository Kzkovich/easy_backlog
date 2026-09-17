import { useState } from 'react';
import type { Person, Plan, RoleId, TeamId } from '../types';
import { ROLE_DEFS } from '../lib/roles';
import { isSharedRole } from '../lib/load';

interface Props {
  plan: Plan;
  updatePlan: (fn: (p: Plan) => Plan) => void;
  cutoffIndex: number;
  onClose: () => void;
}

const SHARES = [0, 0.25, 0.5, 0.75, 1];
const TEAMS: TeamId[] = ['AMCLCT', 'JHD'];

function shareOf(person: Person, team: TeamId): number {
  return person.allocations.find((a) => a.team === team)?.share ?? 0;
}

function makeId(role: RoleId) {
  return `p-${role}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export default function TeamsPanel({ plan, updatePlan, cutoffIndex, onClose }: Props) {
  const [absenceFor, setAbsenceFor] = useState<string | null>(null);

  function mutatePerson(id: string, fn: (p: Person) => Person) {
    updatePlan((p) => ({ ...p, people: p.people.map((x) => (x.id === id ? fn(x) : x)) }));
  }

  function setShare(person: Person, team: TeamId, share: number) {
    mutatePerson(person.id, (p) => {
      const others = p.allocations.filter((a) => a.team !== team);
      const next = share > 0 ? [...others, { team, share }] : others;
      next.sort((a, b) => TEAMS.indexOf(a.team) - TEAMS.indexOf(b.team));
      return { ...p, allocations: next };
    });
  }

  function addPerson(role: RoleId) {
    const person: Person = {
      id: makeId(role),
      name: 'Новый человек',
      role,
      allocations: [{ team: 'AMCLCT', share: 1 }],
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
        <h2>Команды и люди</h2>
        <button className="btn small" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="side-panel-body">
        <p className="hint">
          Кто в каких командах работает и с какой долей. Доля 0,5 в обеих командах = один человек на две команды: его
          загрузка считается суммарно, и пороги для него строже. Отпуска вычитаются из ёмкости того спринта.
        </p>

        {ROLE_DEFS.map((role) => {
          const people = plan.people.filter((p) => p.role === role.id);
          const shared = isSharedRole(plan, role.id);
          const capAm = people.reduce((acc, p) => acc + shareOf(p, 'AMCLCT'), 0);
          const capJhd = people.reduce((acc, p) => acc + shareOf(p, 'JHD'), 0);
          return (
            <div className="team-role-group" key={role.id}>
              <div className="team-role-head">
                <span className="role-dot" style={{ background: role.color }} />
                {role.label}
                <span className="team-role-cap">
                  {shared
                    ? `общий пул ${(capAm + capJhd).toFixed(2).replace(/\.?0+$/, '')} чел.`
                    : `AMCLCT ${capAm} · JHD ${capJhd}`}
                </span>
              </div>

              {people.length > 0 && (
                <div className="team-col-head">
                  <span>AMCLCT</span>
                  <span>JHD</span>
                  <span style={{ width: 46 }} />
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
                    {TEAMS.map((team) => {
                      const v = shareOf(person, team);
                      return (
                        <select
                          key={team}
                          className={`share-select${v === 0 ? ' zero' : ''}`}
                          value={v}
                          onChange={(e) => setShare(person, team, Number(e.target.value))}
                          title={team}
                        >
                          {SHARES.map((s) => (
                            <option key={s} value={s}>
                              {s === 0 ? '—' : s}
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
                      🏖 {person.absences?.length || ''}
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
                            {s.jhd}/{s.amclct}
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
      </div>
    </div>
  );
}
