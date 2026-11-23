import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Attendance, Group, Student } from '../types';
import {
  comparePairNumbers,
  formatDate,
  formatDateShort,
  formatPercent,
  monthLabel,
  shortName,
  slotShortName,
  statusCounts,
  todayISO,
  weekdayShort,
} from '../utils';
import { Icon } from './Icon';
import { StatusChip } from './StatusChip';

interface ReportPrintSheetProps {
  group: Group;
  students: Student[];
  records: Attendance[];
  month: string;
}

interface PrintColumn {
  key: string;
  date: string;
  pairNumber: number;
}

/** Печатная ведомость для скрытого раздела «Печать» в настройках. */
export function ReportPrintSheet({
  group,
  students,
  records,
  month,
}: ReportPrintSheetProps) {
  const scopedRecords = records
    .filter((record) => record.groupId === group.id)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        comparePairNumbers(a.pairNumber, b.pairNumber),
    );

  const columns: PrintColumn[] = [];
  const seenColumns = new Set<string>();
  for (const record of scopedRecords) {
    const key = `${record.date}|${record.pairNumber}`;
    if (seenColumns.has(key)) continue;
    seenColumns.add(key);
    columns.push({ key, date: record.date, pairNumber: record.pairNumber });
  }

  const recordLookup = new Map<string, Attendance>();
  const recordsByStudent = new Map<string, Attendance[]>();
  for (const record of scopedRecords) {
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

  const totals = statusCounts(scopedRecords);
  const totalAbsences = totals.absent + totals.sick + totals.excused;
  const totalVisited = totals.present + totals.late;
  const totalPercent = formatPercent(totalVisited, scopedRecords.length);

  const rows = groupStudents
    .filter(
      (student) =>
        !student.archived || (recordsByStudent.get(student.id)?.length ?? 0) > 0,
    )
    .map((student) => {
      const studentRecords = recordsByStudent.get(student.id) ?? [];
      const counts = statusCounts(studentRecords);
      return {
        student,
        counts,
        total: studentRecords.length,
        percent: formatPercent(counts.present + counts.late, studentRecords.length),
      };
    });

  let displayNumber = 0;

  return (
    <div className="print-only report-print-sheet">
      <div className="report-print-head">
        <h1>Ведомость посещаемости студентов</h1>
        <p>
          {group.name} · {monthLabel(month)} · сформировано {formatDate(todayISO())}
        </p>
      </div>
      <div className="report-print-summary">
        <span>
          Посещаемость: <strong>{totalPercent}</strong>
        </span>
        <span>
          Пропусков: <strong>{totalAbsences}</strong>
        </span>
        <span>
          Занятий отмечено: <strong>{columns.length}</strong>
        </span>
      </div>

      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th className="report-name-col">№ / Студент</th>
              {columns.map((column) => (
                <th key={column.key} className="report-date-col">
                  <span>{formatDateShort(column.date)}</span>
                  <small>{weekdayShort(column.date)}</small>
                  <em>{slotShortName(column.pairNumber)}</em>
                </th>
              ))}
              <th className="report-total-col">Всего</th>
              <th className="report-total-col">Есть</th>
              <th className="report-total-col">Нет</th>
              <th className="report-total-col">Болеет</th>
              <th className="report-total-col">Уваж.</th>
              <th className="report-total-col">Опоздал</th>
              <th className="report-total-col">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (!row.student.archived) displayNumber += 1;
              return (
                <tr
                  key={row.student.id}
                  className={row.student.archived ? 'is-archived' : ''}
                >
                  <th className="report-name-col" scope="row">
                    <span className="report-row-number">
                      {row.student.archived ? (
                        <Icon name="archive" size={14} />
                      ) : (
                        displayNumber
                      )}
                    </span>
                    <span>{shortName(row.student.fullName)}</span>
                    {row.student.archived && <small>архив</small>}
                  </th>
                  {columns.map((column) => {
                    const record = recordLookup.get(
                      `${row.student.id}|${column.date}|${column.pairNumber}`,
                    );
                    return (
                      <td key={column.key}>
                        {record ? (
                          <span
                            className={`report-cell cell-${record.status}`}
                            title={
                              record.comment
                                ? `${STATUS_META[record.status].label}: ${record.comment}`
                                : STATUS_META[record.status].label
                            }
                          >
                            {STATUS_META[record.status].symbol}
                          </span>
                        ) : (
                          <span className="report-cell cell-none">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="report-total-col">{row.total}</td>
                  <td className="report-total-col">{row.counts.present}</td>
                  <td className="report-total-col">{row.counts.absent}</td>
                  <td className="report-total-col">{row.counts.sick}</td>
                  <td className="report-total-col">{row.counts.excused}</td>
                  <td className="report-total-col">{row.counts.late}</td>
                  <td className="report-total-col report-percent">{row.percent}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="report-legend">
        {STATUS_ORDER.map((status) => (
          <span key={status}>
            <StatusChip status={status} />
            <b>{STATUS_META[status].symbol}</b>
          </span>
        ))}
        <span className="muted">— нет отметки</span>
        <span className="muted">
          % = (Есть + Опоздал) / Всего отмечено × 100
        </span>
      </div>
    </div>
  );
}
