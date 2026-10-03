package com.myanmarofflineai

import android.content.Context
import android.util.Log
import java.io.PrintWriter
import java.io.StringWriter

object CrashDiagnostics {
    private const val PREFS = "myk_crash_diagnostics"
    private const val KEY_PHASE = "last_phase"
    private const val KEY_CRASH = "last_crash"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun mark(context: Context, phase: String) {
        prefs(context).edit().putString(KEY_PHASE, phase).apply()
        Log.i("MykDiagnostics", "PHASE: $phase")
    }

    fun install(context: Context) {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            val sw = StringWriter()
            throwable.printStackTrace(PrintWriter(sw))
            val report = buildString {
                append("thread=").append(thread.name).append('\n')
                append("phase=").append(prefs(context).getString(KEY_PHASE, "unknown")).append('\n')
                append("exception=").append(throwable.javaClass.name).append('\n')
                append("message=").append(throwable.message ?: "").append('\n')
                append(sw)
            }
            prefs(context).edit()
                .putString(KEY_CRASH, report)
                .putString(KEY_PHASE, "CRASH_CAPTURED")
                .commit()
            Log.e("MykDiagnostics", report, throwable)
            previous?.uncaughtException(thread, throwable)
        }
    }

    fun previousCrash(context: Context): String? =
        prefs(context).getString(KEY_CRASH, null)

    fun clearCrash(context: Context) {
        prefs(context).edit().remove(KEY_CRASH).putString(KEY_PHASE, "USER_CLEARED").apply()
    }
}
