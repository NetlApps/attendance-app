import { ABSENCE_STATUSES, STATUS_META } from './constants';
import type { Attendance, Student, Status } from './types';
import {
  csvLine,
  formatDate,
  monthLabel,
  safeFilePart,
  slotName,
  todayISO,
  weekdayLong,
} from './utils';

export type AbsenceFilter = Status | 'all';

export interface AbsenceEntry {
  record: Attendance;
  student: Student;
}

export interface AbsenceExportOptions {
  groupName: string;
  month: string;
  filter: AbsenceFilter;
  entries: AbsenceEntry[];
}

/** Подпись фильтра для CSV и печати. */
export function absenceFilterLabel(filter: AbsenceFilter): string {
  return filter === 'all' ? 'Все пропуски' : STATUS_META[filter].label;
}

/** Имя файла: группа, месяц и причина, если выбран фильтр. */
export function absenceCsvFileName(
  groupName: string,
  month: string,
  filter: AbsenceFilter,
): string {
  const suffix = filter === 'all' ? '' : `_${safeFilePart(STATUS_META[filter].short)}`;
  return `Пропуски_${safeFilePart(groupName)}_${month}${suffix}.csv`;
}

/** CSV со списком пропусков: одна строка — один пропуск. */
export function buildAbsencesCsv({
  groupName,
  month,
  filter,
  entries,
}: AbsenceExportOptions): string {
  const lines: string[] = [];
  lines.push(csvLine([`Пропуски: ${groupName}`]));
  lines.push(csvLine([`Месяц: ${monthLabel(month)}`]));
  lines.push(csvLine([`Фильтр: ${absenceFilterLabel(filter)}`]));
  lines.push(csvLine([`Всего: ${entries.length}`]));
  lines.push('');
  lines.push(
    csvLine([
      '№',
      'Студент',
      'Дата',
      'День недели',
      'Пара',
      'Причина',
      'Комментарий',
    ]),
  );

  entries.forEach(({ record, student }, index) => {
    lines.push(
      csvLine([
        index + 1,
        student.fullName,
        formatDate(record.date),
        weekdayLong(record.date),
        slotName(record.pairNumber),
        STATUS_META[record.status].label,
        record.comment?.trim() ?? '',
      ]),
    );
  });

  lines.push('');
  lines.push(csvLine([`Сформировано: ${formatDate(todayISO())}`]));
  return `\uFEFF${lines.join('\r\n')}`;
}

/** Сколько пропусков каждого вида в выбранном списке. */
export function absenceCounts(entries: AbsenceEntry[]): Record<Status, number> {
  const counts: Record<Status, number> = {
    present: 0,
    absent: 0,
    sick: 0,
    excused: 0,
    late: 0,
  };
  for (const { record } of entries) counts[record.status] += 1;
  return counts;
}

/** Только причины, которые действительно считаются пропуском. */
export const ABSENCE_PRINT_STATUSES = ABSENCE_STATUSES;
