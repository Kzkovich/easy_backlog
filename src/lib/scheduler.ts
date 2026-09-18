import type { Pipeline } from '../types';

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
