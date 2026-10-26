package io.dehub.mobile.studio

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File

/**
 * Studio pictures, converted into the camera's own pixel layout.
 *
 * Everything the studio draws (a scene card, the overlay of logos and widgets,
 * a background picture) arrives from JS as an upright picture: the frame as a
 * viewer sees it. The camera does not deliver frames that way. A portrait
 * phone hands over landscape buffers tagged with a rotation, and the encoder
 * rotates them on the far side. So each picture is resampled once, off the
 * capture thread, into planes laid out exactly like the buffer it will be
 * blended into — same width, same height, same rotation — and the per-frame
 * work is then a straight row-for-row blend with no geometry in it at all.
 *
 * Mirroring needs no handling here. WebRTC already flips front-camera frames
 * before they reach a processor, so what is in the buffer is what viewers see;
 * an upright picture placed over it reads the right way round for them.
 */

/** The shape of the frames a processor is seeing. */
data class Geometry(val width: Int, val height: Int, val rotation: Int) {
    val swapped: Boolean get() = rotation % 180 != 0
    /** The size of the picture once the rotation is applied: what viewers see. */
    val uprightWidth: Int get() = if (swapped) height else width
    val uprightHeight: Int get() = if (swapped) width else height
    val chromaWidth: Int get() = (width + 1) / 2
    val chromaHeight: Int get() = (height + 1) / 2

    companion object {
        fun normalise(width: Int, height: Int, rotation: Int): Geometry {
            val r = ((rotation % 360) + 360) % 360
            val snapped = when {
                r < 45 -> 0
                r < 135 -> 90
                r < 225 -> 180
                r < 315 -> 270
                else -> 0
            }
            return Geometry(width, height, snapped)
        }
    }
}

enum class Fit { FILL, COVER }

/**
 * Where each buffer pixel samples from in an upright source picture.
 *
 * For every rotation the source column depends on only one of the buffer's
 * axes and the source row on the other, so two lookup tables cover the whole
 * frame: `a` indexed by buffer column, `b` by buffer row. When `swapped`,
 * `b` gives the source column and `a` the source row.
 */
class Sampler(val a: IntArray, val b: IntArray, val swapped: Boolean) {
    fun sourceX(x: Int, y: Int): Int = if (swapped) b[y] else a[x]
    fun sourceY(x: Int, y: Int): Int = if (swapped) a[x] else b[y]

    companion object {
        fun build(geom: Geometry, sourceW: Int, sourceH: Int, fit: Fit): Sampler {
            val uw = geom.uprightWidth
            val uh = geom.uprightHeight
            var sx = sourceW.toDouble() / uw
            var sy = sourceH.toDouble() / uh
            var ox = 0.0
            var oy = 0.0
            if (fit == Fit.COVER) {
                val s = minOf(sx, sy)
                ox = (sourceW - uw * s) / 2.0
                oy = (sourceH - uh * s) / 2.0
                sx = s
                sy = s
            }
            val mapX = IntArray(uw) { u -> ((u + 0.5) * sx + ox).toInt().coerceIn(0, sourceW - 1) }
            val mapY = IntArray(uh) { u -> ((u + 0.5) * sy + oy).toInt().coerceIn(0, sourceH - 1) }
            val w = geom.width
            val h = geom.height
            return when (geom.rotation) {
                90 -> Sampler(IntArray(w) { x -> mapY[x] }, IntArray(h) { y -> mapX[h - 1 - y] }, true)
                180 -> Sampler(IntArray(w) { x -> mapX[w - 1 - x] }, IntArray(h) { y -> mapY[h - 1 - y] }, false)
                270 -> Sampler(IntArray(w) { x -> mapY[w - 1 - x] }, IntArray(h) { y -> mapX[y] }, true)
                else -> Sampler(IntArray(w) { x -> mapX[x] }, IntArray(h) { y -> mapY[y] }, false)
            }
        }
    }
}

/** RGB to YUV, BT.601 studio range: what the camera and the encoder speak on Android. */
object Yuv {
    fun y(r: Int, g: Int, b: Int): Int = clamp(((66 * r + 129 * g + 25 * b + 128) shr 8) + 16)
    fun u(r: Int, g: Int, b: Int): Int = clamp(((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128)
    fun v(r: Int, g: Int, b: Int): Int = clamp(((112 * r - 94 * g - 18 * b + 128) shr 8) + 128)
    fun clamp(v: Int): Int = if (v < 0) 0 else if (v > 255) 255 else v

    /** "#rrggbb" to (Y, U, V); anything unreadable is near-black. */
    fun ofHex(hex: String?): IntArray {
        val clean = hex?.trim()?.removePrefix("#")
        val n = if (clean != null && clean.length == 6) clean.toLongOrNull(16)?.toInt() else null
        val rgb = n ?: 0x0b0b0f
        val r = (rgb shr 16) and 0xFF
        val g = (rgb shr 8) and 0xFF
        val b = rgb and 0xFF
        return intArrayOf(y(r, g, b), u(r, g, b), v(r, g, b))
    }
}

/**
 * An upright ARGB picture, decoded once. The pixels are kept so the picture
 * can be re-laid-out for a new geometry (a camera flip, a resolution change)
 * without going back to the file.
 */
class SourcePicture(val width: Int, val height: Int, val pixels: IntArray, val generation: Long) {
    companion object {
        /** Longest side a picture is decoded at. A gallery photo can be 4000px. */
        private const val MAX_SIDE = 2048

        fun decode(path: String, generation: Long): SourcePicture? {
            val file = resolve(path) ?: return null
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
            val opts = BitmapFactory.Options().apply {
                inSampleSize = sample
                inPreferredConfig = Bitmap.Config.ARGB_8888
                inPremultiplied = false
            }
            val bitmap = BitmapFactory.decodeFile(file.absolutePath, opts) ?: return null
            return try {
                val w = bitmap.width
                val h = bitmap.height
                val pixels = IntArray(w * h)
                bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
                SourcePicture(w, h, pixels, generation)
            } finally {
                bitmap.recycle()
            }
        }

        private fun resolve(path: String): File? {
            val raw = if (path.startsWith("file://")) Uri.parse(path).path else path
            if (raw.isNullOrEmpty()) return null
            val file = File(raw)
            return if (file.isFile) file else null
        }
    }
}

/** An opaque picture in buffer layout: a scene card or a background picture. */
class OpaqueLayer(
    val geometry: Geometry,
    val generation: Long,
    val y: ByteArray,
    val u: ByteArray,
    val v: ByteArray,
) {
    companion object {
        fun build(src: SourcePicture, geom: Geometry, fit: Fit): OpaqueLayer {
            val w = geom.width
            val h = geom.height
            val cw = geom.chromaWidth
            val ch = geom.chromaHeight
            val s = Sampler.build(geom, src.width, src.height, fit)
            val px = src.pixels
            val sw = src.width
            val yp = ByteArray(w * h)
            val up = ByteArray(cw * ch)
            val vp = ByteArray(cw * ch)
            for (yy in 0 until h) {
                val row = yy * w
                for (x in 0 until w) {
                    val c = px[s.sourceY(x, yy) * sw + s.sourceX(x, yy)]
                    yp[row + x] = Yuv.y((c shr 16) and 0xFF, (c shr 8) and 0xFF, c and 0xFF).toByte()
                }
            }
            for (cy in 0 until ch) {
                val ly = minOf(cy * 2, h - 1)
                val row = cy * cw
                for (cx in 0 until cw) {
                    val lx = minOf(cx * 2, w - 1)
                    val c = px[s.sourceY(lx, ly) * sw + s.sourceX(lx, ly)]
                    val r = (c shr 16) and 0xFF
                    val g = (c shr 8) and 0xFF
                    val b = c and 0xFF
                    up[row + cx] = Yuv.u(r, g, b).toByte()
                    vp[row + cx] = Yuv.v(r, g, b).toByte()
                }
            }
            return OpaqueLayer(geom, src.generation, yp, up, vp)
        }
    }
}

/**
 * A translucent picture in buffer layout: logos and widgets.
 *
 * Colour is stored premultiplied, so the blend per pixel is one multiply and
 * one add. `spans` records, per row, the first and last column with anything
 * on it, so the large empty parts of an overlay cost nothing per frame.
 */
class AlphaLayer(
    val geometry: Geometry,
    val generation: Long,
    val y: ByteArray,
    val a: ByteArray,
    val u: ByteArray,
    val v: ByteArray,
    val ca: ByteArray,
    /** [start, end) per luma row; start == end means nothing on that row. */
    val spans: IntArray,
    val chromaSpans: IntArray,
) {
    companion object {
        fun build(src: SourcePicture, geom: Geometry): AlphaLayer {
            val w = geom.width
            val h = geom.height
            val cw = geom.chromaWidth
            val ch = geom.chromaHeight
            val s = Sampler.build(geom, src.width, src.height, Fit.FILL)
            val px = src.pixels
            val sw = src.width
            val yp = ByteArray(w * h)
            val ap = ByteArray(w * h)
            val up = ByteArray(cw * ch)
            val vp = ByteArray(cw * ch)
            val cap = ByteArray(cw * ch)
            val spans = IntArray(h * 2)
            val chromaSpans = IntArray(ch * 2)

            for (yy in 0 until h) {
                val row = yy * w
                var first = -1
                var last = -1
                for (x in 0 until w) {
                    val c = px[s.sourceY(x, yy) * sw + s.sourceX(x, yy)]
                    val alpha = (c ushr 24) and 0xFF
                    if (alpha == 0) continue
                    if (first < 0) first = x
                    last = x
                    val luma = Yuv.y((c shr 16) and 0xFF, (c shr 8) and 0xFF, c and 0xFF)
                    yp[row + x] = ((luma * alpha + 127) / 255).toByte()
                    ap[row + x] = alpha.toByte()
                }
                spans[yy * 2] = if (first < 0) 0 else first
                spans[yy * 2 + 1] = if (first < 0) 0 else last + 1
            }

            for (cy in 0 until ch) {
                val ly = minOf(cy * 2, h - 1)
                val row = cy * cw
                var first = -1
                var last = -1
                for (cx in 0 until cw) {
                    val lx = minOf(cx * 2, w - 1)
                    val c = px[s.sourceY(lx, ly) * sw + s.sourceX(lx, ly)]
                    val alpha = (c ushr 24) and 0xFF
                    if (alpha == 0) continue
                    if (first < 0) first = cx
                    last = cx
                    val r = (c shr 16) and 0xFF
                    val g = (c shr 8) and 0xFF
                    val b = c and 0xFF
                    up[row + cx] = ((Yuv.u(r, g, b) * alpha + 127) / 255).toByte()
                    vp[row + cx] = ((Yuv.v(r, g, b) * alpha + 127) / 255).toByte()
                    cap[row + cx] = alpha.toByte()
                }
                chromaSpans[cy * 2] = if (first < 0) 0 else first
                chromaSpans[cy * 2 + 1] = if (first < 0) 0 else last + 1
            }
            return AlphaLayer(geom, src.generation, yp, ap, up, vp, cap, spans, chromaSpans)
        }
    }
}
