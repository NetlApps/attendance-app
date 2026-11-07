import { STATUS_META } from './constants';
import type { Attendance, Group, Student } from './types';
import {
  comparePairNumbers,
  csvLine,
  formatDate,
  formatPercent,
  safeFilePart,
  slotName,
  statusCounts,
  todayISO,
  weekdayShort,
} from './utils';

export interface ReportCsvOptions {
  group: Group;
  /** Все студенты приложения: функция сама оставит нужную группу. */
  students: Student[];
  /** Отметки только за выбранный период и только этой группы. */
  records: Attendance[];
  periodLabel: string;
  periodCaption?: string;
}

/** Имя файла отчёта: группа и период (дата или месяц). */
export function reportFileName(groupName: string, periodKey: string): string {
  return `Посещаемость_${safeFilePart(groupName)}_${periodKey}.csv`;
}

/**
 * Собирает CSV в том же «бумажном» формате, что и месячная ведомость:
 * строки — студенты, колонки — отмеченные дни и занятия.
 */
export function buildReportCsv({
  group,
  students,
  records,
  periodLabel,
  periodCaption = 'Период',
}: ReportCsvOptions): string {
  const sortedRecords = [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      comparePairNumbers(a.pairNumber, b.pairNumber),
  );

  const columns: { key: string; date: string; pairNumber: number }[] = [];
  const seenColumns = new Set<string>();
  for (const record of sortedRecords) {
    const key = `${record.date}|${record.pairNumber}`;
    if (seenColumns.has(key)) continue;
    seenColumns.add(key);
    columns.push({ key, date: record.date, pairNumber: record.pairNumber });
  }

  const recordLookup = new Map<string, Attendance>();
  const recordsByStudent = new Map<string, Attendance[]>();
  for (const record of sortedRecords) {
    recordLookup.set(
      `${record.studentId}|${record.date}|${record.pairNumber}`,
      record,
    );
    const list = recordsByStudent.get(record.studentId) ?? [];
    list.push(record);
    recordsByStudent.set(record.studentId, list);
  }

  const groupStudents = students
    .filter((student) => student.groupId === group.id)
    .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
  const relevant = groupStudents.filter(
    (student) => !student.archived || (recordsByStudent.get(student.id)?.length ?? 0) > 0,
  );

  const lines: string[] = [];
  lines.push(csvLine(['Ведомость посещаемости студентов']));
  lines.push(csvLine(['Группа', group.name]));
  lines.push(csvLine([periodCaption, periodLabel]));
  lines.push(csvLine(['Сформировано', formatDate(todayISO())]));
  lines.push('');
  lines.push(
    csvLine([
      '№',
      'ФИО',
      ...columns.map(
        (column) =>
          `${formatDate(column.date)} (${weekdayShort(column.date)}), ${slotName(column.pairNumber)}`,
      ),
      'Всего отмечено',
      'Есть',
      'Не было',
      'Болеет',
      'Уважительная',
      'Опоздал',
      '% посещаемости',
    ]),
  );

  let displayNumber = 0;
  for (const student of relevant) {
    const studentRecords = recordsByStudent.get(student.id) ?? [];
    const counts = statusCounts(studentRecords);
    const visited = counts.present + counts.late;
    if (!student.archived) displayNumber += 1;
    const cells = columns.map((column) => {
      const record = recordLookup.get(
        `${student.id}|${column.date}|${column.pairNumber}`,
      );
      return record ? STATUS_META[record.status].symbol : '—';
    });
    lines.push(
      csvLine([
        student.archived ? 'арх.' : displayNumber,
        student.fullName,
        ...cells,
        studentRecords.length,
        counts.present,
        counts.absent,
        counts.sick,
        counts.excused,
        counts.late,
        formatPercent(visited, studentRecords.length),
      ]),
    );
  }

  lines.push('');
  lines.push(
    csvLine([
      'Обозначения',
      '+ Есть',
      'Н Не было',
      'Б Болеет',
      'У Уважительная причина',
      'О Опоздал',
      '— нет отметки',
    ]),
  );
  lines.push(
    csvLine(['Формула', '% = (Есть + Опоздал) / Всего отмечено × 100']),
  );

  return `\uFEFF${lines.join('\r\n')}`;
}
