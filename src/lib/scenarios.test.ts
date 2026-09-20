import { describe, expect, it } from 'vitest';
import type { Epic } from '../types';
import { applyScenarioEpics } from './scenarios';

function epic(id: string, from: number): Epic {
  return {
    id,
    title: id,
    teams: ['team'],
    enabled: true,
    status: 'разработка',
    effectYear: null,
    effect2026: null,
    effectKind: null,
    needsKb: false,
    notes: '',
    links: [],
    segments: [{ id: `${id}-segment`, role: 'dev', from, to: from + 1, label: '', color: null, flag: null }],
  };
}

describe('applyScenarioEpics', () => {
  it('applies only checked feature proposals', () => {
    const actual = applyScenarioEpics([epic('a', 1), epic('b', 1)], [epic('a', 4), epic('b', 6)], new Set(['a']));

    expect(actual.map((item) => [item.id, item.segments[0].from])).toEqual([['a', 4], ['b', 1]]);
  });

  it('adds a selected proposed feature missing from the current plan', () => {
    const actual = applyScenarioEpics([epic('a', 1)], [epic('a', 1), epic('new', 4)], new Set(['new']));

    expect(actual.map((item) => item.id)).toEqual(['a', 'new']);
  });
});
