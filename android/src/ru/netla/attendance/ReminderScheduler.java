package ru.netla.attendance;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Планирует системные будильники напоминаний через AlarmManager.
 * Будильники продолжают работать, когда приложение закрыто, и восстанавливаются
 * после перезагрузки телефона или обновления приложения.
 */
public final class ReminderScheduler {
  public static final String PREFS = "attendance_app";
  public static final String PREF_ENABLED = "reminders_enabled";
  public static final String PREF_TIMES = "reminder_times";
  public static final String PREF_WEEKDAYS = "reminder_weekdays";
  public static final String PREF_GROUP = "reminder_group";
  public static final String ACTION_REMINDER = "ru.netla.attendance.REMINDER";
  public static final String EXTRA_WEEKDAY = "weekday";
  public static final String EXTRA_TIME = "time";
  public static final String EXTRA_ID = "notification_id";

  private static final int MAX_TIMES = 32;

  private ReminderScheduler() {}

  /** Сохраняет настройки и заново планирует все будильники. */
  public static void saveAndSchedule(
      Context context, boolean enabled, String timesJson, String weekdaysJson, String groupName) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    prefs
        .edit()
        .putBoolean(PREF_ENABLED, enabled)
        .putString(PREF_TIMES, timesJson == null ? "[]" : timesJson)
        .putString(PREF_WEEKDAYS, weekdaysJson == null ? "[]" : weekdaysJson)
        .putString(PREF_GROUP, groupName == null ? "" : groupName)
        .apply();
    scheduleFromPrefs(context);
  }

  /** Отменяет старые будильники и планирует ближайшие по сохранённым настройкам. */
  public static void scheduleFromPrefs(Context context) {
    cancelAll(context);
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(PREF_ENABLED, false)) return;

    List<String> times = readStrings(prefs.getString(PREF_TIMES, "[]"));
    List<Integer> weekdays = readInts(prefs.getString(PREF_WEEKDAYS, "[]"));
    for (int weekday : weekdays) {
      if (weekday < 1 || weekday > 7) continue;
      for (int index = 0; index < times.size() && index < MAX_TIMES; index++) {
        String time = times.get(index);
        int[] hm = parseTime(time);
        if (hm == null) continue;
        long trigger = nextTrigger(weekday, hm[0], hm[1]);
        scheduleAlarm(context, weekday, index, time, trigger);
      }
    }
  }

  /** Проверяет, что занятие всё ещё включено в настройках (защита от устаревшего будильника). */
  public static boolean isSlotEnabled(Context context, int weekday, String time) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    if (!prefs.getBoolean(PREF_ENABLED, false)) return false;
    List<String> times = readStrings(prefs.getString(PREF_TIMES, "[]"));
    List<Integer> weekdays = readInts(prefs.getString(PREF_WEEKDAYS, "[]"));
    return weekdays.contains(weekday) && times.contains(time);
  }

  private static void scheduleAlarm(
      Context context, int weekday, int index, String time, long trigger) {
    AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (manager == null) return;

    Intent intent = new Intent(context, ReminderReceiver.class);
    intent.setAction(ACTION_REMINDER);
    intent.putExtra(EXTRA_WEEKDAY, weekday);
    intent.putExtra(EXTRA_TIME, time);
    intent.putExtra(EXTRA_ID, notificationId(weekday, index));

    PendingIntent pendingIntent =
        PendingIntent.getBroadcast(
            context,
            requestCode(weekday, index),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
      // Если точные будильники запрещены, всё равно напомним — с допустимой задержкой.
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pendingIntent);
    } else {
      manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pendingIntent);
    }
  }

  private static void cancelAll(Context context) {
    AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    if (manager == null) return;
    for (int weekday = 1; weekday <= 7; weekday++) {
      for (int index = 0; index < MAX_TIMES; index++) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction(ACTION_REMINDER);
        PendingIntent pendingIntent =
            PendingIntent.getBroadcast(
                context,
                requestCode(weekday, index),
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
        if (pendingIntent != null) {
          manager.cancel(pendingIntent);
          pendingIntent.cancel();
        }
      }
    }
  }

  /** Ближайшее наступление дня недели (1 = понедельник ... 7 = воскресенье) и времени. */
  private static long nextTrigger(int weekday, int hour, int minute) {
    Calendar now = Calendar.getInstance();
    Calendar target = Calendar.getInstance();
    target.set(Calendar.HOUR_OF_DAY, hour);
    target.set(Calendar.MINUTE, minute);
    target.set(Calendar.SECOND, 0);
    target.set(Calendar.MILLISECOND, 0);

    int today = weekdayNumber(now);
    int daysAhead = (weekday - today + 7) % 7;
    target.add(Calendar.DAY_OF_YEAR, daysAhead);
    if (target.getTimeInMillis() <= now.getTimeInMillis()) {
      target.add(Calendar.DAY_OF_YEAR, 7);
    }
    return target.getTimeInMillis();
  }

  private static int weekdayNumber(Calendar calendar) {
    int value = calendar.get(Calendar.DAY_OF_WEEK);
    return value == Calendar.SUNDAY ? 7 : value - 1;
  }

  private static int[] parseTime(String value) {
    if (value == null) return null;
    String[] parts = value.trim().split(":");
    if (parts.length != 2) return null;
    try {
      int hour = Integer.parseInt(parts[0]);
      int minute = Integer.parseInt(parts[1]);
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
      return new int[] {hour, minute};
    } catch (NumberFormatException error) {
      return null;
    }
  }

  private static List<String> readStrings(String raw) {
    List<String> result = new ArrayList<>();
    try {
      JSONArray array = new JSONArray(raw == null ? "[]" : raw);
      for (int index = 0; index < array.length(); index++) {
        String value = array.getString(index);
        if (value != null && !value.trim().isEmpty()) result.add(value.trim());
      }
    } catch (Exception ignored) {
      // Повреждённые настройки просто не планируем.
    }
    return result;
  }

  private static List<Integer> readInts(String raw) {
    List<Integer> result = new ArrayList<>();
    try {
      JSONArray array = new JSONArray(raw == null ? "[]" : raw);
      for (int index = 0; index < array.length(); index++) {
        result.add(array.getInt(index));
      }
    } catch (Exception ignored) {
      // Повреждённые настройки просто не планируем.
    }
    return result;
  }

  private static int requestCode(int weekday, int index) {
    return weekday * 100 + index;
  }

  private static int notificationId(int weekday, int index) {
    return 1000 + weekday * 100 + index;
  }
}
