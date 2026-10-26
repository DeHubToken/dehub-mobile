package io.dehub.mobile.studio

import android.os.SystemClock
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

private const val TAG = "DHBStudio"

/** How long a scene card takes to fade in or out. */
const val CARD_FADE_MS = 300L

enum class BackgroundMode { NONE, BLUR, COLOR, IMAGE;
    companion object {
        fun parse(raw: String?): BackgroundMode = when (raw) {
            "blur" -> BLUR
            "color" -> COLOR
            "image" -> IMAGE
            else -> NONE
        }
    }
}

/**
 * The card currently on air and the one it is fading from. Either side may be
 * null, which means "the camera". `changedAtMs` is uptime, so a fade survives a
 * wall-clock change.
 */
class CardFade(val current: OpaqueLayer?, val previous: OpaqueLayer?, val changedAtMs: Long) {
    /** 0 → all previous, 256 → all current. */
    fun progress(now: Long): Int {
        val t = ((now - changedAtMs).toFloat() / CARD_FADE_MS).coerceIn(0f, 1f)
        val eased = t * t * (3 - 2 * t)
        return (eased * 256).toInt()
    }
}

/**
 * Everything the studio processors read, written from JS through StudioModule.
 *
 * The capture thread only ever reads immutable snapshots out of volatile
 * fields, so it never waits on a lock and never sees half a picture. Anything
 * slow — decoding a PNG, re-laying-out a picture for a new rotation — happens
 * on the module's thread or on `worker`, never on a frame.
 */
object StudioState {
    private val worker: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "dhb-studio-layout").apply { priority = Thread.NORM_PRIORITY - 1 }
    }
    private val generations = AtomicLong(0)
    private val relayoutQueued = AtomicBoolean(false)

    @Volatile var geometry: Geometry? = null
        private set

    // Sources, upright, as decoded.
    @Volatile private var overlaySource: SourcePicture? = null
    @Volatile private var cardSource: SourcePicture? = null
    @Volatile private var backgroundSource: SourcePicture? = null

    // Laid out for `geometry`.
    @Volatile var overlay: AlphaLayer? = null
        private set
    @Volatile var card: CardFade = CardFade(null, null, 0)
        private set
    @Volatile var backgroundImage: OpaqueLayer? = null
        private set

    @Volatile var backgroundMode: BackgroundMode = BackgroundMode.NONE
        private set
    /** Y, U, V of the colour background. */
    @Volatile var backgroundColor: IntArray = Yuv.ofHex(null)
        private set

    fun nextGeneration(): Long = generations.incrementAndGet()

    // ── Writers (module thread) ─────────────────────────────────────────────

    fun setBackground(mode: BackgroundMode, color: String?, picture: SourcePicture?) {
        backgroundColor = Yuv.ofHex(color)
        backgroundSource = if (mode == BackgroundMode.IMAGE) picture else null
        val geom = geometry
        backgroundImage = if (mode == BackgroundMode.IMAGE && picture != null && geom != null) {
            OpaqueLayer.build(picture, geom, Fit.COVER)
        } else null
        backgroundMode = if (mode == BackgroundMode.IMAGE && picture == null) BackgroundMode.NONE else mode
    }

    fun setOverlay(picture: SourcePicture?) {
        overlaySource = picture
        val geom = geometry
        overlay = if (picture != null && geom != null) AlphaLayer.build(picture, geom) else null
    }

    fun setCard(picture: SourcePicture?, fade: Boolean) {
        cardSource = picture
        val geom = geometry
        val layer = if (picture != null && geom != null) OpaqueLayer.build(picture, geom, Fit.FILL) else null
        val before = card
        val now = SystemClock.uptimeMillis()
        card = when {
            // A countdown tick: same scene, new digits. No fade, and a fade
            // already running carries on from where it was.
            !fade -> CardFade(layer, before.previous, before.changedAtMs)
            else -> CardFade(layer, settledCard(before, now), now)
        }
    }

    /** What is actually on screen at `now`, as the starting point for a new fade. */
    private fun settledCard(state: CardFade, now: Long): OpaqueLayer? =
        if (state.progress(now) >= 128) state.current else state.previous

    fun clear() {
        setOverlay(null)
        card = CardFade(null, null, 0)
        cardSource = null
        setBackground(BackgroundMode.NONE, null, null)
    }

    // ── Reader side (capture thread) ────────────────────────────────────────

    /**
     * Called by every studio processor with each frame's shape. A new shape —
     * the first frame, a camera flip, the phone turned — re-lays-out every
     * picture on the worker; until that finishes the processors skip whatever
     * no longer fits, so the frame is never held up.
     */
    fun noteGeometry(width: Int, height: Int, rotation: Int) {
        val next = Geometry.normalise(width, height, rotation)
        if (next == geometry) return
        geometry = next
        if (!relayoutQueued.compareAndSet(false, true)) return
        try {
            worker.execute {
                relayoutQueued.set(false)
                relayout()
            }
        } catch (t: Throwable) {
            relayoutQueued.set(false)
            Log.w(TAG, "Could not queue a relayout", t)
        }
    }

    private fun relayout() {
        val geom = geometry ?: return
        try {
            overlaySource?.let { src ->
                if (overlay?.geometry != geom) overlay = AlphaLayer.build(src, geom)
            }
            cardSource?.let { src ->
                val state = card
                if (state.current?.geometry != geom) {
                    // A relayout is not a scene change: no fade, and a stale
                    // previous card is dropped rather than drawn at the wrong size.
                    card = CardFade(OpaqueLayer.build(src, geom, Fit.FILL), null, 0)
                }
            }
            backgroundSource?.let { src ->
                if (backgroundImage?.geometry != geom) backgroundImage = OpaqueLayer.build(src, geom, Fit.COVER)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Studio relayout failed", t)
        }
    }
}
