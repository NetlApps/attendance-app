import { useMemo, useState } from 'react';
import { WEEKDAYS } from '../constants';
import { useApp } from '../store';
import {
  currentMonthKey,
  formatDate,
  formatPercent,
  monthLabel,
  monthMatrix,
  plural,
  shiftMonth,
  todayISO,
  weekdayLong,
} from '../utils';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';

interface CalendarScreenProps {
  onDay: (date: string) => void;
  onGroups: () => void;
}

export function CalendarScreen({ onDay, onGroups }: CalendarScreenProps) {
  const { data, activeGroup } = useApp();
  const [month, setMonth] = useState(currentMonthKey());
  const today = todayISO();

  const monthRecords = useMemo(() => {
    if (!activeGroup) return [];
    return data.attendance.filter(
      (record) => record.groupId === activeGroup.id && record.date.startsWith(month),
    );
  }, [data.attendance, activeGroup, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const record of monthRecords) {
      if (!map.has(record.date)) map.set(record.date, new Set());
      map.get(record.date)?.add(record.pairNumber);
    }
    return map;
  }, [monthRecords]);

  const cells = useMemo(() => monthMatrix(month), [month]);
  const markedDays = byDate.size;
  const markedPairs = new Set(
    monthRecords.map((record) => `${record.date}|${record.pairNumber}`),
  ).size;
  const visited = monthRecords.filter(
    (record) => record.status === 'present' || record.status === 'late',
  ).length;

  if (!activeGroup) {
    return (
      <div className="screen">
        <PageHeader title="Календарь" />
        <EmptyState
          icon="users"
          title="Нет активной группы"
          text="Создайте группу, чтобы вести календарь посещаемости."
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
    <div className="screen">
      <PageHeader
        title="Календарь"
        subtitle={activeGroup.name}
        actions={
          <button type="button" className="icon-button" onClick={onGroups} aria-label="Сменить группу">
            <Icon name="users" />
          </button>
        }
      />

      <section className="card calendar-card">
        <div className="calendar-head">
          <button
            type="button"
            className="icon-button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Предыдущий месяц"
          >
            <Icon name="chevron-left" />
          </button>
          <div className="calendar-title">
            <h2>{monthLabel(month)}</h2>
            {month !== currentMonthKey() && (
              <button type="button" className="text-button" onClick={() => setMonth(currentMonthKey())}>
                Сегодня
              </button>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Следующий месяц"
          >
            <Icon name="chevron-right" />
          </button>
        </div>

        <div className="calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <span key={day.value}>{day.short}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((cell, index) => {
            if (!cell) return <span key={`empty-${index}`} className="calendar-day is-empty" />;
            const pairs = byDate.get(cell.iso);
            const isToday = cell.iso === today;
            const isWeekend = [6, 7].includes(
              ((new Date(`${cell.iso}T12:00:00`).getDay() + 6) % 7) + 1,
            );
            return (
              <button
                key={cell.iso}
                type="button"
                className={`calendar-day${isToday ? ' is-today' : ''}${pairs ? ' has-records' : ''}${isWeekend ? ' is-weekend' : ''}`}
                onClick={() => onDay(cell.iso)}
                aria-label={`${formatDate(cell.iso)}, ${weekdayLong(cell.iso)}${pairs ? `, отмечено пар: ${pairs.size}` : ', нет отметок'}`}
                aria-current={isToday ? 'date' : undefined}
              >
                <span className="calendar-day-number">{cell.day}</span>
                {pairs && pairs.size > 0 && (
                  <span className="calendar-day-badge">{pairs.size}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="calendar-legend">
          <span>
            <i className="legend-dot legend-dot-today" /> сегодня
          </span>
          <span>
            <i className="legend-dot legend-dot-marked" /> есть отметки
          </span>
          <span className="muted">Нажмите на день, чтобы открыть или изменить.</span>
        </div>
      </section>

      <section className="card month-stats-card">
        <div className="month-stats">
          <div>
            <strong>{markedDays}</strong>
            <span>{plural(markedDays, 'день', 'дня', 'дней')} с отметками</span>
          </div>
          <div>
            <strong>{markedPairs}</strong>
            <span>{plural(markedPairs, 'пара', 'пары', 'пар')}</span>
          </div>
          <div>
            <strong>{formatPercent(visited, monthRecords.length)}</strong>
            <span>посещаемость за месяц</span>
          </div>
        </div>
      </section>
    </div>
  );
}
