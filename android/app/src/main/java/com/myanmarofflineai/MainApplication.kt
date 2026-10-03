package com.myanmarofflineai

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

    override val reactHost: ReactHost by lazy {
        getDefaultReactHost(
            context = applicationContext,
            packageList = PackageList(this).packages,
        )
    }

    override fun onCreate() {
        super.onCreate()
        CrashDiagnostics.install(this)
        CrashDiagnostics.mark(this, "Application:onCreate:before_loadReactNative")
        loadReactNative(this)
        CrashDiagnostics.mark(this, "Application:onCreate:after_loadReactNative")
    }
}
