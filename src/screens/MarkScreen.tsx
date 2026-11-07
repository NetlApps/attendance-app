import { useEffect, useMemo, useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import type { Status } from '../types';
import { useApp } from '../store';
import {
  capitalizeFirst,
  classHourTopic,
  comparePairNumbers,
  formatDate,
  isClassHour,
  pairTimeLabel,
  scheduleForDate,
  slotAt,
  slotFrom,
  slotName,
  slotNumbersForDate,
  slotTo,
  weekdayLong,
} from '../utils';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

interface MarkScreenProps {
  groupId: string;
  date: string;
  pairNumber: number;
  onExit: () => void;
  onSummary: () => void;
}

export function MarkScreen({
  groupId,
  date,
  pairNumber,
  onExit,
  onSummary,
}: MarkScreenProps) {
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
    onSummary();
  };

  const [index, setIndex] = useState(() => {
    const firstUnmarked = students.findIndex((student) => !recordByStudent.has(student.id));
    return firstUnmarked >= 0 ? firstUnmarked : 0;
  });
  const [lateOpen, setLateOpen] = useState(false);
  const [latePair, setLatePair] = useState(pairNumber);
  const [lateComment, setLateComment] = useState('');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [index]);

  useEffect(() => {
    if (index > students.length - 1 && students.length > 0) {
      setIndex(students.length - 1);
    }
  }, [students.length, index]);

  const student = students[index];
  const record = student ? recordByStudent.get(student.id) : undefined;
  const total = students.length;
  const progress = total > 0 ? Math.round(((index + 1) / total) * 100) : 0;

  const advance = () => {
    if (index >= total - 1) {
      onSummary();
      return;
    }
    setIndex((current) => current + 1);
  };

  const handleStatus = (status: Status, late?: number, comment?: string) => {
    if (!student) return;
    upsertAttendance({
      groupId,
      studentId: student.id,
      date,
      pairNumber,
      status,
      latePairNumber: status === 'late' ? late ?? pairNumber : undefined,
      comment,
    });
    setLateOpen(false);
    advance();
  };

  const openLate = () => {
    setLatePair(record?.latePairNumber ?? pairNumber);
    setLateComment(record?.comment ?? '');
    setLateOpen(true);
  };

  if (!group) {
    return (
      <div className="screen">
        <PageHeader title="Отметка" onBack={onExit} />
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
          title="Отметка"
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

  if (!student) {
    return (
      <div className="screen">
        <PageHeader title="Отметка" onBack={onExit} />
        <EmptyState icon="alert" title="Не удалось открыть студента" text="Попробуйте ещё раз." />
      </div>
    );
  }

  return (
    <div className="screen mark-screen">
      <PageHeader
        title={slotName(pairNumber)}
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
            Студент {index + 1} из {total}
          </span>
          <span className="muted">
            {isClassHour(pairNumber) && classHourTopic(date)
              ? `${classHourTopic(date)} · `
              : ''}
            {pairTimeLabel(dateSchedule, pairNumber) || 'время не задано'}
          </span>
        </div>
        <div className="progress-track">
          <span className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <section className="student-card">
        <div className="student-card-meta">
          <span className="student-order">№ {student.order}</span>
          {record ? (
            <StatusChip status={record.status} />
          ) : (
            <span className="pill">не отмечен</span>
          )}
        </div>
        <h1 className="student-name">{student.fullName}</h1>
        {record?.status === 'late' && (
          <p className="student-note">
            Опоздал, пришёл {slotTo(record.latePairNumber ?? pairNumber)}
            {record.comment ? ` · ${record.comment}` : ''}
          </p>
        )}
        {record && record.status !== 'late' && record.comment && (
          <p className="student-note">Комментарий: {record.comment}</p>
        )}
      </section>

      <div className="status-grid" role="group" aria-label="Статус посещения">
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className={`status-button status-${status}${record?.status === status ? ' is-current' : ''}`}
            onClick={() => {
              if (status === 'late') openLate();
              else handleStatus(status);
            }}
          >
            <span className="status-button-symbol">{STATUS_META[status].symbol}</span>
            <span className="status-button-label">
              {status === 'late' ? 'Опоздал / на какую пару' : STATUS_META[status].label}
            </span>
            {record?.status === status && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>

      <div className="mark-footer">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => (index > 0 ? setIndex(index - 1) : onExit())}
        >
          <Icon name="arrow-left" size={18} />
          {index > 0 ? 'Предыдущий' : 'К настройке'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={advance}>
          Пропустить
          <Icon name="chevron-right" size={18} />
        </button>
      </div>

      <Modal
        open={lateOpen}
        onClose={() => setLateOpen(false)}
        title="Опоздал"
        subtitle={student.fullName}
        footer={
          <div className="modal-footer-row">
            <button type="button" className="btn btn-ghost" onClick={() => setLateOpen(false)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleStatus('late', latePair, lateComment)}
            >
              Сохранить
            </button>
          </div>
        }
      >
        <div className="form-stack">
          <label className="field">
            <span>На какую пару пришёл</span>
            <select
              className="select"
              value={latePair}
              onChange={(event) => setLatePair(Number(event.target.value))}
            >
              {slotNumbersForDate(dateSchedule, [
                pairNumber,
                record?.latePairNumber ?? pairNumber,
              ]).map((pair) => (
                <option key={pair} value={pair}>
                  {slotName(pair)}
                  {pairTimeLabel(dateSchedule, pair)
                    ? ` · ${pairTimeLabel(dateSchedule, pair)}`
                    : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Комментарий (необязательно)</span>
            <textarea
              className="textarea"
              rows={3}
              maxLength={300}
              value={lateComment}
              onChange={(event) => setLateComment(event.target.value)}
              placeholder="Например: задержался транспорт"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
