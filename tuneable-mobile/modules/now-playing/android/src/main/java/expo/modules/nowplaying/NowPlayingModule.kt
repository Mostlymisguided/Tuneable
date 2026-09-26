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

    // Lock-screen Now Playing is implemented natively on iOS. Android keeps
    // these as no-ops so adding the module cannot affect app startup.
    Function("setNowPlaying") { _: NowPlayingParams -> }
    Function("updateElapsed") { _: Double, _: Double, _: Double -> }
    Function("clear") { }
  }
}
