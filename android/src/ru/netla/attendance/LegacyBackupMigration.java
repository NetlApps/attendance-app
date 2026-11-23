package ru.netla.attendance;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Environment;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * Переносит старые резервные копии из «Загрузок» в приватное хранилище приложения.
 *
 * <p>Раньше кнопка «Экспорт JSON» сохраняла файл в общую папку «Загрузки», и там
 * копились десятки одинаковых файлов. Теперь такие файлы один раз импортируются в
 * DataVault и удаляются из проводника, а новые копии сразу пишутся в приложение.
 */
public final class LegacyBackupMigration {
  private static final String TAG = "AttendanceBackupMove";
  static final String PREFIX = "Посещаемость_бэкап_";
  static final int MAX_BYTES = 8 * 1024 * 1024;
  private static final String PREFS = "attendance_app";
  private static final String PREF_MIGRATED = "legacy_backups_migrated";

  private LegacyBackupMigration() {}

  /** Возвращает JSON: found, moved, failed. */
  public static synchronized String run(Context context) {
    JSONObject result = new JSONObject();
    int found = 0;
    int moved = 0;
    int failed = 0;
    Set<String> migrated = readMigrated(context);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Класс с MediaStore.Downloads вынесен отдельно: на Android 7–9 он не загружается.
      try {
        int[] counts = LegacyBackupMigrationQ.run(context, migrated);
        found += counts[0];
        moved += counts[1];
        failed += counts[2];
      } catch (Exception error) {
        Log.w(TAG, "Не удалось проверить «Загрузки»", error);
        failed += 1;
      }
    } else {
      File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      File[] files = dir == null ? null : dir.listFiles();
      if (files != null) {
        for (File file : files) {
          if (!file.isFile()
              || !file.getName().startsWith(PREFIX)
              || !file.getName().endsWith(".json")) {
            continue;
          }
          found += 1;
          String text = readFile(file);
          if (text == null) {
            failed += 1;
            continue;
          }
          if (!migrated.contains(file.getName())) {
            if (!DataVault.importSnapshot(context, text, file.lastModified())) {
              failed += 1;
              continue;
            }
            migrated.add(file.getName());
          }
          if (file.delete()) {
            moved += 1;
          } else {
            failed += 1;
          }
        }
      }
    }

    DataVault.prune(context);
    saveMigrated(context, migrated);
    try {
      result.put("found", found);
      result.put("moved", moved);
      result.put("failed", failed);
    } catch (Exception ignored) {
      // JSON-ответ не критичен: главное — не уронить приложение.
    }
    return result.toString();
  }

  private static Set<String> readMigrated(Context context) {
    try {
      SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      Set<String> saved = prefs.getStringSet(PREF_MIGRATED, null);
      return saved == null ? new HashSet<>() : new HashSet<>(saved);
    } catch (Exception error) {
      return new HashSet<>();
    }
  }

  private static void saveMigrated(Context context, Set<String> migrated) {
    try {
      context
          .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit()
          .putStringSet(PREF_MIGRATED, new HashSet<>(migrated))
          .apply();
    } catch (Exception error) {
      Log.w(TAG, "Не удалось запомнить перенесённые копии", error);
    }
  }

  private static String readFile(File file) {
    try (InputStream input = new FileInputStream(file);
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      return readStream(input, output);
    } catch (Exception error) {
      Log.w(TAG, "Не удалось прочитать файл старой копии", error);
      return null;
    }
  }

  static String readStream(InputStream input, ByteArrayOutputStream output) throws Exception {
    byte[] buffer = new byte[8 * 1024];
    int read;
    int total = 0;
    while ((read = input.read(buffer)) != -1) {
      total += read;
      if (total > MAX_BYTES) return null;
      output.write(buffer, 0, read);
    }
    return new String(output.toByteArray(), StandardCharsets.UTF_8);
  }
}
