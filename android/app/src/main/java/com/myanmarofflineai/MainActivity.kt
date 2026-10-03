package com.myanmarofflineai

import android.app.AlertDialog
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        CrashDiagnostics.mark(this, "MainActivity:onCreate:entered")

        val crash = CrashDiagnostics.previousCrash(this)
        if (crash != null) {
            AlertDialog.Builder(this)
                .setTitle("Myk startup crash captured")
                .setMessage(crash.take(7000))
                .setPositiveButton("Continue test") { _, _ ->
                    CrashDiagnostics.clearCrash(this)
                    recreate()
                }
                .setNegativeButton("Close") { _, _ ->
                    CrashDiagnostics.clearCrash(this)
                    finish()
                }
                .setCancelable(false)
                .show()
            return
        }

        CrashDiagnostics.mark(this, "MainActivity:onCreate:before_super")
        super.onCreate(savedInstanceState)
        CrashDiagnostics.mark(this, "MainActivity:onCreate:after_super")
    }

    override fun getMainComponentName(): String = "MyanmarOfflineAI"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(
            this,
            mainComponentName,
            fabricEnabled,
        )
}
