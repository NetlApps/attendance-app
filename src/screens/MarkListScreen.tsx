import { useEffect, useMemo, useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Status, Student } from '../types';
import { useApp } from '../store';
import {
  capitalizeFirst,
  comparePairNumbers,
  formatDate,
  pairTimeLabel,
  scheduleForDate,
  slotAt,
  slotFrom,
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

interface MarkListScreenProps {
  groupId: string;
  date: string;
  pairNumber: number;
  onExit: () => void;
  onSummary: () => void;
}

export function MarkListScreen({
  groupId,
  date,
  pairNumber,
  onExit,
  onSummary,
}: MarkListScreenProps) {
  const { data, upsertAttendance, copyPairAttendance, notify } = useApp();
  const group = data.groups.find((candidate) => candidate.id === groupId);
  const dateSchedule = scheduleForDate(data.settings, date);
  const students = useMemo(
    () =>
      data.students
        .filter((student) => student.groupId === groupId && !student.archived)
        .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru')),
    [data.students, groupId],
  );

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
  const markedCount = students.filter((student) => recordByStudent.has(student.id)).length;
  const total = students.length;
  const progress = total > 0 ? Math.round((markedCount / total) * 100) : 0;

  const [editing, setEditing] = useState<Student | null>(null);
  const editingRecord = editing ? recordByStudent.get(editing.id) : undefined;

  /** Ближайшее предыдущее занятие этого дня, по которому уже есть отметки. */
  const previousPair = useMemo(() => {
    const activeIds = new Set(students.map((student) => student.id));
    const pairs = data.attendance
      .filter(
        (record) =>
          record.groupId === groupId &&
          record.date === date &&
          comparePairNumbers(record.pairNumber, pairNumber) < 0 &&
          activeIds.has(record.studentId),
      )
      .map((record) => record.pairNumber);
    return pairs.length > 0 ? pairs.sort(comparePairNumbers).at(-1) : undefined;
  }, [data.attendance, groupId, date, pairNumber, students]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const handleQuickStatus = (student: Student, status: Status) => {
    upsertAttendance({
      groupId,
      studentId: student.id,
      date,
      pairNumber,
      status,
    });
  };

  const handleCopyPrevious = () => {
    if (!previousPair) return;
    const copied = copyPairAttendance(groupId, date, pairNumber, previousPair);
    if (copied === 0) {
      notify('Все студенты уже отмечены за это занятие.', 'info');
    } else {
      notify(
        `Скопировано ${slotFrom(previousPair)}: ${copied}. Отметьте ушедших и пришедших.`,
      );
    }
  };

  if (!group) {
    return (
      <div className="screen">
        <PageHeader title="Отметка списком" onBack={onExit} />
        <EmptyState
          icon="alert"
          title="Группа не найдена"
          text="Вернитесь на главный экран и выберите группу заново."
          action={
            <button type="button" className="btn btn-primary" onClick={onExit}>
              На главную
            </button>
          }
        />
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="screen">
        <PageHeader
          title="Отметка списком"
          subtitle={`${group.name} · ${formatDate(date)}`}
          onBack={onExit}
        />
        <EmptyState
          icon="users"
          title="Нет студентов"
          text="Добавьте студентов в группу, чтобы начать отметку."
          action={
            <button type="button" className="btn btn-primary" onClick={onExit}>
              Назад
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="screen mark-list-screen">
      <PageHeader
        title="Отметка списком"
        subtitle={`${formatDate(date)}, ${weekdayLong(date)} · ${group.name}`}
        onBack={onExit}
        actions={
          <button type="button" className="text-button" onClick={onSummary}>
            Итоги
          </button>
        }
      />

      {records.length === 0 && previousPair && (
        <div className="copy-note">
          <div className="copy-note-text">
            <Icon name="copy" size={18} />
            <span>
              {capitalizeFirst(slotAt(previousPair))} уже есть отметки. Заполнить всех, кто был, и
              отметить только ушедших и пришедших?
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={handleCopyPrevious}
          >
            <Icon name="copy" />
            Заполнить {slotFrom(previousPair)}
          </button>
        </div>
      )}

      <div className="mark-progress">
        <div className="mark-progress-row">
          <span>
            Отмечено {markedCount} из {total}
          </span>
          <span className="muted">
            {slotName(pairNumber)} · {pairTimeLabel(dateSchedule, pairNumber) || 'время не задано'}
          </span>
        </div>
        <div className="progress-track">
          <span className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {records.length > 0 && (
        <div className="status-summary-row">
          {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
            <span key={status} className="status-summary-item">
              <StatusChip status={status} short />
              <strong>{counts[status]}</strong>
            </span>
          ))}
        </div>
      )}

      <p className="field-hint mark-list-hint">
        Плюс — «Есть», минус — «Не было», три точки — причина, опоздание и комментарий.
      </p>

      <section className="card mark-list-card">
        <div className="mark-list-head" aria-hidden="true">
          <span>Студент</span>
          <span>Отметка</span>
        </div>
        <div className="mark-list">
          {students.map((student) => {
            const record = recordByStudent.get(student.id);
            const isReason =
              record?.status === 'sick' ||
              record?.status === 'excused' ||
              record?.status === 'late';
            return (
              <div
                key={student.id}
                className={`mark-list-row${record ? ' is-marked' : ''}`}
              >
                <span className="mark-list-order">{student.order}</span>
                <div className="mark-list-info">
                  <strong>{student.fullName}</strong>
                  <span
                    className={`mark-list-state${record ? ` status-${record.status}` : ''}`}
                  >
                    {record ? STATUS_META[record.status].label : 'не отмечен'}
                    {record?.status === 'late' &&
                      ` · пришёл ${slotTo(record.latePairNumber ?? pairNumber)}`}
                    {record?.comment ? ` · ${record.comment}` : ''}
                  </span>
                </div>
                <div className="mark-list-actions">
                  <button
                    type="button"
                    className={`mark-list-action status-present${
                      record?.status === 'present' ? ' is-active' : ''
                    }`}
                    onClick={() => handleQuickStatus(student, 'present')}
                    aria-label={`Есть: ${student.fullName}`}
                    aria-pressed={record?.status === 'present'}
                    title="Есть"
                  >
                    <Icon name="plus" size={20} />
                  </button>
                  <button
                    type="button"
                    className={`mark-list-action status-absent${
                      record?.status === 'absent' ? ' is-active' : ''
                    }`}
                    onClick={() => handleQuickStatus(student, 'absent')}
                    aria-label={`Не было: ${student.fullName}`}
                    aria-pressed={record?.status === 'absent'}
                    title="Не было"
                  >
                    <Icon name="minus" size={20} />
                  </button>
                  <button
                    type="button"
                    className={`mark-list-action mark-list-more${
                      isReason ? ' is-active' : ''
                    }`}
                    onClick={() => setEditing(student)}
                    aria-label={`Причина: ${student.fullName}`}
                    title="Причина"
                  >
                    <Icon name="menu" size={20} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="stack-actions">
        <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onSummary}>
          <Icon name="check" />
          Готово
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
