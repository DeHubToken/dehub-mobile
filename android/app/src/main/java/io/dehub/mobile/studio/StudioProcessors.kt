package io.dehub.mobile.studio

import android.os.SystemClock
import android.util.Log
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import java.nio.ByteBuffer
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

private const val TAG = "DHBStudio"

/** Processor names. A contract with libs/phoneStudio.ts and videoLooks.ts. */
const val PROCESSOR_BACKGROUND = "dhb-background"
const val PROCESSOR_STUDIO = "dhb-studio"

/**
 * The phone studio's two frame processors, registered beside the camera looks
 * (videolooks/VideoLooks.kt) and following the same rules: everything is done
 * on the YUV planes, nothing allocates per pixel, and any failure returns null
 * so the chain carries on without this step rather than dropping the frame.
 *
 * Order in the chain is look → background → studio: the background is cut out
 * of the graded picture, and cards and widgets go on last so nothing grades or
 * cuts them.
 */
object Studio {
    @JvmStatic
    fun register() {
        try {
            ProcessorProvider.addProcessor(PROCESSOR_BACKGROUND, VideoFrameProcessorFactoryInterface { BackgroundProcessor() })
            ProcessorProvider.addProcessor(PROCESSOR_STUDIO, VideoFrameProcessorFactoryInterface { StudioProcessor() })
        } catch (t: Throwable) {
            Log.w(TAG, "Studio processors could not be registered", t)
        }
    }
}

/** Shared plumbing: get an I420 view of the frame, hand back a new frame or null. */
private abstract class PlaneProcessor : VideoFrameProcessor {
    protected var rowA = ByteArray(0)
    protected var rowB = ByteArray(0)

    protected fun rows(width: Int) {
        if (rowA.size < width) {
            rowA = ByteArray(width)
            rowB = ByteArray(width)
        }
    }

    /** Fill `dst` from `src`; false means "nothing to do", and the frame passes through. */
    abstract fun render(src: VideoFrame.I420Buffer, dst: JavaI420Buffer, geom: Geometry): Boolean

    /** Cheap check before any conversion: false skips the frame without touching it. */
    abstract fun wanted(): Boolean

    override fun process(frame: VideoFrame?, textureHelper: SurfaceTextureHelper?): VideoFrame? {
        if (frame == null || !wanted()) return null
        val src = try {
            frame.buffer.toI420()
        } catch (t: Throwable) {
            Log.w(TAG, "Frame would not convert to I420", t)
            null
        } ?: return null

        var out: JavaI420Buffer? = null
        return try {
            val w = src.width
            val h = src.height
            if (w <= 1 || h <= 1) return null
            StudioState.noteGeometry(w, h, frame.rotation)
            val geom = StudioState.geometry ?: return null
            if (geom.width != w || geom.height != h) return null
            val buffer = JavaI420Buffer.allocate(w, h)
            out = buffer
            if (!render(src, buffer, geom)) return null
            val produced = VideoFrame(buffer, frame.rotation, frame.timestampNs)
            out = null
            produced
        } catch (t: Throwable) {
            Log.w(TAG, "${javaClass.simpleName} failed on a frame; skipping it", t)
            null
        } finally {
            out?.release()
            src.release()
        }
    }

    protected fun readRow(plane: ByteBuffer, stride: Int, y: Int, into: ByteArray, width: Int) {
        val b = plane.duplicate()
        b.clear()
        b.position(y * stride)
        b.get(into, 0, width)
    }

    protected fun writeRow(plane: ByteBuffer, stride: Int, y: Int, from: ByteArray, offset: Int, width: Int) {
        val b = plane.duplicate()
        b.clear()
        b.position(y * stride)
        b.put(from, offset, width)
    }

    protected fun copyPlane(src: ByteBuffer, srcStride: Int, dst: ByteBuffer, dstStride: Int, w: Int, h: Int) {
        val s = src.duplicate()
        val d = dst.duplicate()
        for (y in 0 until h) {
            s.clear(); s.position(y * srcStride); s.limit(y * srcStride + w)
            d.clear(); d.position(y * dstStride)
            d.put(s)
        }
    }
}

// ─── Scene cards and overlay ────────────────────────────────────────────────

private class StudioProcessor : PlaneProcessor() {

    override fun wanted(): Boolean {
        val card = StudioState.card
        return StudioState.overlay != null || card.current != null || card.previous != null ||
            // A frame is needed to learn the geometry a pending picture must be laid out for.
            StudioState.geometry == null
    }

    override fun render(src: VideoFrame.I420Buffer, dst: JavaI420Buffer, geom: Geometry): Boolean {
        val overlay = StudioState.overlay?.takeIf { it.geometry == geom }
        val fade = StudioState.card
        val current = fade.current?.takeIf { it.geometry == geom }
        val previous = fade.previous?.takeIf { it.geometry == geom }
        if (overlay == null && current == null && previous == null) return false

        val w = geom.width
        val h = geom.height
        val cw = geom.chromaWidth
        val ch = geom.chromaHeight
        rows(w)

        val t = if (current == null && previous == null) 256 else fade.progress(SystemClock.uptimeMillis())
        when {
            // Settled on a card: the camera is not drawn at all.
            current != null && t >= 256 -> {
                putPlane(current.y, w, dst.dataY, dst.strideY, w, h)
                putPlane(current.u, cw, dst.dataU, dst.strideU, cw, ch)
                putPlane(current.v, cw, dst.dataV, dst.strideV, cw, ch)
            }
            // Settled on the camera (or nothing laid out yet).
            current == null && (previous == null || t >= 256) -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                copyPlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch)
                copyPlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch)
            }
            // Mid-fade: previous → current, either of which may be the camera.
            else -> {
                mixPlane(src.dataY, src.strideY, previous?.y, current?.y, dst.dataY, dst.strideY, w, h, t)
                mixPlane(src.dataU, src.strideU, previous?.u, current?.u, dst.dataU, dst.strideU, cw, ch, t)
                mixPlane(src.dataV, src.strideV, previous?.v, current?.v, dst.dataV, dst.strideV, cw, ch, t)
            }
        }

        if (overlay != null) {
            blendPlane(dst.dataY, dst.strideY, overlay.y, overlay.a, overlay.spans, w, h)
            blendPlane(dst.dataU, dst.strideU, overlay.u, overlay.ca, overlay.chromaSpans, cw, ch)
            blendPlane(dst.dataV, dst.strideV, overlay.v, overlay.ca, overlay.chromaSpans, cw, ch)
        }
        return true
    }

    private fun putPlane(from: ByteArray, fromStride: Int, dst: ByteBuffer, dstStride: Int, w: Int, h: Int) {
        for (y in 0 until h) writeRow(dst, dstStride, y, from, y * fromStride, w)
    }

    /** `out = a + (b - a) * t/256`, where a null side is the camera row. */
    private fun mixPlane(
        cam: ByteBuffer, camStride: Int,
        a: ByteArray?, b: ByteArray?,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int, t: Int,
    ) {
        val inv = 256 - t
        for (y in 0 until h) {
            readRow(cam, camStride, y, rowA, w)
            val off = y * w
            for (x in 0 until w) {
                val camera = rowA[x].toInt() and 0xFF
                val from = if (a != null) a[off + x].toInt() and 0xFF else camera
                val to = if (b != null) b[off + x].toInt() and 0xFF else camera
                rowB[x] = ((from * inv + to * t) shr 8).toByte()
            }
            writeRow(dst, dstStride, y, rowB, 0, w)
        }
    }

    /** Premultiplied over: `out = premul + dst * (255 - a) / 255`, only inside each row's span. */
    private fun blendPlane(
        dst: ByteBuffer, dstStride: Int,
        premul: ByteArray, alpha: ByteArray, spans: IntArray,
        w: Int, h: Int,
    ) {
        for (y in 0 until h) {
            val start = spans[y * 2]
            val end = spans[y * 2 + 1]
            if (end <= start) continue
            readRow(dst, dstStride, y, rowA, w)
            val off = y * w
            for (x in start until end) {
                val a = alpha[off + x].toInt() and 0xFF
                if (a == 0) continue
                val p = premul[off + x].toInt() and 0xFF
                rowA[x] = if (a == 255) p.toByte()
                else (p + ((rowA[x].toInt() and 0xFF) * (255 - a) + 127) / 255).coerceAtMost(255).toByte()
            }
            writeRow(dst, dstStride, y, rowA, 0, w)
        }
    }
}

// ─── Background removal ─────────────────────────────────────────────────────

/** The blur grid is the frame at 1/8 luma resolution (1/4 chroma), blurred again. */
private const val GRID = 8

private class BackgroundProcessor : PlaneProcessor() {
    private var gridY = IntArray(0)
    private var gridU = IntArray(0)
    private var gridV = IntArray(0)
    private var gridTmp = IntArray(0)
    private var mode = BackgroundMode.NONE

    override fun wanted(): Boolean {
        val next = StudioState.backgroundMode
        if (next != mode) {
            if (mode == BackgroundMode.NONE) PersonSegmenter.reset()
            mode = next
        }
        return next != BackgroundMode.NONE
    }

    override fun render(src: VideoFrame.I420Buffer, dst: JavaI420Buffer, geom: Geometry): Boolean {
        PersonSegmenter.offer(src, geom)
        // Until the first mask lands the picture goes out as it is.
        val mask = PersonSegmenter.mask?.takeIf { it.geometry == geom } ?: return false
        val bgMode = StudioState.backgroundMode
        val image = if (bgMode == BackgroundMode.IMAGE) {
            StudioState.backgroundImage?.takeIf { it.geometry == geom } ?: return false
        } else null

        val w = geom.width
        val h = geom.height
        val cw = geom.chromaWidth
        val ch = geom.chromaHeight
        rows(w)

        when (bgMode) {
            BackgroundMode.BLUR -> {
                val gw = (w + GRID - 1) / GRID
                val gh = (h + GRID - 1) / GRID
                buildGrid(src, gw, gh, w, h, cw, ch)
                compositeBlur(src.dataY, src.strideY, mask.luma, gridY, gw, gh, GRID, dst.dataY, dst.strideY, w, h)
                compositeBlur(src.dataU, src.strideU, mask.chroma, gridU, gw, gh, GRID / 2, dst.dataU, dst.strideU, cw, ch)
                compositeBlur(src.dataV, src.strideV, mask.chroma, gridV, gw, gh, GRID / 2, dst.dataV, dst.strideV, cw, ch)
            }
            BackgroundMode.COLOR -> {
                val c = StudioState.backgroundColor
                compositeFlat(src.dataY, src.strideY, mask.luma, c[0], dst.dataY, dst.strideY, w, h)
                compositeFlat(src.dataU, src.strideU, mask.chroma, c[1], dst.dataU, dst.strideU, cw, ch)
                compositeFlat(src.dataV, src.strideV, mask.chroma, c[2], dst.dataV, dst.strideV, cw, ch)
            }
            BackgroundMode.IMAGE -> {
                val img = image!!
                compositeImage(src.dataY, src.strideY, mask.luma, img.y, dst.dataY, dst.strideY, w, h)
                compositeImage(src.dataU, src.strideU, mask.chroma, img.u, dst.dataU, dst.strideU, cw, ch)
                compositeImage(src.dataV, src.strideV, mask.chroma, img.v, dst.dataV, dst.strideV, cw, ch)
            }
            BackgroundMode.NONE -> return false
        }
        return true
    }

    private fun compositeFlat(
        src: ByteBuffer, srcStride: Int, mask: ByteArray, value: Int,
        dst: ByteBuffer, dstStride: Int, w: Int, h: Int,
    ) {
        for (y in 0 until h) {
            readRow(src, srcStride, y, rowA, w)
            val off = y * w
            for (x in 0 until w) {
                val m = mask[off + x].toInt() and 0xFF
                if (m == 255) continue
                val fg = rowA[x].toInt() and 0xFF
                rowA[x] = ((fg * m + value * (255 - m) + 127) / 255).toByte()
            }
            writeRow(dst, dstStride, y, rowA, 0, w)
        }
    }

    private fun compositeImage(
        src: ByteBuffer, srcStride: Int, mask: ByteArray, bg: ByteArray,
        dst: ByteBuffer, dstStride: Int, w: Int, h: Int,
    ) {
        for (y in 0 until h) {
            readRow(src, srcStride, y, rowA, w)
            val off = y * w
            for (x in 0 until w) {
                val m = mask[off + x].toInt() and 0xFF
                if (m == 255) continue
                val fg = rowA[x].toInt() and 0xFF
                val b = bg[off + x].toInt() and 0xFF
                rowA[x] = ((fg * m + b * (255 - m) + 127) / 255).toByte()
            }
            writeRow(dst, dstStride, y, rowA, 0, w)
        }
    }

    /**
     * Blurred background, sampled bilinearly from the coarse grid: each output
     * row interpolates two grid rows once, then each pixel reads one value.
     */
    private fun compositeBlur(
        src: ByteBuffer, srcStride: Int, mask: ByteArray, grid: IntArray, gw: Int, gh: Int, cell: Int,
        dst: ByteBuffer, dstStride: Int, w: Int, h: Int,
    ) {
        val line = IntArray(gw)
        for (y in 0 until h) {
            readRow(src, srcStride, y, rowA, w)
            // Vertical interpolation, in 1/256ths.
            val gyf = ((y * 256 + 128) / cell - 128).coerceAtLeast(0)
            val gy0 = minOf(gyf shr 8, gh - 1)
            val gy1 = minOf(gy0 + 1, gh - 1)
            val fy = gyf and 0xFF
            val r0 = gy0 * gw
            val r1 = gy1 * gw
            for (gx in 0 until gw) line[gx] = (grid[r0 + gx] * (256 - fy) + grid[r1 + gx] * fy) shr 8
            val off = y * w
            for (x in 0 until w) {
                val m = mask[off + x].toInt() and 0xFF
                if (m == 255) continue
                val gxf = ((x * 256 + 128) / cell - 128).coerceAtLeast(0)
                val gx0 = minOf(gxf shr 8, gw - 1)
                val gx1 = minOf(gx0 + 1, gw - 1)
                val fx = gxf and 0xFF
                val bg = (line[gx0] * (256 - fx) + line[gx1] * fx) shr 8
                val fg = rowA[x].toInt() and 0xFF
                rowA[x] = ((fg * m + bg * (255 - m) + 127) / 255).toByte()
            }
            writeRow(dst, dstStride, y, rowA, 0, w)
        }
    }

    /** Coarse copies of the three planes (four samples per cell), then a wide box blur on each. */
    private fun buildGrid(src: VideoFrame.I420Buffer, gw: Int, gh: Int, w: Int, h: Int, cw: Int, ch: Int) {
        val n = gw * gh
        if (gridY.size != n) {
            gridY = IntArray(n); gridU = IntArray(n); gridV = IntArray(n); gridTmp = IntArray(n)
        }
        sampleGrid(src.dataY, src.strideY, w, h, GRID, gridY, gw, gh)
        sampleGrid(src.dataU, src.strideU, cw, ch, GRID / 2, gridU, gw, gh)
        sampleGrid(src.dataV, src.strideV, cw, ch, GRID / 2, gridV, gw, gh)
        for (g in arrayOf(gridY, gridU, gridV)) {
            boxBlur(g, gw, gh, 3)
            boxBlur(g, gw, gh, 3)
        }
    }

    private fun sampleGrid(plane: ByteBuffer, stride: Int, pw: Int, ph: Int, cell: Int, out: IntArray, gw: Int, gh: Int) {
        val q = maxOf(1, cell / 4)
        for (gy in 0 until gh) {
            val y0 = minOf(gy * cell + q, ph - 1)
            val y1 = minOf(gy * cell + cell - q, ph - 1)
            for (gx in 0 until gw) {
                val x0 = minOf(gx * cell + q, pw - 1)
                val x1 = minOf(gx * cell + cell - q, pw - 1)
                val sum = (plane.get(y0 * stride + x0).toInt() and 0xFF) +
                    (plane.get(y0 * stride + x1).toInt() and 0xFF) +
                    (plane.get(y1 * stride + x0).toInt() and 0xFF) +
                    (plane.get(y1 * stride + x1).toInt() and 0xFF)
                out[gy * gw + gx] = sum shr 2
            }
        }
    }

    /** Separable running-sum box blur with clamped edges. */
    private fun boxBlur(g: IntArray, gw: Int, gh: Int, r: Int) {
        val tmp = gridTmp
        val span = r * 2 + 1
        for (y in 0 until gh) {
            val row = y * gw
            var sum = 0
            for (k in -r..r) sum += g[row + k.coerceIn(0, gw - 1)]
            for (x in 0 until gw) {
                tmp[row + x] = sum / span
                sum += g[row + (x + r + 1).coerceAtMost(gw - 1)] - g[row + (x - r).coerceAtLeast(0)]
            }
        }
        for (x in 0 until gw) {
            var sum = 0
            for (k in -r..r) sum += tmp[k.coerceIn(0, gh - 1) * gw + x]
            for (y in 0 until gh) {
                g[y * gw + x] = sum / span
                sum += tmp[(y + r + 1).coerceAtMost(gh - 1) * gw + x] - tmp[(y - r).coerceAtLeast(0) * gw + x]
            }
        }
    }
}
