package ru.netla.attendance;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.util.Locale;

/** Отдаёт файл отчёта приложениям, выбранным в системном диалоге «Поделиться». */
public class ReportFileProvider extends ContentProvider {
  public static final String AUTHORITY = "ru.netla.attendance.files";

  public static Uri uriFor(String filename) {
    return new Uri.Builder()
        .scheme("content")
        .authority(AUTHORITY)
        .appendPath(filename)
        .build();
  }

  private File fileFor(Uri uri) {
    Context context = getContext();
    if (context == null) return null;
    String name = uri.getLastPathSegment();
    if (name == null || name.contains("/") || name.contains("..")) return null;
    File dir = new File(context.getCacheDir(), "share");
    return new File(dir, name);
  }

  @Override
  public boolean onCreate() {
    return true;
  }

  @Override
  public Cursor query(
      Uri uri,
      String[] projection,
      String selection,
      String[] selectionArgs,
      String sortOrder) {
    File file = fileFor(uri);
    if (file == null || !file.exists()) return null;
    String[] columns =
        projection != null
            ? projection
            : new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
    MatrixCursor cursor = new MatrixCursor(columns, 1);
    Object[] row = new Object[columns.length];
    for (int index = 0; index < columns.length; index++) {
      if (OpenableColumns.DISPLAY_NAME.equals(columns[index])) {
        row[index] = file.getName();
      } else if (OpenableColumns.SIZE.equals(columns[index])) {
        row[index] = file.length();
      } else {
        row[index] = null;
      }
    }
    cursor.addRow(row);
    return cursor;
  }

  @Override
  public String getType(Uri uri) {
    File file = fileFor(uri);
    String name = file == null ? "" : file.getName().toLowerCase(Locale.US);
    if (name.endsWith(".html") || name.endsWith(".htm")) return "text/html";
    if (name.endsWith(".json")) return "application/json";
    if (name.endsWith(".txt")) return "text/plain";
    return "text/csv";
  }

  @Override
  public Uri insert(Uri uri, ContentValues values) {
    return null;
  }

  @Override
  public int delete(Uri uri, String selection, String[] selectionArgs) {
    return 0;
  }

  @Override
  public int update(
      Uri uri, ContentValues values, String selection, String[] selectionArgs) {
    return 0;
  }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    File file = fileFor(uri);
    if (file == null || !file.exists()) {
      throw new FileNotFoundException("Файл отчёта не найден");
    }
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
  }
}
