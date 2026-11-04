package expo.modules.nowplaying

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NowPlayingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val command = intent.action ?: return
    NowPlayingController.onNotificationAction(command)
  }
}
