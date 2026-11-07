package ru.netla.attendance;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * OTA-обновление APK без магазина приложений.
 *
 * Схема: приложение читает update.json по адресу из настроек, сравнивает versionCode,
 * скачивает APK во внутренний кэш, проверяет SHA-256, имя пакета, версию и подпись
 * установленного приложения, после чего передаёт файл системному PackageInstaller.
 */
public final class UpdateManager {
  private static final String TAG = "AttendanceUpdate";
  private static final String PREFS = "attendance_app";
  private static final String PREF_STATE = "update_state";
  private static final String PREF_LAST_CHECK = "update_last_check";
  public static final String ACTION_INSTALL_RESULT =
      "ru.netla.attendance.UPDATE_INSTALL_RESULT";

  private static final int MAX_MANIFEST_BYTES = 128 * 1024;
  private static final int CONNECT_TIMEOUT_MS = 15000;
  private static final int READ_TIMEOUT_MS = 30000;

  private static volatile boolean busy = false;
  private static volatile boolean installInProgress = false;

  public interface Listener {
    void onState(String json);
  }

  private UpdateManager() {}

  /** Возвращает текущее состояние в виде JSON для WebView. */
  public static String getState(Context context) {
    JSONObject state = readState(context);
    try {
      PackageInfo info = versionInfo(context);
      state.put("currentVersion", info.versionName);
      state.put("currentCode", info.versionCode);
      String current = state.optString("state", "idle");
      int targetCode = state.optInt("versionCode", 0);
      if ("checking".equals(current) || "downloading".equals(current)) {
        if (!busy) state.put("state", "idle");
      } else if ("installing".equals(current)) {
        if (!installInProgress || info.versionCode >= targetCode) {
          state.put("state", "idle");
        }
      }
    } catch (Exception error) {
      Log.w(TAG, "Не удалось прочитать версию приложения", error);
    }
    return state.toString();
  }

  /** Версия установленного APK в виде JSON. */
  public static String getVersionJson(Context context) {
    JSONObject result = new JSONObject();
    try {
      PackageInfo info = versionInfo(context);
      result.put("versionName", info.versionName);
      result.put("versionCode", info.versionCode);
      result.put("packageName", context.getPackageName());
    } catch (Exception error) {
      try {
        result.put("versionName", "");
        result.put("versionCode", 0);
      } catch (Exception ignored) {
        // Даже пустой ответ не должен ронять мост.
      }
    }
    return result.toString();
  }

  /** Проверяет update.json и сравнивает версию с установленной. */
  public static void check(Context context, String manifestUrl, Listener listener) {
    if (busy) {
      emit(listener, getState(context));
      return;
    }
    if (!isHttpUrl(manifestUrl)) {
      setError(context, "Адрес update.json должен начинаться с http:// или https://", listener);
      return;
    }

    final Context appContext = context.getApplicationContext();
    busy = true;
    JSONObject checking = baseState(appContext);
    try {
      checking.put("state", "checking");
      checking.put("manifestUrl", manifestUrl.trim());
    } catch (Exception ignored) {
      // Поля состояния не критичны.
    }
    persist(appContext, checking, listener);

    new Thread(
            () -> {
              try {
                JSONObject manifest = fetchManifest(manifestUrl.trim());
                int versionCode = manifest.optInt("versionCode", -1);
                String versionName = manifest.optString("versionName", "").trim();
                String apkUrlRaw = manifest.optString("apkUrl", "").trim();
                String sha256 = normalizeSha256(manifest.optString("sha256", ""));
                long size = manifest.optLong("size", 0);
                String notes = manifest.optString("notes", "").trim();

                if (versionCode <= 0) {
                  throw new IllegalArgumentException("В update.json нет корректного versionCode");
                }
                if (versionName.isEmpty()) {
                  throw new IllegalArgumentException("В update.json нет versionName");
                }
                if (apkUrlRaw.isEmpty()) {
                  throw new IllegalArgumentException("В update.json нет apkUrl");
                }
                if (sha256.length() != 64) {
                  throw new IllegalArgumentException("В update.json нет корректного SHA-256");
                }

                URL manifestBase = new URL(manifestUrl.trim());
                URL apkUrl = new URL(manifestBase, apkUrlRaw);
                if (!isHttpUrl(apkUrl.toString())) {
                  throw new IllegalArgumentException("Ссылка на APK должна быть http:// или https://");
                }

                PackageInfo current = versionInfo(appContext);
                JSONObject state = baseState(appContext);
                state.put("manifestUrl", manifestUrl.trim());
                state.put("versionName", versionName);
                state.put("versionCode", versionCode);
                state.put("apkUrl", apkUrl.toString());
                state.put("sha256", sha256);
                state.put("size", size);
                state.put("notes", notes);
                state.put("checkedAt", System.currentTimeMillis());
                state.put(
                    "state", versionCode > current.versionCode ? "available" : "uptodate");

                appContext
                    .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(PREF_LAST_CHECK, System.currentTimeMillis())
                    .apply();
                persist(appContext, state, listener);
              } catch (Exception error) {
                setError(appContext, readableError(error), listener);
              } finally {
                busy = false;
              }
            },
            "attendance-update-check")
        .start();
  }

  /** Скачивает APK из состояния available и проверяет его. */
  public static void download(Context context, boolean installAfterDownload, Listener listener) {
    if (busy) {
      emit(listener, getState(context));
      return;
    }
    final Context appContext = context.getApplicationContext();
    JSONObject state = readState(appContext);
    String apkUrl = state.optString("apkUrl", "");
    String expectedSha = normalizeSha256(state.optString("sha256", ""));
    int expectedCode = state.optInt("versionCode", 0);
    String versionName = state.optString("versionName", "");

    if (apkUrl.isEmpty() || expectedSha.length() != 64 || expectedCode <= 0) {
      setError(appContext, "Сначала проверьте обновление: нет данных о новой версии", listener);
      return;
    }
    if ("ready".equals(state.optString("state"))) {
      if (installAfterDownload) install(appContext, listener);
      else emit(listener, getState(appContext));
      return;
    }

    busy = true;
    JSONObject downloading = baseState(appContext);
    try {
      downloading.put("state", "downloading");
      downloading.put("versionName", versionName);
      downloading.put("versionCode", expectedCode);
      downloading.put("apkUrl", apkUrl);
      downloading.put("sha256", expectedSha);
      downloading.put("size", state.optLong("size", 0));
      downloading.put("notes", state.optString("notes", ""));
      downloading.put("progress", 0);
    } catch (Exception ignored) {
      // Поля состояния не критичны.
    }
    persist(appContext, downloading, listener);

    new Thread(
            () -> {
              File temp = null;
              try {
                File dir = new File(appContext.getCacheDir(), "update");
                if (!dir.exists() && !dir.mkdirs()) {
                  throw new IllegalStateException("Не удалось создать папку обновления");
                }
                File target = new File(dir, "update.apk");
                temp = new File(dir, "update.apk.part");
                if (temp.exists() && !temp.delete()) {
                  throw new IllegalStateException("Не удалось удалить старый файл обновления");
                }

                HttpURLConnection connection = openConnection(apkUrl);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                  throw new IllegalStateException("Сервер вернул HTTP " + status);
                }
                long total = connection.getContentLengthLong();
                if (total <= 0) total = state.optLong("size", 0);

                byte[] buffer = new byte[16 * 1024];
                long downloaded = 0;
                long lastProgressAt = 0;
                int lastProgress = -1;
                try (InputStream input =
                        new BufferedInputStream(connection.getInputStream());
                    OutputStream output = new FileOutputStream(temp)) {
                  int read;
                  while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    downloaded += read;
                    long now = System.currentTimeMillis();
                    int progress =
                        total > 0
                            ? (int) Math.min(99, downloaded * 100 / total)
                            : -1;
                    if (progress >= 0
                        && progress != lastProgress
                        && (progress >= lastProgress + 2 || now - lastProgressAt > 300)) {
                      lastProgress = progress;
                      lastProgressAt = now;
                      emitProgress(appContext, downloading, progress, listener);
                    }
                  }
                } finally {
                  connection.disconnect();
                }

                String actualSha = sha256(temp);
                if (!expectedSha.equals(actualSha)) {
                  throw new SecurityException(
                      "SHA-256 не совпадает. Файл повреждён или подменён.");
                }

                verifyApk(appContext, temp, expectedCode);
                if (target.exists() && !target.delete()) {
                  throw new IllegalStateException("Не удалось заменить старый APK");
                }
                if (!temp.renameTo(target)) {
                  copyFile(temp, target);
                  if (!temp.delete()) {
                    Log.w(TAG, "Не удалось удалить временный APK");
                  }
                }

                JSONObject ready = baseState(appContext);
                ready.put("state", "ready");
                ready.put("versionName", versionName);
                ready.put("versionCode", expectedCode);
                ready.put("apkUrl", apkUrl);
                ready.put("sha256", expectedSha);
                ready.put("size", target.length());
                ready.put("notes", state.optString("notes", ""));
                ready.put("progress", 100);
                persist(appContext, ready, listener);
                busy = false;
                if (installAfterDownload) install(appContext, listener);
              } catch (Exception error) {
                if (temp != null && temp.exists() && !temp.delete()) {
                  Log.w(TAG, "Не удалось удалить недокачанный APK");
                }
                setError(appContext, readableError(error), listener);
              } finally {
                busy = false;
              }
            },
            "attendance-update-download")
        .start();
  }

  /** Запускает системный установщик для уже проверенного APK. */
  public static void install(Context context, Listener listener) {
    final Context appContext = context.getApplicationContext();
    JSONObject state = readState(appContext);
    if (!"ready".equals(state.optString("state"))) {
      setError(appContext, "Сначала скачайте обновление", listener);
      return;
    }
    File apk = new File(new File(appContext.getCacheDir(), "update"), "update.apk");
    if (!apk.exists() || apk.length() == 0) {
      setError(appContext, "Файл обновления не найден. Скачайте его заново.", listener);
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
        && !appContext.getPackageManager().canRequestPackageInstalls()) {
      JSONObject permission = baseState(appContext);
      try {
        permission.put("state", "need_permission");
        permission.put("versionName", state.optString("versionName", ""));
        permission.put("versionCode", state.optInt("versionCode", 0));
        permission.put("apkUrl", state.optString("apkUrl", ""));
        permission.put("sha256", state.optString("sha256", ""));
        permission.put("size", apk.length());
        permission.put("notes", state.optString("notes", ""));
        permission.put("progress", 100);
      } catch (Exception ignored) {
        // Поля состояния не критичны.
      }
      persist(appContext, permission, listener);
      return;
    }

    try {
      PackageInstaller installer = appContext.getPackageManager().getPackageInstaller();
      PackageInstaller.SessionParams params =
          new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
      params.setAppPackageName(appContext.getPackageName());
      int sessionId = installer.createSession(params);
      PackageInstaller.Session session = installer.openSession(sessionId);
      try (InputStream input = new FileInputStream(apk);
          OutputStream output = session.openWrite("base.apk", 0, apk.length())) {
        byte[] buffer = new byte[16 * 1024];
        int read;
        while ((read = input.read(buffer)) != -1) {
          output.write(buffer, 0, read);
        }
        session.fsync(output);
      } finally {
        session.close();
      }

      Intent result = new Intent(appContext, UpdateInstallReceiver.class);
      result.setAction(ACTION_INSTALL_RESULT);
      int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        pendingFlags |= PendingIntent.FLAG_MUTABLE;
      }
      PendingIntent pendingIntent =
          PendingIntent.getBroadcast(appContext, sessionId, result, pendingFlags);

      JSONObject installing = baseState(appContext);
      installing.put("state", "installing");
      installing.put("versionName", state.optString("versionName", ""));
      installing.put("versionCode", state.optInt("versionCode", 0));
      installing.put("apkUrl", state.optString("apkUrl", ""));
      installing.put("sha256", state.optString("sha256", ""));
      installing.put("size", apk.length());
      installing.put("notes", state.optString("notes", ""));
      installing.put("progress", 100);
      installInProgress = true;
      persist(appContext, installing, listener);
      session.commit(pendingIntent.getIntentSender());
    } catch (Exception error) {
      installInProgress = false;
      setError(appContext, "Не удалось запустить установщик: " + readableError(error), listener);
    }
  }

  /** Открывает системную настройку «Установка неизвестных приложений». */
  public static void openInstallPermission(Context context) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Intent intent =
            new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
      }
    } catch (Exception error) {
      Log.w(TAG, "Не удалось открыть настройку установки", error);
    }
  }

  public static void onInstallSuccess(Context context) {
    installInProgress = false;
    try {
      PackageInfo info = versionInfo(context);
      JSONObject state = baseState(context);
      state.put("state", "installed");
      state.put("versionName", info.versionName);
      state.put("versionCode", info.versionCode);
      persist(context, state, null);
    } catch (Exception ignored) {
      // Состояние обновится при следующем запуске.
    }
  }

  public static void setError(Context context, String message) {
    setError(context, message, null);
  }

  private static void setError(Context context, String message, Listener listener) {
    installInProgress = false;
    JSONObject state = baseState(context);
    try {
      state.put("state", "error");
      state.put("error", message == null || message.trim().isEmpty() ? "Неизвестная ошибка" : message);
    } catch (Exception ignored) {
      // Поля состояния не критичны.
    }
    persist(context, state, listener);
  }

  private static void emitProgress(
      Context context, JSONObject state, int progress, Listener listener) {
    try {
      state.put("progress", Math.max(0, Math.min(100, progress)));
    } catch (Exception ignored) {
      // Прогресс не критичен.
    }
    persist(context, state, listener);
  }

  private static void verifyApk(Context context, File apk, int expectedCode) throws Exception {
    PackageManager manager = context.getPackageManager();
    int flags = PackageManager.GET_SIGNATURES;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      flags |= PackageManager.GET_SIGNING_CERTIFICATES;
    }

    PackageInfo archive = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
    if (archive == null || archive.applicationInfo == null) {
      throw new SecurityException("Скачанный файл не является APK");
    }
    if (!context.getPackageName().equals(archive.packageName)) {
      throw new SecurityException("APK принадлежит другому приложению");
    }
    if (archive.versionCode != expectedCode) {
      throw new SecurityException(
          "Версия в APK (" + archive.versionCode + ") не совпадает с update.json ("
              + expectedCode + ")");
    }

    PackageInfo installed = manager.getPackageInfo(context.getPackageName(), flags);
    String installedSign = signatureHash(installed);
    String archiveSign = signatureHash(archive);
    if (installedSign == null || archiveSign == null || !installedSign.equals(archiveSign)) {
      throw new SecurityException("Подпись APK не совпадает с установленным приложением");
    }
  }

  private static String signatureHash(PackageInfo info) throws Exception {
    byte[] certificate = firstCertificate(info);
    if (certificate == null) return null;
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    return toHex(digest.digest(certificate));
  }

  @SuppressWarnings("deprecation")
  private static byte[] firstCertificate(PackageInfo info) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
      Signature[] signatures =
          info.signingInfo.hasMultipleSigners()
              ? info.signingInfo.getApkContentsSigners()
              : info.signingInfo.getSigningCertificateHistory();
      if (signatures != null && signatures.length > 0) {
        return signatures[0].toByteArray();
      }
    }
    if (info.signatures != null && info.signatures.length > 0) {
      return info.signatures[0].toByteArray();
    }
    return null;
  }

  private static PackageInfo versionInfo(Context context) throws Exception {
    return context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
  }

  private static JSONObject fetchManifest(String manifestUrl) throws Exception {
    HttpURLConnection connection = openConnection(manifestUrl);
    try {
      int status = connection.getResponseCode();
      if (status < 200 || status >= 300) {
        throw new IllegalStateException("Сервер вернул HTTP " + status);
      }
      try (InputStream input = new BufferedInputStream(connection.getInputStream());
          ByteArrayOutputStream output = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[8 * 1024];
        int read;
        int total = 0;
        while ((read = input.read(buffer)) != -1) {
          total += read;
          if (total > MAX_MANIFEST_BYTES) {
            throw new IllegalStateException("update.json слишком большой");
          }
          output.write(buffer, 0, read);
        }
        String text = new String(output.toByteArray(), StandardCharsets.UTF_8);
        return new JSONObject(text);
      }
    } finally {
      connection.disconnect();
    }
  }

  private static HttpURLConnection openConnection(String url) throws Exception {
    HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
    connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
    connection.setReadTimeout(READ_TIMEOUT_MS);
    connection.setInstanceFollowRedirects(true);
    connection.setRequestProperty("Accept", "application/json, application/octet-stream");
    connection.setRequestProperty("Cache-Control", "no-cache");
    connection.setRequestProperty("User-Agent", "AttendanceApp-OTA");
    return connection;
  }

  private static JSONObject baseState(Context context) {
    JSONObject state = new JSONObject();
    try {
      PackageInfo info = versionInfo(context);
      state.put("state", "idle");
      state.put("currentVersion", info.versionName);
      state.put("currentCode", info.versionCode);
    } catch (Exception error) {
      try {
        state.put("state", "idle");
      } catch (Exception ignored) {
        // Состояние всё равно вернётся как строка.
      }
    }
    return state;
  }

  private static JSONObject readState(Context context) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String raw = prefs.getString(PREF_STATE, "");
    if (raw != null && !raw.trim().isEmpty()) {
      try {
        JSONObject parsed = new JSONObject(raw);
        if (parsed.has("state")) return parsed;
      } catch (Exception ignored) {
        // Повреждённое состояние заменяем начальным.
      }
    }
    return baseState(context);
  }

  private static void persist(Context context, JSONObject state, Listener listener) {
    String json = state.toString();
    context
        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(PREF_STATE, json)
        .apply();
    emit(listener, json);
  }

  private static void emit(Listener listener, String json) {
    if (listener != null) listener.onState(json);
  }

  private static boolean isHttpUrl(String value) {
    if (value == null) return false;
    String trimmed = value.trim().toLowerCase(Locale.ROOT);
    return trimmed.startsWith("http://") || trimmed.startsWith("https://");
  }

  private static String normalizeSha256(String value) {
    if (value == null) return "";
    return value.trim().toLowerCase(Locale.ROOT).replace(" ", "");
  }

  private static String sha256(File file) throws Exception {
    MessageDigest digest = MessageDigest.getInstance("SHA-256");
    try (InputStream input = new FileInputStream(file)) {
      byte[] buffer = new byte[16 * 1024];
      int read;
      while ((read = input.read(buffer)) != -1) {
        digest.update(buffer, 0, read);
      }
    }
    return toHex(digest.digest());
  }

  private static String toHex(byte[] bytes) {
    StringBuilder builder = new StringBuilder(bytes.length * 2);
    for (byte value : bytes) {
      builder.append(String.format(Locale.ROOT, "%02x", value & 0xff));
    }
    return builder.toString();
  }

  private static void copyFile(File source, File target) throws Exception {
    try (InputStream input = new FileInputStream(source);
        OutputStream output = new FileOutputStream(target)) {
      byte[] buffer = new byte[16 * 1024];
      int read;
      while ((read = input.read(buffer)) != -1) {
        output.write(buffer, 0, read);
      }
    }
  }

  private static String readableError(Exception error) {
    String message = error.getMessage();
    if (message == null || message.trim().isEmpty()) {
      message = error.getClass().getSimpleName();
    }
    if (error instanceof java.net.SocketTimeoutException) {
      return "Сервер не ответил вовремя. Проверьте адрес и подключение к сети.";
    }
    if (error instanceof java.net.UnknownHostException) {
      return "Не удалось найти сервер обновлений. Проверьте адрес update.json.";
    }
    if (error instanceof javax.net.ssl.SSLException) {
      return "Ошибка HTTPS: " + message;
    }
    return message;
  }
}
