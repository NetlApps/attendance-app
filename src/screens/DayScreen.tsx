import { useMemo } from 'react';
import { STATUS_ORDER } from '../constants';
import { useApp } from '../store';
import {
  classHourTopic,
  comparePairNumbers,
  formatDate,
  isClassHour,
  pairTimeLabel,
  plural,
  scheduleForDate,
  slotName,
  slotNumbersForDate,
  slotShortName,
  statusCounts,
  weekdayLong,
} from '../utils';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusChip } from '../components/StatusChip';

interface DayScreenProps {
  groupId: string;
  date: string;
  onBack: () => void;
  onOpenPair: (date: string, pairNumber: number) => void;
  onMark: (date: string) => void;
}

export function DayScreen({ groupId, date, onBack, onOpenPair, onMark }: DayScreenProps) {
  const { data } = useApp();
  const group = data.groups.find((candidate) => candidate.id === groupId);
  const dateSchedule = scheduleForDate(data.settings, date);
  const records = useMemo(
    () =>
      data.attendance.filter(
        (record) => record.groupId === groupId && record.date === date,
      ),
    [data.attendance, groupId, date],
  );

  const activeStudents = useMemo(
    () =>
      data.students
        .filter((student) => student.groupId === groupId && !student.archived)
        .sort((a, b) => a.order - b.order || a.fullName.localeCompare(b.fullName, 'ru')),
    [data.students, groupId],
  );

  /** Пары и классный час, по которым в этот день есть хотя бы одна отметка. */
  const dayPairs = useMemo(
    () =>
      Array.from(new Set(records.map((record) => record.pairNumber))).sort(
        comparePairNumbers,
      ),
    [records],
  );

  /** Все занятия дня: обычные пары и классный час, если он есть в расписании. */
  const daySlots = useMemo(
    () =>
      slotNumbersForDate(
        dateSchedule,
        records.map((record) => record.pairNumber),
      ),
    [dateSchedule, records],
  );

  /** Посещённые пары: «Есть» и «Опоздал» считаются посещением. */
  const attendedByStudent = useMemo(() => {
    const map = new Map<string, { count: number; pairs: number[] }>();
    for (const record of records) {
      if (record.status !== 'present' && record.status !== 'late') continue;
      const entry = map.get(record.studentId) ?? { count: 0, pairs: [] };
      entry.count += 1;
      entry.pairs.push(record.pairNumber);
      map.set(record.studentId, entry);
    }
    for (const entry of map.values()) {
      entry.pairs.sort(comparePairNumbers);
    }
    return map;
  }, [records]);

  const reportStudents = useMemo(() => {
    const recordedIds = new Set(records.map((record) => record.studentId));
    const archived = data.students
      .filter(
        (student) =>
          student.groupId === groupId &&
          student.archived &&
          recordedIds.has(student.id),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));
    return [...activeStudents, ...archived];
  }, [data.students, activeStudents, records, groupId]);

  if (!group) {
    return (
      <div className="screen">
        <PageHeader title="День" onBack={onBack} />
        <EmptyState icon="alert" title="Группа не найдена" text="Вернитесь в календарь." />
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHeader
        title={formatDate(date)}
        subtitle={`${weekdayLong(date)} · ${group.name}`}
        onBack={onBack}
      />

      <section className="card">
        <div className="section-head">
          <h2>Занятия</h2>
          <button type="button" className="text-button" onClick={() => onMark(date)}>
            <Icon name="plus" size={16} />
            Отметить
          </button>
        </div>

        {records.length === 0 && (
          <div className="inline-note">
            <Icon name="info" size={18} />
            <span>За этот день отметок пока нет. Выберите занятие или нажмите «Отметить».</span>
          </div>
        )}

        <div className="day-pair-list">
          {daySlots.map((pair) => {
            const pairRecords = records.filter((record) => record.pairNumber === pair);
            const counts = statusCounts(pairRecords);
            return (
              <button
                key={pair}
                type="button"
                className={`day-pair-row${pairRecords.length === 0 ? ' is-empty' : ''}${
                  isClassHour(pair) ? ' is-class-hour' : ''
                }`}
                onClick={() => onOpenPair(date, pair)}
              >
                <span
                  className={`day-pair-number${isClassHour(pair) ? ' is-class-hour' : ''}`}
                >
                  {isClassHour(pair) ? 'КЧ' : pair}
                </span>
                <span className="day-pair-main">
                  <strong>{slotName(pair)}</strong>
                  <span className="muted">
                    {pairTimeLabel(dateSchedule, pair) || 'время не задано'}
                    {isClassHour(pair) && classHourTopic(date)
                      ? ` · ${classHourTopic(date)}`
                      : ''}
                  </span>
                  {pairRecords.length > 0 && (
                    <span className="day-pair-statuses">
                      {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
                        <span key={status} className="day-pair-status">
                          <StatusChip status={status} short />
                        </span>
                      ))}
                    </span>
                  )}
                </span>
                <span className="day-pair-side">
                  {pairRecords.length > 0 ? (
                    <>
                      <strong>{pairRecords.length}</strong>
                      <span className="muted">
                        {plural(pairRecords.length, 'отметка', 'отметки', 'отметок')}
                      </span>
                    </>
                  ) : (
                    <span className="pill">нет</span>
                  )}
                  <Icon name="chevron-right" size={18} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {records.length > 0 && reportStudents.length > 0 && (
        <section className="card">
          <div className="section-head">
            <h2>Посещаемость за день</h2>
            <span className="muted">
              {dayPairs.length} {plural(dayPairs.length, 'занятие', 'занятия', 'занятий')} с отметками
            </span>
          </div>
          <p className="muted day-report-hint">
            Сколько занятий посетил каждый студент. «Опоздал» считается посещением.
          </p>
          <div className="day-report-list">
            {reportStudents.map((student) => {
              const entry = attendedByStudent.get(student.id);
              const count = entry?.count ?? 0;
              const pairs = entry?.pairs ?? [];
              return (
                <div
                  key={student.id}
                  className={`day-report-row${count === 0 ? ' is-zero' : ''}`}
                >
                  <span className="summary-order">
                    {student.archived ? <Icon name="archive" size={16} /> : student.order}
                  </span>
                  <span className="summary-name">
                    <strong>{student.fullName}</strong>
                    <span className="muted">
                      {pairs.length > 0
                        ? `занятия: ${pairs.map(slotShortName).join(', ')}`
                        : 'не был ни на одном занятии'}
                      {student.archived ? ' · в архиве' : ''}
                    </span>
                  </span>
                  <span className="day-report-count">
                    <strong>{count}</strong>
                    <span>из {dayPairs.length}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={() => onMark(date)}>
        <Icon name="check" />
        Отметить посещаемость на эту дату
      </button>
    </div>
  );
}
