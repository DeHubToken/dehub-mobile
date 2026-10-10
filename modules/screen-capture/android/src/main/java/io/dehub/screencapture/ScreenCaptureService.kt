package io.dehub.screencapture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.Display
import android.view.WindowManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ScreenCaptureService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val work = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var session: CaptureSession? = null
  private var encoder: ProjectionEncoder? = null
  private var projection: MediaProjection? = null
  private var finishing = false
  private var starting: Job? = null
  private var stopping: Job? = null
  private var latestStartId = 0
  private var startupError: Throwable? = null
  private val deadline = Runnable { finish(false) }
  private val displayListener = object : DisplayManager.DisplayListener {
    override fun onDisplayAdded(displayId: Int) {}
    override fun onDisplayRemoved(displayId: Int) {}
    override fun onDisplayChanged(displayId: Int) { if (displayId == Display.DEFAULT_DISPLAY) encoder?.resize(deviceSize()) }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    latestStartId = startId
    val id = intent?.getStringExtra("sessionId") ?: run { stopSelfResult(startId); return START_NOT_STICKY }
    if (intent.action != START) {
      if (session?.id == id) finish(intent.action == CANCEL)
      else if (session == null) stopSelfResult(startId)
      return START_NOT_STICKY
    }
    if (session?.cleaned?.isCompleted == true) {
      session = null; encoder = null; projection = null; starting = null; stopping = null; finishing = false; startupError = null
    }
    if (session != null) return START_NOT_STICKY
    val owner = CaptureSessions.find(id)
    if (owner == null || owner.cancelled || owner.cleaned.isCompleted || owner.state != "starting") {
      stopSelfResult(startId); return START_NOT_STICKY
    }
    session = owner
    owner.stop = { cancel -> main.post { if (session === owner) finish(cancel) } }
    try {
      val notification = notification(owner)
      if (Build.VERSION.SDK_INT >= 29) {
        val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION or
          (if (owner.microphone && Build.VERSION.SDK_INT >= 30) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
        startForeground(NOTIFICATION_ID, notification, types)
      } else startForeground(NOTIFICATION_ID, notification)
      val permission = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra("permission", Intent::class.java)
        else @Suppress("DEPRECATION") (intent.getParcelableExtra("permission") as? Intent)
      val token = requireNotNull(permission)
      projection = requireNotNull(getSystemService(MediaProjectionManager::class.java).getMediaProjection(intent.getIntExtra("resultCode", 0), token))
      starting = work.launch {
        try {
          val recording = ProjectionEncoder(requireNotNull(projection), deviceSize(), resources.configuration.densityDpi,
            owner.file, owner.systemAudio, owner.microphone,
            { main.post { if (session === owner) finish(false) } },
            { error -> main.post { if (session === owner) { startupError = error; finish(false) } } })
          val accepted = withContext(Dispatchers.Main) {
            if (session !== owner || owner.cancelled || finishing) false
            else { encoder = recording; true }
          }
          if (!accepted) { recording.close(true); return@launch }
          recording.start()
          withContext(Dispatchers.Main) {
            if (owner.cancelled || finishing) { finish(owner.cancelled); return@withContext }
            getSystemService(DisplayManager::class.java).registerDisplayListener(displayListener, main)
            CaptureSessions.mark(this@ScreenCaptureService, owner, "recording")
            owner.started.complete(Unit)
            main.postDelayed(deadline, 600_000L)
          }
        } catch (error: Throwable) {
          withContext(Dispatchers.Main) { if (session === owner) { startupError = error; finish(owner.cancelled) } }
        }
      }
    } catch (error: Throwable) { startupError = error; finish(owner.cancelled) }
    return START_NOT_STICKY
  }

  private fun finish(cancel: Boolean) {
    val owner = session ?: return
    owner.cancelled = owner.cancelled || cancel
    if (finishing) return
    finishing = true
    main.removeCallbacks(deadline)
    getSystemService(DisplayManager::class.java).unregisterDisplayListener(displayListener)
    CaptureSessions.mark(this, owner, "finishing")
    val startTask = starting
    stopping = work.launch {
      startTask?.join()
      var error = startupError
      var result: ProjectionFile? = null
      try { result = encoder?.close(owner.cancelled) }
      catch (failure: Throwable) { error = failure }
      if (encoder == null) runCatching { projection?.stop() }
      withContext(Dispatchers.Main) {
        encoder = null; projection = null
        CaptureSessions.complete(this@ScreenCaptureService, owner, result, error)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelfResult(latestStartId)
      }
    }
  }

  private fun deviceSize(): CaptureSize {
    val manager = getSystemService(WindowManager::class.java)
    if (Build.VERSION.SDK_INT >= 30) { val bounds = manager.maximumWindowMetrics.bounds; return CaptureSize(bounds.width(), bounds.height()) }
    val metrics = DisplayMetrics()
    @Suppress("DEPRECATION") manager.defaultDisplay.getRealMetrics(metrics)
    return CaptureSize(metrics.widthPixels, metrics.heightPixels)
  }

  private fun notification(owner: CaptureSession): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, owner.title, NotificationManager.IMPORTANCE_LOW))
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
    val icon = resources.getIdentifier("notification_icon", "drawable", packageName).takeIf { it != 0 } ?: android.R.drawable.ic_btn_speak_now
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
    fun action(name: String, label: String, code: Int): Notification.Action {
      val intent = Intent(this, ScreenCaptureService::class.java).setAction(name).putExtra("sessionId", owner.id)
      val pending = PendingIntent.getService(this, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      return Notification.Action.Builder(null, label, pending).build()
    }
    return builder.setSmallIcon(icon).setContentTitle(owner.title).setContentIntent(open).setOngoing(true)
      .setUsesChronometer(true).setWhen(System.currentTimeMillis()).setCategory(Notification.CATEGORY_SERVICE)
      .addAction(action(SAVE, owner.saveLabel, 1)).addAction(action(CANCEL, owner.cancelLabel, 2)).build()
  }

  override fun onDestroy() {
    main.removeCallbacks(deadline)
    getSystemService(DisplayManager::class.java).unregisterDisplayListener(displayListener)
    val owner = session
    if (owner != null && !owner.cleaned.isCompleted) {
      owner.cancelled = true
      if (!finishing) finish(true)
      val cleanup = stopping
      work.launch {
        cleanup?.join()
        work.cancel()
      }
    } else work.cancel()
    session = null
    super.onDestroy()
  }

  companion object {
    const val START = "io.dehub.screencapture.START"
    const val SAVE = "io.dehub.screencapture.SAVE"
    const val CANCEL = "io.dehub.screencapture.CANCEL"
    private const val CHANNEL = "dehub-screen-recording"
    private const val NOTIFICATION_ID = 5401
  }
}
