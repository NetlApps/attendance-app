import { useMemo, useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Student } from '../types';
import { useApp } from '../store';
import {
  classHourTopic,
  formatDate,
  isClassHour,
  pairTimeLabel,
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

interface PairScreenProps {
  groupId: string;
  date: string;
  pairNumber: number;
  onBack: () => void;
  onMark: () => void;
}

export function PairScreen({
  groupId,
  date,
  pairNumber,
  onBack,
  onMark,
}: PairScreenProps) {
  const { data } = useApp();
  const [editing, setEditing] = useState<Student | null>(null);
  const group = data.groups.find((candidate) => candidate.id === groupId);
  const dateSchedule = scheduleForDate(data.settings, date);

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

  const students = useMemo(() => {
    const groupStudents = data.students.filter((student) => student.groupId === groupId);
    return [
      ...groupStudents
        .filter((student) => !student.archived)
        .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru')),
      ...groupStudents
        .filter((student) => student.archived && recordByStudent.has(student.id))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')),
    ];
  }, [data.students, groupId, recordByStudent]);

  const activeCount = students.filter((student) => !student.archived).length;
  const markedActive = students.filter(
    (student) => !student.archived && recordByStudent.has(student.id),
  ).length;

  if (!group) {
    return (
      <div className="screen">
        <PageHeader title="Пара" onBack={onBack} />
        <EmptyState icon="alert" title="Группа не найдена" text="Вернитесь в календарь." />
      </div>
    );
  }

  const editingRecord = editing ? recordByStudent.get(editing.id) : undefined;

  return (
    <div className="screen">
      <PageHeader
        title={slotName(pairNumber)}
        subtitle={`${formatDate(date)}, ${weekdayLong(date)} · ${group.name}`}
        onBack={onBack}
      />

      <section className="card">
        <div className="pair-detail-head">
          <div>
            <span className="eyebrow">
              {isClassHour(pairNumber) ? 'Время классного часа' : 'Время пары'}
            </span>
            <strong>
              {pairTimeLabel(dateSchedule, pairNumber) || 'не задано'}
            </strong>
            {isClassHour(pairNumber) && classHourTopic(date) && (
              <span className="muted">{classHourTopic(date)}</span>
            )}
            <span className="muted">
              Отмечено {markedActive} из {activeCount}
            </span>
          </div>
          <button type="button" className="btn btn-primary" onClick={onMark}>
            <Icon name={markedActive > 0 ? 'edit' : 'check'} />
            {markedActive === 0
              ? 'Отметить'
              : markedActive < activeCount
                ? 'Продолжить'
                : 'Пройти заново'}
          </button>
        </div>

        {records.length > 0 && (
          <div className="status-chips-row">
            {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
              <span key={status} className="status-count-chip">
                <StatusChip status={status} short />
                <strong>{counts[status]}</strong>
                <span className="status-count-symbol">{STATUS_META[status].symbol}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {students.length === 0 ? (
        <EmptyState
          icon="users"
          title="Нет студентов"
          text="Сначала добавьте студентов в группу."
        />
      ) : (
        <section className="card">
          <div className="section-head">
            <h2>Посещаемость</h2>
            <span className="muted">{records.length} отм.</span>
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
                    {record?.status === 'late' && (
                      <span className="muted">
                        пришёл {slotTo(record.latePairNumber ?? pairNumber)}
                      </span>
                    )}
                    {record?.comment && <span className="muted">{record.comment}</span>}
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
            Нажмите на студента, чтобы поставить или исправить статус.
          </p>
        </section>
      )}

      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onMark}>
        <Icon name="check" />
        {markedActive === 0 ? 'Начать отметку' : 'Отметить по порядку'}
      </button>

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
