package ru.netla.attendance;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import java.util.zip.GZIPOutputStream;

/**
 * Надёжное хранилище данных приложения вне localStorage.
 *
 * <p>WebView может потерять localStorage при обновлении системы, очистке данных или сбое
 * хранилища. Поэтому каждая сохранённая версия дополнительно пишется в приватную папку
 * приложения: последняя копия, предыдущая версия и сжатые снимки по времени. При запуске
 * JavaScript сначала читает localStorage, а если тот пуст или повреждён — восстанавливает
 * данные отсюда.
 */
public final class DataVault {
  private static final String TAG = "AttendanceVault";
  private static final String CURRENT_FILE = "attendance-data.json";
  private static final String PREVIOUS_FILE = "attendance-data.prev.json";
  private static final String BACKUP_PREFIX = "attendance-backup-";
  private static final String BACKUP_SUFFIX = ".json.gz";
  private static final long BACKUP_INTERVAL_MS = 3L * 60L * 60L * 1000L;
  private static final long MAX_BACKUP_AGE_MS = 45L * 24L * 60L * 60L * 1000L;
  private static final int MAX_BACKUPS = 30;
  private static final int MAX_DATA_BYTES = 8 * 1024 * 1024;
  private static final Pattern BACKUP_NAME =
      Pattern.compile("^attendance-backup-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}\\.json\\.gz$");

  private DataVault() {}

  /**
   * Сохраняет данные. Возвращает false, только если данные некорректны или запись не удалась.
   *
   * @param forceBackup создать снимок, даже если последний был сделан недавно
   */
  public static synchronized boolean save(Context context, String json, boolean forceBackup) {
    JSONObject parsed = parseValid(json);
    if (parsed == null) {
      Log.w(TAG, "Отклонены данные: нет обязательных полей или повреждён JSON");
      return false;
    }
    String text = json.trim();

    try {
      File dir = vaultDir(context);
      File current = new File(dir, CURRENT_FILE);
      File previous = new File(dir, PREVIOUS_FILE);

      String existing = readText(current);
      if (text.equals(existing)) {
        if (forceBackup) {
          writeBackup(context, text, true);
          pruneBackups(context);
        }
        return true;
      }

      writeAtomic(current, text);
      if (existing != null && parseValid(existing) != null) {
        writeAtomic(previous, existing);
      }
      writeBackup(context, text, forceBackup);
      pruneBackups(context);
      return true;
    } catch (Exception error) {
      Log.e(TAG, "Не удалось сохранить копию данных", error);
      return false;
    }
  }

  /** Возвращает последнюю целую копию: текущую, предыдущую или самый свежий снимок. */
  public static synchronized String readLatest(Context context) {
    try {
      File dir = vaultDir(context);
      String current = readText(new File(dir, CURRENT_FILE));
      if (parseValid(current) != null) return current.trim();

      String previous = readText(new File(dir, PREVIOUS_FILE));
      if (parseValid(previous) != null) return previous.trim();

      for (File backup : listBackupFiles(context)) {
        String text = readGzip(backup);
        if (parseValid(text) != null) return text.trim();
      }
    } catch (Exception error) {
      Log.e(TAG, "Не удалось прочитать копию данных", error);
    }
    return "";
  }

  /** Сведения о хранилище в формате JSON для экрана настроек. */
  public static synchronized String info(Context context) {
    JSONObject result = new JSONObject();
    try {
      File dir = vaultDir(context);
      File current = new File(dir, CURRENT_FILE);
      File previous = new File(dir, PREVIOUS_FILE);
      String text = readText(current);
      JSONObject parsed = parseValid(text);

      result.put("available", parsed != null);
      result.put("savedAt", current.exists() ? current.lastModified() : 0);
      result.put("size", current.exists() ? current.length() : 0);
      result.put("previousSavedAt", previous.exists() ? previous.lastModified() : 0);
      result.put("backupCount", listBackupFiles(context).size());
      if (parsed != null) {
        JSONArray groups = parsed.optJSONArray("groups");
        JSONArray students = parsed.optJSONArray("students");
        JSONArray attendance = parsed.optJSONArray("attendance");
        result.put("groups", groups == null ? 0 : groups.length());
        result.put("students", students == null ? 0 : students.length());
        result.put("attendance", attendance == null ? 0 : attendance.length());
      }
    } catch (Exception error) {
      Log.w(TAG, "Не удалось прочитать сведения о хранилище", error);
    }
    return result.toString();
  }

  /** Список снимков, новые сначала. */
  public static synchronized String listBackups(Context context) {
    JSONArray result = new JSONArray();
    try {
      for (File file : listBackupFiles(context)) {
        JSONObject item = new JSONObject();
        item.put("name", file.getName());
        item.put("savedAt", file.lastModified());
        item.put("size", file.length());
        result.put(item);
      }
    } catch (Exception error) {
      Log.w(TAG, "Не удалось прочитать список снимков", error);
    }
    return result.toString();
  }

  /** Возвращает JSON выбранного снимка или пустую строку. */
  public static synchronized String readBackup(Context context, String name) {
    if (name == null || !BACKUP_NAME.matcher(name).matches()) return "";
    try {
      File file = new File(backupsDir(context), name);
      if (!file.exists()) return "";
      String text = readGzip(file);
      return parseValid(text) != null ? text.trim() : "";
    } catch (Exception error) {
      Log.w(TAG, "Не удалось прочитать снимок", error);
      return "";
    }
  }

  /** Удаляет старые снимки, сохраняя не больше {@link #MAX_BACKUPS} штук. */
  private static void pruneBackups(Context context) {
    List<File> backups = listBackupFiles(context);
    long cutoff = System.currentTimeMillis() - MAX_BACKUP_AGE_MS;
    for (int index = 0; index < backups.size(); index += 1) {
      File file = backups.get(index);
      if (index >= MAX_BACKUPS || file.lastModified() < cutoff) {
        if (!file.delete()) {
          Log.w(TAG, "Не удалось удалить старый снимок " + file.getName());
        }
      }
    }
  }

  private static void writeBackup(Context context, String text, boolean force) {
    try {
      List<File> backups = listBackupFiles(context);
      long newest = backups.isEmpty() ? 0 : backups.get(0).lastModified();
      long now = System.currentTimeMillis();
      if (!force && newest > 0 && now - newest < BACKUP_INTERVAL_MS) return;

      String stamp = formatTime(now);
      File target = new File(backupsDir(context), BACKUP_PREFIX + stamp + BACKUP_SUFFIX);
      writeGzipAtomic(target, text);
    } catch (Exception error) {
      Log.w(TAG, "Не удалось создать снимок данных", error);
    }
  }

  private static JSONObject parseValid(String text) {
    if (text == null) return null;
    String trimmed = text.trim();
    if (trimmed.isEmpty() || trimmed.length() > MAX_DATA_BYTES) return null;
    try {
      JSONObject object = new JSONObject(trimmed);
      JSONArray groups = object.optJSONArray("groups");
      if (groups == null || groups.length() == 0) return null;
      boolean hasNamedGroup = false;
      for (int index = 0; index < groups.length(); index += 1) {
        JSONObject group = groups.optJSONObject(index);
        if (group != null && !group.optString("name", "").trim().isEmpty()) {
          hasNamedGroup = true;
          break;
        }
      }
      if (!hasNamedGroup) return null;
      if (!(object.opt("students") instanceof JSONArray)) return null;
      if (!(object.opt("attendance") instanceof JSONArray)) return null;
      return object;
    } catch (Exception error) {
      return null;
    }
  }

  private static File vaultDir(Context context) throws IOException {
    File dir = new File(context.getFilesDir(), "data-vault");
    if (!dir.exists() && !dir.mkdirs()) {
      throw new IOException("Не удалось создать папку данных");
    }
    return dir;
  }

  private static File backupsDir(Context context) throws IOException {
    File dir = new File(vaultDir(context), "backups");
    if (!dir.exists() && !dir.mkdirs()) {
      throw new IOException("Не удалось создать папку снимков");
    }
    return dir;
  }

  private static List<File> listBackupFiles(Context context) {
    List<File> files = new ArrayList<>();
    try {
      File[] all = backupsDir(context).listFiles();
      if (all == null) return files;
      for (File file : all) {
        if (file.isFile() && BACKUP_NAME.matcher(file.getName()).matches()) {
          files.add(file);
        }
      }
    } catch (Exception error) {
      Log.w(TAG, "Не удалось перечислить снимки", error);
    }
    Collections.sort(
        files,
        new Comparator<File>() {
          @Override
          public int compare(File left, File right) {
            int byTime = Long.compare(right.lastModified(), left.lastModified());
            return byTime != 0 ? byTime : right.getName().compareTo(left.getName());
          }
        });
    return files;
  }

  private static String readText(File file) {
    if (file == null || !file.exists() || file.length() == 0 || file.length() > MAX_DATA_BYTES) {
      return null;
    }
    try (InputStream input = new FileInputStream(file);
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8 * 1024];
      int read;
      int total = 0;
      while ((read = input.read(buffer)) != -1) {
        total += read;
        if (total > MAX_DATA_BYTES) return null;
        output.write(buffer, 0, read);
      }
      return new String(output.toByteArray(), StandardCharsets.UTF_8);
    } catch (Exception error) {
      Log.w(TAG, "Не удалось прочитать " + file.getName(), error);
      return null;
    }
  }

  private static String readGzip(File file) {
    if (file == null || !file.exists() || file.length() == 0 || file.length() > MAX_DATA_BYTES) {
      return null;
    }
    try (InputStream input = new FileInputStream(file);
        GZIPInputStream gzip = new GZIPInputStream(input);
        ByteArrayOutputStream output = new ByteArrayOutputStream()) {
      byte[] buffer = new byte[8 * 1024];
      int read;
      int total = 0;
      while ((read = gzip.read(buffer)) != -1) {
        total += read;
        if (total > MAX_DATA_BYTES) return null;
        output.write(buffer, 0, read);
      }
      return new String(output.toByteArray(), StandardCharsets.UTF_8);
    } catch (Exception error) {
      Log.w(TAG, "Не удалось распаковать " + file.getName(), error);
      return null;
    }
  }

  private static void writeAtomic(File target, String text) throws Exception {
    File temp = new File(target.getParentFile(), target.getName() + ".tmp");
    byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
    try (FileOutputStream output = new FileOutputStream(temp)) {
      output.write(bytes);
      output.getFD().sync();
    }
    replaceFile(temp, target);
  }

  private static void writeGzipAtomic(File target, String text) throws Exception {
    File temp = new File(target.getParentFile(), target.getName() + ".tmp");
    byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
    try (FileOutputStream file = new FileOutputStream(temp);
        GZIPOutputStream gzip = new GZIPOutputStream(file)) {
      gzip.write(bytes);
      gzip.finish();
      file.getFD().sync();
    }
    replaceFile(temp, target);
  }

  private static void replaceFile(File temp, File target) throws Exception {
    if (target.exists() && !target.delete()) {
      if (!temp.delete()) {
        Log.w(TAG, "Не удалось удалить временный файл " + temp.getName());
      }
      throw new IOException("Не удалось заменить " + target.getName());
    }
    if (!temp.renameTo(target)) {
      try (InputStream input = new FileInputStream(temp);
          OutputStream output = new FileOutputStream(target)) {
        byte[] buffer = new byte[8 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
          output.write(buffer, 0, read);
        }
      }
      if (!temp.delete()) {
        Log.w(TAG, "Не удалось удалить временный файл " + temp.getName());
      }
    }
  }

  private static String formatTime(long timestamp) {
    return new SimpleDateFormat("yyyy-MM-dd_HH-mm-ss", Locale.US).format(new Date(timestamp));
  }
}
