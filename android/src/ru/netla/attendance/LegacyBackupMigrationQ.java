package ru.netla.attendance;

import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Set;

/**
 * Часть переноса старых копий, доступная только на Android 10+.
 *
 * <p>Класс вынесен отдельно, потому что MediaStore.Downloads появился в API 29.
 * Если бы он упоминался в LegacyBackupMigration, приложение падало бы при запуске
 * на Android 7–9 с VerifyError.
 */
final class LegacyBackupMigrationQ {
  private LegacyBackupMigrationQ() {}

  /** Возвращает [найдено, перенесено, ошибок]. */
  static int[] run(Context context, Set<String> migrated) throws Exception {
    int found = 0;
    int moved = 0;
    int failed = 0;

    String[] columns = {
      MediaStore.Downloads._ID,
      MediaStore.Downloads.DISPLAY_NAME,
      MediaStore.Downloads.DATE_MODIFIED
    };
    String selection =
        MediaStore.Downloads.DISPLAY_NAME + " LIKE ? AND "
            + MediaStore.Downloads.DISPLAY_NAME + " LIKE ?";
    String[] args = {LegacyBackupMigration.PREFIX + "%", "%.json"};

    try (Cursor cursor =
        context
            .getContentResolver()
            .query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                columns,
                selection,
                args,
                null)) {
      if (cursor == null) return new int[] {0, 0, 0};

      while (cursor.moveToNext()) {
        found += 1;
        long id = cursor.getLong(0);
        String name = cursor.getString(1);
        long modified = cursor.getLong(2) * 1000L;
        if (name == null || name.trim().isEmpty()) {
          failed += 1;
          continue;
        }

        Uri uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, id);
        String text = readUri(context, uri);
        if (text == null) {
          failed += 1;
          continue;
        }

        if (!migrated.contains(name)) {
          if (!DataVault.importSnapshot(context, text, modified)) {
            failed += 1;
            continue;
          }
          migrated.add(name);
        }

        try {
          int deleted = context.getContentResolver().delete(uri, null, null);
          if (deleted > 0) {
            moved += 1;
          } else {
            failed += 1;
          }
        } catch (Exception error) {
          failed += 1;
        }
      }
    }

    return new int[] {found, moved, failed};
  }

  private static String readUri(Context context, Uri uri) {
    try (InputStream input = context.getContentResolver().openInputStream(uri);
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      if (input == null) return null;
      return LegacyBackupMigration.readStream(input, output);
    } catch (Exception error) {
      return null;
    }
  }
}
