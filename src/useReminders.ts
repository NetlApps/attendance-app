import { useEffect, useState } from 'react';
import type { ReminderSettings } from './types';
import { loadFiredReminders, markReminderFired } from './storage';
import { minutesFromHHMM, pad2, todayISO, weekdayNumber } from './utils';
import { APP_NAME } from './constants';

export interface ReminderDue {
  time: string;
  date: string;
}

async function showSystemNotification(body: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.AndroidApp?.scheduleReminders) {
      // В APK системное уведомление показывает нативный будильник Android,
      // в том числе когда приложение закрыто. Здесь остаётся только баннер.
      return;
    }

    if (typeof window !== 'undefined' && window.AndroidApp?.notify) {
      window.AndroidApp.notify(APP_NAME, body);
      return;
    }

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const icon = new URL('icons/icon-192.png', document.baseURI).href;
    const options: NotificationOptions = {
      body,
      icon,
      badge: icon,
      tag: 'attendance-reminder',
      data: { url: document.baseURI },
    };

    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(APP_NAME, options);
        return;
      }
    }

    const notification = new Notification(APP_NAME, options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch (error) {
    console.warn('Не удалось показать уведомление:', error);
  }
}

/**
 * Локальные напоминания. Точное срабатывание проверяется каждые 20 секунд,
 * пока приложение открыто. При открытии после пропущенного напоминания
 * показывается баннер, если за сегодня ещё нет отметок.
 */
export function useReminders(
  settings: ReminderSettings,
  hasAttendanceToday: boolean,
  groupName: string,
): { due: ReminderDue | null; dismiss: () => void } {
  const [due, setDue] = useState<ReminderDue | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.AndroidApp?.scheduleReminders) return;
    window.AndroidApp.scheduleReminders(
      settings.enabled,
      JSON.stringify(settings.times),
      JSON.stringify(settings.weekdays),
      groupName,
    );
  }, [settings.enabled, settings.times, settings.weekdays, groupName]);

  useEffect(() => {
    if (!settings.enabled) {
      setDue(null);
      return;
    }

    const fire = (time: string, date: string) => {
      const body = `Пора отметить посещаемость группы «${groupName}».`;
      setDue({ time, date });
      void showSystemNotification(body);
    };

    const date = todayISO();
    const day = weekdayNumber(date);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Догоняющий баннер: приложение открыли после времени напоминания,
    // а отметок за сегодня ещё нет.
    if (!hasAttendanceToday && settings.weekdays.includes(day)) {
      const fired = loadFiredReminders();
      const missed = settings.times
        .filter((time) => {
          const minutes = minutesFromHHMM(time);
          return minutes <= nowMinutes && nowMinutes - minutes <= 120;
        })
        .sort();
      const latest = missed[missed.length - 1];
      if (latest && !fired.has(`${date}T${latest}`)) {
        for (const time of missed) markReminderFired(`${date}T${time}`);
        fire(latest, date);
      }
    }

    const tick = () => {
      const current = new Date();
      const currentDate = todayISO();
      const currentDay = weekdayNumber(currentDate);
      if (!settings.weekdays.includes(currentDay)) return;

      const time = `${pad2(current.getHours())}:${pad2(current.getMinutes())}`;
      if (!settings.times.includes(time)) return;

      const key = `${currentDate}T${time}`;
      if (loadFiredReminders().has(key)) return;
      markReminderFired(key);
      fire(time, currentDate);
    };

    tick();
    const interval = window.setInterval(tick, 20_000);
    return () => window.clearInterval(interval);
  }, [settings.enabled, settings.times, settings.weekdays, hasAttendanceToday, groupName]);

  return {
    due,
    dismiss: () => setDue(null),
  };
}
