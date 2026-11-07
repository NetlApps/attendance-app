package ru.netla.attendance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** Срабатывает по будильнику AlarmManager и показывает напоминание. */
public class ReminderReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();

    // Проверочное уведомление не зависит от расписания и настроек дней недели.
    if (ReminderScheduler.ACTION_TEST.equals(action)) {
      ReminderNotifier.showTest(context);
      return;
    }

    if (!ReminderScheduler.ACTION_REMINDER.equals(action)) return;

    int weekday = intent.getIntExtra(ReminderScheduler.EXTRA_WEEKDAY, 0);
    String time = intent.getStringExtra(ReminderScheduler.EXTRA_TIME);
    if (!ReminderScheduler.isSlotEnabled(context, weekday, time)) {
      // Настройки успели измениться — просто пересобираем расписание.
      ReminderScheduler.scheduleFromPrefs(context);
      return;
    }

    SharedPreferences prefs =
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
    String groupName = prefs.getString(ReminderScheduler.PREF_GROUP, "");
    int notificationId = intent.getIntExtra(ReminderScheduler.EXTRA_ID, 1001);
    ReminderNotifier.show(context, groupName, notificationId);

    // Планируем следующее срабатывание этого и остальных напоминаний.
    ReminderScheduler.scheduleFromPrefs(context);
  }
}
