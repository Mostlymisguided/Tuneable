package expo.modules.nowplaying

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class NowPlayingParams : Record {
  @Field var title: String = "Tuneable"
  @Field var artist: String = ""
  @Field var albumTitle: String = "Tuneable"
  @Field var artworkUrl: String? = null
  @Field var duration: Double = 0.0
  @Field var elapsed: Double = 0.0
  @Field var playbackRate: Double = 1.0
  @Field var isPlaying: Boolean = false
  @Field var mode: String = "music"
}

class NowPlayingModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NowPlaying")
    Events("onCommand")

    OnCreate {
      NowPlayingController.setEmitter { command, positionMs, intervalMs ->
        val payload = mutableMapOf<String, Any>("command" to command)
        if (positionMs != null) payload["positionMs"] = positionMs
        if (intervalMs != null) payload["intervalMs"] = intervalMs
        try {
          sendEvent("onCommand", payload)
        } catch (_: Throwable) {
        }
      }
    }

    OnDestroy {
      NowPlayingController.setEmitter(null)
      NowPlayingController.clear()
    }

    Function("setNowPlaying") { params: NowPlayingParams ->
      val context = appContext.reactContext ?: return@Function
      NowPlayingController.setNowPlaying(context, params)
    }

    Function("updateElapsed") { elapsed: Double, duration: Double, playbackRate: Double ->
      NowPlayingController.updateElapsed(elapsed, duration, playbackRate)
    }

    Function("clear") {
      NowPlayingController.clear()
    }
  }
}
