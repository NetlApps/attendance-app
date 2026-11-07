import { useMemo, useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Student } from '../types';
import { useApp } from '../store';
import {
  classHourTopic,
  formatDate,
  isClassHour,
  pairTimeLabel,
  plural,
  scheduleForDate,
  slotName,
  slotTo,
  statusCounts,
  weekdayLong,
} from '../utils';
import { AttendanceEditModal } from '../components/AttendanceEditModal';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

interface MarkSummaryScreenProps {
  groupId: string;
  date: string;
  pairNumber: number;
  onBack: () => void;
  onHome: () => void;
  onAnotherPair: () => void;
}

export function MarkSummaryScreen({
  groupId,
  date,
  pairNumber,
  onBack,
  onHome,
  onAnotherPair,
}: MarkSummaryScreenProps) {
  const { data } = useApp();
  const group = data.groups.find((candidate) => candidate.id === groupId);
  const dateSchedule = scheduleForDate(data.settings, date);
  const [editing, setEditing] = useState<Student | null>(null);

  const students = useMemo(() => {
    const groupStudents = data.students.filter((student) => student.groupId === groupId);
    const active = groupStudents
      .filter((student) => !student.archived)
      .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru'));
    const recordStudentIds = new Set(
      data.attendance
        .filter(
          (record) =>
            record.groupId === groupId &&
            record.date === date &&
            record.pairNumber === pairNumber,
        )
        .map((record) => record.studentId),
    );
    const archived = groupStudents
      .filter((student) => student.archived && recordStudentIds.has(student.id))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
    return [...active, ...archived];
  }, [data.students, data.attendance, groupId, date, pairNumber]);

  const records = useMemo(
    () =>
      data.attendance.filter(
        (record) =>
          record.groupId === groupId &&
          record.date === date &&
          record.pairNumber === pairNumber,
      ),
    [data.attendance, groupId, date, pairNumber],
  );
  const recordByStudent = useMemo(
    () => new Map(records.map((record) => [record.studentId, record])),
    [records],
  );
  const counts = statusCounts(records);
  const activeIds = new Set(
    students.filter((student) => !student.archived).map((student) => student.id),
  );
  const markedActive = records.filter((record) => activeIds.has(record.studentId)).length;
  const activeCount = activeIds.size;

  const editingRecord = editing ? recordByStudent.get(editing.id) : undefined;

  return (
    <div className="screen">
      <PageHeader
        title="Итоги отметки"
        subtitle={`${group?.name ?? ''} · ${formatDate(date)}, ${weekdayLong(date)} · ${slotName(pairNumber)}${
          isClassHour(pairNumber) && classHourTopic(date)
            ? ` (${classHourTopic(date)})`
            : ''
        }`}
        onBack={onBack}
      />

      <section className="card">
        <div className="summary-hero">
          <div>
            <span className="eyebrow">Отмечено</span>
            <strong>
              {markedActive} из {activeCount}
            </strong>
            <span className="muted">
              {pairTimeLabel(dateSchedule, pairNumber) || 'время не задано'}
            </span>
          </div>
          <div className="summary-badge">
            <Icon name="check" size={26} />
          </div>
        </div>

        <div className="summary-status-grid">
          {STATUS_ORDER.map((status) => (
            <div key={status} className={`summary-status status-${status}`}>
              <span className="summary-symbol">{STATUS_META[status].symbol}</span>
              <strong>{counts[status]}</strong>
              <span>{STATUS_META[status].short}</span>
            </div>
          ))}
        </div>
      </section>

      {students.length === 0 ? (
        <EmptyState
          icon="users"
          title="В группе нет студентов"
          text="Добавьте студентов и вернитесь к отметке."
          action={
            <button type="button" className="btn btn-primary" onClick={onHome}>
              На главную
            </button>
          }
        />
      ) : (
        <section className="card">
          <div className="section-head">
            <h2>Студенты</h2>
            <span className="muted">
              {students.length} {plural(students.length, 'человек', 'человека', 'человек')}
            </span>
          </div>
          <div className="summary-list">
            {students.map((student) => {
              const record = recordByStudent.get(student.id);
              return (
                <button
                  key={student.id}
                  type="button"
                  className={`summary-row${student.archived ? ' is-archived' : ''}`}
                  onClick={() => setEditing(student)}
                >
                  <span className="summary-order">
                    {student.archived ? <Icon name="archive" size={16} /> : student.order}
                  </span>
                  <span className="summary-name">
                    <strong>{student.fullName}</strong>
                    {student.archived && <span className="muted">в архиве</span>}
                    {record?.comment && <span className="muted">{record.comment}</span>}
                    {record?.status === 'late' && (
                      <span className="muted">
                        пришёл {slotTo(record.latePairNumber ?? pairNumber)}
                      </span>
                    )}
                  </span>
                  {record ? (
                    <StatusChip status={record.status} short />
                  ) : (
                    <span className="pill">не отмечен</span>
                  )}
                  <Icon name="edit" size={17} />
                </button>
              );
            })}
          </div>
          <p className="field-hint">
            Нажмите на студента, чтобы исправить статус или добавить комментарий.
          </p>
        </section>
      )}

      <div className="stack-actions">
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onAnotherPair}>
          <Icon name="plus" />
          Отметить ещё одну пару
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={onHome}>
          На главную
        </button>
      </div>

      {editing && (
        <AttendanceEditModal
          open={Boolean(editing)}
          onClose={() => setEditing(null)}
          studentId={editing.id}
          studentName={editing.fullName}
          groupId={groupId}
          date={date}
          pairNumber={pairNumber}
          record={editingRecord}
        />
      )}
    </div>
  );
}
