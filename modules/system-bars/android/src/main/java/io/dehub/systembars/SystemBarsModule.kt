package io.dehub.systembars

import android.os.Build
import android.view.View
import android.view.WindowInsetsController
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SystemBarsModule : Module() {
  @Suppress("DEPRECATION")
  override fun definition() = ModuleDefinition {
    Name("DehubSystemBars")

    AsyncFunction("setNavigationBarDarkIcons") { darkIcons: Boolean ->
      val window = appContext.currentActivity?.window ?: return@AsyncFunction false
      val decor = window.decorView
      // Dialogs inherit the legacy appearance bits from the activity too.
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val flag = View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        decor.systemUiVisibility = if (darkIcons) decor.systemUiVisibility or flag
        else decor.systemUiVisibility and flag.inv()
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val appearance = WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        window.insetsController?.setSystemBarsAppearance(if (darkIcons) appearance else 0, appearance)
      }
      true
    }.runOnQueue(Queues.MAIN)
  }
}
