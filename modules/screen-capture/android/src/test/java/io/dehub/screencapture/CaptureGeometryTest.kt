package io.dehub.screencapture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CaptureGeometryTest {
  @Test fun keepsPhoneCaptureEvenAndWithinEncoderDimensions() {
    assertEquals(CaptureSize(1080, 1920), captureSize(1440, 2560))
    val odd = captureSize(1081, 1921)
    assertTrue(odd.width % 2 == 0 && odd.height % 2 == 0 && odd.height <= 1920)
  }

  @Test fun centersLandscapeContentInsidePhoneCaptureWithoutCropping() {
    assertEquals(CaptureViewport(0, 656, 1080, 608), captureViewport(CaptureSize(1920, 1080), CaptureSize(1080, 1920)))
  }

  @Test fun retainsOddAppWindowDimensionsBeforeFittingTheEncoderCanvas() {
    assertEquals(CaptureSize(411, 733), captureInputSize(411, 733))
    assertEquals(CaptureSize(1920, 1080), captureInputSize(3840, 2160))
  }

  @Test fun centersPhoneContentInsideLandscapeCaptureWithoutStretching() {
    assertEquals(CaptureViewport(656, 0, 608, 1080), captureViewport(CaptureSize(1080, 1920), CaptureSize(1920, 1080)))
  }

  @Test fun preservesMatchingSourceAspectAndFitsOddSizedWindows() {
    assertEquals(CaptureViewport(0, 0, 1280, 720), captureViewport(CaptureSize(1920, 1080), CaptureSize(1280, 720)))
    val viewport = captureViewport(CaptureSize(411, 733), CaptureSize(1080, 1920))
    assertTrue(viewport.x >= 0 && viewport.y >= 0 && viewport.x + viewport.width <= 1080 && viewport.y + viewport.height <= 1920)
    assertTrue(kotlin.math.abs(viewport.width.toDouble() / viewport.height - 411.0 / 733.0) < 0.001)
  }

  @Test fun preservesBothSystemAudioAndVoiceAndAvoidsClippingAtFullScale() {
    val output = ShortArray(5)
    mixCaptureSamples(listOf(shortArrayOf(1000, 0, 32767, -32768, 32767), shortArrayOf(0, 2000, 32767, -32768, -32767)), 5, output)
    assertEquals(listOf<Short>(500, 1000, 32767, -32768, 0), output.toList())
  }

  @Test fun retainsSourceGainWhenOnlyNarrationOrOnlySharedSoundIsAvailable() {
    val source = shortArrayOf(1000, -1200, 32767, -32768)
    val output = ShortArray(4)
    mixCaptureSamples(listOf(source), 4, output)
    assertEquals(source.toList(), output.toList())
  }
}
