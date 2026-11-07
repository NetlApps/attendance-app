import { useMemo, useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Attendance, Status, Student } from '../types';
import { useApp } from '../store';
import {
  comparePairNumbers,
  downloadTextFile,
  formatDate,
  formatDateShort,
  formatPercent,
  monthLabel,
  slotName,
  slotShortName,
  statusCounts,
  todayISO,
  weekdayShort,
} from '../utils';
import { buildReportCsv, reportFileName } from '../reportCsv';
import { AttendanceEditModal } from '../components/AttendanceEditModal';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

interface ReportsScreenProps {
  onMark: () => void;
  onGroups: () => void;
}

interface ReportColumn {
  key: string;
  date: string;
  pairNumber: number;
}

interface ReportRow {
  student: Student;
  number?: number;
  counts: Record<Status, number>;
  total: number;
  percent: string;
}

interface EditingCell {
  student: Student;
  record: Attendance;
}

export function ReportsScreen({ onMark, onGroups }: ReportsScreenProps) {
  const { data, activeGroup, notify } = useApp();
  const [groupId, setGroupId] = useState(
    () => activeGroup?.id ?? data.groups[0]?.id ?? '',
  );
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [editing, setEditing] = useState<EditingCell | null>(null);

  const group =
    data.groups.find((candidate) => candidate.id === groupId) ?? data.groups[0];

  const monthRecords = useMemo(() => {
    if (!group) return [];
    return data.attendance
      .filter(
        (record) => record.groupId === group.id && record.date.startsWith(month),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          comparePairNumbers(a.pairNumber, b.pairNumber),
      );
  }, [data.attendance, group, month]);

  const columns = useMemo<ReportColumn[]>(() => {
    const seen = new Set<string>();
    const result: ReportColumn[] = [];
    for (const record of monthRecords) {
      const key = `${record.date}|${record.pairNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ key, date: record.date, pairNumber: record.pairNumber });
      }
    }
    return result;
  }, [monthRecords]);

  const recordLookup = useMemo(() => {
    const map = new Map<string, Attendance>();
    for (const record of monthRecords) {
      map.set(`${record.studentId}|${record.date}|${record.pairNumber}`, record);
    }
    return map;
  }, [monthRecords]);

  const recordsByStudent = useMemo(() => {
    const map = new Map<string, Attendance[]>();
    for (const record of monthRecords) {
      const list = map.get(record.studentId) ?? [];
      list.push(record);
      map.set(record.studentId, list);
    }
    return map;
  }, [monthRecords]);

  const rows = useMemo<ReportRow[]>(() => {
    if (!group) return [];
    const groupStudents = data.students
      .filter((student) => student.groupId === group.id)
      .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
    const relevant = groupStudents.filter(
      (student) => !student.archived || (recordsByStudent.get(student.id)?.length ?? 0) > 0,
    );
    const result: ReportRow[] = [];
    let displayNumber = 0;
    for (const student of relevant) {
      const records = recordsByStudent.get(student.id) ?? [];
      const counts = statusCounts(records);
      const visited = counts.present + counts.late;
      if (!student.archived) displayNumber += 1;
      result.push({
        student,
        number: student.archived ? undefined : displayNumber,
        counts,
        total: records.length,
        percent: formatPercent(visited, records.length),
      });
    }
    return result;
  }, [data.students, group, recordsByStudent]);

  const totals = useMemo(() => {
    const counts = statusCounts(monthRecords);
    const absent = counts.absent + counts.sick + counts.excused;
    const visited = counts.present + counts.late;
    const percent = formatPercent(visited, monthRecords.length);
    const withData = rows.filter((row) => row.total > 0);
    const average =
      withData.length > 0
        ? `${Math.round(
            withData.reduce((sum, row) => {
              const visitedRow = row.counts.present + row.counts.late;
              return sum + (row.total ? (visitedRow / row.total) * 100 : 0);
            }, 0) / withData.length,
          )}%`
        : '—';
    return { counts, absent, percent, average };
  }, [monthRecords, rows]);

  const handleExport = () => {
    if (!group || monthRecords.length === 0) {
      notify('За выбранный месяц пока нет данных для отчёта.', 'info');
      return;
    }

    downloadTextFile(
      reportFileName(group.name, month),
      buildReportCsv({
        group,
        students: data.students,
        records: monthRecords,
        periodLabel: monthLabel(month),
        periodCaption: 'Месяц',
      }),
      'text/csv;charset=utf-8',
    );
  };

  if (!group) {
    return (
      <div className="screen">
        <PageHeader title="Отчёты" />
        <EmptyState
          icon="users"
          title="Нет группы"
          text="Создайте группу и добавьте студентов, чтобы строить отчёты."
          action={
            <button type="button" className="btn btn-primary" onClick={onGroups}>
              Перейти к группам
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="screen reports-screen">
      <PageHeader
        title="Отчёты"
        subtitle="Ведомость за месяц"
        actions={
          <button type="button" className="icon-button" onClick={onGroups} aria-label="Сменить группу">
            <Icon name="users" />
          </button>
        }
      />

      <section className="card report-filters no-print">
        <div className="report-filter-grid">
          <label className="field">
            <span>Группа</span>
            <select
              className="select"
              value={group.id}
              onChange={(event) => setGroupId(event.target.value)}
            >
              {data.groups.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Месяц</span>
            <input
              type="month"
              className="input"
              value={month}
              onChange={(event) => setMonth(event.target.value || todayISO().slice(0, 7))}
            />
          </label>
        </div>
        <div className="report-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExport}
            disabled={monthRecords.length === 0}
          >
            <Icon name="download" />
            CSV для Excel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              if (window.AndroidApp?.printPage) window.AndroidApp.printPage();
              else window.print();
            }}
            disabled={monthRecords.length === 0}
          >
            <Icon name="print" />
            Печать / PDF
          </button>
        </div>
      </section>

      <div className="print-only report-print-head">
        <h1>Ведомость посещаемости студентов</h1>
        <p>
          {group.name} · {monthLabel(month)} · сформировано {formatDate(todayISO())}
        </p>
      </div>

      <div className="print-only report-print-summary">
        <span>
          Средняя посещаемость: <strong>{totals.average}</strong>
        </span>
        <span>
          Посещаемость группы: <strong>{totals.percent}</strong>
        </span>
        <span>
          Пропусков: <strong>{totals.absent}</strong>
        </span>
        <span>
          Занятий отмечено: <strong>{columns.length}</strong>
        </span>
      </div>

      {monthRecords.length === 0 ? (
        <EmptyState
          icon="chart"
          title="За этот месяц нет отметок"
          text="Выберите другой месяц или отметьте посещаемость на главном экране."
          action={
            <button type="button" className="btn btn-primary" onClick={onMark}>
              Перейти к отметке
            </button>
          }
        />
      ) : (
        <>
          <section className="report-stats no-print">
            <div className="report-stat">
              <span>Средняя посещаемость</span>
              <strong>{totals.average}</strong>
            </div>
            <div className="report-stat">
              <span>Посещаемость группы</span>
              <strong>{totals.percent}</strong>
            </div>
            <div className="report-stat">
              <span>Пропусков</span>
              <strong>{totals.absent}</strong>
            </div>
            <div className="report-stat">
              <span>Занятий отмечено</span>
              <strong>{columns.length}</strong>
            </div>
          </section>

          <div className="report-caption">
            <strong>{group.name}</strong>
            <span>
              {monthLabel(month)} · {formatDate(todayISO())}
            </span>
          </div>

          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th className="report-name-col">№ / ФИО</th>
                  {columns.map((column) => (
                    <th key={column.key} className="report-date-col">
                      <span>{formatDateShort(column.date)}</span>
                      <small>{weekdayShort(column.date)}</small>
                      <em>{slotShortName(column.pairNumber)}</em>
                    </th>
                  ))}
                  <th className="report-total-col" title="Всего отмечено">Всего</th>
                  <th className="report-total-col">Есть</th>
                  <th className="report-total-col">Нет</th>
                  <th className="report-total-col">Болеет</th>
                  <th className="report-total-col">Уваж.</th>
                  <th className="report-total-col">Опоздал</th>
                  <th className="report-total-col">%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id} className={row.student.archived ? 'is-archived' : ''}>
                    <th className="report-name-col" scope="row">
                      <span className="report-row-number">
                        {row.student.archived ? (
                          <Icon name="archive" size={14} />
                        ) : (
                          row.number
                        )}
                      </span>
                      <span>{row.student.fullName}</span>
                      {row.student.archived && <small>архив</small>}
                    </th>
                    {columns.map((column) => {
                      const record = recordLookup.get(
                        `${row.student.id}|${column.date}|${column.pairNumber}`,
                      );
                      return (
                        <td key={column.key}>
                          {record ? (
                            <button
                              type="button"
                              className={`report-cell cell-${record.status}${record.comment || record.status === 'late' ? ' has-note' : ''}`}
                              onClick={() => setEditing({ student: row.student, record })}
                              title={`${STATUS_META[record.status].label}${record.comment ? `: ${record.comment}` : ''}`}
                              aria-label={`${row.student.fullName}, ${formatDate(column.date)}, ${slotName(column.pairNumber)}: ${STATUS_META[record.status].label}`}
                            >
                              {STATUS_META[record.status].symbol}
                            </button>
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
                ))}
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

          <p className="field-hint no-print">
            Нажмите на цветную клетку, чтобы изменить статус, посмотреть комментарий или удалить отметку.
          </p>
        </>
      )}

      {editing && (
        <AttendanceEditModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          studentId={editing.student.id}
          studentName={editing.student.fullName}
          groupId={group.id}
          date={editing.record.date}
          pairNumber={editing.record.pairNumber}
          record={editing.record}
        />
      )}
    </div>
  );
}
