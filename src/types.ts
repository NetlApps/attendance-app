export type Status = 'present' | 'absent' | 'sick' | 'excused' | 'late';

export type ThemeId = 'light' | 'dark' | 'ocean' | 'forest' | 'sunset' | 'berry';

/** Способ отметки: по одному студенту или списком. */
export type MarkingMode = 'single' | 'list';

export interface Group {
  id: string;
  name: string;
  curator?: string;
  createdAt: string;
}

export interface Student {
  id: string;
  groupId: string;
  fullName: string;
  order: number;
  archived?: boolean;
}

export interface Attendance {
  id: string;
  groupId: string;
  studentId: string;
  /** Локальная дата в формате YYYY-MM-DD. */
  date: string;
  pairNumber: number;
  status: Status;
  /** На какую пару студент пришёл, если опоздал. */
  latePairNumber?: number;
  comment?: string;
  updatedAt: string;
}

export interface ScheduleItem {
  pairNumber: number;
  start: string;
  end: string;
}

export interface ReminderSettings {
  enabled: boolean;
  times: string[];
  /** Дни недели, 1 = понедельник ... 7 = воскресенье. */
  weekdays: number[];
}

export interface Settings {
  activeGroupId: string;
  /** Расписание звонков по дням недели: 1 = понедельник ... 7 = воскресенье. */
  schedules: Record<number, ScheduleItem[]>;
  reminders: ReminderSettings;
  /** Оформление приложения. */
  theme: ThemeId;
  /** Адрес update.json для OTA-обновлений APK. */
  updateUrl?: string;
  /** Автоматически проверять обновления при запуске APK. */
  autoUpdateCheck?: boolean;
  /** Выбранный способ отметки, сохраняется между сессиями. */
  markingMode?: MarkingMode;
}

export interface AppData {
  version: number;
  groups: Group[];
  students: Student[];
  attendance: Attendance[];
  settings: Settings;
}
