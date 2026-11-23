import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ABSENCE_STATUSES, CLASS_HOUR_PAIR_NUMBER, STATUS_META, THEMES, WEEKDAYS } from '../constants';
import type { AbsenceFilter } from '../absenceReport';
import { useApp } from '../store';
import {
  CLASS_HOUR_DEFAULT_TIMES,
  cloneSchedules,
  DEFAULT_SCHEDULES,
} from '../seed';
import type { ReminderSettings, ScheduleItem, ThemeId } from '../types';
import {
  exportBackupFile,
  getNativeVaultInfo,
  hasNativeVault,
  listNativeBackups,
  parseBackupFile,
  readNativeBackup,
  saveNativeBackupNow,
  type NativeBackupEntry,
  type NativeVaultInfo,
} from '../storage';
import {
  buildImportedGroupData,
  parseGroupShareFile,
} from '../groupShare';
import {
  checkForUpdate,
  currentAppVersion,
  downloadUpdate,
  formatBytes,
  installUpdate,
  isAndroidApp,
  openUpdatePermission,
  useOtaState,
} from '../ota';
import {
  comparePairNumbers,
  downloadTextFile,
  formatDate,
  isClassHour,
  isValidTime,
  minutesFromHHMM,
  pad2,
  plural,
  shareTextFile,
  todayISO,
  weekdayNumber,
} from '../utils';
import {
  isXiaomiLike,
  openAutostartSettings,
  openBatterySettings,
  openNotificationSettings,
  readReliabilityState,
  requestBatteryExemption,
  requestExactAlarms,
  subscribeReliability,
  testNotificationDelayed,
  testNotificationNow,
  type ReliabilityState,
} from '../reliability';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import {
  AbsencePrintSheet,
  type AbsenceEntry,
} from '../components/ReportAttendanceModal';
import { ReportPrintSheet } from '../components/ReportPrintSheet';

type NotificationState = NotificationPermission | 'unsupported';

function notificationState(): NotificationState {
  if (typeof window !== 'undefined' && window.AndroidApp?.notificationPermission) {
    const state = window.AndroidApp.notificationPermission();
    if (state === 'granted' || state === 'denied' || state === 'default') return state;
  }
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function addMinutesToTime(time: string, delta: number): string {
  const total = Math.min(23 * 60 + 59, Math.max(0, minutesFromHHMM(time) + delta));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function formatBackupStamp(timestamp: number): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}, ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

export function SettingsScreen() {
  const {
    data,
    saveSettings,
    replaceData,
    resetAllData,
    requestNotifications,
    notify,
  } = useApp();

  const [reminders, setReminders] = useState<ReminderSettings>(() => ({
    ...data.settings.reminders,
    times: [...data.settings.reminders.times],
    weekdays: [...data.settings.reminders.weekdays],
  }));
  const [schedules, setSchedules] = useState<Record<number, ScheduleItem[]>>(() =>
    cloneSchedules(data.settings.schedules),
  );
  const [scheduleDay, setScheduleDay] = useState<number>(() => weekdayNumber(todayISO()));
  const [permission, setPermission] = useState<NotificationState>(() => notificationState());
  const [reliability, setReliability] = useState<ReliabilityState | null>(() =>
    readReliabilityState(),
  );
  const importRef = useRef<HTMLInputElement | null>(null);
  const isAndroidApp = typeof window !== 'undefined' && Boolean(window.AndroidApp);
  const ota = useOtaState();
  const [updateUrl, setUpdateUrl] = useState(() => data.settings.updateUrl ?? '');
  const [autoUpdateCheck, setAutoUpdateCheck] = useState(
    () => data.settings.autoUpdateCheck !== false,
  );
  const [appVersion, setAppVersion] = useState(() => currentAppVersion());
  const [vaultInfo, setVaultInfo] = useState<NativeVaultInfo | null>(() =>
    getNativeVaultInfo(),
  );
  const [vaultBackups, setVaultBackups] = useState<NativeBackupEntry[]>(() =>
    listNativeBackups(),
  );
  const [showAllBackups, setShowAllBackups] = useState(false);
  const [printGroupId, setPrintGroupId] = useState(
    () => data.settings.activeGroupId || data.groups[0]?.id || '',
  );
  const [printMonth, setPrintMonth] = useState(() => todayISO().slice(0, 7));
  const [printFilter, setPrintFilter] = useState<AbsenceFilter>('all');
  const [printMode, setPrintMode] = useState<'report' | 'absences' | null>(null);

  const refreshVault = () => {
    setVaultInfo(getNativeVaultInfo());
    setVaultBackups(listNativeBackups());
  };

  useEffect(() => {
    setReminders({
      ...data.settings.reminders,
      times: [...data.settings.reminders.times],
      weekdays: [...data.settings.reminders.weekdays],
    });
  }, [data.settings.reminders]);

  useEffect(() => {
    setSchedules(cloneSchedules(data.settings.schedules));
  }, [data.settings.schedules]);

  useEffect(() => {
    setUpdateUrl(data.settings.updateUrl ?? '');
    setAutoUpdateCheck(data.settings.autoUpdateCheck !== false);
  }, [data.settings.updateUrl, data.settings.autoUpdateCheck]);

  useEffect(() => {
    setAppVersion(currentAppVersion());
  }, []);

  useEffect(() => {
    if (!isAndroidApp) return;
    const refresh = () => {
      setReliability(readReliabilityState());
      setPermission(notificationState());
    };
    refresh();
    const unsubscribe = subscribeReliability((state) => {
      setReliability(state);
      setPermission(state.notifications);
    });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isAndroidApp]);

  const printGroup =
    data.groups.find((group) => group.id === printGroupId) ?? data.groups[0];

  const printRecords = useMemo(() => {
    if (!printGroup) return [];
    return data.attendance
      .filter(
        (record) =>
          record.groupId === printGroup.id && record.date.startsWith(printMonth),
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          comparePairNumbers(a.pairNumber, b.pairNumber),
      );
  }, [data.attendance, printGroup, printMonth]);

  const printAbsenceEntries = useMemo<AbsenceEntry[]>(() => {
    const students = new Map(data.students.map((student) => [student.id, student]));
    return printRecords.flatMap((record) => {
      if (!ABSENCE_STATUSES.includes(record.status)) return [];
      const student = students.get(record.studentId);
      return student ? [{ record, student }] : [];
    });
  }, [data.students, printRecords]);

  const printVisibleAbsences =
    printFilter === 'all'
      ? printAbsenceEntries
      : printAbsenceEntries.filter((entry) => entry.record.status === printFilter);

  const handlePrint = (mode: 'report' | 'absences') => {
    if (!printGroup) {
      notify('Нет группы для печати.', 'info');
      return;
    }
    if (mode === 'report' && printRecords.length === 0) {
      notify('За выбранный месяц нет отметок.', 'info');
      return;
    }
    if (mode === 'absences' && printVisibleAbsences.length === 0) {
      notify('За выбранный месяц нет пропусков.', 'info');
      return;
    }
    setPrintMode(mode);
    window.setTimeout(() => {
      if (window.AndroidApp?.printPage) window.AndroidApp.printPage();
      else window.print();
    }, 120);
  };

  const updateReminderTime = (index: number, value: string) => {
    setReminders((current) => ({
      ...current,
      times: current.times.map((time, timeIndex) => (timeIndex === index ? value : time)),
    }));
  };

  const addReminderTime = () => {
    const candidates = ['08:30', '10:10', '12:10', '14:00', '16:00', '18:00'];
    const next = candidates.find((time) => !reminders.times.includes(time)) ?? '12:00';
    setReminders((current) => ({
      ...current,
      times: [...current.times, next],
    }));
  };

  const removeReminderTime = (index: number) => {
    setReminders((current) => ({
      ...current,
      times: current.times.filter((_, timeIndex) => timeIndex !== index),
    }));
  };

  const toggleWeekday = (day: number) => {
    setReminders((current) => ({
      ...current,
      weekdays: current.weekdays.includes(day)
        ? current.weekdays.filter((value) => value !== day)
        : [...current.weekdays, day].sort((a, b) => a - b),
    }));
  };

  const handleTheme = (theme: ThemeId) => {
    if (theme === data.settings.theme) return;
    saveSettings({ ...data.settings, theme });
  };

  const handleSaveReminders = async () => {
    const times = Array.from(
      new Set(reminders.times.map((time) => time.trim()).filter(isValidTime)),
    ).sort();
    if (reminders.enabled && times.length === 0) {
      notify('Добавьте хотя бы одно время напоминания.', 'error');
      return;
    }
    if (reminders.enabled && reminders.weekdays.length === 0) {
      notify('Выберите хотя бы один день недели.', 'error');
      return;
    }

    saveSettings({
      ...data.settings,
      reminders: {
        enabled: reminders.enabled,
        times,
        weekdays: [...reminders.weekdays].sort((a, b) => a - b),
      },
    });

    if (reminders.enabled && notificationState() === 'default') {
      const result = await requestNotifications();
      setPermission(result);
    }

    notify('Настройки напоминаний сохранены');
  };

  const updateScheduleTime = (
    day: number,
    pairNumber: number,
    field: 'start' | 'end',
    value: string,
  ) => {
    setSchedules((current) => ({
      ...current,
      [day]: (current[day] ?? []).map((item) =>
        item.pairNumber === pairNumber ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const addSchedulePair = () => {
    setSchedules((current) => {
      const dayItems = current[scheduleDay] ?? [];
      const regularItems = dayItems.filter((item) => !isClassHour(item.pairNumber));
      if (regularItems.length >= 8) return current;
      const used = new Set(regularItems.map((item) => item.pairNumber));
      let pairNumber = 1;
      while (pairNumber <= 8 && used.has(pairNumber)) pairNumber += 1;
      if (pairNumber > 8) return current;
      const last = regularItems[regularItems.length - 1];
      const start = last ? addMinutesToTime(last.end, 10) : '08:15';
      const end = addMinutesToTime(start, 80);
      return {
        ...current,
        [scheduleDay]: [...dayItems, { pairNumber, start, end }].sort(
          (a, b) => comparePairNumbers(a.pairNumber, b.pairNumber),
        ),
      };
    });
  };

  const addClassHour = () => {
    setSchedules((current) => {
      const dayItems = current[scheduleDay] ?? [];
      if (dayItems.some((item) => isClassHour(item.pairNumber))) return current;
      const times = CLASS_HOUR_DEFAULT_TIMES[scheduleDay] ?? {
        start: '08:15',
        end: '09:00',
      };
      return {
        ...current,
        [scheduleDay]: [
          ...dayItems,
          { pairNumber: CLASS_HOUR_PAIR_NUMBER, ...times },
        ].sort((a, b) => comparePairNumbers(a.pairNumber, b.pairNumber)),
      };
    });
  };

  const removeSchedulePair = (pairNumber: number) => {
    setSchedules((current) => ({
      ...current,
      [scheduleDay]: (current[scheduleDay] ?? []).filter(
        (item) => item.pairNumber !== pairNumber,
      ),
    }));
  };

  const handleSaveSchedule = () => {
    for (let day = 1; day <= 7; day += 1) {
      const items = schedules[day] ?? [];
      const valid = items.every(
        (item) =>
          isValidTime(item.start) &&
          isValidTime(item.end) &&
          minutesFromHHMM(item.start) < minutesFromHHMM(item.end),
      );
      if (!valid) {
        notify(
          `Проверьте расписание (${WEEKDAYS[day - 1].long}): время начала должно быть раньше времени окончания.`,
          'error',
        );
        return;
      }
    }
    saveSettings({ ...data.settings, schedules: cloneSchedules(schedules) });
    notify('Расписание звонков сохранено');
  };

  const resetScheduleDay = () => {
    setSchedules((current) => ({
      ...current,
      [scheduleDay]: (DEFAULT_SCHEDULES[scheduleDay] ?? []).map((item) => ({ ...item })),
    }));
  };

  const handleExport = () => {
    if (isAndroidApp && hasNativeVault()) {
      if (saveNativeBackupNow(data)) {
        refreshVault();
        notify('Копия сохранена в приложении');
      } else {
        notify('Не удалось сохранить копию', 'error');
      }
      return;
    }
    downloadTextFile(
      `Посещаемость_бэкап_${todayISO()}.json`,
      exportBackupFile(data),
      'application/json;charset=utf-8',
    );
    notify('Файл резервной копии сохранён', 'success');
  };

  const handleShareBackup = async () => {
    try {
      const result = await shareTextFile(
        `Посещаемость_бэкап_${todayISO()}.json`,
        exportBackupFile(data),
        'application/json',
        'Резервная копия посещаемости',
      );
      if (result === 'downloaded') {
        notify('Файл сохранён в «Загрузки»', 'success');
      }
    } catch {
      notify('Не удалось отправить файл', 'error');
    }
  };

  const handleMigrateLegacyBackups = () => {
    const bridge = window.AndroidApp;
    if (!bridge?.migrateLegacyBackups) {
      notify('Перенос копий доступен в установленном приложении', 'info');
      return;
    }
    try {
      const result = JSON.parse(bridge.migrateLegacyBackups()) as {
        found?: number;
        moved?: number;
        failed?: number;
      };
      refreshVault();
      if ((result.moved ?? 0) > 0) {
        notify(`Перенесено копий: ${result.moved}`, 'success');
      } else if ((result.found ?? 0) === 0) {
        notify('В «Загрузках» нет старых копий', 'info');
      } else {
        notify('Не удалось перенести часть копий', 'error');
      }
    } catch {
      notify('Не удалось проверить «Загрузки»', 'error');
    }
  };

  const prepareUpdate = () => {
    if (isAndroidApp) saveNativeBackupNow(data);
  };

  const handleVaultRestore = (entry: NativeBackupEntry) => {
    const text = readNativeBackup(entry.name);
    if (!text) {
      notify('Не удалось прочитать копию с телефона', 'error');
      return;
    }
    try {
      const next = parseBackupFile(text);
      if (
        !window.confirm(
          `Восстановить данные из копии от ${formatBackupStamp(entry.savedAt)}?\n\nГрупп: ${next.groups.length}\nСтудентов: ${next.students.length}\nОтметок: ${next.attendance.length}\n\nТекущие данные будут заменены.`,
        )
      ) {
        return;
      }
      replaceData(next);
      refreshVault();
      notify('Данные восстановлены из копии на телефоне');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Не удалось восстановить копию.',
        'error',
      );
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();

      let groupShare: ReturnType<typeof parseGroupShareFile> | null = null;
      try {
        const raw = JSON.parse(text) as { format?: unknown } | null;
        if (raw && raw.format === 'attendance-group-share') {
          groupShare = parseGroupShareFile(text);
        }
      } catch {
        // Не JSON или повреждённый файл: ниже покажем понятную ошибку.
      }

      if (groupShare) {
        const result = buildImportedGroupData(data, groupShare);
        const studentsLabel = `${result.studentCount} ${plural(
          result.studentCount,
          'студент',
          'студента',
          'студентов',
        )}`;
        const historyLabel = groupShare.includesAttendance
          ? `, ${result.attendanceCount} ${plural(
              result.attendanceCount,
              'отметка',
              'отметки',
              'отметок',
            )}`
          : ', без истории';
        if (
          !window.confirm(
            `Это файл группы, а не резервная копия.\n\nДобавить группу «${groupShare.group.name}»?\n${studentsLabel}${historyLabel}\n\nТекущие группы и данные не заменяются.`,
          )
        ) {
          return;
        }
        replaceData(result.data);
        notify(
          `Группа «${groupShare.group.name}» добавлена: ${studentsLabel}${historyLabel}`,
        );
        return;
      }

      const next = parseBackupFile(text);
      if (
        !window.confirm(
          `Импортировать резервную копию?\n\nГрупп: ${next.groups.length}\nСтудентов: ${next.students.length}\nОтметок: ${next.attendance.length}\n\nТекущие данные будут заменены.`,
        )
      ) {
        return;
      }
      replaceData(next);
      notify('Данные восстановлены из резервной копии');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Не удалось импортировать файл.',
        'error',
      );
    } finally {
      input.value = '';
    }
  };

  const handleClear = () => {
    if (
      !window.confirm(
        'Удалить ВСЕ данные: группы, студентов, отметки и настройки?\n\nСначала рекомендуется сделать резервную копию.',
      )
    ) {
      return;
    }
    if (!window.confirm('Точно удалить всё? Это действие нельзя отменить.')) return;
    resetAllData();
    notify('Все данные удалены. Создайте группу и добавьте студентов.', 'info');
  };

  const handleRequestPermission = async () => {
    const result = await requestNotifications();
    setPermission(result);
    setReliability(readReliabilityState());
    if (result === 'granted') notify('Уведомления разрешены');
    else if (result === 'denied')
      notify(
        isAndroidApp
          ? 'Уведомления запрещены в настройках Android'
          : 'Уведомления запрещены в настройках браузера',
        'error',
      );
    else if (result === 'unsupported') notify('Системные уведомления не поддерживаются', 'error');
  };

  const refreshReliability = () => {
    setReliability(readReliabilityState());
    setPermission(notificationState());
  };

  const handleTestNow = () => {
    if (!isAndroidApp) {
      notify('Проверка доступна только в установленном APK', 'info');
      return;
    }
    if (reliability?.notifications !== 'granted') {
      notify('Сначала разрешите уведомления', 'error');
      return;
    }
    if (!testNotificationNow()) {
      notify('Уведомления запрещены в настройках Android', 'error');
      return;
    }
    notify('Проверочное уведомление отправлено');
  };

  const handleTestDelayed = () => {
    if (!isAndroidApp) {
      notify('Проверка доступна только в установленном APK', 'info');
      return;
    }
    if (reliability?.notifications !== 'granted') {
      notify('Сначала разрешите уведомления', 'error');
      return;
    }
    if (!testNotificationDelayed(10)) {
      notify('Не удалось запланировать проверку', 'error');
      return;
    }
    notify('Уведомление придёт через 10 секунд — приложение можно закрыть', 'info');
  };

  const handleBattery = () => {
    if (reliability?.batteryOptimized) requestBatteryExemption();
    else openBatterySettings();
  };

  const handleSaveUpdateSettings = () => {
    const trimmed = updateUrl.trim();
    if (trimmed && !/^https?:\/\/\S+$/i.test(trimmed)) {
      notify('Адрес обновления должен начинаться с http:// или https://', 'error');
      return;
    }
    saveSettings({
      ...data.settings,
      updateUrl: trimmed || undefined,
      autoUpdateCheck,
    });
    notify('Настройки обновлений сохранены');
  };

  const handleCheckUpdate = () => {
    const trimmed = updateUrl.trim();
    if (!trimmed) {
      notify('Сначала укажите адрес update.json', 'error');
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      notify('Адрес обновления должен начинаться с http:// или https://', 'error');
      return;
    }
    saveSettings({
      ...data.settings,
      updateUrl: trimmed,
      autoUpdateCheck,
    });
    if (!isAndroidApp) {
      notify('OTA-обновления устанавливаются только в APK', 'info');
      return;
    }
    if (checkForUpdate(trimmed)) {
      notify('Проверяем обновления…', 'info');
    } else {
      notify('Не удалось запустить проверку обновлений', 'error');
    }
  };

  const permissionText =
    permission === 'granted'
      ? 'Уведомления разрешены'
      : permission === 'denied'
        ? isAndroidApp
          ? 'Уведомления запрещены в настройках Android'
          : 'Уведомления запрещены в настройках браузера'
        : permission === 'unsupported'
          ? isAndroidApp
            ? 'Системные уведомления недоступны'
            : 'Браузер не поддерживает системные уведомления'
          : 'Разрешение пока не запрошено';

  const timeCount = reminders.times.length;
  const dayScheduleItems = schedules[scheduleDay] ?? [];
  const regularDayItems = dayScheduleItems.filter(
    (item) => !isClassHour(item.pairNumber),
  );
  const hasClassHour = dayScheduleItems.some((item) => isClassHour(item.pairNumber));

  let updateStatus: ReactNode = (
    <div className="update-state-box">
      <div className="update-state-head">
        <Icon name="info" size={17} />
        Проверка ещё не выполнялась
      </div>
      <p>Укажите адрес update.json и нажмите «Проверить обновления».</p>
    </div>
  );

  if (ota.state === 'checking') {
    updateStatus = (
      <div className="update-state-box">
        <div className="update-state-head">
          <Icon name="clock" size={17} />
          Проверяем обновления…
        </div>
        <p>Сервер должен вернуть файл update.json с версией и контрольной суммой APK.</p>
      </div>
    );
  } else if (ota.state === 'uptodate') {
    updateStatus = (
      <div className="update-state-box is-ready">
        <div className="update-state-head">
          <Icon name="check" size={17} />
          Установлена последняя версия
        </div>
        <p>{ota.currentVersion ? `Версия ${ota.currentVersion} актуальна.` : 'Обновлений нет.'}</p>
      </div>
    );
  } else if (ota.state === 'available') {
    updateStatus = (
      <div className="update-state-box is-available">
        <div className="update-state-head">
          <Icon name="download" size={17} />
          Доступна версия {ota.versionName ?? 'новее установленной'}
        </div>
        {ota.notes && <p className="update-notes">{ota.notes}</p>}
        <p>
          {[formatBytes(ota.size), ota.currentVersion ? `сейчас ${ota.currentVersion}` : '']
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              prepareUpdate();
              downloadUpdate(true);
            }}
          >
            <Icon name="download" />
            Скачать и установить
          </button>
        </div>
      </div>
    );
  } else if (ota.state === 'downloading') {
    const progress = ota.progress ?? 0;
    updateStatus = (
      <div className="update-state-box is-available">
        <div className="update-state-head">
          <Icon name="download" size={17} />
          Скачивание обновления {ota.versionName ?? ''}
        </div>
        <p>
          Загружено {progress}%{ota.size ? ` из ${formatBytes(ota.size)}` : ''}. После загрузки
          файл будет проверен по SHA-256 и подписи.
        </p>
        <span className="update-settings-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      </div>
    );
  } else if (ota.state === 'ready') {
    updateStatus = (
      <div className="update-state-box is-ready">
        <div className="update-state-head">
          <Icon name="check" size={17} />
          Обновление {ota.versionName ?? ''} готово
        </div>
        <p>Файл проверен по SHA-256 и подписи приложения. Подтвердите установку в системе.</p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              prepareUpdate();
              installUpdate();
            }}
          >
            <Icon name="download" />
            Установить
          </button>
        </div>
      </div>
    );
  } else if (ota.state === 'need_permission') {
    updateStatus = (
      <div className="update-state-box is-need_permission">
        <div className="update-state-head">
          <Icon name="alert" size={17} />
          Нужно разрешение на установку
        </div>
        <p>
          Android запрещает устанавливать APK из этого приложения. Откройте настройку,
          включите «Разрешить из этого источника», вернитесь и нажмите «Установить».
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => openUpdatePermission()}
          >
            Разрешить
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              prepareUpdate();
              installUpdate();
            }}
          >
            Установить
          </button>
        </div>
      </div>
    );
  } else if (ota.state === 'installing') {
    updateStatus = (
      <div className="update-state-box is-available">
        <div className="update-state-head">
          <Icon name="download" size={17} />
          Установка обновления
        </div>
        <p>Подтвердите установку в системном окне Android. Приложение закроется и обновится.</p>
      </div>
    );
  } else if (ota.state === 'error') {
    updateStatus = (
      <div className="update-state-box is-error">
        <div className="update-state-head">
          <Icon name="alert" size={17} />
          Не удалось проверить или скачать обновление
        </div>
        <p>{ota.error || 'Неизвестная ошибка.'}</p>
        <div className="settings-actions">
          <button type="button" className="btn btn-secondary" onClick={handleCheckUpdate}>
            Повторить проверку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`screen settings-screen${printMode ? ' is-printing-sheet' : ''}`}>
      <PageHeader title="Настройки" subtitle="Оформление, расписание, напоминания и данные" />

      <nav className="settings-nav no-print" aria-label="Разделы настроек">
        {[
          ['settings-theme', 'Тема'],
          ['settings-reminders', 'Напоминания'],
          ['settings-schedule', 'Расписание'],
          ['settings-backup', 'Данные'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="card" id="settings-theme">
        <div className="section-head">
          <h2>
            <Icon name="palette" size={20} />
            Тема оформления
          </h2>
          <span className="pill">{THEMES.length} тем</span>
        </div>
        <p className="muted theme-hint">
          Тема применяется сразу и сохраняется на этом устройстве.
        </p>
        <div className="theme-grid" role="group" aria-label="Тема оформления">
          {THEMES.map((theme) => {
            const active = data.settings.theme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={`theme-option${active ? ' is-active' : ''}`}
                onClick={() => handleTheme(theme.id)}
                aria-pressed={active}
              >
                <span
                  className="theme-preview"
                  style={{ background: theme.preview.bg }}
                  aria-hidden="true"
                >
                  <span
                    className="theme-preview-card"
                    style={{ background: theme.preview.surface }}
                  >
                    <span
                      className="theme-preview-line"
                      style={{ background: theme.preview.soft }}
                    />
                    <span
                      className="theme-preview-line is-short"
                      style={{ background: theme.preview.soft }}
                    />
                  </span>
                  <span
                    className="theme-preview-dot"
                    style={{ background: theme.preview.accent }}
                  />
                </span>
                <span className="theme-option-text">
                  <strong>{theme.label}</strong>
                  <span>{theme.hint}</span>
                </span>
                {active && (
                  <span className="theme-check" aria-hidden="true">
                    <Icon name="check" size={13} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card" id="settings-reminders">
        <div className="section-head">
          <h2>
            <Icon name="bell" size={20} />
            Напоминания
          </h2>
        </div>

        <label className="switch-row">
          <span>
            <strong>Напоминать об отметке</strong>
            <small>
              {isAndroidApp
                ? 'Системное уведомление, даже когда приложение закрыто'
                : 'Баннер в приложении и системное уведомление, если разрешено'}
            </small>
          </span>
          <span className="switch">
            <input
              type="checkbox"
              checked={reminders.enabled}
              onChange={(event) =>
                setReminders((current) => ({ ...current, enabled: event.target.checked }))
              }
            />
            <span className="switch-track" />
          </span>
        </label>

        <div className={`settings-block${reminders.enabled ? '' : ' is-disabled'}`}>
          <div className="section-subhead">
            <span className="field-label">Время напоминания</span>
            <button type="button" className="text-button" onClick={addReminderTime}>
              <Icon name="plus" size={16} />
              Добавить время
            </button>
          </div>
          <div className="time-list">
            {reminders.times.map((time, index) => (
              <div className="time-row" key={`time-${index}`}>
                <input
                  type="time"
                  className="input"
                  value={time}
                  onChange={(event) => updateReminderTime(index, event.target.value)}
                />
                <button
                  type="button"
                  className="icon-button bordered danger"
                  onClick={() => removeReminderTime(index)}
                  aria-label="Удалить время"
                >
                  <Icon name="trash" size={17} />
                </button>
              </div>
            ))}
            {reminders.times.length === 0 && (
              <p className="muted">Пока нет ни одного времени.</p>
            )}
          </div>
          {timeCount > 0 && (
            <p className="field-hint">
              {timeCount === 1
                ? 'Одно напоминание в день'
                : `${timeCount} ${plural(timeCount, 'напоминание', 'напоминания', 'напоминаний')} в день`}{' '}
              в выбранные дни недели.
            </p>
          )}

          <span className="field-label">Дни недели</span>
          <div className="weekday-row">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`weekday-toggle${reminders.weekdays.includes(day.value) ? ' is-active' : ''}`}
                onClick={() => toggleWeekday(day.value)}
                aria-pressed={reminders.weekdays.includes(day.value)}
              >
                {day.short}
              </button>
            ))}
          </div>

          <div className="notification-status">
            <span className={`permission-dot permission-${permission}`} />
            <span>{permissionText}</span>
            {permission !== 'granted' && permission !== 'unsupported' && (
              <button
                type="button"
                className="text-button"
                onClick={
                  permission === 'denied' && isAndroidApp
                    ? openNotificationSettings
                    : handleRequestPermission
                }
              >
                {permission === 'denied' && isAndroidApp ? 'Настройки' : 'Разрешить'}
              </button>
            )}
          </div>

          {isAndroidApp && reliability && (
            <div className="reliability-panel">
              <div className="section-subhead">
                <span className="field-label">Надёжность напоминаний</span>
                <button type="button" className="text-button" onClick={refreshReliability}>
                  <Icon name="restore" size={15} />
                  Проверить
                </button>
              </div>

              <div className="reliability-row">
                <span
                  className={`permission-dot permission-${
                    reliability.notifications === 'granted' ? 'granted' : 'denied'
                  }`}
                />
                <span className="reliability-text">
                  <strong>Уведомления</strong>
                  <small>
                    {reliability.notifications === 'granted'
                      ? 'Разрешены — система покажет напоминание'
                      : 'Запрещены — напоминания не появятся'}
                  </small>
                </span>
                {reliability.notifications !== 'granted' && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={
                      reliability.notifications === 'denied'
                        ? openNotificationSettings
                        : handleRequestPermission
                    }
                  >
                    {reliability.notifications === 'denied' ? 'Настройки' : 'Разрешить'}
                  </button>
                )}
              </div>

              <div className="reliability-row">
                <span
                  className={`permission-dot ${
                    reliability.exactAlarms ? 'permission-granted' : 'permission-denied'
                  }`}
                />
                <span className="reliability-text">
                  <strong>Точные будильники</strong>
                  <small>
                    {reliability.exactAlarms
                      ? 'Разрешены — напоминание придёт вовремя'
                      : 'Запрещены — Android может задержать напоминание'}
                  </small>
                </span>
                {!reliability.exactAlarms && (
                  <button type="button" className="text-button" onClick={requestExactAlarms}>
                    Разрешить
                  </button>
                )}
              </div>

              <div className="reliability-row">
                <span
                  className={`permission-dot ${
                    reliability.batteryOptimized ? 'permission-denied' : 'permission-granted'
                  }`}
                />
                <span className="reliability-text">
                  <strong>Ограничения батареи</strong>
                  <small>
                    {reliability.batteryOptimized
                      ? 'Включены — система может останавливать приложение'
                      : 'Сняты — фоновая работа не ограничена'}
                  </small>
                </span>
                <button type="button" className="text-button" onClick={handleBattery}>
                  {reliability.batteryOptimized ? 'Снять' : 'Проверить'}
                </button>
              </div>

              {isXiaomiLike(reliability) && (
                <div className="reliability-row">
                  <span className="permission-dot permission-neutral" />
                  <span className="reliability-text">
                    <strong>Автозапуск Xiaomi</strong>
                    <small>Проверьте вручную и разрешите автозапуск приложения</small>
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={openAutostartSettings}
                  >
                    Открыть
                  </button>
                </div>
              )}

              <div className="reliability-test">
                <button type="button" className="btn btn-secondary" onClick={handleTestNow}>
                  Проверить сейчас
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleTestDelayed}>
                  Через 10 секунд
                </button>
              </div>
              <p className="field-hint">
                Для проверки фоновой доставки нажмите «Через 10 секунд» и закройте приложение.
              </p>
            </div>
          )}

          <div className="inline-note">
            <Icon name="info" size={18} />
            <span>
              {isAndroidApp ? (
                <>
                  В APK напоминания планируются системным будильником Android и приходят, даже
                  когда приложение закрыто. На Xiaomi/Redmi разрешите автозапуск и снимите
                  ограничения батареи. Принудительная остановка приложения отменяет будильники
                  до следующего запуска.
                </>
              ) : (
                <>
                  В браузере приложение не может работать в фоне без сервера: уведомление
                  сработает, пока вкладка открыта, а после закрытия баннер появится при следующем
                  открытии. Для фоновых напоминаний установите APK.
                </>
              )}
            </span>
          </div>
        </div>

        <button type="button" className="btn btn-primary btn-block" onClick={() => void handleSaveReminders()}>
          Сохранить напоминания
        </button>
      </section>

      <section className="card" id="settings-schedule">
        <div className="section-head">
          <h2>
            <Icon name="clock" size={20} />
            Расписание звонков
          </h2>
        </div>
        <p className="muted">
          Время отличается по дням недели. Выберите день и отредактируйте пары.
        </p>
        <div className="weekday-row" role="group" aria-label="День недели">
          {WEEKDAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              className={`weekday-toggle${scheduleDay === day.value ? ' is-active' : ''}`}
              onClick={() => setScheduleDay(day.value)}
              aria-pressed={scheduleDay === day.value}
            >
              {day.short}
            </button>
          ))}
        </div>
        <p className="field-hint">
          {WEEKDAYS[scheduleDay - 1].long}: {regularDayItems.length}{' '}
          {plural(regularDayItems.length, 'пара', 'пары', 'пар')}
          {hasClassHour ? ' + классный час' : ''}
        </p>
        <div className="schedule-list">
          {dayScheduleItems.map((item) => (
            <div className="schedule-row" key={item.pairNumber}>
              <span
                className={`schedule-number${isClassHour(item.pairNumber) ? ' is-class-hour' : ''}`}
              >
                {isClassHour(item.pairNumber) ? 'КЧ' : item.pairNumber}
              </span>
              <div className="schedule-times">
                <label className="field compact">
                  <span>Начало</span>
                  <input
                    type="time"
                    className="input"
                    value={item.start}
                    onChange={(event) =>
                      updateScheduleTime(scheduleDay, item.pairNumber, 'start', event.target.value)
                    }
                  />
                </label>
                <span className="schedule-dash">—</span>
                <label className="field compact">
                  <span>Конец</span>
                  <input
                    type="time"
                    className="input"
                    value={item.end}
                    onChange={(event) =>
                      updateScheduleTime(scheduleDay, item.pairNumber, 'end', event.target.value)
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="schedule-remove"
                onClick={() => removeSchedulePair(item.pairNumber)}
                aria-label={
                  isClassHour(item.pairNumber)
                    ? 'Удалить классный час'
                    : `Удалить ${item.pairNumber} пару`
                }
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {(schedules[scheduleDay] ?? []).length === 0 && (
            <p className="muted">В этот день занятий нет.</p>
          )}
        </div>
        <div className="settings-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={addSchedulePair}>
            <Icon name="plus" size={16} />
            Добавить пару
          </button>
          {!hasClassHour && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={addClassHour}>
              <Icon name="plus" size={16} />
              Классный час
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetScheduleDay}>
            Сбросить день
          </button>
        </div>
        <div className="inline-note">
          <Icon name="info" size={18} />
          <span>
            Классный час — отдельное занятие. По умолчанию он есть в понедельник
            («Разговоры о важном») и четверг («Россия — мои горизонты»). Его можно
            добавить в любой день или удалить.
          </span>
        </div>
        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSaveSchedule}>
            Сохранить расписание
          </button>
        </div>
      </section>

      <details className="card advanced-settings" id="settings-advanced">
        <summary className="advanced-head">
          <span className="advanced-head-main">
            <span className="advanced-head-icon" aria-hidden="true">
              <Icon name="settings" size={20} />
            </span>
            <span className="advanced-head-text">
              <strong>Дополнительно</strong>
              <small>Обновления, печать и копии внутри приложения</small>
            </span>
          </span>
          <span className="advanced-chevron" aria-hidden="true">
            <Icon name="chevron-down" size={18} />
          </span>
        </summary>
        <div className="advanced-body">
          <section className="advanced-block" id="settings-updates">
            <div className="section-head">
              <h2>
                <Icon name="arrow-down" size={20} />
                Обновления приложения
              </h2>
              <span className="update-version-badge">v{appVersion}</span>
            </div>
            <p className="muted">
              OTA-обновление APK: приложение само проверяет сервер, скачивает новую версию,
              проверяет SHA-256 и подпись, затем открывает системный установщик.
            </p>
            <div className="update-current">
              <div>
                <strong>Установленная версия</strong>
                <span>Обновление не удаляет группы, студентов и историю</span>
              </div>
            </div>

            {isAndroidApp ? (
              <>
                <label className="field update-url-field">
                  <span>Адрес update.json</span>
                  <input
                    type="url"
                    className="input"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="https://…/update.json"
                    value={updateUrl}
                    onChange={(event) => setUpdateUrl(event.target.value)}
                  />
                </label>
                <label className="switch-row">
                  <span>
                    <strong>Проверять при запуске</strong>
                    <small>Не чаще одного раза в 6 часов, если адрес сохранён</small>
                  </span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={autoUpdateCheck}
                      onChange={(event) => setAutoUpdateCheck(event.target.checked)}
                    />
                    <span className="switch-track" />
                  </span>
                </label>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleSaveUpdateSettings}
                  >
                    Сохранить адрес
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCheckUpdate}
                    disabled={ota.state === 'checking' || ota.state === 'downloading'}
                  >
                    <Icon name="arrow-down" />
                    {ota.state === 'checking' ? 'Проверяем…' : 'Проверить обновления'}
                  </button>
                </div>
                {updateStatus}
                <div className="inline-note">
                  <Icon name="info" size={18} />
                  <span>
                    Для локальной сети подойдёт HTTP, для интернета — только HTTPS. Скачанный APK
                    принимается, если совпали имя пакета, версия, SHA-256 и подпись установленного
                    приложения. Android может попросить разрешение «Установка неизвестных
                    приложений» — это системная защита.
                  </span>
                </div>
              </>
            ) : (
              <div className="inline-note">
                <Icon name="info" size={18} />
                <span>
                  В браузере OTA-обновление APK недоступно: новая версия открывается с сайта или
                  устанавливается поверх старого APK. Настройка OTA появляется в установленном
                  приложении.
                </span>
              </div>
            )}
          </section>

          <section className="advanced-block" id="settings-print">
            <div className="section-head">
              <h2>
                <Icon name="print" size={20} />
                Печать
              </h2>
            </div>
            <p className="field-hint">
              Редко используемая функция. A4, альбомная ориентация. Выберите группу и
              месяц.
            </p>
            <div className="print-settings-fields">
              <label className="field">
                <span>Группа</span>
                <select
                  className="select"
                  value={printGroup?.id ?? ''}
                  onChange={(event) => setPrintGroupId(event.target.value)}
                >
                  {data.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Месяц</span>
                <input
                  type="month"
                  className="input"
                  value={printMonth}
                  onChange={(event) =>
                    setPrintMonth(event.target.value || todayISO().slice(0, 7))
                  }
                />
              </label>
              <label className="field">
                <span>Причина пропусков</span>
                <select
                  className="select"
                  value={printFilter}
                  onChange={(event) =>
                    setPrintFilter(event.target.value as AbsenceFilter)
                  }
                >
                  <option value="all">Все пропуски</option>
                  {ABSENCE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="settings-actions print-settings-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handlePrint('report')}
                disabled={printRecords.length === 0}
              >
                <Icon name="print" />
                Печать ведомости
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handlePrint('absences')}
                disabled={printVisibleAbsences.length === 0}
              >
                <Icon name="print" />
                Печать пропусков
              </button>
            </div>
            <p className="field-hint">
              {printRecords.length === 0
                ? 'За выбранный месяц отметок нет.'
                : printFilter === 'all'
                  ? `Отметок: ${printRecords.length} · пропусков: ${printAbsenceEntries.length}.`
                  : `Отметок: ${printRecords.length} · по фильтру: ${printVisibleAbsences.length}.`}
            </p>
          </section>

          {isAndroidApp && hasNativeVault() ? (
            <section className="advanced-block advanced-vault" id="settings-vault">
              <div className="section-head">
                <h2>
                  <Icon name="archive" size={20} />
                  Копии в приложении
                </h2>
                {vaultInfo && vaultInfo.backupCount > 0 ? (
                  <span className="pill">{vaultInfo.backupCount}</span>
                ) : null}
              </div>
              <p className="muted">
                {vaultInfo?.available && vaultInfo.savedAt
                  ? `Последняя: ${formatBackupStamp(vaultInfo.savedAt)}`
                  : 'Пока нет сохранённой копии'}
              </p>
              <p className="field-hint">
                Копия сохраняется автоматически при изменениях. Если данные пропадут после
                обновления, их можно восстановить из этой копии.
              </p>
              {vaultBackups.length > 0 ? (
                <div className="device-backup-list">
                  {(showAllBackups ? vaultBackups : vaultBackups.slice(0, 5)).map((entry) => (
                    <div className="device-backup-row" key={entry.name}>
                      <span className="device-backup-meta">
                        <strong>{formatBackupStamp(entry.savedAt)}</strong>
                        <span className="muted">{formatBytes(entry.size)}</span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleVaultRestore(entry)}
                      >
                        Восстановить
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {vaultBackups.length > 5 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAllBackups((value) => !value)}
                >
                  {showAllBackups ? 'Свернуть' : `Показать все (${vaultBackups.length})`}
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleMigrateLegacyBackups}
              >
                <Icon name="archive" size={16} />
                Перенести копии из «Загрузок»
              </button>
              <p className="field-hint">
                Старые JSON-файлы переместятся в приложение и исчезнут из проводника.
              </p>
            </section>
          ) : null}
        </div>
      </details>

      <section className="card" id="settings-backup">
        <div className="section-head">
          <h2>
            <Icon name="download" size={20} />
            Резервная копия
          </h2>
        </div>
        <p className="muted">
          {isAndroidApp && hasNativeVault()
            ? 'Копии хранятся внутри приложения и не появляются в «Загрузках».'
            : 'Скачайте файл резервной копии или отправьте его на другое устройство.'}
        </p>
        <div className="settings-actions backup-actions">
          <button type="button" className="btn btn-primary" onClick={handleExport}>
            <Icon name={isAndroidApp && hasNativeVault() ? 'archive' : 'download'} />
            {isAndroidApp && hasNativeVault() ? 'Сохранить в приложении' : 'Скачать файл'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleShareBackup()}
          >
            <Icon name="share" />
            Отправить файл
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => importRef.current?.click()}
          >
            <Icon name="upload" />
            Импорт файла
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={(event) => void handleImport(event)}
          />
        </div>
        <p className="field-hint">
          «Отправить файл» — перенос на другой телефон. Импорт заменит текущие данные;
          файл группы добавится отдельной группой.
        </p>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>
            <Icon name="alert" size={20} />
            Опасная зона
          </h2>
        </div>
        <p className="muted">
          Полностью удаляет группы, студентов, историю и настройки из приложения. Автоматические
          копии на телефоне остаются в разделе «Резервная копия» — из них можно восстановить
          данные. Сначала сделайте резервную копию.
        </p>
        <button type="button" className="btn btn-danger-ghost btn-block" onClick={handleClear}>
          <Icon name="trash" />
          Очистить все данные
        </button>
      </section>

      <section className="card about-card">
        <div className="about-head">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="check" size={20} />
          </span>
          <div>
            <strong>Посещаемость</strong>
            <span className="muted">Версия {appVersion} · офлайн-приложение</span>
          </div>
        </div>
        <div className="about-facts">
          <span>
            <Icon name="users" size={16} />
            {data.groups.length} {plural(data.groups.length, 'группа', 'группы', 'групп')},
            {' '}{data.students.length}{' '}
            {plural(data.students.length, 'студент', 'студента', 'студентов')}
          </span>
          <span>
            <Icon name="chart" size={16} />
            {data.attendance.length}{' '}
            {plural(data.attendance.length, 'отметка', 'отметки', 'отметок')}
          </span>
          <span>
            <Icon name="calendar" size={16} />
            Сегодня: {formatDate(todayISO())}
          </span>
        </div>
        {isAndroidApp ? (
          <div className="inline-note">
            <Icon name="info" size={18} />
            <span>
              Приложение установлено на телефон и работает офлайн. Все данные хранятся локально;
              делайте резервные копии JSON, чтобы не потерять историю при смене устройства.
            </span>
          </div>
        ) : (
          <div className="inline-note">
            <Icon name="info" size={18} />
            <span>
              Установка: на Android откройте сайт в Chrome → меню ⋮ → «Установить приложение».
              На iPhone — Safari → «Поделиться» → «На экран Домой». После установки приложение
              работает офлайн.
            </span>
          </div>
        )}
      </section>

      {printMode === 'report' && printGroup ? (
        <ReportPrintSheet
          group={printGroup}
          students={data.students}
          records={printRecords}
          month={printMonth}
        />
      ) : null}

      {printMode === 'absences' && printGroup ? (
        <AbsencePrintSheet
          entries={printVisibleAbsences}
          groupName={printGroup.name}
          month={printMonth}
          filter={printFilter}
        />
      ) : null}
    </div>
  );
}
