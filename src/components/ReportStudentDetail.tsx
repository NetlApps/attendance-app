import { ABSENCE_STATUSES, STATUS_META, STATUS_ORDER } from '../constants';
import type { Attendance, Student } from '../types';
import {
  formatDate,
  formatPercent,
  monthLabel,
  slotName,
  statusCounts,
  weekdayShort,
} from '../utils';
import { Icon } from './Icon';
import { StatusChip } from './StatusChip';

interface ReportStudentDetailProps {
  student: Student;
  records: Attendance[];
  month: string;
  onOpenAll: () => void;
}

/**
 * Раскрытая строка студента в отчёте: итоги и все пропуски за месяц.
 * Полный список отметок открывается в отдельном окне.
 */
export function ReportStudentDetail({
  student,
  records,
  month,
  onOpenAll,
}: ReportStudentDetailProps) {
  const counts = statusCounts(records);
  const visited = counts.present + counts.late;
  const absences = records.filter((record) =>
    ABSENCE_STATUSES.includes(record.status),
  );

  return (
    <div className="report-student-detail">
      <div className="report-student-detail-head">
        <div className="report-student-detail-title">
          <strong>{student.fullName}</strong>
          <span>
            {monthLabel(month)} · посещаемость {formatPercent(visited, records.length)} ·
            отмечено {records.length}
          </span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenAll}>
          <Icon name="chevron-right" size={15} />
          Все отметки
        </button>
      </div>

      <div className="report-student-detail-counts" aria-label="Итоги по статусам">
        {STATUS_ORDER.map((status) => (
          <span key={status} className={`report-detail-count status-${status}`}>
            <span>{STATUS_META[status].short}</span>
            <b>{counts[status]}</b>
          </span>
        ))}
      </div>

      <div className="report-student-detail-subhead">
        <span>Пропуски за месяц</span>
        <strong>{absences.length}</strong>
      </div>

      {absences.length === 0 ? (
        <div className="attendance-detail-empty">
          <Icon name="check" size={20} />
          <span>Пропусков за этот месяц нет.</span>
        </div>
      ) : (
        <div className="attendance-detail-list report-student-absences">
          {absences.map((record) => (
            <div
              className={`attendance-detail-row status-${record.status}`}
              key={record.id}
            >
              <div className="attendance-detail-when">
                <strong>{formatDate(record.date)}</strong>
                <span>
                  {weekdayShort(record.date)} · {slotName(record.pairNumber)}
                </span>
              </div>
              <StatusChip status={record.status} short />
              {record.comment && (
                <div className="attendance-detail-extra">
                  <span className="attendance-detail-comment">{record.comment}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
