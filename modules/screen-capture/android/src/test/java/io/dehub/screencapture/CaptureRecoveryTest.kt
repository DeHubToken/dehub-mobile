package io.dehub.screencapture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureRecoveryTest {
  private val first = "a".repeat(64)
  private val second = "b".repeat(64)
  private fun record(scope: String = first) = CaptureRecovery("capture_123", scope, 1250.5, 1080, 1920, 10_000)

  @Test fun returnsOnlyTheOriginalProjectAndAccountScope() {
    assertEquals(listOf(record()), recoverCapturesForScope(listOf(record(), record(second)), first))
    assertTrue(recoverCapturesForScope(listOf(record()), second).isEmpty())
  }

  @Test fun retainsTheOriginalPlayheadAcrossRecovery() {
    assertEquals(1250.5, recoverCapturesForScope(listOf(record()), first).single().playheadMs, 0.0)
  }

  @Test fun refusesRawWalletsAndUnboundProjectNames() {
    for (scope in listOf("", "project-1", "0x" + "a".repeat(40), "A".repeat(64), "g".repeat(64))) {
      assertTrue(recoverCapturesForScope(listOf(record()), scope).isEmpty())
      assertFalse(validCaptureRecovery(record(scope)))
    }
  }

  @Test fun refusesTraversalAndInvalidSessionIdentifiers() {
    for (id in listOf("../capture", "capture/123", "short", "a".repeat(65))) assertFalse(validCaptureRecovery(record().copy(sessionId = id)))
  }

  @Test fun refusesInvalidPlayheadsWithoutMovingAValidRecording() {
    for (playhead in listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0)) assertFalse(validCaptureRecovery(record().copy(playheadMs = playhead)))
    assertTrue(validCaptureRecovery(record().copy(playheadMs = 0.0)))
  }

  @Test fun refusesIncompleteOrOutOfBoundsCaptureMetadata() {
    for (duration in listOf(0L, 249L, 602_001L)) assertFalse(validCaptureRecovery(record().copy(durationMs = duration)))
    for (width in listOf(0, 1081, 1922)) assertFalse(validCaptureRecovery(record().copy(width = width)))
    assertFalse(validCaptureRecovery(record().copy(height = 1921)))
  }
}
