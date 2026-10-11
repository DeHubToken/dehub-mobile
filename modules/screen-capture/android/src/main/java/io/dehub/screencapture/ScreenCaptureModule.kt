package io.dehub.screencapture

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.Serializable
import java.util.concurrent.CopyOnWriteArraySet

internal data class ProjectionConsent(val sessionId: String) : Serializable
internal data class ProjectionConsentResult(val sessionId: String, val resultCode: Int, val data: Intent?)
internal class ProjectionConsentContract : AppContextActivityResultContract<ProjectionConsent, ProjectionConsentResult> {
  override fun createIntent(context: Context, input: ProjectionConsent): Intent {
    return context.getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent()
  }
  override fun parseResult(input: ProjectionConsent, resultCode: Int, intent: Intent?) = ProjectionConsentResult(input.sessionId, resultCode, intent)
}

class ScreenCaptureModule : Module() {
  private lateinit var consent: AppContextActivityResultLauncher<ProjectionConsent, ProjectionConsentResult>
  private var pickerOwner: String? = null
  private val owned = CopyOnWriteArraySet<String>()
  private val preCancelled = CopyOnWriteArraySet<String>()
  private var applicationContext: Context? = null
  private val observer: (Map<String, Any?>) -> Unit = { state ->
    val id = state["sessionId"] as? String
    if (id != null && owned.contains(id)) sendEvent("screenRecordingState", state)
  }
  private val context: Context get() = applicationContext ?: requireNotNull(appContext.reactContext).applicationContext

  override fun definition() = ModuleDefinition {
    Name("DeHubScreenCapture")
    Events("screenRecordingState")
    Function("capabilities") { mapOf("available" to true, "systemAudio" to (Build.VERSION.SDK_INT >= 29), "microphone" to true, "background" to true) }
    Function("status") { id: String -> if (owned.contains(id)) CaptureSessions.find(id)?.let { CaptureSessions.status(it) } else null }
    Function("recover") { scopeKey: String -> CaptureSessions.recover(scopeKey).map { session -> owned.add(session.id); CaptureSessions.status(session) } }
    Function("acknowledge") { id: String ->
      if (owned.contains(id)) {
        val session = requireNotNull(CaptureSessions.find(id))
        check(session.state == "completed" && session.cleaned.isCompleted) { "Screen recording has not completed" }
        CaptureSessions.forget(context, id); owned.remove(id)
      }
    }

    AsyncFunction("start") Coroutine { id: String, scopeKey: String, playheadMs: Double, microphone: Boolean, systemAudio: Boolean, title: String, save: String, cancel: String ->
      withContext(Dispatchers.Main) {
        check(!preCancelled.contains(id)) { "Screen recording was cancelled" }
        check(appContext.currentActivity != null && pickerOwner == null) { "Screen capture picker unavailable" }
        val audio = microphone || (systemAudio && Build.VERSION.SDK_INT >= 29)
        check(!audio || ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Audio capture permission is required" }
        val session = CaptureSessions.begin(context, id, scopeKey, playheadMs, microphone, systemAudio, title, save, cancel)
        owned.add(id); pickerOwner = id
        try {
          check(!preCancelled.contains(id)) { "Screen recording was cancelled" }
          val result = try { consent.launch(ProjectionConsent(id)) } finally { if (pickerOwner == id) pickerOwner = null }
          check(result.sessionId == id && !session.cancelled && !session.cleaned.isCompleted) { "Screen capture no longer belongs to this take" }
          check(result.resultCode == Activity.RESULT_OK && result.data != null) { "Screen capture permission was declined" }
          CaptureSessions.mark(context, session, "starting")
          val intent = Intent(context, ScreenCaptureService::class.java).setAction(ScreenCaptureService.START)
            .putExtra("sessionId", id).putExtra("resultCode", result.resultCode).putExtra("permission", result.data)
          ContextCompat.startForegroundService(context, intent)
          withTimeout(20_000L) { session.started.await() }
          check(!session.cancelled) { "Screen recording was cancelled" }
        } catch (error: Throwable) {
          CaptureSessions.cancel(context, id)
          throw error
        }
      }
    }
    AsyncFunction("finish") Coroutine { id: String ->
      check(owned.contains(id)) { "Screen recording is not owned by this editor" }
      val session = requireNotNull(CaptureSessions.find(id))
      session.started.await()
      check(!session.cancelled)
      session.stop?.invoke(false)
      val result = session.completed.await()
      mapOf("sessionId" to id, "scopeKey" to session.scopeKey, "playheadMs" to session.playheadMs, "uri" to result.uri, "width" to result.width, "height" to result.height, "durationMs" to result.durationMs)
    }
    AsyncFunction("cancel") Coroutine { id: String ->
      preCancelled.add(id)
      if (preCancelled.size > 64) preCancelled.firstOrNull()?.let { preCancelled.remove(it) }
      if (owned.contains(id)) {
        val session = CaptureSessions.cancel(context, id)
        session?.cleaned?.await()
        CaptureSessions.forget(context, id); owned.remove(id)
      }
    }
    RegisterActivityContracts {
      consent = registerForActivityResult(ProjectionConsentContract()) { input, _ ->
        // A recreated activity may only discard the old request; its consent cannot start a new take.
        if (owned.contains(input.sessionId)) CaptureSessions.cancel(context, input.sessionId)
      }
    }
    OnCreate { applicationContext = requireNotNull(appContext.reactContext).applicationContext; CaptureSessions.reconcile(context); CaptureSessions.observers.add(observer) }
    OnDestroy {
      CaptureSessions.observers.remove(observer)
      applicationContext?.let { context -> for (id in owned) if (CaptureSessions.find(id)?.cleaned?.isCompleted == false) CaptureSessions.cancel(context, id) }
      owned.clear()
    }
  }
}
