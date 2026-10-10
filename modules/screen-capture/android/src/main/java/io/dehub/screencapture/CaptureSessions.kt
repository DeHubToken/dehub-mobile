package io.dehub.screencapture

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.CompletableDeferred
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet

internal class CaptureSession(
  val id: String,
  val scopeKey: String,
  val playheadMs: Double,
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
    val saved = runCatching { JSONArray(ledger(context).getString("completed", "[]")) }.getOrElse { JSONArray() }
    for (index in 0 until minOf(saved.length(), 4)) {
      val value = saved.optJSONObject(index) ?: continue
      val recovery = CaptureRecovery(value.optString("sessionId"), value.optString("scopeKey"), value.optDouble("playheadMs", Double.NaN), value.optInt("width"), value.optInt("height"), value.optLong("durationMs"))
      if (!validCaptureRecovery(recovery) || sessions.containsKey(recovery.sessionId)) continue
      val file = file(context, recovery.sessionId)
      if (!file.isFile || file.length() == 0L) continue
      val session = CaptureSession(recovery.sessionId, recovery.scopeKey, recovery.playheadMs, false, false, "", "", "", file)
      val result = ProjectionFile(Uri.fromFile(file).toString(), recovery.width, recovery.height, recovery.durationMs)
      session.result = result; session.state = "completed"
      session.started.complete(Unit); session.completed.complete(result); session.cleaned.complete(Unit)
      sessions[session.id] = session
    }
    val stale = ledger(context).getString("active", null)
    if (stale != null && validCaptureId(stale) && !sessions.containsKey(stale)) file(context, stale).delete()
    // Only completed files are recovered. OS consent is never stored or reused.
    ledger(context).edit().remove("active").remove("state").commit()
    persistRecovery(context)
  }

  @Synchronized fun begin(context: Context, id: String, scopeKey: String, playheadMs: Double, microphone: Boolean, systemAudio: Boolean, title: String, save: String, cancel: String): CaptureSession {
    require(validCaptureId(id) && validCaptureScope(scopeKey) && playheadMs.isFinite() && playheadMs >= 0 && title.isNotBlank() && save.isNotBlank() && cancel.isNotBlank())
    check(activeId == null && !sessions.containsKey(id) && sessions.size < 4) { "Another screen recording is still owned" }
    val session = CaptureSession(id, scopeKey, playheadMs, microphone, systemAudio, title, save, cancel, file(context, id))
    sessions[id] = session; activeId = id
    if (!ledger(context).edit().putString("active", id).putString("state", "pending").commit()) {
      sessions.remove(id); activeId = null
      error("Screen recording ownership could not be saved")
    }
    emit(session)
    return session
  }

  @Synchronized fun find(id: String): CaptureSession? = sessions[id]

  @Synchronized fun recover(scopeKey: String): List<CaptureSession> {
    val metadata = sessions.values.mapNotNull { session -> session.result?.let { CaptureRecovery(session.id, session.scopeKey, session.playheadMs, it.width, it.height, it.durationMs) } }
    val allowed = recoverCapturesForScope(metadata, scopeKey).map { it.sessionId }.toSet()
    return sessions.values.filter { it.id in allowed && it.state == "completed" && it.cleaned.isCompleted && it.file.isFile && it.file.length() > 0 }
  }

  @Synchronized fun mark(context: Context, session: CaptureSession, state: String) {
    check(sessions[session.id] === session && activeId == session.id)
    session.state = state
    ledger(context).edit().putString("state", state).apply()
    emit(session)
  }

  @Synchronized fun complete(context: Context, session: CaptureSession, result: ProjectionFile?, error: Throwable?) {
    if (sessions[session.id] !== session || session.cleaned.isCompleted) return
    session.stop = null
    var failure = error
    val validResult = result?.let { validCaptureRecovery(CaptureRecovery(session.id, session.scopeKey, session.playheadMs, it.width, it.height, it.durationMs)) && it.uri == Uri.fromFile(session.file).toString() && session.file.isFile && session.file.length() > 0 }
    if (result != null && validResult != true) failure = IllegalStateException("Screen recording metadata is invalid")
    session.result = if (session.cancelled || failure != null) null else result
    if (session.cancelled) session.state = "cancelled"
    else if (failure != null || result == null) session.state = "failed"
    else session.state = "completed"
    if (session.state == "completed" && !persistRecovery(context)) {
      failure = IllegalStateException("Completed screen recording could not be saved")
      session.result = null; session.state = "failed"
    }
    if (!session.started.isCompleted) session.started.completeExceptionally(failure ?: IllegalStateException("Screen recording did not start"))
    if (session.cancelled || result == null || failure != null) {
      session.file.delete()
      session.completed.completeExceptionally(failure ?: IllegalStateException("Screen recording was cancelled"))
    } else session.completed.complete(result)
    if (activeId == session.id) {
      activeId = null
      ledger(context).edit().remove("active").putString("state", session.state).commit()
    }
    if (session.state != "completed") persistRecovery(context)
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
    else forget(context, id)
    return session
  }

  @Synchronized fun forget(context: Context, id: String) {
    val session = sessions[id] ?: return
    if (session.cleaned.isCompleted) { session.file.delete(); sessions.remove(id); persistRecovery(context) }
  }

  fun status(session: CaptureSession): Map<String, Any?> {
    val result = session.result
    return mapOf("sessionId" to session.id, "scopeKey" to session.scopeKey, "playheadMs" to session.playheadMs, "state" to session.state, "result" to result?.let {
      mapOf("sessionId" to session.id, "scopeKey" to session.scopeKey, "playheadMs" to session.playheadMs, "uri" to it.uri, "width" to it.width, "height" to it.height, "durationMs" to it.durationMs)
    })
  }
  private fun emit(session: CaptureSession) { val state = status(session); for (observer in observers) runCatching { observer(state) } }
  private fun file(context: Context, id: String) = File(context.cacheDir, "screen-recordings/$id.mp4")
  private fun persistRecovery(context: Context): Boolean {
    val completed = JSONArray()
    for (session in sessions.values) {
      val result = session.result ?: continue
      if (session.state != "completed" || session.cancelled) continue
      completed.put(JSONObject(mapOf("sessionId" to session.id, "scopeKey" to session.scopeKey, "playheadMs" to session.playheadMs, "width" to result.width, "height" to result.height, "durationMs" to result.durationMs)))
    }
    return ledger(context).edit().putString("completed", completed.toString()).commit()
  }
}
