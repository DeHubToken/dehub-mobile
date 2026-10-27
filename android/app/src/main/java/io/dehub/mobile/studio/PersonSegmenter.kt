package io.dehub.mobile.studio

import android.os.SystemClock
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.webrtc.VideoFrame

private const val TAG = "DHBStudioSegmenter"

/** At most this many segmentations a second; the mask in between is reused. */
private const val MIN_INTERVAL_MS = 50L

/**
 * A person mask in buffer layout, one confidence byte per luma pixel and one
 * per chroma pixel. 255 is the person, 0 is the room behind them.
 */
class PersonMask(val geometry: Geometry, val luma: ByteArray, val chroma: ByteArray)

/**
 * ML Kit selfie segmentation in stream mode, run beside the capture thread.
 *
 * The capture thread only ever does two cheap things: hands over a
 * half-resolution NV21 copy of a frame when the previous one has finished, and
 * reads whatever mask is newest. A segmentation that runs slow costs a stale
 * mask edge for a frame or two, never a late frame.
 */
object PersonSegmenter {
    private val busy = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor { r -> Thread(r, "dhb-studio-segment") }
    @Volatile private var lastStartMs = 0L
    @Volatile private var failed = false

    @Volatile var mask: PersonMask? = null
        private set

    private val segmenter: Segmenter? by lazy {
        try {
            Segmentation.getClient(
                SelfieSegmenterOptions.Builder()
                    .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                    .build()
            )
        } catch (t: Throwable) {
            Log.w(TAG, "Selfie segmentation is unavailable", t)
            failed = true
            null
        }
    }

    /** Drops the mask, so a later background starts clean rather than from an old pose. */
    fun reset() {
        mask = null
    }

    /**
     * Offer a frame. Returns immediately; most frames are declined because a
     * segmentation is already running.
     */
    fun offer(src: VideoFrame.I420Buffer, geom: Geometry) {
        if (failed) return
        val now = SystemClock.uptimeMillis()
        if (now - lastStartMs < MIN_INTERVAL_MS) return
        if (!busy.compareAndSet(false, true)) return
        lastStartMs = now
        val client = segmenter
        if (client == null) {
            busy.set(false)
            return
        }
        try {
            // Half resolution in each direction: the model itself looks at
            // 256px, so the full frame would only cost time.
            val w = (src.width / 2) and 1.inv()
            val h = (src.height / 2) and 1.inv()
            if (w < 2 || h < 2) {
                busy.set(false)
                return
            }
            val nv21 = ByteArray(w * h + w * h / 2)
            val dy = src.dataY
            val sy = src.strideY
            for (y in 0 until h) {
                val s = y * 2 * sy
                val d = y * w
                for (x in 0 until w) nv21[d + x] = dy.get(s + x * 2)
            }
            val du = src.dataU
            val dv = src.dataV
            val su = src.strideU
            val sv = src.strideV
            val cw = w / 2
            val ch = h / 2
            var o = w * h
            for (y in 0 until ch) {
                val ru = y * 2 * su
                val rv = y * 2 * sv
                for (x in 0 until cw) {
                    nv21[o++] = dv.get(rv + x * 2)
                    nv21[o++] = du.get(ru + x * 2)
                }
            }
            val image = InputImage.fromByteArray(nv21, w, h, geom.rotation, InputImage.IMAGE_FORMAT_NV21)
            client.process(image)
                .addOnSuccessListener(executor) { result ->
                    try {
                        accept(result, w, h, geom)
                    } catch (t: Throwable) {
                        Log.w(TAG, "Could not use a mask", t)
                    } finally {
                        busy.set(false)
                    }
                }
                .addOnFailureListener(executor) { e ->
                    Log.w(TAG, "Segmentation failed", e)
                    busy.set(false)
                }
        } catch (t: Throwable) {
            Log.w(TAG, "Could not start a segmentation", t)
            busy.set(false)
        }
    }

    /**
     * Lays the mask out like the frame, softens its edge, and blends it with
     * the previous one so hair and shoulders do not flicker frame to frame.
     */
    private fun accept(result: SegmentationMask, inputW: Int, inputH: Int, geom: Geometry) {
        val mw = result.width
        val mh = result.height
        if (mw <= 0 || mh <= 0) return
        val floats = result.buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
        val small = ByteArray(mw * mh)
        for (i in 0 until mw * mh) {
            // Confidence 0.3..0.7 becomes the soft edge; anything firmer is solid.
            val c = (floats.get(i) - 0.3f) / 0.4f
            small[i] = (c.coerceIn(0f, 1f) * 255f).toInt().toByte()
        }

        // ML Kit answers in the upright picture when it was told a rotation;
        // a quarter-turn mask the shape of the raw input is in buffer layout
        // already. (Upside down cannot be told apart by shape; upright is assumed.)
        val inBufferLayout = geom.rotation == 0 ||
            (geom.swapped && mw * inputH == mh * inputW && inputW != inputH)
        val sampler = if (inBufferLayout) {
            Sampler.build(Geometry(geom.width, geom.height, 0), mw, mh, Fit.FILL)
        } else {
            Sampler.build(geom, mw, mh, Fit.FILL)
        }

        val w = geom.width
        val h = geom.height
        val previous = mask?.takeIf { it.geometry == geom }
        val luma = ByteArray(w * h)
        for (y in 0 until h) {
            val row = y * w
            for (x in 0 until w) {
                val fresh = small[sampler.sourceY(x, y) * mw + sampler.sourceX(x, y)].toInt() and 0xFF
                val value = if (previous != null) {
                    ((previous.luma[row + x].toInt() and 0xFF) + fresh * 3) shr 2
                } else fresh
                luma[row + x] = value.toByte()
            }
        }
        val cw = geom.chromaWidth
        val ch = geom.chromaHeight
        val chroma = ByteArray(cw * ch)
        for (cy in 0 until ch) {
            val ly = minOf(cy * 2, h - 1) * w
            val row = cy * cw
            for (cx in 0 until cw) chroma[row + cx] = luma[ly + minOf(cx * 2, w - 1)]
        }
        mask = PersonMask(geom, luma, chroma)
    }
}
