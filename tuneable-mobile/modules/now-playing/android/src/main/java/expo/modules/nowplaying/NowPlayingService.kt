package expo.modules.nowplaying

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

class NowPlayingService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = try {
      NowPlayingController.onServiceStart(this, startId)
    } catch (error: Exception) {
      Log.e(TAG, "Failed to build playback notification", error)
      null
    }
    val posted = notification ?: NowPlayingController.fallbackNotification(this)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NowPlayingController.NOTIFICATION_ID,
          posted,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        )
      } else {
        startForeground(NowPlayingController.NOTIFICATION_ID, posted)
      }
    } catch (error: Exception) {
      Log.e(TAG, "startForeground failed", error)
      stopSelf(startId)
      return START_NOT_STICKY
    }
    if (notification == null) {
      stopSelf(startId)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    NowPlayingController.onServiceDestroyed(this)
    super.onDestroy()
  }

  private companion object {
    const val TAG = "TuneableNowPlaying"
  }
}
