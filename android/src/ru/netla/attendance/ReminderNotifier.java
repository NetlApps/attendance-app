package ru.netla.attendance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/** Показывает системное уведомление из фонового приёмника. */
public final class ReminderNotifier {
  public static final String CHANNEL_ID = "reminders";

  private ReminderNotifier() {}

  public static void show(Context context, String groupName, int notificationId) {
    if (Build.VERSION.SDK_INT >= 33
        && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
      return;
    }

    NotificationManager manager =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager == null) return;

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      NotificationChannel channel =
          new NotificationChannel(
              CHANNEL_ID, "Напоминания", NotificationManager.IMPORTANCE_DEFAULT);
      channel.setDescription("Напоминания отметить посещаемость");
      manager.createNotificationChannel(channel);
    }

    Intent intent = new Intent(context, MainActivity.class);
    intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent pendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

    String body =
        groupName == null || groupName.trim().isEmpty()
            ? "Не забудьте отметить посещаемость."
            : "Не забудьте отметить посещаемость группы «" + groupName.trim() + "».";

    Notification.Builder builder =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
    builder
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("Посещаемость")
        .setContentText(body)
        .setStyle(new Notification.BigTextStyle().bigText(body))
        .setContentIntent(pendingIntent)
        .setAutoCancel(true);
    manager.notify(notificationId, builder.build());
  }
}
