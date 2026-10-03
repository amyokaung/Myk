package com.myanmarofflineai.myk;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "MykAI")
public class MykAIPlugin extends Plugin {
    private static final String TAG = "MykAI";
    private static final int PORT = 8080;
    private Process process;

    private String binaryPath() {
        return getContext().getApplicationInfo().nativeLibraryDir + "/libllamaserver.so";
    }

    private boolean healthy() {
        try {
            HttpURLConnection c = (HttpURLConnection)
                    new URL("http://127.0.0.1:" + PORT + "/health").openConnection();
            c.setConnectTimeout(1000);
            c.setReadTimeout(1000);
            int code = c.getResponseCode();
            c.disconnect();
            return code == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private void startServer(File model) throws Exception {
        if (healthy()) return;
        if (process != null && process.isAlive()) {
            process.destroy();
            process = null;
        }

        File binary = new File(binaryPath());
        if (!binary.exists()) throw new Exception("llama-server binary is missing");
        if (!model.exists() || model.length() < 1_000_000L) {
            throw new Exception("GGUF model is missing or invalid");
        }

        List<String> command = new ArrayList<>();
        command.add(binary.getAbsolutePath());
        command.add("-m");
        command.add(model.getAbsolutePath());
        command.add("--host");
        command.add("127.0.0.1");
        command.add("--port");
        command.add(String.valueOf(PORT));
        command.add("-c");
        command.add("2048");
        command.add("-t");
        command.add(String.valueOf(Math.max(1, Math.min(8, Runtime.getRuntime().availableProcessors()))));
        command.add("--no-warmup");

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.redirectErrorStream(true);
        builder.directory(getContext().getFilesDir());
        builder.environment().put(
                "LD_LIBRARY_PATH",
                getContext().getApplicationInfo().nativeLibraryDir + ":/system/lib64:/system/lib"
        );

        Log.i(TAG, "Starting llama-server");
        process = builder.start();

        Thread logs = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null) Log.i(TAG, line);
            } catch (Exception ignored) {}
        });
        logs.setDaemon(true);
        logs.start();

        long deadline = System.currentTimeMillis() + 180_000L;
        while (System.currentTimeMillis() < deadline) {
            if (process == null || !process.isAlive()) {
                throw new Exception("llama-server exited during startup");
            }
            if (healthy()) return;
            Thread.sleep(750);
        }
        throw new Exception("AI engine startup timed out");
    }

    private String chatRequest(String message) throws Exception {
        JSONObject body = new JSONObject();
        body.put("messages", new JSONArray().put(
                new JSONObject().put("role", "user").put("content", message)));
        body.put("temperature", 0.7);
        body.put("max_tokens", 512);
        body.put("stream", false);

        HttpURLConnection c = (HttpURLConnection)
                new URL("http://127.0.0.1:" + PORT + "/v1/chat/completions").openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(3000);
        c.setReadTimeout(180_000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json");

        byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = c.getOutputStream()) {
            out.write(data);
        }

        int code = c.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream(),
                StandardCharsets.UTF_8));

        StringBuilder raw = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) raw.append(line);
        c.disconnect();

        if (code < 200 || code >= 300) {
            throw new Exception("llama-server HTTP " + code + ": " + raw);
        }

        JSONObject response = new JSONObject(raw.toString());
        JSONArray choices = response.optJSONArray("choices");
        if (choices == null || choices.length() == 0) throw new Exception("AI returned no choices");

        JSONObject choice = choices.getJSONObject(0);
        JSONObject msg = choice.optJSONObject("message");
        String content = msg == null ? "" : msg.optString("content", "");
        if (content.trim().isEmpty()) content = choice.optString("text", "");
        return content.trim();
    }

    @PluginMethod
    public void chat(PluginCall call) {
        String message = call.getString("message", "").trim();
        String modelName = call.getString("modelName", "").trim();

        if (message.isEmpty()) {
            call.reject("Message is empty");
            return;
        }
        if (modelName.isEmpty()
                || modelName.contains("/")
                || modelName.contains("\\")
                || !modelName.toLowerCase().endsWith(".gguf")) {
            call.reject("Please select a GGUF model first");
            return;
        }

        new Thread(() -> {
            try {
                File model = new File(new File(getContext().getFilesDir(), "models"), modelName);
                startServer(model);
                String reply = chatRequest(message);
                JSObject result = new JSObject();
                result.put("reply", reply);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Chat failed", e);
                call.reject(e.getMessage() == null ? "AI generation failed" : e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            if (process != null) process.destroy();
            process = null;
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not stop AI engine", e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (process != null) process.destroy();
        process = null;
        super.handleOnDestroy();
    }
}
