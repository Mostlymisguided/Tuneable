# iOS vs Web Player Audit

## Web version (two players)

1. **Music / party queue player** – `PersistentWebPlayer` + `useWebPlayerStore`
   - Plays the party queue (YouTube + other sources).
   - Queue is set from the **displayed** list: time filter (e.g. Today, This Week) + tag filters.
   - "Play" below the time filters calls `handlePlayQueue()`: `getDisplayMedia()` → clean queue → `setQueue(cleanedQueue)`, `setCurrentMedia(cleanedQueue[0], 0)`, `play()`.
   - Same queue is used when tapping play on a single track (`handlePlayMedia(item, index)`).

2. **Podcast player** – `PersistentPodcastPlayer` + `usePodcastPlayerStore`
   - Separate player for podcast episodes (audio URLs).
   - When starting music playback, web clears the podcast player so the UI shows the music player.

## iOS version (two players)

1. **Podcast player** – `PodcastPlayerStore` (AVPlayer)
   - Used by: `NowPlayingSheet`, `PodcastMiniBarView`, `PodcastEpisodeProfileView`.
   - Injected in `TuneableApp` and `MainTabView`.

2. **Music / Global Tunes** – `MusicPlayerStore` + in-app playback
   - **Play button (Music tab):** Sets queue to current `displayMedia` (time period + tag filters), same logic as web. Starts playback in-app.
   - **Playback:** `MusicPlayerHostView` uses a hidden `WKWebView`:
     - **YouTube:** loads embed HTML with iframe API; play/pause/seek/next via JS.
     - **Direct audio URLs:** loads HTML with `<audio>`; same controls.
   - **UI:** `MusicMiniBarView` (progress + play/pause), `MusicNowPlayingSheet` (full-screen: cover, title, progress, seek, prev/next).
   - **Per-track play:** Tapping the play overlay on a row starts the queue from that track (like web).

## Summary

| Platform | Music/queue player           | Podcast player   |
|----------|-----------------------------|------------------|
| Web      | Yes (WebPlayer + queue)     | Yes (Podcast)    |
| iOS      | Yes (MusicPlayerStore + WKWebView) | Yes (Podcast only) |
