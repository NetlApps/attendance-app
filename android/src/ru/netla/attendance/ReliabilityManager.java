package ru.netla.attendance;

import android.app.AlarmManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import org.json.JSONObject;

import java.util.Locale;

/**
 * Проверяет системные разрешения, от которых зависит доставка фоновых напоминаний,
 * и открывает нужные экраны настроек Android.
 */
public final class ReliabilityManager {
  private static final String PREFS = "attendance_app";
  private static final String PREF_NOTIFICATION_ASKED = "notification_asked";

  private ReliabilityManager() {}

  /** Состояние разрешений в формате JSON для интерфейса приложения. */
  public static String getState(Context context) {
    JSONObject state = new JSONObject();
    try {
      state.put("notifications", notificationState(context));
      state.put("exactAlarms", canScheduleExactAlarms(context));
      state.put("batteryOptimized", isBatteryOptimized(context));
      state.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
      state.put("sdk", Build.VERSION.SDK_INT);
    } catch (Exception ignored) {
      // Даже при ошибке интерфейс получит хотя бы пустой объект.
    }
    return state.toString();
  }

  private static String notificationState(Context context) {
    if (Build.VERSION.SDK_INT < 33) return "granted";
    if (context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED) {
      return "granted";
    }
    boolean asked =
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(PREF_NOTIFICATION_ASKED, false);
    return asked ? "denied" : "default";
  }

  private static boolean canScheduleExactAlarms(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
    AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    return manager != null && manager.canScheduleExactAlarms();
  }

  private static boolean isBatteryOptimized(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    PowerManager manager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
    return manager != null && !manager.isIgnoringBatteryOptimizations(context.getPackageName());
  }

  public static void requestExactAlarmPermission(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      try {
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        return;
      } catch (Exception ignored) {
        // Ниже откроем общие настройки приложения.
      }
    }
    openAppSettings(context);
  }

  public static void requestBatteryOptimizationExemption(Context context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && isBatteryOptimized(context)) {
      try {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        return;
      } catch (Exception ignored) {
        // Ниже откроем список приложений с ограничениями батареи.
      }
    }
    openBatterySettings(context);
  }

  public static void openBatterySettings(Context context) {
    try {
      Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
    } catch (Exception ignored) {
      openAppSettings(context);
    }
  }

  /** На Xiaomi открывает экран автозапуска, на остальных — настройки приложения. */
  public static void openAutostartSettings(Context context) {
    if (isXiaomi()) {
      try {
        Intent intent = new Intent();
        intent.setComponent(
            new ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        return;
      } catch (Exception ignored) {
        // На некоторых прошивках экран называется иначе — откроем настройки приложения.
      }
    }
    openAppSettings(context);
  }

  public static void openAppSettings(Context context) {
    try {
      Intent intent =
          new Intent(
              Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
              Uri.parse("package:" + context.getPackageName()));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
    } catch (Exception ignored) {
      // Настройки недоступны — ничего страшного, приложение продолжает работать.
    }
  }

  public static boolean isXiaomi() {
    String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.ROOT);
    return manufacturer.contains("xiaomi")
        || manufacturer.contains("redmi")
        || manufacturer.contains("poco");
  }
}
