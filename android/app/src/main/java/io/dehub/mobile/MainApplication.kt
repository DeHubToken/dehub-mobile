package io.dehub.mobile

import android.app.Application
import android.content.ComponentCallbacks2
import android.os.SystemClock
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory
import io.dehub.mobile.studio.Studio
import io.dehub.mobile.studio.StudioPackage
import io.dehub.mobile.videolooks.VideoLooks

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    ExpoReactHostFactory.getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(StudioPackage())
        }
    )
  }

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    VideoLooks.register()
    Studio.register()
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }

  // React Native only raises AppState "memoryWarning" on iOS. Android phones
  // low on memory (mostly old or low-RAM ones) never told the app, so the
  // decoded picture cache was never dropped before the system killed us.
  // Forward foreground memory pressure to the same JS event; the app clears
  // its in-memory picture cache there (the disk cache keeps the files).
  private var lastMemoryWarningAt = 0L

  @Suppress("DEPRECATION")
  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW ||
        level == ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) {
      emitMemoryWarning()
    }
  }

  override fun onLowMemory() {
    super.onLowMemory()
    emitMemoryWarning()
  }

  private fun emitMemoryWarning() {
    val now = SystemClock.elapsedRealtime()
    if (now - lastMemoryWarningAt < 10_000L) return
    lastMemoryWarningAt = now
    try {
      reactHost.currentReactContext?.emitDeviceEvent("memoryWarning", null)
    } catch (_: Throwable) {
    }
  }
}
