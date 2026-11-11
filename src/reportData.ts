import type { Attendance, Group, Status, Student } from './types';
import { comparePairNumbers, formatPercent, statusCounts } from './utils';

export interface ReportDataOptions {
  group: Group;
  /** Все студенты приложения: функция сама оставит нужную группу. */
  students: Student[];
  /** Отметки только за выбранный период и только этой группы. */
  records: Attendance[];
}

export interface ReportStudentDay {
  date: string;
  records: Attendance[];
}

export interface ReportStudentEntry {
  student: Student;
  /** Номер по списку; у архивных студентов номера нет. */
  number?: number;
  records: Attendance[];
  days: ReportStudentDay[];
  counts: Record<Status, number>;
  total: number;
  visited: number;
  missed: number;
  percent: string;
  percentValue: number | null;
}

export interface ReportData {
  entries: ReportStudentEntry[];
  dates: string[];
  pairNumbers: number[];
  records: Attendance[];
  totalLessons: number;
  activeStudents: number;
  overallPercent: string;
  absences: number;
}

/**
 * Готовит данные для простого отчёта: по каждому студенту — дни и пары,
 * где стоят отметки. Одинаково используется в CSV и в красивом HTML-отчёте.
 */
export function buildReportData({
  group,
  students,
  records,
}: ReportDataOptions): ReportData {
  const groupStudents = students
    .filter((student) => student.groupId === group.id)
    .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
  const studentIds = new Set(groupStudents.map((student) => student.id));
  const scopedRecords = records
    .filter((record) => record.groupId === group.id && studentIds.has(record.studentId))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        comparePairNumbers(a.pairNumber, b.pairNumber),
    );

  const recordsByStudent = new Map<string, Attendance[]>();
  for (const record of scopedRecords) {
    const list = recordsByStudent.get(record.studentId) ?? [];
    list.push(record);
    recordsByStudent.set(record.studentId, list);
  }

  const relevant = groupStudents.filter(
    (student) => !student.archived || (recordsByStudent.get(student.id)?.length ?? 0) > 0,
  );

  let displayNumber = 0;
  const entries: ReportStudentEntry[] = [];
  for (const student of relevant) {
    const studentRecords = recordsByStudent.get(student.id) ?? [];
    const counts = statusCounts(studentRecords);
    const total = studentRecords.length;
    const visited = counts.present + counts.late;
    if (!student.archived) displayNumber += 1;

    const daysByDate = new Map<string, Attendance[]>();
    for (const record of studentRecords) {
      const list = daysByDate.get(record.date) ?? [];
      list.push(record);
      daysByDate.set(record.date, list);
    }
    const days: ReportStudentDay[] = [...daysByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, dayRecords]) => ({
        date,
        records: [...dayRecords].sort((a, b) =>
          comparePairNumbers(a.pairNumber, b.pairNumber),
        ),
      }));

    entries.push({
      student,
      number: student.archived ? undefined : displayNumber,
      records: studentRecords,
      days,
      counts,
      total,
      visited,
      missed: total - visited,
      percent: total > 0 ? formatPercent(visited, total) : '—',
      percentValue: total > 0 ? Math.round((visited / total) * 100) : null,
    });
  }

  const dates = Array.from(new Set(scopedRecords.map((record) => record.date))).sort();
  const pairNumbers = Array.from(
    new Set(scopedRecords.map((record) => record.pairNumber)),
  ).sort(comparePairNumbers);
  const totalLessons = new Set(
    scopedRecords.map((record) => `${record.date}|${record.pairNumber}`),
  ).size;
  const counts = statusCounts(scopedRecords);
  const visited = counts.present + counts.late;
  const activeStudents = groupStudents.filter((student) => !student.archived).length;

  return {
    entries,
    dates,
    pairNumbers,
    records: scopedRecords,
    totalLessons,
    activeStudents,
    overallPercent:
      scopedRecords.length > 0 ? formatPercent(visited, scopedRecords.length) : '—',
    absences: counts.absent + counts.sick + counts.excused,
  };
}
