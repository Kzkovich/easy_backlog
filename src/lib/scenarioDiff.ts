import type { Epic, ScenarioSnapshot, Segment, TeamId } from '../types';

export type SegmentChangeKind = 'added' | 'removed' | 'moved' | 'resized' | 'unchanged';

export interface SegmentChange {
  id: string;
  kind: SegmentChangeKind;
  before?: Segment;
  after?: Segment;
  deltaFrom?: number;
  deltaTo?: number;
}

export interface FeatureChange {
  id: string;
  title: string;
  teams: TeamId[];
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
  teamChanged: boolean;
  before?: Epic;
  after?: Epic;
  segments: SegmentChange[];
}

export interface ScenarioDiffSummary {
  changedFeatures: number;
  movedLeft: number;
  movedRight: number;
  added: number;
  removed: number;
}

export interface ScenarioDiff {
  features: FeatureChange[];
  summary: ScenarioDiffSummary;
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function sameTeams(a: TeamId[], b: TeamId[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

function segmentChange(before?: Segment, after?: Segment): SegmentChange {
  const id = after?.id ?? before!.id;
  if (!before) return { id, kind: 'added', after };
  if (!after) return { id, kind: 'removed', before };
  const deltaFrom = after.from - before.from;
  const deltaTo = after.to - before.to;
  if (deltaFrom === 0 && deltaTo === 0) return { id, kind: 'unchanged', before, after };
  if (deltaFrom === deltaTo) return { id, kind: 'moved', before, after, deltaFrom, deltaTo };
  return { id, kind: 'resized', before, after, deltaFrom, deltaTo };
}

function featureChange(before?: Epic, after?: Epic): FeatureChange {
  const id = after?.id ?? before!.id;
  const title = after?.title ?? before!.title;
  const teams = after?.teams ?? before!.teams;
  const beforeSegments = byId(before?.segments ?? []);
  const afterSegments = byId(after?.segments ?? []);
  const segmentIds = [...beforeSegments.keys(), ...afterSegments.keys()].filter((id, index, ids) => ids.indexOf(id) === index);
  const segments = segmentIds.map((id) => segmentChange(beforeSegments.get(id), afterSegments.get(id)));
  const teamChanged = !!before && !!after && !sameTeams(before.teams, after.teams);
  const changedSegments = segments.some((segment) => segment.kind !== 'unchanged');
  return {
    id,
    title,
    teams,
    kind: !before ? 'added' : !after ? 'removed' : changedSegments || teamChanged ? 'changed' : 'unchanged',
    teamChanged,
    before,
    after,
    segments,
  };
}

export function diffScenario(base: ScenarioSnapshot, proposal: ScenarioSnapshot): ScenarioDiff {
  const before = byId(base.epics);
  const after = byId(proposal.epics);
  const ids = [...before.keys(), ...after.keys()].filter((id, index, list) => list.indexOf(id) === index);
  const features = ids.map((id) => featureChange(before.get(id), after.get(id)));
  const segmentChanges = features.flatMap((feature) => feature.segments);
  return {
    features,
    summary: {
      changedFeatures: features.filter((feature) => feature.kind !== 'unchanged').length,
      movedLeft: segmentChanges.filter((segment) => segment.kind === 'moved' && (segment.deltaFrom ?? 0) < 0).length,
      movedRight: segmentChanges.filter((segment) => segment.kind === 'moved' && (segment.deltaFrom ?? 0) > 0).length,
      added: segmentChanges.filter((segment) => segment.kind === 'added').length,
      removed: segmentChanges.filter((segment) => segment.kind === 'removed').length,
    },
  };
}

export function filterDiffByTeam(diff: ScenarioDiff, teamId: TeamId | 'ALL'): ScenarioDiff {
  if (teamId === 'ALL') return diff;
  const features = diff.features.filter((feature) => feature.teams.includes(teamId));
  const segmentChanges = features.flatMap((feature) => feature.segments);
  return {
    features,
    summary: {
      changedFeatures: features.filter((feature) => feature.kind !== 'unchanged').length,
      movedLeft: segmentChanges.filter((segment) => segment.kind === 'moved' && (segment.deltaFrom ?? 0) < 0).length,
      movedRight: segmentChanges.filter((segment) => segment.kind === 'moved' && (segment.deltaFrom ?? 0) > 0).length,
      added: segmentChanges.filter((segment) => segment.kind === 'added').length,
      removed: segmentChanges.filter((segment) => segment.kind === 'removed').length,
    },
  };
}
