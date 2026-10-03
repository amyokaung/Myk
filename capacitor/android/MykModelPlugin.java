package com.myanmarofflineai.myk;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.ActivityResult;
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

@CapacitorPlugin(name = "MykModel")
public class MykModelPlugin extends Plugin {

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
