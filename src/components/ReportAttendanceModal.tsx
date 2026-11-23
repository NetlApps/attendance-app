import { useMemo, useState } from 'react';
import {
  ABSENCE_PRINT_STATUSES,
  absenceCounts,
  absenceFilterLabel,
  type AbsenceEntry,
  type AbsenceFilter,
} from '../absenceReport';
import { ABSENCE_STATUSES, STATUS_META } from '../constants';
import type { Attendance, Student } from '../types';
import {
  formatDate,
  formatDateShort,
  formatPercent,
  monthLabel,
  shortName,
  slotName,
  statusCounts,
  todayISO,
  weekdayShort,
} from '../utils';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { StatusChip } from './StatusChip';

export type { AbsenceEntry } from '../absenceReport';

interface StudentAttendanceModalProps {
  student: Student;
  records: Attendance[];
  month: string;
  onClose: () => void;
}

/** Все отметки одного студента за месяц: удобно считать пропуски и смотреть комментарии. */
export function StudentAttendanceModal({
  student,
  records,
  month,
  onClose,
}: StudentAttendanceModalProps) {
  const [onlyAbsences, setOnlyAbsences] = useState(false);
  const counts = statusCounts(records);
  const absent = counts.absent + counts.sick + counts.excused;
  const visited = counts.present + counts.late;
  const visibleRecords = onlyAbsences
    ? records.filter((record) => ABSENCE_STATUSES.includes(record.status))
    : records;

  return (
    <Modal
      open
      onClose={onClose}
      title={shortName(student.fullName)}
      subtitle={`${student.fullName} · ${monthLabel(month)}`}
      wide
      footer={
        <div className="modal-footer-row">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      }
    >
      <div className="attendance-detail-summary">
        <div>
          <span>Посещаемость</span>
          <strong>{formatPercent(visited, records.length)}</strong>
        </div>
        <div className={absent > 0 ? 'is-warning' : undefined}>
          <span>Пропусков</span>
          <strong>{absent}</strong>
        </div>
        <div>
          <span>Опозданий</span>
          <strong>{counts.late}</strong>
        </div>
        <div>
          <span>Отмечено</span>
          <strong>{records.length}</strong>
        </div>
      </div>

      <div className="attendance-detail-toggle" role="group" aria-label="Какие отметки показать">
        <button
          type="button"
          className={!onlyAbsences ? 'is-active' : ''}
          onClick={() => setOnlyAbsences(false)}
          aria-pressed={!onlyAbsences}
        >
          Все отметки
          <span>{records.length}</span>
        </button>
        <button
          type="button"
          className={onlyAbsences ? 'is-active' : ''}
          onClick={() => setOnlyAbsences(true)}
          aria-pressed={onlyAbsences}
        >
          Пропуски
          <span>{absent}</span>
        </button>
      </div>

      {visibleRecords.length === 0 ? (
        <div className="attendance-detail-empty">
          <Icon name="check" size={22} />
          <span>
            {onlyAbsences ? 'Пропусков за этот месяц нет.' : 'За этот месяц отметок нет.'}
          </span>
        </div>
      ) : (
        <div className="attendance-detail-list">
          {visibleRecords.map((record) => (
            <div className={`attendance-detail-row status-${record.status}`} key={record.id}>
              <div className="attendance-detail-when">
                <strong>{formatDateShort(record.date)}</strong>
                <span>
                  {weekdayShort(record.date)} · {slotName(record.pairNumber)}
                </span>
              </div>
              <StatusChip status={record.status} short />
              {(record.comment || (record.status === 'late' && record.latePairNumber)) && (
                <div className="attendance-detail-extra">
                  {record.status === 'late' && record.latePairNumber && (
                    <span>Пришёл на {slotName(record.latePairNumber)}</span>
                  )}
                  {record.comment && (
                    <span className="attendance-detail-comment">{record.comment}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

interface GroupAbsencesModalProps {
  entries: AbsenceEntry[];
  groupName: string;
  month: string;
  onClose: () => void;
  onSelectStudent: (studentId: string) => void;
  onExportCsv: (entries: AbsenceEntry[], filter: AbsenceFilter) => void;
}

/** Все пропуски группы за месяц с фильтром по причине. */
export function GroupAbsencesModal({
  entries,
  groupName,
  month,
  onClose,
  onSelectStudent,
  onExportCsv,
}: GroupAbsencesModalProps) {
  const [filter, setFilter] = useState<AbsenceFilter>('all');
  const counts = useMemo(() => statusCounts(entries.map((entry) => entry.record)), [entries]);
  const total = entries.length;
  const visible =
    filter === 'all'
      ? entries
      : entries.filter((entry) => entry.record.status === filter);

  return (
    <Modal
      open
      onClose={onClose}
      title="Пропуски за месяц"
      subtitle={`${monthLabel(month)} · всего ${total}`}
      wide
      footer={
        <div className="modal-footer-row">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      }
    >
      <div className="absence-filters" role="group" aria-label="Причина пропуска">
        <button
          type="button"
          className={filter === 'all' ? 'is-active' : ''}
          onClick={() => setFilter('all')}
          aria-pressed={filter === 'all'}
        >
          Все <b>{total}</b>
        </button>
        {ABSENCE_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={`status-${status}${filter === status ? ' is-active' : ''}`}
            onClick={() => setFilter(status)}
            aria-pressed={filter === status}
          >
            {STATUS_META[status].short} <b>{counts[status]}</b>
          </button>
        ))}
      </div>

      <div className="absence-toolbar">
        <span className="absence-toolbar-label">
          {absenceFilterLabel(filter)} · {visible.length}
        </span>
        <div className="absence-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onExportCsv(visible, filter)}
            disabled={visible.length === 0}
          >
            <Icon name="download" size={16} />
            CSV
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="attendance-detail-empty">
          <Icon name="check" size={22} />
          <span>Пропусков с такой причиной нет.</span>
        </div>
      ) : (
        <div className="absence-list">
          {visible.map(({ record, student }) => (
            <button
              key={record.id}
              type="button"
              className="absence-row"
              onClick={() => onSelectStudent(student.id)}
              title={`Открыть все отметки: ${student.fullName}`}
            >
              <span className="absence-row-main">
                <strong>{shortName(student.fullName)}</strong>
                <span>
                  {formatDate(record.date)}, {weekdayShort(record.date)} ·{' '}
                  {slotName(record.pairNumber)}
                </span>
                {record.comment && <em>{record.comment}</em>}
              </span>
              <StatusChip status={record.status} short />
              <Icon name="chevron-right" size={16} />
            </button>
          ))}
        </div>
      )}

      <p className="field-hint">Нажмите на студента, чтобы открыть все его отметки за месяц.</p>
    </Modal>
  );
}

interface AbsencePrintSheetProps {
  entries: AbsenceEntry[];
  groupName: string;
  month: string;
  filter: AbsenceFilter;
}

/** Таблица пропусков только для печати и PDF. */
export function AbsencePrintSheet({
  entries,
  groupName,
  month,
  filter,
}: AbsencePrintSheetProps) {
  const counts = absenceCounts(entries);

  return (
    <div className="print-only absences-print">
      <div className="absences-print-head">
        <h1>Пропуски за месяц</h1>
        <p>
          {groupName} · {monthLabel(month)} · {absenceFilterLabel(filter)} ·
          сформировано {formatDate(todayISO())}
        </p>
      </div>
      <div className="absences-print-summary">
        <span>
          Всего пропусков: <strong>{entries.length}</strong>
        </span>
        {ABSENCE_PRINT_STATUSES.map((status) => (
          <span key={status}>
            {STATUS_META[status].short}: <strong>{counts[status]}</strong>
          </span>
        ))}
      </div>
      <table className="absences-print-table">
        <thead>
          <tr>
            <th className="absences-print-number">№</th>
            <th>Студент</th>
            <th>Дата</th>
            <th>День</th>
            <th>Пара</th>
            <th>Причина</th>
            <th>Комментарий</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ record, student }, index) => (
            <tr key={record.id}>
              <td className="absences-print-number">{index + 1}</td>
              <td>{student.fullName}</td>
              <td>{formatDate(record.date)}</td>
              <td>{weekdayShort(record.date)}</td>
              <td>{slotName(record.pairNumber)}</td>
              <td>{STATUS_META[record.status].label}</td>
              <td>{record.comment?.trim() || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
