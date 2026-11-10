import type { Status, ThemeId } from './types';

export const APP_VERSION = '1.4.14';
export const DEFAULT_UPDATE_URL = 'https://netlapps.github.io/attendance-app/update.json';
export const DATA_VERSION = 2;
export const STORAGE_KEY = 'attendance-app-data-v1';
export const FIRED_REMINDERS_KEY = 'attendance-app-fired-reminders-v1';

export const STATUS_ORDER: Status[] = ['present', 'absent', 'sick', 'excused', 'late'];

export const STATUS_META: Record<
  Status,
  { label: string; short: string; symbol: string }
> = {
  present: { label: 'Есть', short: 'Есть', symbol: '+' },
  absent: { label: 'Не было', short: 'Нет', symbol: 'Н' },
  sick: { label: 'Болеет', short: 'Болеет', symbol: 'Б' },
  excused: { label: 'Уважительная причина', short: 'Уваж.', symbol: 'У' },
  late: { label: 'Опоздал', short: 'Опоздал', symbol: 'О' },
};

export const WEEKDAYS = [
  { value: 1, short: 'Пн', long: 'Понедельник' },
  { value: 2, short: 'Вт', long: 'Вторник' },
  { value: 3, short: 'Ср', long: 'Среда' },
  { value: 4, short: 'Чт', long: 'Четверг' },
  { value: 5, short: 'Пт', long: 'Пятница' },
  { value: 6, short: 'Сб', long: 'Суббота' },
  { value: 7, short: 'Вс', long: 'Воскресенье' },
] as const;

export const PAIR_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/**
 * Классный час хранится как отдельное занятие с зарезервированным номером 9.
 * Так не меняется формат отметок, а отчёты и резервные копии остаются совместимыми.
 */
export const CLASS_HOUR_PAIR_NUMBER = 9;

export const ALL_PAIR_NUMBERS: readonly number[] = [
  ...PAIR_NUMBERS,
  CLASS_HOUR_PAIR_NUMBER,
];

export const APP_NAME = 'Посещаемость';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  hint: string;
  /** Цвета для маленького превью в настройках. */
  preview: { bg: string; surface: string; accent: string; soft: string };
}

export const THEMES: ThemeOption[] = [
  {
    id: 'light',
    label: 'Светлая',
    hint: 'Классическая светлая',
    preview: { bg: '#f3f5fb', surface: '#ffffff', accent: '#4f46e5', soft: '#eef2ff' },
  },
  {
    id: 'dark',
    label: 'Тёмная',
    hint: 'Для вечера и слабого света',
    preview: { bg: '#0b1120', surface: '#111827', accent: '#818cf8', soft: '#1e293b' },
  },
  {
    id: 'ocean',
    label: 'Океан',
    hint: 'Свежая бирюза',
    preview: { bg: '#eef7fb', surface: '#ffffff', accent: '#0284c7', soft: '#e0f2fe' },
  },
  {
    id: 'forest',
    label: 'Лес',
    hint: 'Спокойная зелень',
    preview: { bg: '#f0f7f2', surface: '#ffffff', accent: '#15803d', soft: '#e3f2e8' },
  },
  {
    id: 'sunset',
    label: 'Закат',
    hint: 'Тёплый оранжевый',
    preview: { bg: '#fdf3ec', surface: '#ffffff', accent: '#ea580c', soft: '#ffeadb' },
  },
  {
    id: 'berry',
    label: 'Ягода',
    hint: 'Малиновый акцент',
    preview: { bg: '#fbf0f6', surface: '#ffffff', accent: '#db2777', soft: '#fbe3f0' },
  },
];

export const DEFAULT_THEME: ThemeId = 'light';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
