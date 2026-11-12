import { useState } from 'react';
import { STATUS_META, STATUS_ORDER } from '../constants';
import { useApp } from '../store';
import { buildReportHtml, reportHtmlFileName } from '../reportHtml';
import {
  comparePairNumbers,
  currentPairNumber,
  capitalizeFirst,
  formatDate,
  formatPercent,
  monthKeyFromISO,
  monthLabel,
  minutesFromHHMM,
  pairTimeLabel,
  plural,
  scheduleForDate,
  shareTextFile,
  shortName,
  slotAt,
  slotName,
  slotNameLower,
  statusCounts,
  todayISO,
  weekdayLong,
} from '../utils';
import { Icon } from '../components/Icon';
import { StatusChip } from '../components/StatusChip';

interface HomeScreenProps {
  onMark: () => void;
  onReports: () => void;
  onStudents: () => void;
  onSettings: () => void;
  onGroups: () => void;
  onOpenPair: (date: string, pairNumber: number) => void;
}

export function HomeScreen({
  onMark,
  onReports,
  onStudents,
  onSettings,
  onGroups,
  onOpenPair,
}: HomeScreenProps) {
  const { data, activeGroup, activeStudents, notify } = useApp();
  const [sharing, setSharing] = useState<'today' | 'month' | null>(null);
  const today = todayISO();
  const todayRecords = activeGroup
    ? data.attendance.filter(
        (record) => record.groupId === activeGroup.id && record.date === today,
      )
    : [];
  const month = monthKeyFromISO(today);
  const monthRecords = activeGroup
    ? data.attendance.filter(
        (record) =>
          record.groupId === activeGroup.id && record.date.startsWith(month),
      )
    : [];
  const monthCounts = statusCounts(monthRecords);
  const visited = monthCounts.present + monthCounts.late;
  const monthPercent = formatPercent(visited, monthRecords.length);
  const todaySchedule = scheduleForDate(data.settings, today);
  const currentPair = currentPairNumber(todaySchedule);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const nextPair = todaySchedule.find(
    (item) => minutesFromHHMM(item.start) > nowMinutes,
  )?.pairNumber;

  const pairs = Array.from(new Set(todayRecords.map((record) => record.pairNumber))).sort(
    comparePairNumbers,
  );

  const lastPair = pairs.length > 0 ? pairs[pairs.length - 1] : undefined;
  const absentToday = lastPair
    ? todayRecords
        .filter(
          (record) =>
            record.pairNumber === lastPair &&
            (record.status === 'absent' ||
              record.status === 'sick' ||
              record.status === 'excused'),
        )
        .flatMap((record) => {
          const student = activeStudents.find((candidate) => candidate.id === record.studentId);
          return student ? [{ record, student }] : [];
        })
    : [];

  const handleShare = async (period: 'today' | 'month') => {
    if (!activeGroup) {
      notify('Сначала выберите группу.', 'info');
      return;
    }
    const records = period === 'today' ? todayRecords : monthRecords;
    if (records.length === 0) {
      notify(
        period === 'today'
          ? 'За сегодня пока нет отметок для отчёта.'
          : 'За этот месяц пока нет отметок для отчёта.',
        'info',
      );
      return;
    }

    setSharing(period);
    try {
      const periodLabel = period === 'today' ? formatDate(today) : monthLabel(month);
      const periodKey = period === 'today' ? today : month;
      const result = await shareTextFile(
        reportHtmlFileName(activeGroup.name, periodKey),
        buildReportHtml({
          group: activeGroup,
          students: data.students,
          records,
          periodLabel,
          periodCaption: period === 'today' ? 'Дата' : 'Месяц',
        }),
        'text/html',
        `Отчёт за ${periodLabel}`,
      );
      if (result === 'downloaded') {
        notify('Файл сохранён в «Загрузки».', 'success');
      }
    } catch {
      notify('Не удалось отправить отчёт. Попробуйте ещё раз.', 'error');
    } finally {
      setSharing(null);
    }
  };

  return (
    <div className="screen home-screen">
      <header className="home-topbar">
        <div className="wordmark">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
          <span>Посещаемость</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onSettings}
          aria-label="Настройки"
        >
          <Icon name="settings" />
        </button>
      </header>

      <div className="home-date">
        <span className="eyebrow">{weekdayLong(today)}</span>
        <h1>{formatDate(today)}</h1>
      </div>

      <button type="button" className="group-switcher" onClick={onGroups}>
        <span className="group-avatar" aria-hidden="true">
          {activeGroup?.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span className="group-switcher-text">
          <strong>{activeGroup?.name ?? 'Нет группы'}</strong>
          <span>
            {activeStudents.length}{' '}
            {plural(activeStudents.length, 'студент', 'студента', 'студентов')}
            {activeGroup?.curator ? ` · ${activeGroup.curator}` : ''}
          </span>
        </span>
        <span className="group-switcher-action">
          Сменить
          <Icon name="chevron-right" size={18} />
        </span>
      </button>

      {activeStudents.length > 0 ? (
        <button type="button" className="mark-hero" onClick={onMark}>
          <span className="mark-hero-icon" aria-hidden="true">
            <Icon name="check" size={30} />
          </span>
          <span className="mark-hero-text">
            <span className="mark-hero-kicker">
              {currentPair
                ? `Сейчас идёт ${slotNameLower(currentPair)}`
                : nextPair
                  ? `Следующая — ${slotNameLower(nextPair)} в ${
                      pairTimeLabel(todaySchedule, nextPair).split('–')[0]
                    }`
                  : 'Отметка на сегодня'}
            </span>
            <strong>Отметить посещаемость</strong>
            <span>
              {currentPair
                ? `${pairTimeLabel(todaySchedule, currentPair)} · ${
                    data.settings.markingMode === 'list' ? 'списком' : 'по одному студенту'
                  }`
                : 'Выберите дату и пару — дальше как удобнее'}
            </span>
          </span>
          <Icon name="chevron-right" size={24} />
        </button>
      ) : (
        <div className="mark-hero mark-hero-empty">
          <span className="mark-hero-icon" aria-hidden="true">
            <Icon name="users" size={30} />
          </span>
          <span className="mark-hero-text">
            <strong>В группе пока нет студентов</strong>
            <span>Добавьте их, чтобы начать отмечать посещаемость</span>
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onStudents}>
            Добавить
          </button>
        </div>
      )}

      <section className="card today-card">
        <div className="section-head">
          <h2>Сегодня</h2>
          {todayRecords.length > 0 && (
            <span className="muted">
              {todayRecords.length}{' '}
              {plural(todayRecords.length, 'отметка', 'отметки', 'отметок')}
            </span>
          )}
        </div>

        {pairs.length === 0 ? (
          <div className="today-empty">
            <span className="today-empty-icon">
              <Icon name="clock" size={20} />
            </span>
            <div>
              <strong>
                {activeStudents.length === 0 ? 'Сначала добавьте студентов' : 'Ещё не отмечено'}
              </strong>
              <p>
                {activeStudents.length === 0
                  ? 'После добавления здесь появятся отмеченные пары.'
                  : 'Когда будете готовы, нажмите «Отметить посещаемость».'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="pair-chip-list">
              {pairs.map((pair) => {
                const records = todayRecords.filter((record) => record.pairNumber === pair);
                const counts = statusCounts(records);
                return (
                  <button
                    key={pair}
                    type="button"
                    className="pair-chip"
                    onClick={() => onOpenPair(today, pair)}
                  >
                    <span className="pair-chip-number">{slotName(pair)}</span>
                    <span className="pair-chip-time">
                      {pairTimeLabel(todaySchedule, pair) || 'время не задано'}
                    </span>
                    <span className="pair-chip-count">
                      {records.length} из {activeStudents.length}
                      <Icon name="chevron-right" size={16} />
                    </span>
                    <span className="pair-chip-statuses">
                      {STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => (
                        <span key={status} title={STATUS_META[status].label}>
                          <StatusChip status={status} short />
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            {lastPair !== undefined && absentToday.length > 0 && (
              <div className="today-absent">
                <span className="today-absent-title">
                  {capitalizeFirst(slotAt(lastPair))} отсутствуют:
                </span>
                <div className="today-absent-list">
                  {absentToday.slice(0, 6).map(({ record, student }) => (
                    <span key={record.id} className="today-absent-item">
                      <StatusChip status={record.status} short />
                      <span>{shortName(student.fullName)}</span>
                    </span>
                  ))}
                  {absentToday.length > 6 && (
                    <span className="muted">ещё {absentToday.length - 6}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {activeGroup && activeStudents.length > 0 && (
        <section className="card share-card">
          <div className="section-head">
            <h2>
              <Icon name="share" size={20} />
              Отправить отчёт
            </h2>
          </div>
          <p className="muted share-hint">
            HTML-отчёт для мессенджера: видно каждую пару каждого студента. Для Excel —
            «Отчёты → CSV».
          </p>
          <div className="share-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleShare('today')}
              disabled={sharing !== null}
            >
              <Icon name="share" size={18} />
              {sharing === 'today' ? 'Готовим…' : 'За сегодня'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => handleShare('month')}
              disabled={sharing !== null}
            >
              <Icon name="share" size={18} />
              {sharing === 'month' ? 'Готовим…' : 'За месяц'}
            </button>
          </div>
          {todayRecords.length === 0 && monthRecords.length === 0 && (
            <p className="share-empty">
              Пока нет отметок — сначала отметьте посещаемость.
            </p>
          )}
        </section>
      )}

      <section className="card month-card">
        <div className="section-head">
          <h2>{monthLabel(month)}</h2>
          <button type="button" className="text-button" onClick={onReports}>
            Отчёт
            <Icon name="chevron-right" size={16} />
          </button>
        </div>
        {monthRecords.length === 0 ? (
          <p className="muted">В этом месяце пока нет отметок.</p>
        ) : (
          <>
            <div className="month-stats">
              <div>
                <strong>{monthPercent}</strong>
                <span>посещаемость</span>
              </div>
              <div>
                <strong>{monthRecords.length}</strong>
                <span>{plural(monthRecords.length, 'отметка', 'отметки', 'отметок')}</span>
              </div>
              <div>
                <strong>{monthCounts.absent + monthCounts.sick + monthCounts.excused}</strong>
                <span>пропусков</span>
              </div>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span
                className="progress-fill"
                style={{
                  width: `${monthRecords.length ? Math.round((visited / monthRecords.length) * 100) : 0}%`,
                }}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
