package com.myanmarofflineai.myk;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.os.StatFs;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "MykModel")
public class MykModelPlugin extends Plugin {
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;
    private volatile boolean cancelDownload = false;
    private volatile long downloadBytes = 0;
    private volatile long downloadTotal = 0;
    private volatile String downloadName = "";
    private volatile String downloadError = "";

    @PluginMethod
    public void pickModel(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "application/octet-stream",
                "application/x-gguf",
                "*/*"
        });
        startActivityForResult(call, intent, "modelPicked");
    }

    @PluginMethod
    public void listModels(PluginCall call) {
        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists()) dir.mkdirs();

        JSArray models = new JSArray();
        File[] files = dir.listFiles();

        if (files != null) {
            for (File file : files) {
                if (file.isFile() && file.getName().toLowerCase().endsWith(".gguf")) {
                    JSObject item = new JSObject();
                    item.put("name", file.getName());
                    item.put("path", file.getAbsolutePath());
                    item.put("size", file.length());
                    models.put(item);
                }
            }
        }

        JSObject result = new JSObject();
        result.put("models", models);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        if (downloading) {
            call.reject("A model download is already running");
            return;
        }

        String name = call.getString("name");
        String urlString = call.getString("url");
        Long expectedSize = call.getLong("sizeBytes");

        if (name == null || urlString == null || !isSafeModelName(name) || !urlString.startsWith("https://")) {
            call.reject("Invalid model download");
            return;
        }

        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not create model directory");
            return;
        }

        File target = new File(dir, name);
        File partial = new File(dir, name + ".part");

        if (expectedSize != null && expectedSize > 0) {
            long freeBytes = new StatFs(dir.getAbsolutePath()).getAvailableBytes();
            long requiredBytes = expectedSize + (512L * 1024L * 1024L);
            if (freeBytes < requiredBytes) {
                call.reject("Not enough free storage. Need about " + formatGb(requiredBytes) + " free.");
                return;
            }
        }
        if (target.exists() && target.length() > 0) {
            JSObject ret = new JSObject();
            ret.put("name", target.getName());
            ret.put("path", target.getAbsolutePath());
            ret.put("size", target.length());
            call.resolve(ret);
            return;
        }

        downloading = true;
        cancelDownload = false;
        downloadName = name;
        downloadError = "";
        downloadBytes = partial.exists() ? partial.length() : 0;
        downloadTotal = expectedSize == null ? 0 : expectedSize;
        call.resolve(new JSObject().put("started", true));

        downloadExecutor.execute(() -> {
            try {
                downloadFile(urlString, partial, target);
            } catch (Exception e) {
                downloadError = e.getMessage() == null ? "Download failed" : e.getMessage();
                if (target.exists()) target.delete();
            } finally {
                downloading = false;
            }
        });
    }

    @PluginMethod
    public void getDownloadStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("downloading", downloading);
        ret.put("cancelled", cancelDownload && !downloading);
        ret.put("name", downloadName);
        ret.put("bytes", downloadBytes);
        ret.put("total", downloadTotal);
        ret.put("error", downloadError);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelDownload = true;
        call.resolve();
    }

    private void downloadFile(String urlString, File partial, File target) throws Exception {
        long existing = partial.exists() ? partial.length() : 0;
        HttpURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            if (existing > 0) connection.setRequestProperty("Range", "bytes=" + existing + "-");
            int code = connection.getResponseCode();

            if (existing > 0 && code == HttpURLConnection.HTTP_OK) {
                existing = 0;
                downloadBytes = 0;
                if (partial.exists()) partial.delete();
            } else if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
                throw new Exception("Server returned HTTP " + code);
            }

            long contentLength = connection.getContentLengthLong();
            if (code == HttpURLConnection.HTTP_PARTIAL) {
                downloadTotal = existing + Math.max(0, contentLength);
            } else if (contentLength > 0) {
                downloadTotal = contentLength;
            }
            downloadBytes = existing;

            try (InputStream input = connection.getInputStream();
                 RandomAccessFile output = new RandomAccessFile(partial, "rw")) {
                output.seek(existing);
                byte[] buffer = new byte[1024 * 1024];
                int read;
                while (!cancelDownload && (read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    downloadBytes += read;
                }
            }

            if (cancelDownload) return;
            if (downloadTotal > 0 && downloadBytes < downloadTotal) throw new Exception("Download incomplete");
            if (target.exists()) target.delete();
            if (!partial.renameTo(target)) throw new Exception("Could not finalize downloaded model");
            downloadBytes = target.length();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @PluginMethod
    public void exportModel(PluginCall call) {
        String name = call.getString("name");

        if (name == null || !isSafeModelName(name)) {
            call.reject("Invalid model name");
            return;
        }

        File dir = new File(getContext().getFilesDir(), "models");
        File source = new File(dir, name);
        if (!source.exists() || !source.isFile() || source.length() == 0) {
            call.reject("Model file not found");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(call, intent, "modelExported");
    }

    @ActivityCallback
    private void modelExported(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result == null
                || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("Export cancelled");
            return;
        }

        String name = call.getString("name");
        if (name == null || !isSafeModelName(name)) {
            call.reject("Invalid model name");
            return;
        }

        File source = new File(new File(getContext().getFilesDir(), "models"), name);
        Uri destination = result.getData().getData();

        if (!source.exists() || !source.isFile()) {
            call.reject("Model file not found");
            return;
        }

        try (InputStream input = new java.io.FileInputStream(source);
             java.io.OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {

            if (output == null) throw new Exception("Could not open destination");

            byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();

            call.resolve(new JSObject().put("name", name).put("size", source.length()));
        } catch (Exception e) {
            call.reject("Could not export model: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        String name = call.getString("name");

        if (name == null
                || name.contains("/")
                || name.contains("\\")
                || !name.toLowerCase().endsWith(".gguf")) {
            call.reject("Invalid model name");
            return;
        }

        File dir = new File(getContext().getFilesDir(), "models");
        File file = new File(dir, name);

        if (file.exists() && !file.delete()) {
            call.reject("Could not delete model");
            return;
        }

        call.resolve();
    }

    private String formatGb(long bytes) {
        return String.format(java.util.Locale.US, "%.1f GB", bytes / (1024.0 * 1024.0 * 1024.0));
    }

    private boolean isSafeModelName(String name) {
        return name != null
                && !name.contains("/")
                && !name.contains("\\")
                && name.toLowerCase().endsWith(".gguf");
    }

    @ActivityCallback
    private void modelPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result == null
                || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("No model selected");
            return;
        }

        Uri uri = result.getData().getData();
        String name = queryDisplayName(uri);

        if (name == null || !name.toLowerCase().endsWith(".gguf")) {
            call.reject("Please select a .gguf model file");
            return;
        }

        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not create model directory");
            return;
        }

        File target = new File(dir, name);

        try (InputStream input =
                     getContext().getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(target)) {

            if (input == null) {
                throw new Exception("Could not open selected file");
            }

            byte[] buffer = new byte[1024 * 1024];
            int read;

            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }

            output.flush();

            JSObject ret = new JSObject();
            ret.put("name", target.getName());
            ret.put("path", target.getAbsolutePath());
            ret.put("size", target.length());
            call.resolve(ret);

        } catch (Exception e) {
            if (target.exists()) target.delete();
            call.reject("Could not copy model: " + e.getMessage());
        }
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;

        try {
            cursor = getContext().getContentResolver().query(
                    uri, null, null, null, null);

            if (cursor != null && cursor.moveToFirst()) {
                int index =
                        cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);

                if (index >= 0) {
                    return cursor.getString(index);
                }
            }
        } finally {
            if (cursor != null) cursor.close();
        }

        return null;
    }
}
