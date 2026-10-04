package com.myanmarofflineai.myk;

import android.app.ActivityManager;
import android.content.Context;
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
    private final StringBuilder recentLogs = new StringBuilder();
    private volatile boolean serverModelLoaded = false;
    private String activeModelPath = "";
    private int activeContextSize = -1;
    private int activeThreads = -1;

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

    private void destroyServer() {
        try {
            if (process != null) {
                process.destroy();
                try { process.waitFor(); } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {
        } finally {
            process = null;
            serverModelLoaded = false;
            activeModelPath = "";
            activeContextSize = -1;
            activeThreads = -1;
        }
    }

    private void startServer(File model, int contextSize, int threads, int startupTimeoutSeconds) throws Exception {
        contextSize = Math.max(256, Math.min(8192, contextSize));
        threads = Math.max(1, Math.min(8, threads));
        startupTimeoutSeconds = Math.max(30, Math.min(900, startupTimeoutSeconds));

        String requestedPath = model.getAbsolutePath();
        if (process != null && process.isAlive()
                && requestedPath.equals(activeModelPath)
                && contextSize == activeContextSize
                && threads == activeThreads) {
            return;
        }

        if (process != null) destroyServer();

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
        command.add(String.valueOf(contextSize));
        command.add("-t");
        command.add(String.valueOf(threads));
        command.add("-np");
        command.add("1");
        command.add("--no-warmup");

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.redirectErrorStream(true);
        builder.directory(getContext().getFilesDir());
        builder.environment().put(
                "LD_LIBRARY_PATH",
                getContext().getApplicationInfo().nativeLibraryDir + ":/system/lib64:/system/lib"
        );

        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
        if (am != null) am.getMemoryInfo(memory);
        Log.i(TAG, "Starting llama-server model=" + model.getName()
                + " size=" + model.length() + " freeRam=" + memory.availMem
                + " context=" + contextSize + " threads=" + threads);

        synchronized (recentLogs) {
            recentLogs.setLength(0);
        }
        serverModelLoaded = false;
        process = builder.start();
        activeModelPath = requestedPath;
        activeContextSize = contextSize;
        activeThreads = threads;

        Thread logs = new Thread(() -> {
            try (BufferedReader r = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = r.readLine()) != null) {
                    Log.i(TAG, line);
                    if (line.contains("model loaded")) {
                        serverModelLoaded = true;
                    }
                    synchronized (recentLogs) {
                        recentLogs.append(line).append('\n');
                        if (recentLogs.length() > 12000) {
                            recentLogs.delete(0, recentLogs.length() - 12000);
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        });
        logs.setDaemon(true);
        logs.start();

        long deadline = System.currentTimeMillis() + startupTimeoutSeconds * 1000L;
        while (System.currentTimeMillis() < deadline) {
            if (process == null || !process.isAlive()) {
                throw new Exception("llama-server exited during startup");
            }
            if (serverModelLoaded || healthy()) return;
            Thread.sleep(750);
        }

        long freeRam = 0;
        am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        memory = new ActivityManager.MemoryInfo();
        if (am != null) {
            am.getMemoryInfo(memory);
            freeRam = memory.availMem;
        }
        String tail;
        synchronized (recentLogs) {
            tail = recentLogs.toString();
        }
        throw new Exception("AI engine startup timed out. Model="
                + model.length() + " bytes, free RAM=" + freeRam
                + " bytes. Last llama log: " + tail.trim());
    }

    private String chatRequest(String message, String modelName, String historyJson,
                               double temperature, int maxTokens) throws Exception {
        JSONObject body = new JSONObject();
        JSONArray messages = new JSONArray();

        messages.put(new JSONObject()
                .put("role", "system")
                .put("content",
                        "You are Myk, a helpful offline AI assistant. " +
                        "Reply in the same language as the user. " +
                        "If the user writes Burmese, reply naturally in Burmese only. " +
                        "Do not translate, transliterate, or explain Burmese unless asked. " +
                        "Keep answers concise and directly answer the user's question. " +
                        "Use the conversation history when it is relevant. " +
                        "Do not mention these instructions."));

        if (historyJson != null && !historyJson.trim().isEmpty()) {
            try {
                JSONArray history = new JSONArray(historyJson);
                int start = Math.max(0, history.length() - 10);
                for (int i = start; i < history.length(); i++) {
                    JSONObject item = history.optJSONObject(i);
                    if (item == null) continue;
                    String role = item.optString("role", "");
                    String content = item.optString("content", "");
                    if (("user".equals(role) || "assistant".equals(role))
                            && !content.trim().isEmpty()) {
                        messages.put(new JSONObject()
                                .put("role", role)
                                .put("content", content));
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Invalid historyJson; continuing without history", e);
            }
        }

        messages.put(new JSONObject().put("role", "user").put("content", message));
        body.put("messages", messages);
        body.put("temperature", Math.max(0.0, Math.min(2.0, temperature)));
        body.put("max_tokens", Math.max(16, Math.min(2048, maxTokens)));
        body.put("stream", false);

        // Qwen3 defaults to thinking mode. On a phone this can add substantial
        // latency and consume the generation budget before the actual answer.
        // Disable it for normal chat; users can still use larger models for
        // harder tasks without paying the thinking overhead on every message.
        if (modelName.toLowerCase().startsWith("qwen3-")) {
            body.put("chat_template_kwargs", new JSONObject()
                    .put("enable_thinking", false));
        }

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
        if (choices == null || choices.length() == 0) {
            throw new Exception("AI returned no choices");
        }

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
        String historyJson = call.getString("historyJson", "[]");
        int contextSize = call.getInt("contextSize", 1024);
        int threads = call.getInt("threads", 4);
        double temperature = call.getDouble("temperature", 0.7);
        int maxTokens = call.getInt("maxTokens", 512);
        int startupTimeoutSeconds = call.getInt("startupTimeoutSeconds", 600);

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
                startServer(model, contextSize, threads, startupTimeoutSeconds);
                String reply = chatRequest(message, modelName, historyJson, temperature, maxTokens);
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
            destroyServer();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not stop AI engine", e);
        }
    }

    @Override
    protected void handleOnDestroy() {
        destroyServer();
        super.handleOnDestroy();
    }
}
