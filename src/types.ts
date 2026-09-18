// Модель данных «Колбасок» — см. PROMPT-планировщик.md, раздел 4.

export type TeamId = string;

export interface SprintFlags {
  freeze?: boolean;
  holiday?: boolean;
  custom?: string | null;
}

export interface Sprint {
  index: number; // порядковый индекс, источник истины для положения на сетке
  dateFrom: string; // ISO yyyy-mm-dd
  dateTo: string; // ISO yyyy-mm-dd
  quarter: string; // например "Q4 2025"
  flags: SprintFlags;
  // Устаревшее: номера спринтов теперь считаются от Team.sprintBase.
  jhd?: number;
  amclct?: number;
}

export interface Team {
  id: TeamId;
  name: string;
  shortName: string;
  sprintBase: number; // номер спринта этой команды в календарном спринте с индексом 0
  color: string; // метка команды на карточках фич
}

export type RoleId = string;

export interface RoleDef {
  id: RoleId;
  label: string;
  color: string;
  capacityTracked: boolean; // считаем ли загрузку по этой роли
  shared: boolean; // по умолчанию совмещённая роль, пока в составе нет людей
}

export interface PersonAllocation {
  team: TeamId;
  share: number; // 0..1
}

export interface Person {
  id: string;
  name: string;
  role: RoleId;
  allocations: PersonAllocation[];
  absences: number[]; // индексы спринтов отсутствия
}

export type EpicStatus =
  | 'бэклог'
  | 'дискавери'
  | 'разработка'
  | 'тест'
  | 'раскатка'
  | 'готово'
  | 'перенесён';

export type EffectKind = 'Балансы' | 'Сборы' | 'Экономия' | null;

export type SegmentFlag = 'ok' | 'risk' | 'blocked' | null;

export interface Segment {
  id: string;
  role: RoleId;
  from: number; // индекс спринта, включительно
  to: number; // индекс спринта, включительно
  label: string;
  color: string | null; // null = цвет по роли
  flag: SegmentFlag;
  notes?: Record<number, string>; // индекс спринта -> комментарий именно на этот спринт колбаски
}

/** Импортированный базовый план. Не участвует в расчёте загрузки и редактировании факта. */

export interface EpicLink {
  title: string;
  url: string;
}

export interface Epic {
  id: string;
  title: string;
  teams: TeamId[]; // одна или несколько команд
  enabled: boolean;
  status: EpicStatus;
  effectYear: number | null;
  effect2026: number | null;
  effectKind: EffectKind;
  needsKb: boolean;
  notes: string;
  links: EpicLink[];
  segments: Segment[];
  plannedFrom?: number; // плановый старт всей задачи (спринт) — серый контур
  plannedTo?: number; // плановый финиш всей задачи (спринт)
  pipelineOverride?: Pipeline;
  visibleRoles?: RoleId[]; // какие роли показывать строками; undefined = все роли (обратная совместимость)
}

export interface ScenarioSnapshot {
  epics: Epic[];
  people: Person[];
}

export interface Scenario {
  id: string;
  name: string;
  snapshot: ScenarioSnapshot;
}

export interface RiskThresholds {
  okPerPerson: number; // сколько параллельных задач на человека ещё считаем нормой
  okPerPersonShared: number; // то же для совмещённых людей (0,5 на две команды)
}

export type StageLinkType = 'sequential' | 'earliest';

export interface PipelineStage {
  id: string;
  roles: RoleId[]; // роли этапа, работают параллельно
  linkType: StageLinkType; // как этап зависит от предыдущего
}

export interface Pipeline {
  stages: PipelineStage[];
}

export interface Settings {
  thresholds: RiskThresholds;
  pipeline?: Pipeline;
  rolloutDeadlineOffsetFromFreeze: number; // спринтов до фриза, после которых раскатка не успевает
}

export interface Plan {
  version: number;
  sprints: Sprint[];
  teams: Team[];
  roles: RoleDef[];
  people: Person[];
  epics: Epic[];
  scenarios: Scenario[];
  settings: Settings;
}
