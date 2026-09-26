import ExpoModulesCore
import MediaPlayer
import UIKit

struct NowPlayingParams: Record {
  @Field var title: String = "Tuneable"
  @Field var artist: String = ""
  @Field var albumTitle: String = "Tuneable"
  @Field var artworkUrl: String?
  @Field var duration: Double = 0
  @Field var elapsed: Double = 0
  @Field var playbackRate: Double = 1
  @Field var isPlaying: Bool = false
  @Field var mode: String = "music"
}

public class NowPlayingModule: Module {
  private var remoteCommandsReady = false
  private var artworkURLString: String?
  private var currentMode = "music"

  public func definition() -> ModuleDefinition {
    Name("NowPlaying")
    Events("onCommand")

    Function("setNowPlaying") { (params: NowPlayingParams) in
      DispatchQueue.main.async {
        self.setupRemoteCommandsIfNeeded()
        self.applyRemoteCommandMode(params.mode)
        self.writeNowPlaying(params)
        if let artworkUrl = params.artworkUrl, !artworkUrl.isEmpty {
          self.loadArtwork(from: artworkUrl)
        }
      }
    }

    Function("updateElapsed") { (elapsed: Double, duration: Double, playbackRate: Double) in
      DispatchQueue.main.async {
        guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo, !info.isEmpty else {
          return
        }
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
        info[MPMediaItemPropertyPlaybackDuration] = duration
        info[MPNowPlayingInfoPropertyPlaybackRate] = playbackRate
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    }

    Function("clear") {
      DispatchQueue.main.async {
        self.artworkURLString = nil
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      }
    }
  }

  private func writeNowPlaying(_ params: NowPlayingParams) {
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPMediaItemPropertyTitle] = params.title
    info[MPMediaItemPropertyArtist] = params.artist
    info[MPMediaItemPropertyAlbumTitle] = params.albumTitle
    info[MPMediaItemPropertyPlaybackDuration] = params.duration
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = params.elapsed
    info[MPNowPlayingInfoPropertyPlaybackRate] = params.isPlaying ? params.playbackRate : 0.0
    info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = params.playbackRate
    info[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func setupRemoteCommandsIfNeeded() {
    guard !remoteCommandsReady else { return }
    remoteCommandsReady = true
    let center = MPRemoteCommandCenter.shared()

    center.playCommand.addTarget { [weak self] _ in
      self?.emitCommand("play")
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.emitCommand("pause")
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.emitCommand("toggle")
      return .success
    }
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.emitCommand("next")
      return .success
    }
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.emitCommand("previous")
      return .success
    }
    center.skipForwardCommand.preferredIntervals = [30]
    center.skipForwardCommand.addTarget { [weak self] event in
      let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 30
      self?.emitCommand("skipForward", extra: ["intervalMs": seconds * 1000])
      return .success
    }
    center.skipBackwardCommand.preferredIntervals = [15]
    center.skipBackwardCommand.addTarget { [weak self] event in
      let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 15
      self?.emitCommand("skipBack", extra: ["intervalMs": seconds * 1000])
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }
      self?.emitCommand("seek", extra: ["positionMs": event.positionTime * 1000])
      return .success
    }
  }

  private func applyRemoteCommandMode(_ mode: String) {
    currentMode = mode
    let center = MPRemoteCommandCenter.shared()
    let isPodcast = mode == "podcast"
    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.togglePlayPauseCommand.isEnabled = true
    center.changePlaybackPositionCommand.isEnabled = true
    center.nextTrackCommand.isEnabled = !isPodcast
    center.previousTrackCommand.isEnabled = !isPodcast
    center.skipForwardCommand.isEnabled = isPodcast
    center.skipBackwardCommand.isEnabled = isPodcast
  }

  private func emitCommand(_ command: String, extra: [String: Any] = [:]) {
    var body: [String: Any] = ["command": command]
    extra.forEach { body[$0.key] = $0.value }
    sendEvent("onCommand", body)
  }

  private func loadArtwork(from urlString: String) {
    guard urlString != artworkURLString, let url = URL(string: urlString) else { return }
    artworkURLString = urlString
    Task {
      do {
        let (data, _) = try await URLSession.shared.data(from: url)
        guard let image = UIImage(data: data) else { return }
        let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        await MainActor.run {
          var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
          info[MPMediaItemPropertyArtwork] = artwork
          MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
      } catch {}
    }
  }
}
