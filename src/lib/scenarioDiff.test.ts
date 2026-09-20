import { describe, expect, it } from 'vitest';
import type { Epic, ScenarioSnapshot } from '../types';
import { diffScenario, filterDiffByTeam } from './scenarioDiff';

function epic(id: string, teams: string[], from: number, to: number): Epic {
  return {
    id,
    title: id,
    teams,
    enabled: true,
    status: 'разработка',
    effectYear: null,
    effect2026: null,
    effectKind: null,
    needsKb: false,
    notes: '',
    links: [],
    segments: [{ id: 's1', role: 'dev', from, to, label: '', color: null, flag: null }],
  };
}

function snapshot(epics: Epic[]): ScenarioSnapshot {
  return { epics, people: [] };
}

describe('diffScenario', () => {
  it('reports a right shift and its sprint delta', () => {
    const diff = diffScenario(snapshot([epic('feature', ['team-a'], 2, 3)]), snapshot([epic('feature', ['team-a'], 4, 5)]));

    expect(diff.features[0].segments[0]).toMatchObject({ kind: 'moved', deltaFrom: 2, deltaTo: 2 });
    expect(diff.summary.movedRight).toBe(1);
  });

  it('keeps a two-team feature in either team filter', () => {
    const diff = diffScenario(snapshot([epic('feature', ['team-a', 'team-b'], 2, 3)]), snapshot([epic('feature', ['team-a', 'team-b'], 2, 3)]));

    expect(filterDiffByTeam(diff, 'team-b').features).toHaveLength(1);
  });

  it('keeps a feature visible to a team it leaves', () => {
    const diff = diffScenario(snapshot([epic('feature', ['team-a', 'team-b'], 2, 3)]), snapshot([epic('feature', ['team-b'], 2, 3)]));

    expect(filterDiffByTeam(diff, 'team-a').features).toHaveLength(1);
  });

  it('describes segments removed from a proposal', () => {
    const base = epic('feature', ['team-a'], 2, 3);
    const proposal = { ...base, segments: [] };

    expect(diffScenario(snapshot([base]), snapshot([proposal])).features[0].segments[0].kind).toBe('removed');
  });
});
