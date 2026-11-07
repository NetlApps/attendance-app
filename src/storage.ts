import {
  ALL_PAIR_NUMBERS,
  CLASS_HOUR_PAIR_NUMBER,
  DATA_VERSION,
  DEFAULT_THEME,
  FIRED_REMINDERS_KEY,
  isThemeId,
  STORAGE_KEY,
  STATUS_ORDER,
} from './constants';
import {
  CLASS_HOUR_DEFAULT_TIMES,
  createSeedData,
  DEFAULT_SCHEDULES,
  LEGACY_DEFAULT_SCHEDULE,
} from './seed';
import type {
  AppData,
  Attendance,
  Group,
  ReminderSettings,
  ScheduleItem,
  Settings,
  Status,
  Student,
} from './types';
import {
  comparePairNumbers,
  isISODate,
  isValidTime,
  minutesFromHHMM,
  todayISO,
  uid,
} from './utils';

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDaySchedule(input: unknown, fallback: ScheduleItem[]): ScheduleItem[] {
  if (!Array.isArray(input)) return fallback.map((item) => ({ ...item }));

  const seen = new Set<number>();
  const items: ScheduleItem[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<ScheduleItem>;
    const pairNumber = Number(item.pairNumber);
    const start = asString(item.start);
    const end = asString(item.end);

    if (!Number.isInteger(pairNumber) || !ALL_PAIR_NUMBERS.includes(pairNumber)) continue;
    if (seen.has(pairNumber)) continue;
    if (!isValidTime(start) || !isValidTime(end)) continue;
    if (minutesFromHHMM(start) >= minutesFromHHMM(end)) continue;

    seen.add(pairNumber);
    items.push({ pairNumber, start, end });
  }

  return items.sort((a, b) => comparePairNumbers(a.pairNumber, b.pairNumber));
}

function isLegacyDefaultSchedule(items: ScheduleItem[]): boolean {
  if (items.length !== LEGACY_DEFAULT_SCHEDULE.length) return false;
  return LEGACY_DEFAULT_SCHEDULE.every((legacy) => {
    const match = items.find((item) => item.pairNumber === legacy.pairNumber);
    return Boolean(match && match.start === legacy.start && match.end === legacy.end);
  });
}

function normalizeSchedules(
  input: unknown,
  legacyInput: unknown,
): Record<number, ScheduleItem[]> {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;

  const legacyItems = Array.isArray(legacyInput)
    ? normalizeDaySchedule(legacyInput, [])
    : [];
  // Старое единое расписание переносим на все дни, кроме случая, когда это
  // нетронутые стандартные времена: тогда подставляем новое расписание с фото.
  const useLegacy = legacyItems.length > 0 && !isLegacyDefaultSchedule(legacyItems);

  const result: Record<number, ScheduleItem[]> = {};
  for (let day = 1; day <= 7; day += 1) {
    if (source) {
      result[day] = normalizeDaySchedule(source[String(day)], DEFAULT_SCHEDULES[day]);
    } else if (useLegacy) {
      result[day] = legacyItems.map((item) => ({ ...item }));
    } else {
      result[day] = (DEFAULT_SCHEDULES[day] ?? []).map((item) => ({ ...item }));
    }
  }
  return result;
}

/**
 * В версии 1 классного часа не было. Добавляем его в понедельник и четверг
 * один раз при миграции, чтобы не воскрешать после ручного удаления.
 */
function addClassHourForLegacyData(schedules: Record<number, ScheduleItem[]>): void {
  for (const day of [1, 4]) {
    const items = schedules[day] ?? [];
    if (items.some((item) => item.pairNumber === CLASS_HOUR_PAIR_NUMBER)) continue;
    const times = CLASS_HOUR_DEFAULT_TIMES[day] ?? { start: '08:15', end: '09:00' };
    schedules[day] = [
      ...items,
      { pairNumber: CLASS_HOUR_PAIR_NUMBER, ...times },
    ].sort((a, b) => comparePairNumbers(a.pairNumber, b.pairNumber));
  }
}

function normalizeReminders(input: unknown): ReminderSettings {
  const fallback = createSeedData().settings.reminders;
  if (!input || typeof input !== 'object') {
    return {
      enabled: fallback.enabled,
      times: [...fallback.times],
      weekdays: [...fallback.weekdays],
    };
  }

  const source = input as Partial<ReminderSettings>;
  const times = Array.isArray(source.times)
    ? Array.from(
        new Set(
          source.times
            .filter((time): time is string => typeof time === 'string')
            .map((time) => time.trim())
            .filter(isValidTime),
        ),
      ).sort()
    : [...fallback.times];

  const weekdays = Array.isArray(source.weekdays)
    ? Array.from(
        new Set(
          source.weekdays
            .map(Number)
            .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
        ),
      ).sort((a, b) => a - b)
    : [...fallback.weekdays];

  return {
    enabled: Boolean(source.enabled),
    times,
    weekdays,
  };
}

function normalizeSettings(input: unknown, groups: Group[]): Settings {
  const fallbackGroupId = groups[0]?.id ?? '';
  const source = (input && typeof input === 'object' ? input : {}) as Partial<Settings> & {
    schedule?: unknown;
  };
  const activeGroupId =
    typeof source.activeGroupId === 'string' &&
    groups.some((group) => group.id === source.activeGroupId)
      ? source.activeGroupId
      : fallbackGroupId;

  const rawUpdateUrl = asString(source.updateUrl);
  const updateUrl =
    /^https?:\/\/\S+$/i.test(rawUpdateUrl) && rawUpdateUrl.length <= 2048
      ? rawUpdateUrl
      : undefined;

  return {
    activeGroupId,
    schedules: normalizeSchedules(source.schedules, source.schedule),
    reminders: normalizeReminders(source.reminders),
    theme: isThemeId(source.theme) ? source.theme : DEFAULT_THEME,
    updateUrl,
    autoUpdateCheck: source.autoUpdateCheck !== false,
  };
}

/**
 * Приводит данные к актуальной схеме. Бросает ошибку, если это не похоже
 * на резервную копию приложения.
 */
export function normalizeData(input: unknown): AppData {
  if (!input || typeof input !== 'object') {
    throw new Error('Файл не похож на резервную копию приложения.');
  }

  const source = input as Partial<AppData>;
  const sourceVersion = Number(source.version);
  const needsClassHourMigration =
    !Number.isFinite(sourceVersion) || sourceVersion < DATA_VERSION;
  if (!Array.isArray(source.groups) || source.groups.length === 0) {
    throw new Error('В резервной копии нет ни одной группы.');
  }

  const groupIds = new Set<string>();
  const groups: Group[] = [];
  for (const raw of source.groups) {
    if (!raw || typeof raw !== 'object') continue;
    const id = asString((raw as Group).id) || uid('group');
    const name = asString((raw as Group).name);
    if (!name || groupIds.has(id)) continue;
    groupIds.add(id);
    groups.push({
      id,
      name,
      curator: asString((raw as Group).curator) || undefined,
      createdAt: asString((raw as Group).createdAt) || new Date().toISOString(),
    });
  }

  if (groups.length === 0) {
    throw new Error('В резервной копии нет корректных групп.');
  }

  const studentIds = new Set<string>();
  const students: Student[] = [];
  const rawStudents = Array.isArray(source.students) ? source.students : [];
  rawStudents.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const item = raw as Partial<Student>;
    const fullName = asString(item.fullName);
    const groupId = asString(item.groupId);
    let id = asString(item.id) || uid('student');
    if (!fullName || !groupIds.has(groupId) || studentIds.has(id)) return;
    if (!id) id = uid('student');
    studentIds.add(id);
    const order = Number(item.order);
    students.push({
      id,
      groupId,
      fullName,
      order: Number.isFinite(order) && order > 0 ? order : index + 1,
      archived: Boolean(item.archived),
    });
  });

  const seenAttendanceKeys = new Set<string>();
  const attendance: Attendance[] = [];
  const rawAttendance = Array.isArray(source.attendance) ? source.attendance : [];
  for (const raw of rawAttendance) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<Attendance>;
    const groupId = asString(item.groupId);
    const studentId = asString(item.studentId);
    const date = asString(item.date);
    const pairNumber = Number(item.pairNumber);
    const status = item.status as Status;
    const student = students.find((candidate) => candidate.id === studentId);

    if (
      !groupIds.has(groupId) ||
      !student ||
      student.groupId !== groupId ||
      !isISODate(date) ||
      !STATUS_ORDER.includes(status) ||
      !ALL_PAIR_NUMBERS.includes(pairNumber)
    ) {
      continue;
    }

    const key = `${groupId}|${studentId}|${date}|${pairNumber}`;
    if (seenAttendanceKeys.has(key)) continue;
    seenAttendanceKeys.add(key);

    const latePair = Number(item.latePairNumber);
    attendance.push({
      id: asString(item.id) || uid('attendance'),
      groupId,
      studentId,
      date,
      pairNumber,
      status,
      latePairNumber:
        status === 'late' && ALL_PAIR_NUMBERS.includes(latePair)
          ? latePair
          : undefined,
      comment: asString(item.comment) || undefined,
      updatedAt: asString(item.updatedAt) || new Date().toISOString(),
    });
  }

  const settings = normalizeSettings(source.settings, groups);
  if (needsClassHourMigration) addClassHourForLegacyData(settings.schedules);

  return {
    version: DATA_VERSION,
    groups,
    students,
    attendance,
    settings,
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedData();
    const parsed = JSON.parse(raw) as unknown;
    const data = normalizeData(parsed);
    const storedVersion =
      parsed && typeof parsed === 'object'
        ? Number((parsed as { version?: unknown }).version)
        : Number.NaN;
    if (!Number.isFinite(storedVersion) || storedVersion !== DATA_VERSION) {
      saveData(data);
    }
    return data;
  } catch (error) {
    console.error('Не удалось загрузить сохранённые данные:', error);
    return createSeedData();
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Не удалось сохранить данные:', error);
    return false;
  }
}

export function exportBackupFile(data: AppData): string {
  return JSON.stringify(
    {
      ...data,
      exportedAt: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function parseBackupFile(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Не удалось прочитать JSON-файл.');
  }
  return normalizeData(parsed);
}

export function clearStoredData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Не удалось очистить данные:', error);
  }
}

function pruneFired(set: Set<string>): Set<string> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const pruned = new Set<string>();
  for (const key of set) {
    if (key.slice(0, 10) >= cutoffKey) pruned.add(key);
  }
  return pruned;
}

export function loadFiredReminders(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_REMINDERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return pruneFired(
      new Set(parsed.filter((item): item is string => typeof item === 'string')),
    );
  } catch {
    return new Set();
  }
}

function saveFiredReminders(set: Set<string>): void {
  try {
    localStorage.setItem(FIRED_REMINDERS_KEY, JSON.stringify([...set]));
  } catch (error) {
    console.error('Не удалось сохранить состояние напоминаний:', error);
  }
}

export function markReminderFired(key: string): void {
  const fired = loadFiredReminders();
  fired.add(key);
  saveFiredReminders(pruneFired(fired));
}

export function clearFiredReminders(): void {
  try {
    localStorage.removeItem(FIRED_REMINDERS_KEY);
  } catch {
    // ignore
  }
}

export function reminderKey(date = todayISO(), time = '00:00'): string {
  return `${date}T${time}`;
}
