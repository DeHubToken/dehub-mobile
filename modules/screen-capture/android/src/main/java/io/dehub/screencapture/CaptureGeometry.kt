package io.dehub.screencapture

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

internal data class CaptureSize(val width: Int, val height: Int)
internal data class CaptureViewport(val x: Int, val y: Int, val width: Int, val height: Int)

internal fun captureInputSize(width: Int, height: Int, longestEdge: Int = 1920): CaptureSize {
  require(width > 0 && height > 0 && longestEdge > 0)
  val scale = min(1.0, longestEdge.toDouble() / max(width, height))
  return CaptureSize(max(1, (width * scale).roundToInt()), max(1, (height * scale).roundToInt()))
}

internal fun captureSize(width: Int, height: Int, longestEdge: Int = 1920): CaptureSize {
  require(width > 0 && height > 0 && longestEdge >= 2)
  val scale = min(1.0, longestEdge.toDouble() / max(width, height))
  return CaptureSize(max(2, (width * scale).roundToInt() / 2 * 2), max(2, (height * scale).roundToInt() / 2 * 2))
}

internal fun captureViewport(source: CaptureSize, canvas: CaptureSize): CaptureViewport {
  require(source.width > 0 && source.height > 0 && canvas.width > 0 && canvas.height > 0)
  val scale = min(canvas.width.toDouble() / source.width, canvas.height.toDouble() / source.height)
  val width = max(1, min(canvas.width, (source.width * scale).roundToInt()))
  val height = max(1, min(canvas.height, (source.height * scale).roundToInt()))
  return CaptureViewport((canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
}

internal fun mixCaptureSamples(inputs: List<ShortArray>, samples: Int, output: ShortArray) {
  require(inputs.isNotEmpty() && samples >= 0 && samples <= output.size && inputs.all { it.size >= samples })
  for (index in 0 until samples) {
    var sum = 0L
    for (input in inputs) sum += input[index].toLong()
    output[index] = (sum / inputs.size).coerceIn(Short.MIN_VALUE.toLong(), Short.MAX_VALUE.toLong()).toShort()
  }
}
