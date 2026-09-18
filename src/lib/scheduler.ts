import type { Epic, Pipeline, Plan, StageLinkType } from '../types';

/** Дефолтный пайплайн по DEFAULT_ROLES (seed, редактируется пользователем). */
export function defaultPipeline(): Pipeline {
  return {
    stages: [
      { id: 'grooming', roles: ['grooming'], linkType: 'sequential' },
      { id: 'design', roles: ['design'], linkType: 'sequential' },
      { id: 'analytics', roles: ['analytics'], linkType: 'sequential' },
      { id: 'dev', roles: ['midl', 'android', 'ios', 'web'], linkType: 'sequential' },
      { id: 'testing', roles: ['testing'], linkType: 'earliest' },
      { id: 'rollout', roles: ['rollout'], linkType: 'sequential' },
    ],
  };
}

export function pipelineForEpic(plan: Plan, epic: Epic): Pipeline {
  return epic.pipelineOverride ?? plan.settings?.pipeline ?? defaultPipeline();
}

export function stageFloor(prevEnds: number[], linkType: StageLinkType): number {
  if (prevEnds.length === 0) return -1;
  return linkType === 'earliest' ? Math.min(...prevEnds) : Math.max(...prevEnds);
}
