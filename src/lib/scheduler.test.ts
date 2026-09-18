import { describe, it, expect } from 'vitest';
import type { Plan, Epic } from '../types';
import { defaultPipeline, pipelineForEpic, stageFloor } from './scheduler';

describe('defaultPipeline', () => {
  it('has six stages in the documented order', () => {
    const p = defaultPipeline();
    expect(p.stages.map((s) => s.id)).toEqual(['grooming', 'design', 'analytics', 'dev', 'testing', 'rollout']);
  });

  it('marks dev roles parallel and testing earliest', () => {
    const p = defaultPipeline();
    const dev = p.stages.find((s) => s.id === 'dev')!;
    const testing = p.stages.find((s) => s.id === 'testing')!;
    expect(dev.roles).toEqual(['midl', 'android', 'ios', 'web']);
    expect(testing.linkType).toBe('earliest');
    expect(p.stages.every((s) => s.id !== 'testing' || s.linkType === 'earliest')).toBe(true);
  });
});

describe('pipelineForEpic', () => {
  const plan = { settings: { pipeline: defaultPipeline() } } as Plan;
  const epic = { id: 'e1', pipelineOverride: undefined } as Epic;
  it('falls back to settings pipeline', () => {
    expect(pipelineForEpic(plan, epic).stages.length).toBe(6);
  });
  it('prefers epic override', () => {
    const over = { ...epic, pipelineOverride: { stages: [{ id: 'a', roles: ['design'], linkType: 'sequential' as const }] } };
    expect(pipelineForEpic(plan, over).stages[0].id).toBe('a');
  });
});

describe('stageFloor', () => {
  it('sequential waits for every predecessor', () => {
    expect(stageFloor([3, 5, 4], 'sequential')).toBe(5);
  });
  it('earliest starts at the first predecessor finish', () => {
    expect(stageFloor([3, 5, 4], 'earliest')).toBe(3);
  });
  it('first stage has no floor', () => {
    expect(stageFloor([], 'sequential')).toBe(-1);
  });
});
