package com.myanmarofflineai

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Runs llama.cpp as a separate child process.
 *
 * The native executable is packaged as:
 *   jniLibs/arm64-v8a/libllamaserver.so
 *
 * Keeping llama.cpp outside the React Native process is intentional: a native
 * inference crash cannot directly bring down the React Native runtime.
 */
class LlamaServerModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    private var process: Process? = null
    private var logThread: Thread? = null
    private var port: Int = 8080

    override fun getName(): String = "LlamaServer"

    private fun binaryPath(): String {
        return "${reactContext.applicationInfo.nativeLibraryDir}/libllamaserver.so"
    }

    private fun probeHealth(): Boolean {
        return try {
            val connection =
                URL("http://127.0.0.1:$port/health")
                    .openConnection() as HttpURLConnection

            connection.connectTimeout = 1200
            connection.readTimeout = 1200
            val code = connection.responseCode
            connection.disconnect()

            code == 200
        } catch (_: Exception) {
            false
        }
    }

    @ReactMethod
    fun start(
        modelPath: String,
        requestedPort: Int,
        nThreads: Int,
        nCtx: Int,
        promise: Promise,
    ) {
        Thread {
            try {
                port = requestedPort.coerceIn(1024, 65500)

                if (probeHealth()) {
                    promise.resolve("reused")
                    return@Thread
                }

                val oldProcess = process
                if (oldProcess?.isAlive == true) {
                    oldProcess.destroy()
                    process = null
                }

                val binary = File(binaryPath())
                val model = File(modelPath)

                if (!binary.exists()) {
                    promise.reject(
                        "NO_SERVER_BINARY",
                        "llama-server binary is missing: ${binary.absolutePath}",
                    )
                    return@Thread
                }

                if (!model.exists() || model.length() < 1_000_000L) {
                    promise.reject(
                        "NO_MODEL",
                        "GGUF model is missing or too small: ${model.absolutePath}",
                    )
                    return@Thread
                }

                val context = nCtx.coerceIn(512, 16384)
                val threads = nThreads.coerceIn(1, 8)

                val command = listOf(
                    binary.absolutePath,
                    "-m", model.absolutePath,
                    "--host", "127.0.0.1",
                    "--port", port.toString(),
                    "-c", context.toString(),
                    "-t", threads.toString(),
                    "--no-warmup",
                )

                Log.i("LlamaServer", "Starting llama-server on 127.0.0.1:$port")

                val builder = ProcessBuilder(command)
                builder.redirectErrorStream(true)
                builder.directory(reactContext.filesDir)
                builder.environment()["LD_LIBRARY_PATH"] =
                    "${reactContext.applicationInfo.nativeLibraryDir}:/system/lib64:/system/lib"

                val child = builder.start()
                process = child

                logThread = Thread {
                    try {
                        child.inputStream.bufferedReader().forEachLine {
                            Log.i("LlamaServerProc", it)
                        }
                    } catch (_: Exception) {
                    }
                }.also {
                    it.isDaemon = true
                    it.start()
                }

                val deadline = System.currentTimeMillis() + 150_000L

                while (System.currentTimeMillis() < deadline) {
                    if (!child.isAlive) {
                        promise.reject(
                            "SERVER_EXITED",
                            "llama-server exited during startup.",
                        )
                        return@Thread
                    }

                    if (probeHealth()) {
                        promise.resolve("started")
                        return@Thread
                    }

                    Thread.sleep(750)
                }

                promise.reject(
                    "SERVER_TIMEOUT",
                    "llama-server did not become healthy within 150 seconds.",
                )
            } catch (e: Exception) {
                promise.reject(
                    "SERVER_START_FAILED",
                    e.message ?: "Unable to start llama-server.",
                    e,
                )
            }
        }.start()
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        Thread {
            promise.resolve(process?.isAlive == true && probeHealth())
        }.start()
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            process?.destroy()
            process = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject(
                "SERVER_STOP_FAILED",
                e.message ?: "Unable to stop llama-server.",
                e,
            )
        }
    }

    override fun invalidate() {
        process?.destroy()
        process = null
        super.invalidate()
    }
}
