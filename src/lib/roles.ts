import type { RoleDef, RoleId } from '../types';

// Стартовый набор ролей — используется для новых планов и для миграции
// старых plan.json, где ролей ещё не было в данных. Дальше состав ролей
// целиком редактируется пользователем и хранится в plan.roles.
export const DEFAULT_ROLES: RoleDef[] = [
  { id: 'business', label: 'Бизнес', color: '#94A3B8', capacityTracked: false, shared: false },
  { id: 'grooming', label: 'Груминг', color: '#CBD5E1', capacityTracked: false, shared: false },
  { id: 'design', label: 'Дизайн', color: '#00E5A0', capacityTracked: true, shared: true },
  { id: 'android', label: 'Фронт Android', color: '#B98BFF', capacityTracked: true, shared: false },
  { id: 'ios', label: 'Фронт iOS', color: '#8B5CF6', capacityTracked: true, shared: true },
  { id: 'web', label: 'Фронт Web/Mob', color: '#6366F1', capacityTracked: true, shared: true },
  { id: 'midl', label: 'Мидл', color: '#FF7A45', capacityTracked: true, shared: false },
  { id: 'analytics', label: 'Аналитика', color: '#38BDF8', capacityTracked: true, shared: false },
  { id: 'testing', label: 'Тестирование', color: '#FFD23F', capacityTracked: true, shared: false },
  { id: 'ek', label: 'ЕК', color: '#FF3860', capacityTracked: false, shared: false },
  { id: 'rollout', label: 'Раскатка', color: '#2DD4FF', capacityTracked: true, shared: false },
  { id: 'docs', label: 'Документация/БЗ', color: '#F472B6', capacityTracked: false, shared: false },
];

// Палитра для новых ролей, добавленных руками — по кругу.
const NEW_ROLE_PALETTE = ['#22D3EE', '#F97316', '#A3E635', '#F43F5E', '#818CF8', '#FBBF24', '#34D399', '#E879F9'];

export function nextRoleColor(existing: RoleDef[]): string {
  return NEW_ROLE_PALETTE[existing.length % NEW_ROLE_PALETTE.length];
}

export function findRole(roles: RoleDef[], id: RoleId): RoleDef | undefined {
  return roles.find((r) => r.id === id);
}

export function roleColor(roles: RoleDef[], id: RoleId): string {
  return findRole(roles, id)?.color ?? '#999999';
}

export function roleLabel(roles: RoleDef[], id: RoleId): string {
  return findRole(roles, id)?.label ?? id;
}

// Разметка для сопоставления текста из столбца C Excel с ролью по умолчанию.
// Работает, только пока роль с таким id ещё существует в текущем составе
// (пользователь мог её переименовать или удалить).
const ROLE_ALIASES: Array<[RoleId, string[]]> = [
  ['business', ['бизнес']],
  ['grooming', ['груминг']],
  ['design', ['дизайн']],
  ['android', ['фронт android', 'android', 'фронт-android']],
  ['ios', ['фронт ios', 'ios', 'фронт-ios']],
  ['web', ['фронт web/mob', 'фронт web', 'web/mob', 'web', 'фронт-web/mob']],
  ['midl', ['мидл', 'бэк', 'бекенд', 'бэкенд', 'backend']],
  ['analytics', ['аналитика', 'системный аналитик', 'аналитик']],
  ['testing', ['тестирование', 'тест', 'qa']],
  ['ek', ['ек']],
  ['rollout', ['раскатка']],
  ['docs', ['документация/бз', 'документация', 'бз', 'база знаний']],
];

export function matchRoleFromExcelLabel(raw: string, roles: RoleDef[]): RoleId | null {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!norm) return null;

  // 1. точное совпадение с названием существующей роли
  const byLabel = roles.find((r) => r.label.trim().toLowerCase() === norm);
  if (byLabel) return byLabel.id;

  // 2. известные алиасы — только если такая роль ещё есть в составе
  const knownIds = new Set(roles.map((r) => r.id));
  for (const [id, aliases] of ROLE_ALIASES) {
    if (knownIds.has(id) && aliases.includes(norm)) return id;
  }
  for (const [id, aliases] of ROLE_ALIASES) {
    if (knownIds.has(id) && aliases.some((a) => norm.includes(a) || a.includes(norm))) return id;
  }

  // 3. частичное совпадение с названием существующей роли
  const partial = roles.find((r) => {
    const l = r.label.trim().toLowerCase();
    return l.length > 2 && (norm.includes(l) || l.includes(norm));
  });
  return partial?.id ?? null;
}
