package ru.netla.attendance;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Получает результат установки APK от PackageInstaller. */
public class UpdateInstallReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    int status =
        intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);

    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
      Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
      if (confirmation != null) {
        confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
          context.startActivity(confirmation);
        } catch (Exception ignored) {
          // Если системное окно не открылось, пользователь запустит установку ещё раз.
        }
      }
      return;
    }

    if (status == PackageInstaller.STATUS_SUCCESS) {
      UpdateManager.onInstallSuccess(context);
      return;
    }

    String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
    UpdateManager.setError(
        context,
        "Установка не завершена"
            + (message == null || message.trim().isEmpty() ? "" : ": " + message));
  }
}
