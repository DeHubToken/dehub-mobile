package io.dehub.screencapture

internal data class CaptureRecovery(
  val sessionId: String,
  val scopeKey: String,
  val playheadMs: Double,
  val width: Int,
  val height: Int,
  val durationMs: Long,
)

internal fun validCaptureId(id: String) = Regex("^[a-zA-Z0-9_-]{8,64}$").matches(id)
internal fun validCaptureScope(scopeKey: String) = Regex("^[a-f0-9]{64}$").matches(scopeKey)
internal fun validCaptureRecovery(value: CaptureRecovery) =
  validCaptureId(value.sessionId) && validCaptureScope(value.scopeKey) &&
    value.playheadMs.isFinite() && value.playheadMs >= 0 &&
    value.width in 2..1920 && value.height in 2..1920 &&
    value.width % 2 == 0 && value.height % 2 == 0 && value.durationMs in 250..602_000

internal fun recoverCapturesForScope(records: List<CaptureRecovery>, scopeKey: String): List<CaptureRecovery> {
  if (!validCaptureScope(scopeKey)) return emptyList()
  return records.filter { validCaptureRecovery(it) && it.scopeKey == scopeKey }
}
