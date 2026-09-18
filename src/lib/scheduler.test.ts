import { describe, it, expect } from 'vitest';
import { defaultPipeline } from './scheduler';

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
