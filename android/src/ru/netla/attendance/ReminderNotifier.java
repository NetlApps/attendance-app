package ru.netla.attendance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/** Показывает системные уведомления из приложения и фонового приёмника. */
public final class ReminderNotifier {
  /**
   * Новый канал с высоким приоритетом: звук, вибрация и показ на экране блокировки.
   * Старый канал "reminders" остаётся у уже установленных версий, но новые
   * уведомления используют более надёжный канал.
   */
  public static final String CHANNEL_ID = "reminders_v2";

  private ReminderNotifier() {}

  /** Создаёт канал заранее, чтобы его настройки были видны в системе до первого напоминания. */
  public static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "Напоминания", NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription("Напоминания отметить посещаемость");
    channel.enableLights(true);
    channel.enableVibration(true);
    channel.setVibrationPattern(new long[] {0, 250, 180, 250});
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setShowBadge(true);
    channel.setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build());
    manager.createNotificationChannel(channel);
  }

  /** Проверяет, разрешены ли уведомления на уровне Android. */
  public static boolean canNotify(Context context) {
    if (Build.VERSION.SDK_INT >= 33
        && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      return false;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationManager manager =
          (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      return manager != null && manager.areNotificationsEnabled();
    }
    return true;
  }

  public static void show(Context context, String groupName, int notificationId) {
    String body =
        groupName == null || groupName.trim().isEmpty()
            ? "Не забудьте отметить посещаемость."
            : "Не забудьте отметить посещаемость группы «" + groupName.trim() + "».";
    showMessage(context, "Посещаемость", body, notificationId);
  }

  /** Тестовое уведомление: проверяет разрешения, канал, звук и показ на экране блокировки. */
  public static void showTest(Context context) {
    showMessage(
        context,
        "Проверка уведомлений",
        "Уведомления работают. Напоминания придут, даже если приложение закрыто.",
        9999);
  }

  public static void showMessage(Context context, String title, String body, int notificationId) {
    if (!canNotify(context)) return;
    ensureChannel(context);

    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    Intent intent = new Intent(context, MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    String safeTitle = title == null || title.trim().isEmpty() ? "Посещаемость" : title.trim();
    String safeBody = body == null ? "" : body;

    Notification.Builder builder =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
    builder
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle(safeTitle)
        .setContentText(safeBody)
        .setStyle(new Notification.BigTextStyle().bigText(safeBody))
        .setContentIntent(pendingIntent)
        .setCategory(Notification.CATEGORY_REMINDER)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setWhen(System.currentTimeMillis())
        .setShowWhen(true)
        .setAutoCancel(true);

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
    }

    manager.notify(notificationId, builder.build());
  }
}
