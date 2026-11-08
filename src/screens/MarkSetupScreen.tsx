import { useMemo, useState } from 'react';
import { STATUS_ORDER } from '../constants';
import type { MarkingMode } from '../types';
import { useApp } from '../store';
import {
  capitalizeFirst,
  comparePairNumbers,
  currentPairNumber,
  formatDate,
  isClassHour,
  pairTimeLabel,
  plural,
  scheduleForDate,
  slotAt,
  slotFrom,
  slotName,
  slotNumbersForDate,
  statusCounts,
  todayISO,
  weekdayLong,
} from '../utils';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

interface MarkSetupScreenProps {
  initialDate?: string;
  initialPair?: number;
  onBack: () => void;
  onStart: (date: string, pairNumber: number, mode: MarkingMode) => void;
  onSummary: (date: string, pairNumber: number) => void;
  onStudents: () => void;
  onGroups: () => void;
}

export function MarkSetupScreen({
  initialDate,
  initialPair,
  onBack,
  onStart,
  onSummary,
  onStudents,
  onGroups,
}: MarkSetupScreenProps) {
  const { data, activeGroup, activeStudents, clearPairAttendance, copyPairAttendance, markAllPresent, notify, saveSettings } =
    useApp();
  const [date, setDate] = useState(initialDate ?? todayISO());
  const [markingMode, setMarkingMode] = useState<MarkingMode>(
    data.settings.markingMode === 'list' ? 'list' : 'single',
  );
  const dateSchedule = scheduleForDate(data.settings, date);
  const slotNumbers = useMemo(() => slotNumbersForDate(dateSchedule), [dateSchedule]);
  const [pairNumber, setPairNumber] = useState(() => {
    const startDate = initialDate ?? todayISO();
    const startSchedule = scheduleForDate(data.settings, startDate);
    const startSlots = slotNumbersForDate(startSchedule);
    if (initialPair && startSlots.includes(initialPair)) return initialPair;
    return currentPairNumber(startSchedule) ?? startSlots[0] ?? 1;
  });

  const handleDateChange = (value: string) => {
    const nextDate = value || todayISO();
    setDate(nextDate);
    const nextSchedule = scheduleForDate(data.settings, nextDate);
    const nextSlots = slotNumbersForDate(nextSchedule);
    if (!nextSlots.includes(pairNumber)) {
      setPairNumber(nextSlots[0] ?? 1);
    }
  };

  const changeMarkingMode = (mode: MarkingMode) => {
    setMarkingMode(mode);
    if (data.settings.markingMode !== mode) {
      saveSettings({ ...data.settings, markingMode: mode });
    }
  };

  const existing = useMemo(() => {
    if (!activeGroup) return [];
    const activeIds = new Set(activeStudents.map((student) => student.id));
    return data.attendance.filter(
      (record) =>
        record.groupId === activeGroup.id &&
        record.date === date &&
        record.pairNumber === pairNumber &&
        activeIds.has(record.studentId),
    );
  }, [data.attendance, activeGroup, activeStudents, date, pairNumber]);

  const existingIds = useMemo(
    () => new Set(existing.map((record) => record.studentId)),
    [existing],
  );
  const markedCount = existingIds.size;
  const total = activeStudents.length;
  const complete = total > 0 && markedCount >= total;
  const counts = statusCounts(existing);

  /** Ближайшее предыдущее занятие этого дня, по которому уже есть отметки. */
  const previousPair = useMemo(() => {
    if (!activeGroup) return undefined;
    const activeIds = new Set(activeStudents.map((student) => student.id));
    const pairs = data.attendance
      .filter(
        (record) =>
          record.groupId === activeGroup.id &&
          record.date === date &&
          comparePairNumbers(record.pairNumber, pairNumber) < 0 &&
          activeIds.has(record.studentId),
      )
      .map((record) => record.pairNumber);
    return pairs.length > 0 ? pairs.sort(comparePairNumbers).at(-1) : undefined;
  }, [data.attendance, activeGroup, activeStudents, date, pairNumber]);

  const handleCopyPrevious = () => {
    if (!activeGroup || !previousPair) return;
    const copied = copyPairAttendance(activeGroup.id, date, pairNumber, previousPair);
    if (copied === 0) {
      notify('Все студенты уже отмечены за это занятие.', 'info');
    } else {
      notify(
        `Скопировано ${slotFrom(previousPair)}: ${copied}. Отметьте ушедших и пришедших.`,
      );
    }
    if (markingMode === 'list') {
      onStart(date, pairNumber, 'list');
    } else {
      onSummary(date, pairNumber);
    }
  };

  const handleRestart = () => {
    if (!activeGroup) return;
    if (
      !window.confirm(
        'Очистить все отметки за эту пару и начать заново? Текущие статусы будут удалены.',
      )
    ) {
      return;
    }
    clearPairAttendance(activeGroup.id, date, pairNumber);
    onStart(date, pairNumber, markingMode);
  };

  const handleAllPresent = () => {
    if (!activeGroup) return;
    if (
      !window.confirm(
        existing.length > 0
          ? 'Все студенты получат статус «Есть», текущие статусы за эту пару будут заменены. Продолжить?'
          : 'Отметить всех студентов как «Есть»?',
      )
    ) {
      return;
    }
    const count = markAllPresent(activeGroup.id, date, pairNumber);
    notify(`Отмечено как «Есть»: ${count}`);
    onSummary(date, pairNumber);
  };

  if (!activeGroup) {
    return (
      <div className="screen">
        <PageHeader title="Отметка" onBack={onBack} />
        <EmptyState
          icon="users"
          title="Нет активной группы"
          text="Создайте группу и добавьте в неё студентов."
          action={
            <button type="button" className="btn btn-primary" onClick={onGroups}>
              Перейти к группам
            </button>
          }
        />
      </div>
    );
  }

  if (activeStudents.length === 0) {
    return (
      <div className="screen">
        <PageHeader
          title="Отметка"
          subtitle={activeGroup.name}
          onBack={onBack}
          actions={
            <button type="button" className="icon-button" onClick={onGroups} aria-label="Группы">
              <Icon name="users" />
            </button>
          }
        />
        <EmptyState
          icon="users"
          title="В группе нет студентов"
          text="Добавьте студентов, чтобы отметить посещаемость."
          action={
            <button type="button" className="btn btn-primary" onClick={onStudents}>
              Добавить студентов
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHeader
        title="Отметка"
        subtitle={activeGroup.name}
        onBack={onBack}
        actions={
          <button type="button" className="icon-button" onClick={onGroups} aria-label="Сменить группу">
            <Icon name="users" />
          </button>
        }
      />

      <section className="mark-mode-bar">
        <div className="mark-mode-bar-head">
          <span className="field-label">Способ отметки</span>
          <span className="muted">запомним</span>
        </div>
        <div className="mark-mode-switch" role="group" aria-label="Способ отметки">
          <button
            type="button"
            className={`mark-mode-option${markingMode === 'single' ? ' is-active' : ''}`}
            onClick={() => changeMarkingMode('single')}
            aria-pressed={markingMode === 'single'}
          >
            По одному
          </button>
          <button
            type="button"
            className={`mark-mode-option${markingMode === 'list' ? ' is-active' : ''}`}
            onClick={() => changeMarkingMode('list')}
            aria-pressed={markingMode === 'list'}
          >
            Списком
          </button>
        </div>
      </section>

      <section className="card form-stack">
        <label className="field">
          <span>Дата</span>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(event) => handleDateChange(event.target.value)}
          />
          <span className="field-hint">
            {formatDate(date)} · {weekdayLong(date)}
          </span>
        </label>

        <div>
          <span className="field-label">Занятие</span>
          <div className="pair-grid">
            {slotNumbers.map((pair) => (
              <button
                key={pair}
                type="button"
                className={`pair-option${isClassHour(pair) ? ' is-class-hour' : ''}${
                  pair === pairNumber ? ' is-selected' : ''
                }`}
                onClick={() => setPairNumber(pair)}
                aria-pressed={pair === pairNumber}
              >
                <strong>{isClassHour(pair) ? 'Классный час' : pair}</strong>
                <span>{pairTimeLabel(dateSchedule, pair) || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card setup-summary">
        <div className="section-head">
          <h2>
            {formatDate(date)} · {slotName(pairNumber)}
          </h2>
          <span className={`pill ${complete ? 'pill-done' : markedCount > 0 ? 'pill-partial' : ''}`}>
            {markedCount > 0 ? `${markedCount} из ${total}` : 'не начато'}
          </span>
        </div>
        <p className="muted">
          {activeGroup.name} · {total} {plural(total, 'студент', 'студента', 'студентов')} ·{' '}
          {pairTimeLabel(dateSchedule, pairNumber) || 'время не задано'}
        </p>

        {existing.length > 0 && (
          <>
            <div className="status-summary-row">
              {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
                <span key={status} className="status-summary-item">
                  <StatusChip status={status} short />
                  <strong>{counts[status]}</strong>
                </span>
              ))}
            </div>
            <p className="field-hint">
              {complete
                ? 'Все студенты отмечены. Можно открыть итоги или изменить отметки.'
                : 'Отметки уже есть. Продолжите с первого неотмеченного или начните заново.'}
            </p>
          </>
        )}

        {previousPair && !complete && (
          <div className="copy-note">
            <div className="copy-note-text">
              <Icon name="copy" size={18} />
              <span>
                {capitalizeFirst(slotAt(previousPair))} уже есть отметки. Можно перенести состав: все, кто
                был, останутся, а вы отметите только ушедших и пришедших.
              </span>
            </div>
            <button
              type="button"
              className={`btn btn-block ${markedCount === 0 ? 'btn-primary btn-lg' : 'btn-secondary'}`}
              onClick={handleCopyPrevious}
            >
              <Icon name="copy" />
              {markedCount === 0
                ? `Продолжить ${slotFrom(previousPair)}`
                : `Дозаполнить ${slotFrom(previousPair)}`}
            </button>
          </div>
        )}

        <div className="stack-actions">
          {complete ? (
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              onClick={() => onSummary(date, pairNumber)}
            >
              <Icon name="check" />
              Открыть итоги
            </button>
          ) : (
            <button
              type="button"
              className={`btn btn-block ${
                markedCount === 0 && previousPair ? 'btn-secondary' : 'btn-primary btn-lg'
              }`}
              onClick={() => onStart(date, pairNumber, markingMode)}
            >
              {markedCount > 0
                ? markingMode === 'list'
                  ? 'Продолжить списком'
                  : 'Продолжить с первого неотмеченного'
                : previousPair
                  ? markingMode === 'list'
                    ? 'Отметить списком'
                    : 'Отметить по одному'
                  : markingMode === 'list'
                    ? 'Открыть список'
                    : 'Начать отметку'}
              <Icon name="chevron-right" />
            </button>
          )}

          <button type="button" className="btn btn-secondary btn-block" onClick={handleAllPresent}>
            <Icon name="check" />
            Отметить всех присутствующими
          </button>

          {existing.length > 0 && (
            <button type="button" className="btn btn-ghost btn-block" onClick={handleRestart}>
              <Icon name="restore" />
              Начать заново
            </button>
          )}
        </div>
      </section>

      <div className="info-note">
        <Icon name="info" size={18} />
        <span>
          Отметки сохраняются сразу. Позже их можно изменить в календаре или отчёте.
          Для опоздавших укажите, на какую пару они пришли. Выбранный способ отметки
          запоминается для следующих занятий.
        </span>
      </div>
    </div>
  );
}
