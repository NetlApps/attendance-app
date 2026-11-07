import {
  ALL_PAIR_NUMBERS,
  CLASS_HOUR_PAIR_NUMBER,
  PAIR_NUMBERS,
  STATUS_META,
  WEEKDAYS,
} from './constants';
import type { Attendance, ScheduleItem, Settings, Status } from './types';

export function uid(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

export function isISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISODate(value).getTime());
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

export function formatDateShort(iso: string): string {
  const [, month, day] = iso.split('-');
  if (!month || !day) return iso;
  return `${day}.${month}`;
}

/** 1 = понедельник, 7 = воскресенье. */
export function weekdayNumber(iso: string): number {
  return ((parseISODate(iso).getDay() + 6) % 7) + 1;
}

export function weekdayLong(iso: string): string {
  return WEEKDAYS[weekdayNumber(iso) - 1]?.long ?? '';
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS[weekdayNumber(iso) - 1]?.short ?? '';
}

/** Классный час — отдельное занятие с зарезервированным номером 9. */
export function isClassHour(pairNumber: number): boolean {
  return pairNumber === CLASS_HOUR_PAIR_NUMBER;
}

/** Классный час всегда идёт перед первой парой. */
export function slotOrder(pairNumber: number): number {
  return isClassHour(pairNumber) ? 0 : pairNumber;
}

export function comparePairNumbers(a: number, b: number): number {
  return slotOrder(a) - slotOrder(b);
}

export function sortPairNumbers(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort(comparePairNumbers);
}

/**
 * Номера занятий для экрана отметки: обычные пары 1–8 и классный час, если он
 * есть в расписании этого дня или в уже сохранённых отметках.
 */
export function slotNumbersForDate(
  schedule: ScheduleItem[],
  extra: Iterable<number> = [],
): number[] {
  const numbers = new Set<number>(PAIR_NUMBERS);
  for (const item of schedule) {
    if (ALL_PAIR_NUMBERS.includes(item.pairNumber)) numbers.add(item.pairNumber);
  }
  for (const number of extra) {
    if (ALL_PAIR_NUMBERS.includes(number)) numbers.add(number);
  }
  return sortPairNumbers(numbers);
}

export function slotName(pairNumber: number): string {
  return isClassHour(pairNumber) ? 'Классный час' : `${pairNumber} пара`;
}

export function slotNameLower(pairNumber: number): string {
  return isClassHour(pairNumber) ? 'классный час' : `${pairNumber} пара`;
}

export function slotShortName(pairNumber: number): string {
  return isClassHour(pairNumber) ? 'Кл. час' : `${pairNumber} п.`;
}

/** «на классном часе» / «на 2 паре». */
export function slotAt(pairNumber: number): string {
  return isClassHour(pairNumber) ? 'на классном часе' : `на ${pairNumber} паре`;
}

/** Делает первую букву заглавной, не меняя остальное. */
export function capitalizeFirst(value: string): string {
  return value ? value.charAt(0).toLocaleUpperCase('ru') + value.slice(1) : value;
}

/** «на классный час» / «на 2 пару». */
export function slotTo(pairNumber: number): string {
  return isClassHour(pairNumber) ? 'на классный час' : `на ${pairNumber} пару`;
}

/** «с классного часа» / «с 2 пары». */
export function slotFrom(pairNumber: number): string {
  return isClassHour(pairNumber) ? 'с классного часа' : `с ${pairNumber} пары`;
}

/** Тема классного часа по дню недели (из расписания на фото). */
export function classHourTopic(iso: string): string {
  const weekday = weekdayNumber(iso);
  if (weekday === 1) return 'Разговоры о важном';
  if (weekday === 4) return 'Россия — мои горизонты';
  return '';
}

/** Следующее занятие после текущего: после классного часа — первая пара. */
export function nextPairNumber(pairNumber: number): number {
  if (isClassHour(pairNumber)) return 1;
  return pairNumber < 8 ? pairNumber + 1 : pairNumber;
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function currentMonthKey(): string {
  return monthKeyFromDate(new Date());
}

export function monthKeyFromISO(iso: string): string {
  return iso.slice(0, 7);
}

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1, 12);
  return monthKeyFromDate(date);
}

export interface CalendarCell {
  iso: string;
  day: number;
}

/** Календарная сетка с понедельника. */
export function monthMatrix(monthKey: string): (CalendarCell | null)[] {
  const [year, month] = monthKey.split('-').map(Number);
  const first = new Date(year, month - 1, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (CalendarCell | null)[] = [];

  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ iso: `${year}-${pad2(month)}-${pad2(day)}`, day });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function minutesFromHHMM(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return NaN;
  return hours * 60 + minutes;
}

export function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const minutes = minutesFromHHMM(value);
  return Number.isFinite(minutes) && minutes >= 0 && minutes < 24 * 60;
}

export function scheduleItem(schedule: ScheduleItem[], pairNumber: number): ScheduleItem | undefined {
  return schedule.find((item) => item.pairNumber === pairNumber);
}

export function pairTimeLabel(schedule: ScheduleItem[], pairNumber: number): string {
  const item = scheduleItem(schedule, pairNumber);
  return item ? `${item.start}–${item.end}` : '';
}

export function scheduleForWeekday(settings: Settings, weekday: number): ScheduleItem[] {
  return settings.schedules[weekday] ?? [];
}

export function scheduleForDate(settings: Settings, iso: string): ScheduleItem[] {
  return scheduleForWeekday(settings, weekdayNumber(iso));
}

export function currentPairNumber(schedule: ScheduleItem[], now = new Date()): number | undefined {
  const current = now.getHours() * 60 + now.getMinutes();
  return schedule.find((item) => {
    const start = minutesFromHHMM(item.start);
    const end = minutesFromHHMM(item.end);
    return current >= start && current <= end;
  })?.pairNumber;
}

export function statusCounts(records: Attendance[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    present: 0,
    absent: 0,
    sick: 0,
    excused: 0,
    late: 0,
  };
  for (const record of records) counts[record.status] += 1;
  return counts;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatPercent(present: number, total: number): string {
  if (total <= 0) return '—';
  return `${Math.round((present / total) * 100)}%`;
}

export function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  if (typeof window !== 'undefined' && window.AndroidApp?.saveFile) {
    window.AndroidApp.saveFile(filename, mime, content);
    return;
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ShareFileResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * Отправляет текстовый файл через системный «Поделиться»:
 * Android-обёртка открывает свой share sheet, браузер — Web Share API.
 * Если поделиться нельзя, файл сохраняется в «Загрузки».
 */
export async function shareTextFile(
  filename: string,
  content: string,
  mime: string,
  title: string,
): Promise<ShareFileResult> {
  if (typeof window !== 'undefined' && window.AndroidApp?.shareFile) {
    window.AndroidApp.shareFile(filename, mime, content);
    return 'shared';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([content], filename, { type: mime });
    const data: ShareData = { files: [file], title };
    if (!navigator.canShare || navigator.canShare(data)) {
      try {
        await navigator.share(data);
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return 'cancelled';
        }
      }
    }
  }

  downloadTextFile(filename, content, mime);
  return 'downloaded';
}

export function csvCell(value: string | number): string {
  const text = String(value);
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function csvLine(values: (string | number)[]): string {
  return values.map(csvCell).join(';');
}

export function statusLabel(status: Status): string {
  return STATUS_META[status].label;
}

export function dateCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts[1]?.[0] ?? '';
  return `${first}${second}`.toUpperCase();
}
