package io.dehub.screencapture

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AudioEffect
import android.media.audiofx.NoiseSuppressor
import android.media.projection.MediaProjection
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Surface
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

internal data class ProjectionFile(val uri: String, val width: Int, val height: Int, val durationMs: Long)
private data class EncodedSample(val audio: Boolean, val bytes: ByteArray, val pts: Long, val flags: Int)

/** Encode the fitted screen and one mixed AAC track on the same monotonic clock. */
internal class ProjectionEncoder(
  private val projection: MediaProjection,
  initialSource: CaptureSize,
  private val density: Int,
  private val file: File,
  systemAudio: Boolean,
  microphone: Boolean,
  private val stopped: () -> Unit,
  private val failed: (Throwable) -> Unit,
) {
  private val size = captureSize(initialSource.width, initialSource.height)
  @Volatile private var latestSource = initialSource
  private val running = AtomicBoolean(false)
  private val failure = AtomicReference<Throwable?>(null)
  private val muxerLock = Any()
  private val pending = ArrayList<EncodedSample>()
  private var pendingBytes = 0
  private var muxer: MediaMuxer? = null
  private var muxing = false
  private var videoTrack = -1
  private var audioTrack = -1
  private var video: MediaCodec? = null
  private var audio: MediaCodec? = null
  private var videoSurface: Surface? = null
  private var fittedSurface: CaptureSurface? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var videoThread: Thread? = null
  private var audioThread: Thread? = null
  private val inputs = ArrayList<AudioRecord>()
  private val effects = ArrayList<AudioEffect>()
  private var startUs = 0L
  private var callbackRegistered = false
  private var closed = false
  private val callback = object : MediaProjection.Callback() {
    override fun onStop() { stopped() }
    override fun onCapturedContentResize(width: Int, height: Int) { if (width > 0 && height > 0) resize(CaptureSize(width, height)) }
  }

  init {
    try {
      file.parentFile?.mkdirs()
      muxer = MediaMuxer(file.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, size.width, size.height).apply {
        setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
        setInteger(MediaFormat.KEY_BIT_RATE, 6_000_000)
        setInteger(MediaFormat.KEY_FRAME_RATE, 30)
        setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
      }
      video = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).also {
        it.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        videoSurface = it.createInputSurface()
      }
      fittedSurface = CaptureSurface(requireNotNull(videoSurface), size, initialSource, ::reportFailure)
      if (systemAudio && Build.VERSION.SDK_INT >= 29) inputs.add(playbackInput())
      if (microphone) inputs.add(microphoneInput())
      if (inputs.isNotEmpty()) {
        val audioFormat = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SAMPLE_RATE, 1).apply {
          setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
          setInteger(MediaFormat.KEY_BIT_RATE, 128_000)
          setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, SAMPLES_PER_FRAME * 2)
        }
        audio = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).also {
          it.configure(audioFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        }
      }
      projection.registerCallback(callback, Handler(Looper.getMainLooper())); callbackRegistered = true
    } catch (error: Throwable) { close(true); throw error }
  }

  fun start() {
    try {
      startUs = System.nanoTime() / 1000L
      running.set(true)
      requireNotNull(video).start(); audio?.start()
      for (input in inputs) {
        input.startRecording()
        check(input.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "Audio capture did not start" }
      }
      videoThread = Thread({ drainVideo() }, "DeHubCaptureVideo").apply { start() }
      if (audio != null) audioThread = Thread({ captureAudio() }, "DeHubCaptureAudio").apply { start() }
      val inputSize = captureInputSize(latestSource.width, latestSource.height)
      virtualDisplay = projection.createVirtualDisplay(
        "DeHub screen recording", inputSize.width, inputSize.height, density,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, requireNotNull(fittedSurface).input, null, null,
      )
      check(virtualDisplay != null) { "Screen capture did not start" }
      resize(latestSource)
      fittedSurface!!.start()
    } catch (error: Throwable) { reportFailure(error); throw error }
  }

  fun resize(source: CaptureSize) {
    latestSource = source
    if (!running.get()) return
    fittedSurface?.resize(source) { fitted -> virtualDisplay?.resize(fitted.width, fitted.height, density) }
  }

  @Synchronized fun close(cancel: Boolean): ProjectionFile? {
    if (closed) return null
    closed = true; running.set(false)
    virtualDisplay?.release(); virtualDisplay = null
    fittedSurface?.close(); fittedSurface = null
    for (input in inputs) runCatching { input.stop() }
    runCatching { video?.signalEndOfInputStream() }
    videoThread?.join(4000L); audioThread?.join(4000L)
    if (videoThread?.isAlive == true || audioThread?.isAlive == true) failure.compareAndSet(null, IllegalStateException("Capture encoder did not finish"))
    runCatching { video?.stop() }; runCatching { video?.release() }; video = null
    runCatching { audio?.stop() }; runCatching { audio?.release() }; audio = null
    videoSurface?.release(); videoSurface = null
    for (input in inputs) runCatching { input.release() }
    for (effect in effects) runCatching { effect.release() }
    inputs.clear(); effects.clear()
    if (callbackRegistered) projection.unregisterCallback(callback)
    runCatching { projection.stop() }
    synchronized(muxerLock) {
      if (muxing) try { muxer?.stop() } catch (error: Throwable) { failure.compareAndSet(null, error) }
      runCatching { muxer?.release() }; muxer = null; pending.clear(); pendingBytes = 0
    }
    if (cancel || failure.get() != null || !muxing || !file.isFile || file.length() == 0L) {
      file.delete()
      if (!cancel) throw failure.get() ?: IllegalStateException("Screen recording is empty")
      return null
    }
    return try {
      val metadata = MediaMetadataRetriever()
      try {
        metadata.setDataSource(file.absolutePath)
        val duration = metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        check(duration >= 250L) { "Screen recording is too short" }
        ProjectionFile(android.net.Uri.fromFile(file).toString(), size.width, size.height, duration)
      } finally { metadata.release() }
    } catch (error: Throwable) { file.delete(); throw error }
  }

  private fun playbackInput(): AudioRecord {
    check(Build.VERSION.SDK_INT >= 29)
    val capture = AudioPlaybackCaptureConfiguration.Builder(projection)
      .addMatchingUsage(AudioAttributes.USAGE_MEDIA).addMatchingUsage(AudioAttributes.USAGE_GAME)
      .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN).build()
    return checkedInput(AudioRecord.Builder().setAudioFormat(pcmFormat()).setBufferSizeInBytes(bufferSize()).setAudioPlaybackCaptureConfig(capture).build())
  }

  private fun microphoneInput(): AudioRecord {
    val input = checkedInput(AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
      .setAudioFormat(pcmFormat()).setBufferSizeInBytes(bufferSize()).build())
    if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(input.audioSessionId)?.let { it.enabled = true; effects.add(it) }
    if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(input.audioSessionId)?.let { it.enabled = true; effects.add(it) }
    return input
  }

  private fun checkedInput(input: AudioRecord): AudioRecord {
    if (input.state != AudioRecord.STATE_INITIALIZED) { input.release(); throw IllegalStateException("Audio capture unavailable") }
    return input
  }
  private fun pcmFormat() = AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build()
  private fun bufferSize(): Int {
    val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minimum > 0)
    return maxOf(minimum * 4, SAMPLES_PER_FRAME * 8)
  }

  private fun captureAudio() {
    val codec = requireNotNull(audio)
    val buffers = inputs.map { ShortArray(SAMPLES_PER_FRAME) }
    val mixed = ShortArray(SAMPLES_PER_FRAME)
    var samplesWritten = 0L
    val firstSampleUs = (System.nanoTime() / 1000L - startUs).coerceAtLeast(0L)
    try {
      while (running.get()) {
        var count = SAMPLES_PER_FRAME
        for ((index, input) in inputs.withIndex()) {
          var read = 0
          while (read < SAMPLES_PER_FRAME && running.get()) {
            val received = input.read(buffers[index], read, SAMPLES_PER_FRAME - read, AudioRecord.READ_BLOCKING)
            if (received < 0) { if (running.get()) throw IllegalStateException("Audio capture failed: $received"); break }
            if (received == 0) continue
            read += received
          }
          count = minOf(count, read)
        }
        if (!running.get() || count == 0) break
        mixCaptureSamples(buffers, count, mixed)
        val inputIndex = inputBuffer(codec, 2_000_000_000L)
        val buffer = requireNotNull(codec.getInputBuffer(inputIndex)).order(ByteOrder.LITTLE_ENDIAN)
        buffer.clear(); check(buffer.remaining() >= count * 2)
        for (index in 0 until count) buffer.putShort(mixed[index])
        codec.queueInputBuffer(inputIndex, 0, count * 2, firstSampleUs + samplesWritten * 1_000_000L / SAMPLE_RATE, 0)
        samplesWritten += count
        drain(codec, true, false)
      }
      val inputIndex = inputBuffer(codec, 2_000_000_000L)
      codec.queueInputBuffer(inputIndex, 0, 0, firstSampleUs + samplesWritten * 1_000_000L / SAMPLE_RATE, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
      drain(codec, true, true)
    } catch (error: Throwable) { reportFailure(error) }
  }

  private fun inputBuffer(codec: MediaCodec, timeoutNs: Long): Int {
    val deadline = System.nanoTime() + timeoutNs
    while (System.nanoTime() < deadline) {
      val index = codec.dequeueInputBuffer(10_000L)
      if (index >= 0) return index
      drain(codec, true, false)
    }
    throw IllegalStateException("Audio encoder did not accept input")
  }

  private fun drainVideo() {
    try { drain(requireNotNull(video), false, true) }
    catch (error: Throwable) { reportFailure(error) }
  }

  private fun drain(codec: MediaCodec, isAudio: Boolean, untilEnd: Boolean) {
    val info = MediaCodec.BufferInfo()
    var closingDeadline = Long.MAX_VALUE
    while (true) {
      if (!running.get() && closingDeadline == Long.MAX_VALUE) closingDeadline = System.nanoTime() + 3_000_000_000L
      if (System.nanoTime() > closingDeadline) throw IllegalStateException("Capture encoder did not emit its final frame")
      val index = codec.dequeueOutputBuffer(info, 10_000L)
      if (index == MediaCodec.INFO_TRY_AGAIN_LATER) { if (!untilEnd) return; continue }
      if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { formatReady(isAudio, codec.outputFormat); continue }
      if (index < 0) continue
      try {
        if (info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
          val data = requireNotNull(codec.getOutputBuffer(index))
          data.position(info.offset); data.limit(info.offset + info.size)
          val bytes = ByteArray(info.size); data.get(bytes)
          val pts = if (isAudio) info.presentationTimeUs else (info.presentationTimeUs - startUs).coerceAtLeast(0L)
          write(EncodedSample(isAudio, bytes, pts, info.flags))
        }
      } finally { codec.releaseOutputBuffer(index, false) }
      if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
    }
  }

  private fun formatReady(isAudio: Boolean, format: MediaFormat) = synchronized(muxerLock) {
    val target = requireNotNull(muxer)
    if (isAudio) { check(audioTrack < 0); audioTrack = target.addTrack(format) }
    else { check(videoTrack < 0); videoTrack = target.addTrack(format) }
    if (!muxing && videoTrack >= 0 && (audio == null || audioTrack >= 0)) {
      target.start(); muxing = true
      for (sample in pending) writeReady(sample)
      pending.clear(); pendingBytes = 0
    }
  }

  private fun write(sample: EncodedSample) = synchronized(muxerLock) {
    if (muxing) writeReady(sample)
    else {
      check(pendingBytes + sample.bytes.size <= 8 * 1024 * 1024) { "Capture audio/video formats did not settle" }
      pending.add(sample); pendingBytes += sample.bytes.size
    }
  }

  private fun writeReady(sample: EncodedSample) {
    val info = MediaCodec.BufferInfo().apply { set(0, sample.bytes.size, sample.pts, sample.flags) }
    requireNotNull(muxer).writeSampleData(if (sample.audio) audioTrack else videoTrack, ByteBuffer.wrap(sample.bytes), info)
  }

  private fun reportFailure(error: Throwable) {
    if (failure.compareAndSet(null, error)) failed(error)
  }

  companion object { private const val SAMPLE_RATE = 48_000; private const val SAMPLES_PER_FRAME = 960 }
}
