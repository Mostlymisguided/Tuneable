package expo.modules.nowplaying

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.media.AudioAttributesCompat
import androidx.media.app.NotificationCompat.MediaStyle
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Publishes the active expo-av track to Android as a media session plus a
 * playback notification. The lock screen reads that pair; a session alone
 * does not appear there.
 */
internal object NowPlayingController {
  const val NOTIFICATION_ID = 48120
  private const val CHANNEL_ID = "tuneable_playback"
  private const val TAG = "TuneableNowPlaying"
  private const val SKIP_BACK_MS = 15_000.0
  private const val SKIP_FORWARD_MS = 30_000.0
  private const val ACTION_SKIP_BACK = "expo.modules.nowplaying.SKIP_BACK"
  private const val ACTION_SKIP_FORWARD = "expo.modules.nowplaying.SKIP_FORWARD"

  private val main = Handler(Looper.getMainLooper())
  private val artworkExecutor = Executors.newSingleThreadExecutor { runnable ->
    Thread(runnable, "tuneable-artwork").apply { isDaemon = true }
  }

  private var appContext: Context? = null
  private var session: MediaSessionCompat? = null
  private var snapshot: Snapshot? = null
  private var artwork: Bitmap? = null
  private var artworkUrl: String? = null
  private var artworkGen = 0
  private var boundService: NowPlayingService? = null
  private var lastStartId = 0
  private var emitter: ((String, Double?, Double?) -> Unit)? = null
  private var lastEmitKey = ""
  private var lastEmitAt = 0L

  private data class Snapshot(
    val title: String,
    val artist: String,
    val albumTitle: String,
    val artworkUrl: String?,
    val durationMs: Long,
    val positionMs: Long,
    val playbackRate: Float,
    val isPlaying: Boolean,
    val mode: String,
  )

  fun setEmitter(emitter: ((String, Double?, Double?) -> Unit)?) {
    this.emitter = emitter
  }

  fun setNowPlaying(context: Context, params: NowPlayingParams) {
    val app = context.applicationContext
    main.post {
      appContext = app
      val next = Snapshot(
        title = params.title.ifBlank { "Tuneable" },
        artist = params.artist,
        albumTitle = params.albumTitle.ifBlank { "Tuneable" },
        artworkUrl = params.artworkUrl?.trim()?.takeIf { it.startsWith("http://") || it.startsWith("https://") },
        durationMs = secondsToMs(params.duration),
        positionMs = secondsToMs(params.elapsed),
        playbackRate = if (params.isPlaying) params.playbackRate.toFloat().coerceAtLeast(0.1f) else 0f,
        isPlaying = params.isPlaying,
        mode = params.mode,
      )
      snapshot = next
      if (next.artworkUrl != artworkUrl) {
        artworkUrl = next.artworkUrl
        artwork = null
        artworkGen += 1
        val url = next.artworkUrl
        if (url != null) loadArtwork(url, artworkGen)
      }
      try {
        pushSession(updateNotification = true)
      } catch (error: Exception) {
        Log.e(TAG, "Failed to publish Now Playing", error)
      }
    }
  }

  fun updateElapsed(elapsedSec: Double, durationSec: Double, playbackRate: Double) {
    main.post {
      val current = snapshot ?: return@post
      val playing = playbackRate > 0.01
      val next = current.copy(
        durationMs = secondsToMs(durationSec),
        positionMs = secondsToMs(elapsedSec),
        playbackRate = if (playing) playbackRate.toFloat().coerceAtLeast(0.1f) else 0f,
        isPlaying = playing,
      )
      val visualChange = current.isPlaying != next.isPlaying || abs(current.durationMs - next.durationMs) > 1000
      snapshot = next
      try {
        pushSession(updateNotification = visualChange)
      } catch (error: Exception) {
        Log.e(TAG, "Failed to update Now Playing", error)
      }
    }
  }

  fun clear() {
    main.post { release() }
  }

  fun onServiceStart(service: NowPlayingService, startId: Int): Notification? {
    if (snapshot == null) return null
    boundService = service
    lastStartId = startId
    appContext = service.applicationContext
    ensureChannel(service)
    return buildNotification(service)
  }

  fun onServiceDestroyed(service: NowPlayingService) {
    if (boundService === service) boundService = null
  }

  fun fallbackNotification(context: Context): Notification {
    ensureChannel(context)
    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_music)
      .setContentTitle("Tuneable")
      .setOngoing(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  fun onNotificationAction(command: String) {
    main.post {
      when (command) {
        "skipBack" -> emit("skipBack", intervalMs = SKIP_BACK_MS)
        "skipForward" -> emit("skipForward", intervalMs = SKIP_FORWARD_MS)
        "play", "pause", "next", "previous" -> emit(command)
      }
    }
  }

  private fun release() {
    artworkGen += 1
    snapshot = null
    artwork = null
    artworkUrl = null
    teardownSession()
    val service = boundService
    val startId = lastStartId
    boundService = null
    if (service != null) {
      service.stopSelf(startId)
    } else {
      appContext?.let { NotificationManagerCompat.from(it).cancel(NOTIFICATION_ID) }
    }
  }

  private fun teardownSession() {
    val current = session ?: return
    session = null
    try {
      current.setCallback(null)
      current.isActive = false
      current.release()
    } catch (_: Exception) {
    }
  }

  private fun pushSession(updateNotification: Boolean) {
    val context = appContext ?: return
    val shot = snapshot ?: return
    val mediaSession = ensureSession(context)
    mediaSession.setMetadata(buildMetadata(shot))
    mediaSession.setPlaybackState(buildState(shot))
    mediaSession.isActive = true
    if (updateNotification) ensurePosted(context)
  }

  private fun ensureSession(context: Context): MediaSessionCompat {
    session?.let { return it }
    val created = MediaSessionCompat(context, "Tuneable")
    created.setCallback(sessionCallback, main)
    @Suppress("DEPRECATION")
    created.setFlags(
      MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS or
        MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
    )
    sessionActivity(context)?.let { created.setSessionActivity(it) }
    created.setPlaybackToLocal(
      AudioAttributesCompat.Builder()
        .setUsage(AudioAttributesCompat.USAGE_MEDIA)
        .setContentType(AudioAttributesCompat.CONTENT_TYPE_MUSIC)
        .build()
    )
    session = created
    return created
  }

  private val sessionCallback = object : MediaSessionCompat.Callback() {
    override fun onPlay() = emit("play")
    override fun onPause() = emit("pause")
    override fun onSkipToNext() = emit("next")
    override fun onSkipToPrevious() = emit("previous")
    override fun onRewind() = emit("skipBack", intervalMs = SKIP_BACK_MS)
    override fun onFastForward() = emit("skipForward", intervalMs = SKIP_FORWARD_MS)
    override fun onSeekTo(pos: Long) = emit("seek", positionMs = pos.toDouble())
    override fun onCustomAction(action: String?, extras: android.os.Bundle?) {
      when (action) {
        ACTION_SKIP_BACK -> emit("skipBack", intervalMs = SKIP_BACK_MS)
        ACTION_SKIP_FORWARD -> emit("skipForward", intervalMs = SKIP_FORWARD_MS)
      }
    }
  }

  private fun buildMetadata(shot: Snapshot): MediaMetadataCompat {
    val builder = MediaMetadataCompat.Builder()
      .putString(MediaMetadataCompat.METADATA_KEY_TITLE, shot.title)
      .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, shot.artist)
      .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, shot.albumTitle)
      .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, shot.title)
      .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, shot.artist)
      .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, shot.durationMs)
    shot.artworkUrl?.let { url ->
      builder.putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ART_URI, url)
      builder.putString(MediaMetadataCompat.METADATA_KEY_ART_URI, url)
      builder.putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_ICON_URI, url)
    }
    artwork?.let { bitmap ->
      builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, bitmap)
    }
    return builder.build()
  }

  private fun buildState(shot: Snapshot): PlaybackStateCompat {
    val podcast = shot.mode == "podcast"
    var actions = PlaybackStateCompat.ACTION_PLAY or
      PlaybackStateCompat.ACTION_PAUSE or
      PlaybackStateCompat.ACTION_PLAY_PAUSE or
      PlaybackStateCompat.ACTION_SEEK_TO
    val builder = PlaybackStateCompat.Builder()
    if (podcast) {
      actions = actions or PlaybackStateCompat.ACTION_REWIND or PlaybackStateCompat.ACTION_FAST_FORWARD
      // Android 13+ lock-screen slots show custom actions when skip-next/previous
      // are not set. Order is back, then forward.
      builder.addCustomAction(
        PlaybackStateCompat.CustomAction.Builder(
          ACTION_SKIP_BACK,
          "Back 15 seconds",
          R.drawable.ic_action_back
        ).build()
      )
      builder.addCustomAction(
        PlaybackStateCompat.CustomAction.Builder(
          ACTION_SKIP_FORWARD,
          "Forward 30 seconds",
          R.drawable.ic_action_forward
        ).build()
      )
    } else {
      actions = actions or PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
    }
    val state = if (shot.isPlaying) {
      PlaybackStateCompat.STATE_PLAYING
    } else {
      PlaybackStateCompat.STATE_PAUSED
    }
    return builder
      .setActions(actions)
      .setState(state, shot.positionMs, shot.playbackRate, SystemClock.elapsedRealtime())
      .build()
  }

  private fun ensurePosted(context: Context) {
    ensureChannel(context)
    val notification = buildNotification(context) ?: return
    val service = boundService
    if (service == null) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, NowPlayingService::class.java))
      } catch (error: Exception) {
        Log.e(TAG, "Unable to start playback foreground service", error)
        postNotification(context, notification)
      }
      return
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        service.startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        service.startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      Log.e(TAG, "Unable to refresh playback notification", error)
      postNotification(context, notification)
    }
  }

  private fun postNotification(context: Context, notification: Notification) {
    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (error: Exception) {
      Log.e(TAG, "Unable to post playback notification", error)
    }
  }

  fun buildNotification(context: Context): Notification? {
    val shot = snapshot ?: return null
    val token = session?.sessionToken
    ensureChannel(context)
    val podcast = shot.mode == "podcast"
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_music)
      .setContentTitle(shot.title)
      .setContentText(shot.artist.ifBlank { "Tuneable" })
      .setSubText(shot.albumTitle)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setShowWhen(false)
      .setColor(Color.parseColor("#6D28D9"))
      .setPriority(NotificationCompat.PRIORITY_LOW)
    sessionActivity(context)?.let { builder.setContentIntent(it) }
    artwork?.let { builder.setLargeIcon(it) }
    if (podcast) {
      builder.addAction(action(context, android.R.drawable.ic_media_rew, "Back 15 seconds", "skipBack"))
    } else {
      builder.addAction(action(context, android.R.drawable.ic_media_previous, "Previous", "previous"))
    }
    if (shot.isPlaying) {
      builder.addAction(action(context, android.R.drawable.ic_media_pause, "Pause", "pause"))
    } else {
      builder.addAction(action(context, android.R.drawable.ic_media_play, "Play", "play"))
    }
    if (podcast) {
      builder.addAction(action(context, android.R.drawable.ic_media_ff, "Forward 30 seconds", "skipForward"))
    } else {
      builder.addAction(action(context, android.R.drawable.ic_media_next, "Next", "next"))
    }
    val style = MediaStyle().setShowActionsInCompactView(0, 1, 2)
    if (token != null) style.setMediaSession(token)
    builder.setStyle(style)
    return builder.build()
  }

  private fun action(context: Context, icon: Int, label: String, command: String): NotificationCompat.Action {
    val intent = Intent(context, NowPlayingReceiver::class.java).setAction(command)
    val pending = PendingIntent.getBroadcast(
      context,
      requestCode(command),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Action(icon, label, pending)
  }

  private fun requestCode(command: String): Int = when (command) {
    "play" -> 1
    "pause" -> 2
    "next" -> 3
    "previous" -> 4
    "skipForward" -> 5
    "skipBack" -> 6
    else -> 7
  }

  private fun sessionActivity(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      context,
      8,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Now playing",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Playback controls on the lock screen"
      setShowBadge(false)
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  private fun loadArtwork(url: String, generation: Int) {
    artworkExecutor.execute {
      val bitmap = fetchArtwork(url) ?: return@execute
      main.post {
        if (generation != artworkGen || snapshot?.artworkUrl != url) return@post
        artwork = bitmap
        try {
          pushSession(updateNotification = true)
        } catch (error: Exception) {
          Log.e(TAG, "Failed to publish artwork", error)
        }
      }
    }
  }

  private fun fetchArtwork(url: String): Bitmap? {
    var connection: HttpURLConnection? = null
    return try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 8000
        readTimeout = 8000
        instanceFollowRedirects = true
        setRequestProperty("User-Agent", "Tuneable")
      }
      if (connection.responseCode !in 200..299) return null
      if (connection.contentLength > 4_000_000) return null
      connection.inputStream.use { stream ->
        val bytes = stream.readBytes()
        if (bytes.size > 4_000_000) null else decodeScaled(bytes)
      }
    } catch (_: Exception) {
      null
    } finally {
      connection?.disconnect()
    }
  }

  private fun decodeScaled(bytes: ByteArray): Bitmap? {
    if (bytes.isEmpty() || bytes.size > 4_000_000) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / sample > 512 || bounds.outHeight / sample > 512) sample *= 2
    val decoded = BitmapFactory.decodeByteArray(
      bytes,
      0,
      bytes.size,
      BitmapFactory.Options().apply { inSampleSize = sample }
    ) ?: return null
    val largest = maxOf(decoded.width, decoded.height)
    if (largest <= 256) return decoded
    val scale = 256f / largest
    val scaled = Bitmap.createScaledBitmap(
      decoded,
      (decoded.width * scale).toInt().coerceAtLeast(1),
      (decoded.height * scale).toInt().coerceAtLeast(1),
      true
    )
    if (scaled != decoded) decoded.recycle()
    return scaled
  }

  private fun emit(command: String, positionMs: Double? = null, intervalMs: Double? = null) {
    if (snapshot == null) return
    val now = SystemClock.elapsedRealtime()
    val key = "$command:${positionMs ?: ""}:${intervalMs ?: ""}"
    if (key == lastEmitKey && now - lastEmitAt < 200) return
    lastEmitKey = key
    lastEmitAt = now
    try {
      emitter?.invoke(command, positionMs, intervalMs)
    } catch (_: Exception) {
    }
  }

  private fun secondsToMs(seconds: Double): Long {
    if (!seconds.isFinite() || seconds <= 0) return 0
    return (seconds * 1000).toLong()
  }
}
