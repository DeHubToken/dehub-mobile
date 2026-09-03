package io.dehub.exitreason

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

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
private const val CRASH_FILE = "last_java_crash.txt"

class ExitReasonModule : Module() {
  private var handlerInstalled = false

  override fun definition() = ModuleDefinition {
    Name("ExitReason")

    OnCreate {
      installCrashHandler()
    }

    // The Java stack of the last uncaught exception, then nothing: read once.
    // Android reports that death only as REASON_CRASH with no trace, so the
    // handler below writes the throwable to a file on the way down.
    Function("takeLastJavaCrash") { ->
      installCrashHandler()
      try {
        val dir = appContext.reactContext?.filesDir ?: return@Function null
        val file = File(dir, CRASH_FILE)
        if (!file.exists()) return@Function null
        val text = file.readText()
        file.delete()
        text
      } catch (e: Exception) {
        null
      }
    }

    Function("getLastExitReasons") { max: Int ->
      installCrashHandler()
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

  /**
   * Chained in front of whatever handler was there (Android's own, which ends
   * the process). Writes the stack first, then lets the previous handler do
   * exactly what it did before, so nothing about the crash itself changes —
   * only that it leaves a note.
   */
  private fun installCrashHandler() {
    if (handlerInstalled) return
    val dir = appContext.reactContext?.filesDir ?: return
    handlerInstalled = true
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val writer = StringWriter()
        throwable.printStackTrace(PrintWriter(writer))
        val text = "thread=${thread.name}\ntime=${System.currentTimeMillis()}\n" + writer.toString()
        File(dir, CRASH_FILE).writeText(text.take(16000))
      } catch (e: Exception) {
        /* the crash handler must not add a second crash */
      }
      previous?.uncaughtException(thread, throwable)
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
