package io.dehub.mobile
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.view.WindowCompat

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.views.modal.ReactModalHostView

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = false
    window.decorView.viewTreeObserver.addOnWindowFocusChangeListener(matchDialogBars)
  }

  // React Native draws every <Modal> (comments, drawers, sheets) in its own
  // dialog window, and with edge-to-edge on it turns the nav bar contrast
  // scrim back on there, tinted by the phone's system light/dark setting
  // rather than the app theme. With the 3-button bar on a phone in light mode
  // that is a flat light grey strip under every sheet. A dialog takes focus
  // as it opens, so that is when it gets this window's nav bar back.
  private val matchDialogBars = ViewTreeObserver.OnWindowFocusChangeListener { hasFocus ->
    if (!hasFocus) matchDialogNavigationBars(window.decorView)
  }

  private fun matchDialogNavigationBars(view: View) {
    if (view is ReactModalHostView) {
      val dialogWindow = view.dialog?.window ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        dialogWindow.isNavigationBarContrastEnforced = false
      }
      WindowCompat.getInsetsController(dialogWindow, dialogWindow.decorView).isAppearanceLightNavigationBars =
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars
      // A sheet opened from inside this one lives in this dialog's tree and
      // takes focus from it rather than from the activity.
      val observer = dialogWindow.decorView.viewTreeObserver
      if (observer.isAlive) {
        observer.removeOnWindowFocusChangeListener(matchDialogBars)
        observer.addOnWindowFocusChangeListener(matchDialogBars)
      }
      matchDialogNavigationBars(dialogWindow.decorView)
      return
    }
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) matchDialogNavigationBars(view.getChildAt(i))
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
