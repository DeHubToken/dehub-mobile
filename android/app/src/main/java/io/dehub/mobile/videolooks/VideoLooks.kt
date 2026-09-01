package io.dehub.mobile.videolooks

import android.util.Log
import com.oney.WebRTCModule.videoEffects.ProcessorProvider
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import java.nio.ByteBuffer
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame

/**
 * Camera looks — the Android half.
 *
 * react-native-webrtc ships the video-effects plumbing (ProcessorProvider,
 * VideoEffectProcessor) and no processors at all, so `track._setVideoEffect(name)`
 * is a no-op until something registers one under that name. This is that
 * something. The JS side names a look, the capture pipeline asks
 * ProcessorProvider for it, and every frame passes through `process` on its way
 * to the encoder.
 *
 * The web app does the same job with a canvas in front of the camera
 * (src/lib/livepeer/video-effects.ts); React Native has no canvas and no way to
 * publish a synthetic track, which is why this is native at all.
 *
 * **Everything here works on the YUV planes, and that is the whole performance
 * story.** Chroma is quarter resolution, so recolouring — mono, warm, cool,
 * vivid, neon, the VHS chroma bleed — touches a quarter of the data and costs
 * almost nothing. Anything that has to walk the full luma plane (the tone
 * curves, the mosaic) is written as a lookup table or a bulk row copy for the
 * same reason. Nothing convolves, which is why the web app's Soft and Dream
 * bloom are not here: a real blur over 720p luma in Java will not hold 30fps,
 * and Soft is a tone curve here instead.
 *
 * **Failure is designed in.** VideoEffectProcessor treats a null return as
 * "publish the frame untouched", so every path out of `process` that is not a
 * finished frame is a null, and a broken look degrades to a plain broadcast
 * rather than a dead one.
 */
private const val TAG = "VideoLooks"

/** Neutral chroma. 128 in both planes is grey — no colour at all. */
private const val NEUTRAL = 128

/** Fixed point for the chroma maths: 256 = 1.0. Integer throughout, per frame. */
private const val ONE = 256

const val LOOK_SOFT = "soft"
const val LOOK_MONO = "mono"
const val LOOK_NOIR = "noir"
const val LOOK_WARM = "warm"
const val LOOK_COOL = "cool"
const val LOOK_VIVID = "vivid"
const val LOOK_NEON = "neon"
const val LOOK_VHS = "vhs"
const val LOOK_PIXELATE = "pixelate"

private val ALL_LOOKS = listOf(
    LOOK_SOFT, LOOK_MONO, LOOK_NOIR, LOOK_WARM,
    LOOK_COOL, LOOK_VIVID, LOOK_NEON, LOOK_VHS, LOOK_PIXELATE
)

object VideoLooks {
    /**
     * Registers every look. Called once from MainApplication.
     *
     * Wrapped whole: this runs on the startup path, and a look that cannot be
     * registered must cost the creator a filter, never the app.
     */
    @JvmStatic
    fun register() {
        try {
            for (look in ALL_LOOKS) {
                ProcessorProvider.addProcessor(look, VideoFrameProcessorFactoryInterface {
                    LookProcessor(look)
                })
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Camera looks could not be registered", t)
        }
    }
}

private class LookProcessor(private val look: String) : VideoFrameProcessor {

    /**
     * One reusable row, grown on demand.
     *
     * The mosaic and the solid chroma fills both write the same row many times
     * over, and a fresh array per row would churn the allocator thirty times a
     * second. Safe as instance state because ProcessorProvider builds a
     * processor per track and frames arrive on one capture thread.
     */
    private var row = ByteArray(0)

    /** Tone curve for the looks that have one; null for the rest. */
    private val luma: ByteArray? = when (look) {
        LOOK_SOFT -> buildLut { y -> y + (255 - y) * 10 / 100 + 6 }
        LOOK_NOIR -> buildLut { y -> NEUTRAL + (y - NEUTRAL) * 150 / 100 - 8 }
        else -> null
    }

    override fun process(frame: VideoFrame?, textureHelper: SurfaceTextureHelper?): VideoFrame? {
        if (frame == null) return null
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
            if (w <= 0 || h <= 0) return null
            val buffer = JavaI420Buffer.allocate(w, h)
            out = buffer
            render(src, buffer, w, h)
            val produced = VideoFrame(buffer, frame.rotation, frame.timestampNs)
            // Ownership has moved to the frame; the pipeline releases it.
            out = null
            produced
        } catch (t: Throwable) {
            Log.w(TAG, "Look '$look' failed on a frame; publishing it untouched", t)
            out?.release()
            null
        } finally {
            // toI420() handed us a reference of our own, whatever happened above.
            src.release()
        }
    }

    private fun render(src: VideoFrame.I420Buffer, dst: JavaI420Buffer, w: Int, h: Int) {
        val cw = (w + 1) / 2
        val ch = (h + 1) / 2

        when (look) {
            LOOK_MONO -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                fillPlane(dst.dataU, dst.strideU, cw, ch, NEUTRAL)
                fillPlane(dst.dataV, dst.strideV, cw, ch, NEUTRAL)
            }

            LOOK_NOIR -> {
                lutPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h, luma!!)
                fillPlane(dst.dataU, dst.strideU, cw, ch, NEUTRAL)
                fillPlane(dst.dataV, dst.strideV, cw, ch, NEUTRAL)
            }

            // Soft is a tone curve, not a blur: shadows lifted, colour pulled
            // very slightly back, which is what actually flatters skin on a
            // phone camera in a badly lit room.
            LOOK_SOFT -> {
                lutPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h, luma!!)
                gradePlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch, 236, 0)
                gradePlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch, 236, 3)
            }

            // V carries red, U carries blue, so a temperature shift is one
            // addition on each — no per-pixel colour conversion anywhere.
            LOOK_WARM -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                gradePlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch, 268, -8)
                gradePlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch, 268, 12)
            }

            LOOK_COOL -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                gradePlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch, 268, 14)
                gradePlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch, 268, -10)
            }

            LOOK_VIVID -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                gradePlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch, 400, 0)
                gradePlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch, 400, 0)
            }

            // Rotating the (U,V) vector IS a hue rotation — the same thing the
            // web look asks CSS for, done with two multiplies.
            LOOK_NEON -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                rotateChroma(src, dst, cw, ch, cos = -241, sin = -88, saturation = 460)
            }

            // Chroma dragged apart horizontally is the colour bleed of a worn
            // tape; the darkened rows are the scanlines.
            LOOK_VHS -> {
                val drift = maxOf(1, cw / 90)
                scanlinePlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                shiftPlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch, -drift)
                shiftPlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch, drift)
            }

            // The privacy look. Nearest-neighbour on purpose: the detail is
            // discarded rather than smeared, so there is nothing left to
            // recover, and it reads as a deliberate choice rather than a
            // camera fault.
            LOOK_PIXELATE -> {
                val block = maxOf(4, w / 32)
                pixelatePlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h, block)
                pixelatePlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch, maxOf(2, block / 2))
                pixelatePlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch, maxOf(2, block / 2))
            }

            else -> {
                copyPlane(src.dataY, src.strideY, dst.dataY, dst.strideY, w, h)
                copyPlane(src.dataU, src.strideU, dst.dataU, dst.strideU, cw, ch)
                copyPlane(src.dataV, src.strideV, dst.dataV, dst.strideV, cw, ch)
            }
        }
    }

    private fun scratch(width: Int): ByteArray {
        if (row.size < width) row = ByteArray(width)
        return row
    }

    /** Row-at-a-time bulk copy — a memcpy per row, not a loop per byte. */
    private fun copyPlane(
        src: ByteBuffer, srcStride: Int,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int
    ) {
        val s = src.duplicate()
        val d = dst.duplicate()
        for (y in 0 until h) {
            s.clear(); s.position(y * srcStride); s.limit(y * srcStride + w)
            d.clear(); d.position(y * dstStride)
            d.put(s)
        }
    }

    private fun fillPlane(dst: ByteBuffer, dstStride: Int, w: Int, h: Int, value: Int) {
        val line = scratch(w)
        java.util.Arrays.fill(line, 0, w, value.toByte())
        val d = dst.duplicate()
        for (y in 0 until h) {
            d.clear(); d.position(y * dstStride)
            d.put(line, 0, w)
        }
    }

    private fun lutPlane(
        src: ByteBuffer, srcStride: Int,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int, lut: ByteArray
    ) {
        for (y in 0 until h) {
            val s = y * srcStride
            val d = y * dstStride
            for (x in 0 until w) {
                dst.put(d + x, lut[src.get(s + x).toInt() and 0xFF])
            }
        }
    }

    /** `out = 128 + (in - 128) * gain/256 + shift`, clamped. */
    private fun gradePlane(
        src: ByteBuffer, srcStride: Int,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int, gain: Int, shift: Int
    ) {
        for (y in 0 until h) {
            val s = y * srcStride
            val d = y * dstStride
            for (x in 0 until w) {
                val v = (src.get(s + x).toInt() and 0xFF) - NEUTRAL
                dst.put(d + x, clamp(NEUTRAL + (v * gain) / ONE + shift).toByte())
            }
        }
    }

    /** Rotates the chroma vector, which is a hue rotation, then saturates it. */
    private fun rotateChroma(
        src: VideoFrame.I420Buffer, dst: JavaI420Buffer,
        w: Int, h: Int, cos: Int, sin: Int, saturation: Int
    ) {
        val su = src.dataU; val sv = src.dataV
        val du = dst.dataU; val dv = dst.dataV
        for (y in 0 until h) {
            val sur = y * src.strideU; val svr = y * src.strideV
            val dur = y * dst.strideU; val dvr = y * dst.strideV
            for (x in 0 until w) {
                val u = (su.get(sur + x).toInt() and 0xFF) - NEUTRAL
                val v = (sv.get(svr + x).toInt() and 0xFF) - NEUTRAL
                val ru = (u * cos - v * sin) / ONE
                val rv = (u * sin + v * cos) / ONE
                du.put(dur + x, clamp(NEUTRAL + (ru * saturation) / ONE).toByte())
                dv.put(dvr + x, clamp(NEUTRAL + (rv * saturation) / ONE).toByte())
            }
        }
    }

    /** Copies each row displaced horizontally, clamping at the edges. */
    private fun shiftPlane(
        src: ByteBuffer, srcStride: Int,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int, dx: Int
    ) {
        for (y in 0 until h) {
            val s = y * srcStride
            val d = y * dstStride
            for (x in 0 until w) {
                val sx = (x - dx).coerceIn(0, w - 1)
                dst.put(d + x, src.get(s + sx))
            }
        }
    }

    /** Copies luma, dropping every fourth row pair to a darker level. */
    private fun scanlinePlane(
        src: ByteBuffer, srcStride: Int,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int
    ) {
        copyPlane(src, srcStride, dst, dstStride, w, h)
        for (y in 0 until h) {
            if (y % 4 >= 2) continue
            val d = y * dstStride
            for (x in 0 until w) {
                dst.put(d + x, ((dst.get(d + x).toInt() and 0xFF) * 72 / 100).toByte())
            }
        }
    }

    /**
     * Nearest-neighbour mosaic.
     *
     * One source row per block builds one output row, which is then bulk-copied
     * down the block — so the cost is a handful of reads plus a memcpy per row,
     * not a sample per pixel.
     */
    private fun pixelatePlane(
        src: ByteBuffer, srcStride: Int,
        dst: ByteBuffer, dstStride: Int,
        w: Int, h: Int, block: Int
    ) {
        val line = scratch(w)
        val d = dst.duplicate()
        var y = 0
        while (y < h) {
            val sampleRow = minOf(y + block / 2, h - 1) * srcStride
            var x = 0
            while (x < w) {
                val value = src.get(sampleRow + minOf(x + block / 2, w - 1))
                val end = minOf(x + block, w)
                java.util.Arrays.fill(line, x, end, value)
                x = end
            }
            val lastRow = minOf(y + block, h)
            var yy = y
            while (yy < lastRow) {
                d.clear(); d.position(yy * dstStride)
                d.put(line, 0, w)
                yy++
            }
            y = lastRow
        }
    }

    private fun clamp(v: Int): Int = if (v < 0) 0 else if (v > 255) 255 else v

    private fun buildLut(curve: (Int) -> Int): ByteArray {
        val lut = ByteArray(256)
        for (i in 0..255) lut[i] = clamp(curve(i)).toByte()
        return lut
    }
}
