package io.dehub.mobile.studio

import android.util.Log
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

private const val TAG = "DHBStudio"

/**
 * `DHBStudio` — the JS handle on the phone studio (libs/phoneStudio.ts).
 *
 * JS renders every picture (cards with Skia, the overlay of logos and widgets)
 * to a PNG file and passes the path; this decodes it on the module thread and
 * hands it to StudioState, which the frame processors read. Each method
 * resolves once the picture is in place, so JS can delete the file straight
 * away.
 *
 * Bump STUDIO_VERSION when the JS contract changes, so a newer bundle can tell
 * an older binary apart.
 */
const val STUDIO_VERSION = 1

class StudioModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName(): String = "DHBStudio"

    override fun getConstants(): MutableMap<String, Any> = hashMapOf(
        "version" to STUDIO_VERSION,
        "segmentation" to true,
    )

    @ReactMethod
    fun setBackground(mode: String?, color: String?, imagePath: String?, promise: Promise) {
        try {
            val parsed = BackgroundMode.parse(mode)
            val picture = if (parsed == BackgroundMode.IMAGE && !imagePath.isNullOrEmpty()) {
                SourcePicture.decode(imagePath, StudioState.nextGeneration())
                    ?: return promise.reject("E_STUDIO_IMAGE", "Could not read the background picture")
            } else null
            StudioState.setBackground(parsed, color, picture)
            promise.resolve(null)
        } catch (t: Throwable) {
            Log.w(TAG, "setBackground failed", t)
            promise.reject("E_STUDIO", t.message, t)
        }
    }

    @ReactMethod
    fun setOverlay(pngPath: String?, promise: Promise) {
        try {
            val picture = if (!pngPath.isNullOrEmpty()) {
                SourcePicture.decode(pngPath, StudioState.nextGeneration())
                    ?: return promise.reject("E_STUDIO_IMAGE", "Could not read the overlay")
            } else null
            StudioState.setOverlay(picture)
            promise.resolve(null)
        } catch (t: Throwable) {
            Log.w(TAG, "setOverlay failed", t)
            promise.reject("E_STUDIO", t.message, t)
        }
    }

    @ReactMethod
    fun setCard(pngPath: String?, fade: Boolean, promise: Promise) {
        try {
            val picture = if (!pngPath.isNullOrEmpty()) {
                SourcePicture.decode(pngPath, StudioState.nextGeneration())
                    ?: return promise.reject("E_STUDIO_IMAGE", "Could not read the card")
            } else null
            StudioState.setCard(picture, fade)
            promise.resolve(null)
        } catch (t: Throwable) {
            Log.w(TAG, "setCard failed", t)
            promise.reject("E_STUDIO", t.message, t)
        }
    }

    /** The upright size of the frames being processed, or null before the first one. */
    @ReactMethod
    fun getFrameSize(promise: Promise) {
        val geom = StudioState.geometry
        if (geom == null) {
            promise.resolve(null)
            return
        }
        val map = Arguments.createMap()
        map.putInt("width", geom.uprightWidth)
        map.putInt("height", geom.uprightHeight)
        promise.resolve(map)
    }

    /** Everything off: no card, no overlay, no background. */
    @ReactMethod
    fun reset(promise: Promise) {
        try {
            StudioState.clear()
            PersonSegmenter.reset()
            promise.resolve(null)
        } catch (t: Throwable) {
            promise.reject("E_STUDIO", t.message, t)
        }
    }
}

class StudioPackage : ReactPackage {
    @Deprecated("Legacy module registration, kept for the interop layer")
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(StudioModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
