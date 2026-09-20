import type { Plan, Scenario } from '../types';

export function createScenario(plan: Plan, name: string): Scenario {
  const snapshot = {
    epics: structuredClone(plan.epics),
    people: structuredClone(plan.people),
  };
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || 'Новый вариант',
    createdAt: now,
    updatedAt: now,
    baseSnapshot: structuredClone(snapshot),
    snapshot,
  };
}
