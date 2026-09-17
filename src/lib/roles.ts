import type { RoleDef, RoleId } from '../types';

export const ROLE_DEFS: RoleDef[] = [
  { id: 'business', label: 'Бизнес', color: '#94A3B8', order: 0, capacityTracked: false, shared: false },
  { id: 'grooming', label: 'Груминг', color: '#CBD5E1', order: 1, capacityTracked: false, shared: false },
  { id: 'design', label: 'Дизайн', color: '#00E5A0', order: 2, capacityTracked: true, shared: true },
  { id: 'android', label: 'Фронт Android', color: '#B98BFF', order: 3, capacityTracked: true, shared: false },
  { id: 'ios', label: 'Фронт iOS', color: '#8B5CF6', order: 4, capacityTracked: true, shared: true },
  { id: 'web', label: 'Фронт Web/Mob', color: '#6366F1', order: 5, capacityTracked: true, shared: true },
  { id: 'midl', label: 'Мидл', color: '#FF7A45', order: 6, capacityTracked: true, shared: false },
  { id: 'analytics', label: 'Аналитика', color: '#38BDF8', order: 7, capacityTracked: true, shared: false },
  { id: 'testing', label: 'Тестирование', color: '#FFD23F', order: 8, capacityTracked: true, shared: false },
  { id: 'ek', label: 'ЕК', color: '#FF3860', order: 9, capacityTracked: false, shared: false },
  { id: 'rollout', label: 'Раскатка', color: '#2DD4FF', order: 10, capacityTracked: true, shared: false },
  { id: 'docs', label: 'Документация/БЗ', color: '#F472B6', order: 11, capacityTracked: false, shared: false },
];

export const ROLE_BY_ID: Record<RoleId, RoleDef> = Object.fromEntries(
  ROLE_DEFS.map((r) => [r.id, r])
) as Record<RoleId, RoleDef>;

export function roleColor(id: RoleId): string {
  return ROLE_BY_ID[id]?.color ?? '#999999';
}

export function roleLabel(id: RoleId): string {
  return ROLE_BY_ID[id]?.label ?? id;
}

// Разметка для сопоставления текста из столбца C Excel с ролью.
// Ключи — нормализованные (нижний регистр, без лишних пробелов) варианты написания.
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

export function matchRoleFromExcelLabel(raw: string): RoleId | null {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!norm) return null;
  for (const [id, aliases] of ROLE_ALIASES) {
    if (aliases.includes(norm)) return id;
  }
  // частичное совпадение как запасной вариант
  for (const [id, aliases] of ROLE_ALIASES) {
    if (aliases.some((a) => norm.includes(a) || a.includes(norm))) return id;
  }
  return null;
}
