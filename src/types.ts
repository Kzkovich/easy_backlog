// Модель данных «Колбасок» — см. PROMPT-планировщик.md, раздел 4.

export type TeamId = 'AMCLCT' | 'JHD';

export interface SprintFlags {
  freeze?: boolean;
  holiday?: boolean;
  custom?: string | null;
}

export interface Sprint {
  index: number; // порядковый индекс, источник истины для положения на сетке
  jhd: number; // номер спринта у Johnny Debt
  amclct: number; // номер спринта у AM Collection
  dateFrom: string; // ISO yyyy-mm-dd
  dateTo: string; // ISO yyyy-mm-dd
  quarter: string; // например "Q4 2025"
  flags: SprintFlags;
}

export interface Team {
  id: TeamId;
  name: string;
  shortName: string;
}

export type RoleId =
  | 'business'
  | 'grooming'
  | 'design'
  | 'android'
  | 'ios'
  | 'web'
  | 'midl'
  | 'analytics'
  | 'testing'
  | 'ek'
  | 'rollout'
  | 'docs';

export interface RoleDef {
  id: RoleId;
  label: string;
  color: string;
  order: number;
  capacityTracked: boolean; // считаем ли загрузку по этой роли
  shared: boolean; // true = один человек на обе команды (доля 0,5)
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

export type EpicTeam = 'AMCLCT' | 'JHD' | 'BOTH';

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

export interface EpicLink {
  title: string;
  url: string;
}

export interface Epic {
  id: string;
  title: string;
  team: EpicTeam;
  enabled: boolean;
  status: EpicStatus;
  effectYear: number | null;
  effect2026: number | null;
  effectKind: EffectKind;
  needsKb: boolean;
  notes: string;
  links: EpicLink[];
  segments: Segment[];
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

export interface Settings {
  thresholds: RiskThresholds;
  rolloutDeadlineOffsetFromFreeze: number; // спринтов до фриза, после которых раскатка не успевает
  colors: Record<RoleId, string>;
}

export interface Plan {
  version: number;
  sprints: Sprint[];
  teams: Team[];
  people: Person[];
  epics: Epic[];
  scenarios: Scenario[];
  settings: Settings;
}
