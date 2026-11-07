package ru.netla.attendance;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Vibrator;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
  private static final String TAG = "AttendanceWeb";
  private static final int FILE_CHOOSER_REQUEST = 1001;
  private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
  private static final String CHANNEL_ID = "reminders";
  private static final String PREFS = "attendance_app";
  private static final String PREF_NOTIFICATION_ASKED = "notification_asked";
  private static final String PREF_SYSTEM_BG = "system_bar_background";
  private static final String PREF_SYSTEM_DARK = "system_bar_dark";

  private WebView webView;
  private ValueCallback<Uri[]> fileChooserCallback;

  @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    webView = new WebView(this);
    webView.setBackgroundColor(0xFFF3F5FB);
    setContentView(webView);
    setupSystemBars();

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setAllowFileAccessFromFileURLs(true);
    settings.setAllowUniversalAccessFromFileURLs(true);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setSupportZoom(false);
    settings.setTextZoom(100);
    settings.setMediaPlaybackRequiresUserGesture(false);
    settings.setJavaScriptCanOpenWindowsAutomatically(false);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      settings.setForceDark(WebSettings.FORCE_DARK_OFF);
    }

    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
    webView.addJavascriptInterface(new AndroidBridge(), "AndroidApp");

    webView.setWebViewClient(
        new WebViewClient() {
          @Override
          public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url.startsWith("file://")) return false;
            if (url.startsWith("http://") || url.startsWith("https://")) {
              try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
              } catch (Exception ignored) {
                // РќРµС‚ РїСЂРёР»РѕР¶РµРЅРёСЏ, РєРѕС‚РѕСЂРѕРµ РјРѕР¶РµС‚ РѕС‚РєСЂС‹С‚СЊ СЃСЃС‹Р»РєСѓ.
              }
            }
            return true;
          }

          @Override
          public void onPageFinished(WebView view, String url) {
            injectBackHandler(view);
          }
        });

    webView.setWebChromeClient(
        new WebChromeClient() {
          @Override
          public boolean onShowFileChooser(
              WebView view,
              ValueCallback<Uri[]> filePathCallback,
              FileChooserParams fileChooserParams) {
            if (fileChooserCallback != null) {
              fileChooserCallback.onReceiveValue(null);
            }
            fileChooserCallback = filePathCallback;
            try {
              Intent intent = fileChooserParams.createIntent();
              startActivityForResult(intent, FILE_CHOOSER_REQUEST);
              return true;
            } catch (Exception error) {
              fileChooserCallback = null;
              Toast.makeText(
                      MainActivity.this,
                      "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РІС‹Р±РѕСЂ С„Р°Р№Р»Р°",
                      Toast.LENGTH_SHORT)
                  .show();
              return false;
            }
          }

          @Override
          public boolean onConsoleMessage(ConsoleMessage message) {
            Log.d(TAG, message.message() + " @" + message.sourceId() + ":" + message.lineNumber());
            return true;
          }
        });

    requestNotificationPermissionIfNeeded();
    webView.loadUrl("file:///android_asset/www/index.html");
  }

  private void setupSystemBars() {
    SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
    String background = prefs.getString(PREF_SYSTEM_BG, "#F3F5FB");
    boolean dark = prefs.getBoolean(PREF_SYSTEM_DARK, false);
    applySystemBars(background, dark);
  }

  /** РљСЂР°СЃРёС‚ СЃРёСЃС‚РµРјРЅС‹Рµ РїР°РЅРµР»Рё РІ С„РѕРЅ С‚РµРєСѓС‰РµР№ С‚РµРјС‹, С‡С‚РѕР±С‹ РЅРµ Р±С‹Р»Рѕ Р±РµР»С‹С… РїРѕР»РѕСЃ. */
  private void applySystemBars(String background, boolean dark) {
    try {
      int color;
      try {
        color = Color.parseColor(background == null ? "" : background.trim());
      } catch (Exception error) {
        color = dark ? 0xFF0B1120 : 0xFFF3F5FB;
      }

      Window window = getWindow();
      window.setStatusBarColor(color);
      window.setNavigationBarColor(color);
      if (webView != null) webView.setBackgroundColor(color);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowInsetsController controller = window.getInsetsController();
        if (controller != null) {
          int mask =
              WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                  | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
          controller.setSystemBarsAppearance(dark ? 0 : mask, mask);
        }
      } else {
        View decor = window.getDecorView();
        int flags = decor.getSystemUiVisibility();
        int lightFlags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          lightFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        flags = dark ? (flags & ~lightFlags) : (flags | lightFlags);
        decor.setSystemUiVisibility(flags);
      }
    } catch (Exception ignored) {
      // РћС„РѕСЂРјР»РµРЅРёРµ СЃРёСЃС‚РµРјРЅС‹С… РїР°РЅРµР»РµР№ РЅРµ РєСЂРёС‚РёС‡РЅРѕ РґР»СЏ СЂР°Р±РѕС‚С‹ РїСЂРёР»РѕР¶РµРЅРёСЏ.
    }
  }

  private void injectBackHandler(WebView view) {
    String script =
        "(function(){"
            + "if(!window.__androidBack){window.__androidBack=function(){"
            + "try{"
            + "var back=document.querySelector('[aria-label=\"РќР°Р·Р°Рґ\"]');"
            + "if(back){back.click();return true;}"
            + "var items=Array.prototype.slice.call(document.querySelectorAll('.bottom-nav-item'));"
            + "var home=items.filter(function(el){return (el.textContent||'').indexOf('Р“Р»Р°РІРЅР°СЏ')>=0;})[0];"
            + "if(home&&!home.classList.contains('is-active')){home.click();return true;}"
            + "return false;"
            + "}catch(e){return false;}"
            + "};}"
            + "})();";
    view.evaluateJavascript(script, null);
  }

  private void requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT >= 33) {
      if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
          != PackageManager.PERMISSION_GRANTED) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!prefs.getBoolean(PREF_NOTIFICATION_ASKED, false)) {
          prefs.edit().putBoolean(PREF_NOTIFICATION_ASKED, true).apply();
          requestPermissions(
              new String[] {android.Manifest.permission.POST_NOTIFICATIONS},
              NOTIFICATION_PERMISSION_REQUEST);
        }
      }
    }
  }

  private String notificationPermissionState() {
    if (Build.VERSION.SDK_INT < 33) return "granted";
    if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
        == PackageManager.PERMISSION_GRANTED) {
      return "granted";
    }
    SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
    return prefs.getBoolean(PREF_NOTIFICATION_ASKED, false) ? "denied" : "default";
  }

  @Override
  public void onBackPressed() {
    if (webView == null) {
      super.onBackPressed();
      return;
    }
    webView.evaluateJavascript(
        "(function(){try{if(window.__androidBack){return window.__androidBack();}return false;}catch(e){return false;}})()",
        value -> {
          if (!"true".equals(value)) {
            finish();
          }
        });
  }

  @Override
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == FILE_CHOOSER_REQUEST) {
      if (fileChooserCallback != null) {
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
          if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            result = new Uri[count];
            for (int i = 0; i < count; i += 1) {
              result[i] = data.getClipData().getItemAt(i).getUri();
            }
          } else if (data.getData() != null) {
            result = new Uri[] {data.getData()};
          }
        }
        fileChooserCallback.onReceiveValue(result);
        fileChooserCallback = null;
      }
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  @Override
  protected void onDestroy() {
    if (webView != null) {
      webView.removeJavascriptInterface("AndroidApp");
      webView.destroy();
      webView = null;
    }
    super.onDestroy();
  }

  private class AndroidBridge {
    @JavascriptInterface
    public void saveFile(String filename, String mime, String content) {
      saveTextFile(filename, mime, content);
    }

    @JavascriptInterface
    public void shareFile(String filename, String mime, String content) {
      shareTextFile(filename, mime, content);
    }

    @JavascriptInterface
    public void notify(String title, String body) {
      showNotification(title, body);
    }

    /** РЎРѕС…СЂР°РЅСЏРµС‚ РЅР°СЃС‚СЂРѕР№РєРё РЅР°РїРѕРјРёРЅР°РЅРёР№ Рё РїР»Р°РЅРёСЂСѓРµС‚ СЃРёСЃС‚РµРјРЅС‹Рµ Р±СѓРґРёР»СЊРЅРёРєРё Android. */
    @JavascriptInterface
    public void scheduleReminders(
        boolean enabled, String timesJson, String weekdaysJson, String groupName) {
      ReminderScheduler.saveAndSchedule(
          getApplicationContext(), enabled, timesJson, weekdaysJson, groupName);
    }

    /** РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµС‚ С†РІРµС‚ СЃС‚Р°С‚СѓСЃ-Р±Р°СЂР° Рё РїР°РЅРµР»Рё РЅР°РІРёРіР°С†РёРё СЃ С‚РµРјРѕР№ РїСЂРёР»РѕР¶РµРЅРёСЏ. */
    @JavascriptInterface
    public void setSystemBars(String background, boolean dark) {
      runOnUiThread(
          () -> {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            prefs
                .edit()
                .putString(PREF_SYSTEM_BG, background)
                .putBoolean(PREF_SYSTEM_DARK, dark)
                .apply();
            applySystemBars(background, dark);
          });
    }

    @JavascriptInterface
    public void printPage() {
      runOnUiThread(
          () -> {
            if (webView == null) return;
            try {
              PrintManager printManager = (PrintManager) getSystemService(PRINT_SERVICE);
              String jobName = "Р’РµРґРѕРјРѕСЃС‚СЊ РїРѕСЃРµС‰Р°РµРјРѕСЃС‚Рё";
              PrintAttributes attributes =
                  new PrintAttributes.Builder()
                      .setMediaSize(PrintAttributes.MediaSize.ISO_A4.asLandscape())
                      .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                      .build();
              printManager.print(
                  jobName, webView.createPrintDocumentAdapter(jobName), attributes);
            } catch (Exception error) {
              Toast.makeText(
                      MainActivity.this,
                      "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РєСЂС‹С‚СЊ РїРµС‡Р°С‚СЊ: " + error.getMessage(),
                      Toast.LENGTH_LONG)
                  .show();
            }
          });
    }

    @JavascriptInterface
    public String notificationPermission() {
      return notificationPermissionState();
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
      runOnUiThread(
          () -> {
            if (Build.VERSION.SDK_INT >= 33) {
              SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
              prefs.edit().putBoolean(PREF_NOTIFICATION_ASKED, true).apply();
              if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                  != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                    new String[] {android.Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST);
              }
            }
          });
    }

    /** РљРѕСЂРѕС‚РєР°СЏ РІРёР±СЂР°С†РёСЏ РґР»СЏ С‚Р°РєС‚РёР»СЊРЅРѕРіРѕ РѕС‚РєР»РёРєР° РїРµСЂРµС‚Р°СЃРєРёРІР°РЅРёСЏ РЅРёР¶РЅРµРіРѕ РјРµРЅСЋ. */
    @JavascriptInterface
    public void vibrate(int milliseconds) {
      try {
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
          vibrator.vibrate(Math.max(1, Math.min(40, milliseconds)));
        }
      } catch (Exception ignored) {
        // Р’РёР±СЂР°С†РёСЏ РЅРµ РєСЂРёС‚РёС‡РЅР°.
      }
    }

    @JavascriptInterface
    public String getAppVersion() {
      return UpdateManager.getVersionJson(getApplicationContext());
    }

    @JavascriptInterface
    public String getUpdateState() {
      return UpdateManager.getState(getApplicationContext());
    }

    @JavascriptInterface
    public void checkUpdate(String manifestUrl) {
      UpdateManager.check(getApplicationContext(), manifestUrl, MainActivity.this::emitOtaState);
    }

    @JavascriptInterface
    public void downloadUpdate(boolean installAfterDownload) {
      UpdateManager.download(
          getApplicationContext(), installAfterDownload, MainActivity.this::emitOtaState);
    }

    @JavascriptInterface
    public void installUpdate() {
      runOnUiThread(
          () -> UpdateManager.install(getApplicationContext(), MainActivity.this::emitOtaState));
    }

    @JavascriptInterface
    public void openUpdatePermission() {
      runOnUiThread(
          () -> UpdateManager.openInstallPermission(getApplicationContext()));
    }
  }

  /** РџРµСЂРµРґР°С‘С‚ СЃРѕСЃС‚РѕСЏРЅРёРµ OTA-Р·Р°РіСЂСѓР·С‡РёРєР° РІ JavaScript. */
  private void emitOtaState(String json) {
    runOnUiThread(
        () -> {
          if (webView == null) return;
          String quoted = JSONObject.quote(json == null ? "{}" : json);
          webView.evaluateJavascript(
              "window.__onOtaEvent && window.__onOtaEvent(" + quoted + ");", null);
        });
  }

  private void shareTextFile(String filename, String mime, String content) {
    runOnUiThread(
        () -> {
          try {
            String safeName =
                filename == null || filename.trim().isEmpty()
                    ? "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ.csv"
                    : filename.replaceAll("[\\\\/:*?\"<>|]", "_");
            String safeMime =
                mime == null || mime.trim().isEmpty() ? "text/csv" : mime;
            File dir = new File(getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) {
              throw new IllegalStateException("РЅРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїР°РїРєСѓ");
            }
            File file = new File(dir, safeName);
            byte[] bytes =
                content == null ? new byte[0] : content.getBytes(StandardCharsets.UTF_8);
            try (FileOutputStream out = new FileOutputStream(file)) {
              out.write(bytes);
            }

            Uri uri = ReportFileProvider.uriFor(safeName);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(safeMime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, safeName);
            send.setClipData(ClipData.newRawUri(safeName, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(send, "РћС‚РїСЂР°РІРёС‚СЊ РѕС‚С‡С‘С‚");
            chooser.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(chooser);
          } catch (Exception error) {
            Toast.makeText(
                    MainActivity.this,
                    "РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ С„Р°Р№Р»: " + error.getMessage(),
                    Toast.LENGTH_LONG)
                .show();
          }
        });
  }

  private void saveTextFile(String filename, String mime, String content) {
    runOnUiThread(
        () -> {
          String safeName =
              filename == null || filename.trim().isEmpty()
                  ? "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ.txt"
                  : filename.replaceAll("[\\\\/:*?\"<>|]", "_");
          String safeMime = mime == null || mime.trim().isEmpty() ? "text/plain" : mime;
          byte[] bytes =
              content == null ? new byte[0] : content.getBytes(StandardCharsets.UTF_8);
          try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
              ContentValues values = new ContentValues();
              values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
              values.put(MediaStore.MediaColumns.MIME_TYPE, safeMime);
              values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
              Uri uri =
                  getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
              if (uri == null) throw new IllegalStateException("РЅРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ С„Р°Р№Р»");
              try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("РЅРµС‚ РґРѕСЃС‚СѓРїР° Рє С„Р°Р№Р»Сѓ");
                out.write(bytes);
              }
              Toast.makeText(
                      this, "РЎРѕС…СЂР°РЅРµРЅРѕ РІ В«Р—Р°РіСЂСѓР·РєРёВ»: " + safeName, Toast.LENGTH_LONG)
                  .show();
            } else {
              File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
              if (dir == null) dir = getFilesDir();
              if (!dir.exists() && !dir.mkdirs()) {
                throw new IllegalStateException("РЅРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїР°РїРєСѓ");
              }
              File file = new File(dir, safeName);
              try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
              }
              Toast.makeText(this, "РЎРѕС…СЂР°РЅРµРЅРѕ: " + file.getAbsolutePath(), Toast.LENGTH_LONG)
                  .show();
            }
          } catch (Exception error) {
            Toast.makeText(
                    this,
                    "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ С„Р°Р№Р»: " + error.getMessage(),
                    Toast.LENGTH_LONG)
                .show();
          }
        });
  }

  private void showNotification(String title, String body) {
    runOnUiThread(
        () -> {
          if (Build.VERSION.SDK_INT >= 33
              && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                  != PackageManager.PERMISSION_GRANTED) {
            return;
          }
          NotificationManager manager =
              (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel =
                new NotificationChannel(
                    CHANNEL_ID, "РќР°РїРѕРјРёРЅР°РЅРёСЏ", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("РќР°РїРѕРјРёРЅР°РЅРёСЏ РѕС‚РјРµС‚РёС‚СЊ РїРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ");
            manager.createNotificationChannel(channel);
          }
          Intent intent = new Intent(MainActivity.this, MainActivity.class);
          intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
          PendingIntent pendingIntent =
              PendingIntent.getActivity(
                  MainActivity.this,
                  0,
                  intent,
                  PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
          Notification.Builder builder =
              Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                  ? new Notification.Builder(MainActivity.this, CHANNEL_ID)
                  : new Notification.Builder(MainActivity.this);
          builder
              .setSmallIcon(android.R.drawable.ic_dialog_info)
              .setContentTitle(title == null ? "РџРѕСЃРµС‰Р°РµРјРѕСЃС‚СЊ" : title)
              .setContentText(body == null ? "" : body)
              .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
              .setContentIntent(pendingIntent)
              .setAutoCancel(true);
          manager.notify(1001, builder.build());
        });
  }
}
