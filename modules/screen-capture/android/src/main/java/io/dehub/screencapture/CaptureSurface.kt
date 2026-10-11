package io.dehub.screencapture

import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLExt
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** One encoder canvas, with a fitted viewport when the captured app rotates or resizes. */
internal class CaptureSurface(
  private val output: Surface,
  private val canvas: CaptureSize,
  initialSource: CaptureSize,
  private val failed: (Throwable) -> Unit,
) {
  private val thread = HandlerThread("DeHubCaptureSurface").apply { start() }
  private val handler = Handler(thread.looper)
  private var display: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var context: EGLContext = EGL14.EGL_NO_CONTEXT
  private var window: EGLSurface = EGL14.EGL_NO_SURFACE
  private var texture: SurfaceTexture? = null
  private var textureId = 0
  private var program = 0
  private var source = captureInputSize(initialSource.width, initialSource.height)
  private var nextFrameNs = 0L
  private var framePending = false
  private var frameLatched = false
  private var closed = false
  private val matrix = FloatArray(16)
  lateinit var input: Surface
    private set
  private val vertices = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
    put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0)
  }
  private val coordinates = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
    put(floatArrayOf(0f, 0f, 1f, 0f, 0f, 1f, 1f, 1f)); position(0)
  }
  private val tick = object : Runnable {
    override fun run() {
      if (closed) return
      try {
        if (framePending) {
          texture!!.updateTexImage(); texture!!.getTransformMatrix(matrix)
          framePending = false; frameLatched = true
        }
        if (frameLatched) render()
        val now = System.nanoTime()
        nextFrameNs = maxOf(nextFrameNs + 1_000_000_000L / 30L, now)
        handler.postDelayed(this, maxOf(1L, (nextFrameNs - now + 999_999L) / 1_000_000L))
      } catch (error: Throwable) { closed = true; failed(error) }
    }
  }

  init {
    try { synchronous { prepare() } }
    catch (error: Throwable) { close(); throw error }
  }

  fun start() { handler.post { nextFrameNs = System.nanoTime(); tick.run() } }

  fun resize(size: CaptureSize, resized: (CaptureSize) -> Unit) {
    handler.post {
      if (closed) return@post
      try {
        source = captureInputSize(size.width, size.height)
        frameLatched = false; framePending = false
        texture!!.setDefaultBufferSize(source.width, source.height)
        resized(source)
      } catch (error: Throwable) { closed = true; failed(error) }
    }
  }

  fun close() {
    // Cleanup also runs after a render failure, when the frame loop is already stopped.
    runCatching {
      synchronous {
        closed = true; handler.removeCallbacksAndMessages(null)
        if (::input.isInitialized) input.release()
        texture?.release(); texture = null
        if (display != EGL14.EGL_NO_DISPLAY) {
          if (context != EGL14.EGL_NO_CONTEXT && window != EGL14.EGL_NO_SURFACE) {
            EGL14.eglMakeCurrent(display, window, window, context)
            if (program != 0) GLES20.glDeleteProgram(program)
            if (textureId != 0) GLES20.glDeleteTextures(1, intArrayOf(textureId), 0)
          }
          EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
          if (window != EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display, window)
          if (context != EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display, context)
          EGL14.eglReleaseThread(); EGL14.eglTerminate(display)
          display = EGL14.EGL_NO_DISPLAY; context = EGL14.EGL_NO_CONTEXT; window = EGL14.EGL_NO_SURFACE
        }
      }
    }
    thread.quitSafely()
    if (Thread.currentThread() !== thread) thread.join(2000L)
  }

  private fun synchronous(block: () -> Unit) {
    if (Thread.currentThread() === thread) { block(); return }
    val settled = CountDownLatch(1)
    var failure: Throwable? = null
    check(handler.post { try { block() } catch (error: Throwable) { failure = error } finally { settled.countDown() } })
    check(settled.await(5L, TimeUnit.SECONDS)) { "Capture surface did not settle" }
    failure?.let { throw it }
  }

  private fun prepare() {
    display = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    check(display != EGL14.EGL_NO_DISPLAY)
    val versions = IntArray(2)
    check(EGL14.eglInitialize(display, versions, 0, versions, 1))
    val configs = arrayOfNulls<EGLConfig>(1)
    val count = IntArray(1)
    val attributes = intArrayOf(
      EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_ALPHA_SIZE, 8, EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT, 0x3142, 1, EGL14.EGL_NONE,
    )
    check(EGL14.eglChooseConfig(display, attributes, 0, configs, 0, 1, count, 0) && count[0] > 0)
    val config = requireNotNull(configs[0])
    context = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE), 0)
    check(context != EGL14.EGL_NO_CONTEXT)
    window = EGL14.eglCreateWindowSurface(display, config, output, intArrayOf(EGL14.EGL_NONE), 0)
    check(window != EGL14.EGL_NO_SURFACE && EGL14.eglMakeCurrent(display, window, window, context))
    val vertex = shader(GLES20.GL_VERTEX_SHADER, "attribute vec4 position; attribute vec4 coordinate; uniform mat4 transform; varying vec2 uv; void main(){gl_Position=position; uv=(transform*coordinate).xy;}")
    val fragment = shader(GLES20.GL_FRAGMENT_SHADER, "#extension GL_OES_EGL_image_external : require\nprecision mediump float; uniform samplerExternalOES image; varying vec2 uv; void main(){gl_FragColor=texture2D(image,uv);}")
    program = GLES20.glCreateProgram()
    GLES20.glAttachShader(program, vertex); GLES20.glAttachShader(program, fragment); GLES20.glLinkProgram(program)
    GLES20.glDeleteShader(vertex); GLES20.glDeleteShader(fragment)
    val linked = IntArray(1); GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linked, 0)
    check(linked[0] != 0) { GLES20.glGetProgramInfoLog(program) }
    val names = IntArray(1); GLES20.glGenTextures(1, names, 0); textureId = names[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    texture = SurfaceTexture(textureId).apply {
      setDefaultBufferSize(source.width, source.height)
      setOnFrameAvailableListener({ framePending = true }, handler)
    }
    input = Surface(requireNotNull(texture))
  }

  private fun shader(kind: Int, source: String): Int {
    val shader = GLES20.glCreateShader(kind); GLES20.glShaderSource(shader, source); GLES20.glCompileShader(shader)
    val compiled = IntArray(1); GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0)
    if (compiled[0] == 0) {
      val error = GLES20.glGetShaderInfoLog(shader); GLES20.glDeleteShader(shader); throw IllegalStateException(error)
    }
    return shader
  }

  private fun render() {
    val viewport = captureViewport(source, canvas)
    GLES20.glViewport(0, 0, canvas.width, canvas.height)
    GLES20.glClearColor(0f, 0f, 0f, 1f); GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    GLES20.glViewport(viewport.x, viewport.y, viewport.width, viewport.height)
    GLES20.glUseProgram(program)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0); GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    val position = GLES20.glGetAttribLocation(program, "position")
    val coordinate = GLES20.glGetAttribLocation(program, "coordinate")
    GLES20.glEnableVertexAttribArray(position); GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 0, vertices)
    GLES20.glEnableVertexAttribArray(coordinate); GLES20.glVertexAttribPointer(coordinate, 2, GLES20.GL_FLOAT, false, 0, coordinates)
    GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(program, "transform"), 1, false, matrix, 0)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(program, "image"), 0)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(position); GLES20.glDisableVertexAttribArray(coordinate)
    check(GLES20.glGetError() == GLES20.GL_NO_ERROR)
    EGLExt.eglPresentationTimeANDROID(display, window, System.nanoTime())
    check(EGL14.eglSwapBuffers(display, window))
  }
}
