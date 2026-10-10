package io.dehub.screencapture

import android.content.Context
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet

internal class CaptureSession(
  val id: String,
  val microphone: Boolean,
  val systemAudio: Boolean,
  val title: String,
  val saveLabel: String,
  val cancelLabel: String,
  val file: File,
) {
  @Volatile var cancelled = false
  @Volatile var state = "pending"
  @Volatile var result: ProjectionFile? = null
  @Volatile var stop: ((Boolean) -> Unit)? = null
  val started = CompletableDeferred<Unit>()
  val completed = CompletableDeferred<ProjectionFile>()
  val cleaned = CompletableDeferred<Unit>()
}

internal object CaptureSessions {
  private val sessions = LinkedHashMap<String, CaptureSession>()
  private var activeId: String? = null
  val observers = CopyOnWriteArraySet<(Map<String, Any?>) -> Unit>()
  private fun ledger(context: Context) = context.getSharedPreferences("dehub-screen-capture", Context.MODE_PRIVATE)

  @Synchronized fun reconcile(context: Context) {
    if (activeId != null || sessions.isNotEmpty()) return
    val stale = ledger(context).getString("active", null)
    if (stale != null && validId(stale)) File(context.cacheDir, "screen-recordings/$stale.mp4").delete()
    val completed = ledger(context).getString("result", null)?.let { runCatching { JSONObject(it).optString("sessionId") }.getOrNull() }
    if (completed != null && validId(completed)) File(context.cacheDir, "screen-recordings/$completed.mp4").delete()
    // A permission token is deliberately never written to storage or restored after process death.
    ledger(context).edit().remove("active").remove("state").remove("result").apply()
  }

  @Synchronized fun begin(context: Context, id: String, microphone: Boolean, systemAudio: Boolean, title: String, save: String, cancel: String): CaptureSession {
    require(validId(id) && title.isNotBlank() && save.isNotBlank() && cancel.isNotBlank())
    check(activeId == null && !sessions.containsKey(id) && sessions.size < 4) { "Another screen recording is still owned" }
    val session = CaptureSession(id, microphone, systemAudio, title, save, cancel, File(context.cacheDir, "screen-recordings/$id.mp4"))
    sessions[id] = session; activeId = id
    ledger(context).edit().putString("active", id).putString("state", "pending").remove("result").apply()
    emit(session)
    return session
  }

  @Synchronized fun find(id: String): CaptureSession? = sessions[id]

  @Synchronized fun mark(context: Context, session: CaptureSession, state: String) {
    check(sessions[session.id] === session && activeId == session.id)
    session.state = state
    ledger(context).edit().putString("state", state).apply()
    emit(session)
  }

  @Synchronized fun complete(context: Context, session: CaptureSession, result: ProjectionFile?, error: Throwable?) {
    if (sessions[session.id] !== session || session.cleaned.isCompleted) return
    session.stop = null
    session.result = if (session.cancelled || error != null) null else result
    if (session.cancelled) session.state = "cancelled"
    else if (error != null || result == null) session.state = "failed"
    else session.state = "completed"
    if (!session.started.isCompleted) session.started.completeExceptionally(error ?: IllegalStateException("Screen recording did not start"))
    if (session.cancelled || result == null || error != null) {
      session.file.delete()
      session.completed.completeExceptionally(error ?: IllegalStateException("Screen recording was cancelled"))
    } else session.completed.complete(result)
    if (activeId == session.id) {
      activeId = null
      val persisted = result?.let { JSONObject(mapOf("sessionId" to session.id, "uri" to it.uri, "width" to it.width, "height" to it.height, "durationMs" to it.durationMs)).toString() }
      ledger(context).edit().remove("active").putString("state", session.state).putString("result", persisted).apply()
    }
    session.cleaned.complete(Unit)
    emit(session)
    if (session.cancelled) sessions.remove(session.id)
  }

  @Synchronized fun cancel(context: Context, id: String): CaptureSession? {
    val session = sessions[id] ?: return null
    session.cancelled = true
    val stop = session.stop
    if (stop != null) stop(true)
    else if (!session.cleaned.isCompleted) complete(context, session, null, null)
    else { session.file.delete(); sessions.remove(id) }
    return session
  }

  @Synchronized fun forget(id: String) {
    val session = sessions[id] ?: return
    if (session.cleaned.isCompleted) { session.file.delete(); sessions.remove(id) }
  }

  fun status(session: CaptureSession): Map<String, Any?> {
    val result = session.result
    return mapOf("sessionId" to session.id, "state" to session.state, "result" to result?.let {
      mapOf("sessionId" to session.id, "uri" to it.uri, "width" to it.width, "height" to it.height, "durationMs" to it.durationMs)
    })
  }
  private fun emit(session: CaptureSession) { val state = status(session); for (observer in observers) runCatching { observer(state) } }
  private fun validId(id: String) = Regex("^[a-zA-Z0-9_-]{8,64}$").matches(id)
}
