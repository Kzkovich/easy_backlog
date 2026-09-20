import type { Epic, Plan, Scenario } from '../types';

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

export function applyScenarioEpics(current: Epic[], proposed: Epic[], selectedIds: Set<string>): Epic[] {
  const proposedById = new Map(proposed.map((epic) => [epic.id, epic]));
  const applied = current.map((epic) => (selectedIds.has(epic.id) && proposedById.has(epic.id) ? structuredClone(proposedById.get(epic.id)!) : epic));
  const additions = proposed.filter((epic) => selectedIds.has(epic.id) && !current.some((currentEpic) => currentEpic.id === epic.id));
  return [...applied, ...structuredClone(additions)];
}
