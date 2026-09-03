package io.dehub.exitreason

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Why the last process died.
 *
 * A native crash — an OutOfMemoryError in the video player, a SIGSEGV in a
 * renderer, an ANR — ends the process without the JavaScript thread ever
 * running again, so nothing the app's own error reporter does can record it.
 * Android keeps a record: since API 30, ActivityManager hands back the last
 * few exits for this package with a reason code, a description, memory at the
 * time, and for native crashes and ANRs the tombstone itself. Read on the
 * next launch and shipped to the same log table as everything else, that is
 * the difference between "the app just closes" and a stack trace.
 */
class ExitReasonModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExitReason")

    Function("getLastExitReasons") { max: Int ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
        return@Function emptyList<Map<String, Any?>>()
      }
      val context = appContext.reactContext ?: return@Function emptyList<Map<String, Any?>>()
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val infos = try {
        am.getHistoricalProcessExitReasons(context.packageName, 0, max.coerceIn(1, 16))
      } catch (e: Exception) {
        return@Function emptyList<Map<String, Any?>>()
      }
      infos.map { info -> describe(info) }
    }
  }

  private fun describe(info: ApplicationExitInfo): Map<String, Any?> {
    // The tombstone is only there for native crashes and ANRs, and it can be
    // large. The head of it is what names the signal and the top frames.
    val trace = try {
      when (info.reason) {
        ApplicationExitInfo.REASON_CRASH_NATIVE, ApplicationExitInfo.REASON_ANR ->
          info.traceInputStream?.bufferedReader()?.use { reader ->
            val buffer = CharArray(8000)
            val read = reader.read(buffer)
            if (read > 0) String(buffer, 0, read) else null
          }
        else -> null
      }
    } catch (e: Exception) {
      null
    }
    return mapOf(
      "reason" to info.reason,
      "reasonName" to reasonName(info.reason),
      "description" to info.description,
      "timestamp" to info.timestamp,
      "importance" to info.importance,
      "pss" to info.pss,
      "rss" to info.rss,
      "status" to info.status,
      "trace" to trace,
    )
  }

  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_EXIT_SELF -> "EXIT_SELF"
    ApplicationExitInfo.REASON_SIGNALED -> "SIGNALED"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "LOW_MEMORY"
    ApplicationExitInfo.REASON_CRASH -> "CRASH"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "CRASH_NATIVE"
    ApplicationExitInfo.REASON_ANR -> "ANR"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "INITIALIZATION_FAILURE"
    ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "PERMISSION_CHANGE"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "EXCESSIVE_RESOURCE_USAGE"
    ApplicationExitInfo.REASON_USER_REQUESTED -> "USER_REQUESTED"
    ApplicationExitInfo.REASON_USER_STOPPED -> "USER_STOPPED"
    ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "DEPENDENCY_DIED"
    ApplicationExitInfo.REASON_OTHER -> "OTHER"
    ApplicationExitInfo.REASON_FREEZER -> "FREEZER"
    else -> "UNKNOWN_$reason"
  }
}
