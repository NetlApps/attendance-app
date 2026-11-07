import { CLASS_HOUR_PAIR_NUMBER, DATA_VERSION, DEFAULT_THEME } from './constants';
import type { AppData, ScheduleItem } from './types';

/**
 * Демонстрационный список для публичной версии.
 * Все ФИО вымышлены; реальные студенты в репозиторий не попадают.
 */
export const STUDENT_NAMES = [
  'Иванов Иван Иванович',
  'Петрова Мария Сергеевна',
  'Смирнов Алексей Андреевич',
  'Кузнецова Анна Дмитриевна',
  'Соколов Дмитрий Павлович',
];

/** Старое единое расписание — нужно только для миграции сохранённых данных. */
export const LEGACY_DEFAULT_SCHEDULE: ScheduleItem[] = [
  { pairNumber: 1, start: '08:30', end: '10:00' },
  { pairNumber: 2, start: '10:10', end: '11:40' },
  { pairNumber: 3, start: '12:10', end: '13:40' },
  { pairNumber: 4, start: '13:50', end: '15:20' },
  { pairNumber: 5, start: '15:30', end: '17:00' },
  { pairNumber: 6, start: '17:10', end: '18:40' },
  { pairNumber: 7, start: '18:50', end: '20:20' },
  { pairNumber: 8, start: '20:30', end: '22:00' },
];

const MONDAY_THURSDAY_PAIRS: ScheduleItem[] = [
  { pairNumber: 1, start: '09:10', end: '10:30' },
  { pairNumber: 2, start: '10:40', end: '12:00' },
  { pairNumber: 3, start: '12:40', end: '14:00' },
  { pairNumber: 4, start: '14:10', end: '15:30' },
  { pairNumber: 5, start: '15:40', end: '17:00' },
];

/** Время классного часа по дням недели (из расписания на фото). */
export const CLASS_HOUR_DEFAULT_TIMES: Record<
  number,
  { start: string; end: string }
> = {
  1: { start: '08:30', end: '09:00' },
  4: { start: '08:15', end: '09:00' },
};

const MONDAY: ScheduleItem[] = [
  { pairNumber: CLASS_HOUR_PAIR_NUMBER, ...CLASS_HOUR_DEFAULT_TIMES[1] },
  ...MONDAY_THURSDAY_PAIRS,
];

const THURSDAY: ScheduleItem[] = [
  { pairNumber: CLASS_HOUR_PAIR_NUMBER, ...CLASS_HOUR_DEFAULT_TIMES[4] },
  ...MONDAY_THURSDAY_PAIRS,
];

const TUESDAY_WEDNESDAY_FRIDAY: ScheduleItem[] = [
  { pairNumber: 1, start: '08:15', end: '09:35' },
  { pairNumber: 2, start: '09:45', end: '11:05' },
  { pairNumber: 3, start: '12:00', end: '13:20' },
  { pairNumber: 4, start: '13:30', end: '14:50' },
  { pairNumber: 5, start: '15:00', end: '16:20' },
];

const SATURDAY: ScheduleItem[] = [
  { pairNumber: 1, start: '08:15', end: '09:35' },
  { pairNumber: 2, start: '09:45', end: '11:05' },
  { pairNumber: 3, start: '11:15', end: '12:35' },
  { pairNumber: 4, start: '12:45', end: '14:05' },
];

/** Расписание звонков по фото: у каждого дня недели своё время. */
export const DEFAULT_SCHEDULES: Record<number, ScheduleItem[]> = {
  1: MONDAY,
  2: TUESDAY_WEDNESDAY_FRIDAY,
  3: TUESDAY_WEDNESDAY_FRIDAY,
  4: THURSDAY,
  5: TUESDAY_WEDNESDAY_FRIDAY,
  6: SATURDAY,
  7: [],
};

export function cloneSchedules(
  schedules: Record<number, ScheduleItem[]>,
): Record<number, ScheduleItem[]> {
  const copy: Record<number, ScheduleItem[]> = {};
  for (let day = 1; day <= 7; day += 1) {
    copy[day] = (schedules[day] ?? []).map((item) => ({ ...item }));
  }
  return copy;
}

const defaultReminders = {
  enabled: false,
  times: ['08:30'],
  weekdays: [1, 2, 3, 4, 5, 6],
};

export function createSeedData(): AppData {
  const now = new Date().toISOString();
  const groupId = 'group-main';

  return {
    version: DATA_VERSION,
    groups: [
      {
        id: groupId,
        name: 'Моя группа',
        curator: '',
        createdAt: now,
      },
    ],
    students: STUDENT_NAMES.map((fullName, index) => ({
      id: `student-${index + 1}`,
      groupId,
      fullName,
      order: index + 1,
      archived: false,
    })),
    attendance: [],
    settings: {
      activeGroupId: groupId,
      schedules: cloneSchedules(DEFAULT_SCHEDULES),
      reminders: {
        ...defaultReminders,
        times: [...defaultReminders.times],
        weekdays: [...defaultReminders.weekdays],
      },
      theme: DEFAULT_THEME,
      autoUpdateCheck: true,
    },
  };
}

export function createEmptyData(): AppData {
  const now = new Date().toISOString();
  const groupId = 'group-main';

  return {
    version: DATA_VERSION,
    groups: [{ id: groupId, name: 'Моя группа', curator: '', createdAt: now }],
    students: [],
    attendance: [],
    settings: {
      activeGroupId: groupId,
      schedules: cloneSchedules(DEFAULT_SCHEDULES),
      reminders: {
        ...defaultReminders,
        times: [...defaultReminders.times],
        weekdays: [...defaultReminders.weekdays],
      },
      theme: DEFAULT_THEME,
      autoUpdateCheck: true,
    },
  };
}
