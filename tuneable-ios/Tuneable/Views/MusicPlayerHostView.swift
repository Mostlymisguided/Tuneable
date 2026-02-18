import SwiftUI
import WebKit
import AVFoundation

/// Hosts the actual playback (YouTube embed or direct audio) in a WKWebView.
/// When `isVisibleInSheet` is true, the WebView is shown in the now-playing sheet so iOS allows playback.
struct MusicPlayerHostView: View {
    @ObservedObject var store: MusicPlayerStore
    /// When true, this host is the visible one in the sheet (required for iOS to allow programmatic play).
    var isVisibleInSheet: Bool = false

    var body: some View {
        MusicPlayerWebViewRepresentable(store: store, isVisibleInSheet: isVisibleInSheet)
            .frame(width: isVisibleInSheet ? 280 : 320, height: isVisibleInSheet ? 280 : 180)
            .opacity(isVisibleInSheet ? 1 : 0.01)
            .allowsHitTesting(isVisibleInSheet)
    }
}

private struct MusicPlayerWebViewRepresentable: UIViewRepresentable {
    let store: MusicPlayerStore
    var isVisibleInSheet: Bool = false

    func makeCoordinator() -> Coordinator {
        Coordinator(store: store, isVisibleInSheet: isVisibleInSheet)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.processPool = WKProcessPool()

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "ended")
        contentController.add(context.coordinator, name: "playerReady")
        config.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.isScrollEnabled = false
        webView.isOpaque = false
        webView.backgroundColor = .clear
        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let coordinator = context.coordinator
        let item = store.currentItem
        let itemId = item?.id ?? ""

        let shouldPauseBackground = !context.coordinator.isVisibleInSheet && store.isMusicSheetPresented
        if shouldPauseBackground {
            coordinator.applyPlayPause(false)
            return
        }

        if coordinator.lastLoadedItemId != itemId {
            coordinator.lastLoadedItemId = itemId
            guard let item = item, let url = item.playbackURL else {
                return
            }
            if item.isYouTubeSource, let videoId = item.youtubeVideoId {
                coordinator.loadYouTube(videoId: videoId, autoplay: store.isPlaying)
            } else {
                coordinator.loadDirectAudio(url: url, autoplay: store.isPlaying)
            }
        } else {
            coordinator.applyPlayPause(store.isPlaying)
        }

        if let target = store.seekTarget {
            coordinator.applySeek(seconds: target)
            store.seekTarget = nil
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.stopTimePolling()
        coordinator.webView = nil
    }

    final class Coordinator: NSObject, WKScriptMessageHandler {
        private weak var store: MusicPlayerStore?
        private var timePolling: Timer?
        weak var webView: WKWebView? {
            didSet {
                if webView == nil { stopTimePolling() }
            }
        }
        var lastLoadedItemId: String = ""
        let isVisibleInSheet: Bool

        init(store: MusicPlayerStore, isVisibleInSheet: Bool = false) {
            self.store = store
            self.isVisibleInSheet = isVisibleInSheet
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "ended" {
                Task { @MainActor in
                    store?.next()
                }
            } else if message.name == "playerReady" {
                Task { @MainActor in
                    let shouldPlay = store?.isPlaying ?? true
                    if shouldPlay {
                        configureAudioSessionForPlayback()
                        applyPlayPause(true)
                    }
                }
            }
        }

        func loadYouTube(videoId: String, autoplay: Bool) {
            if autoplay {
                configureAudioSessionForPlayback()
            }
            let autoplayVal = autoplay ? "1" : "0"
            let html = """
            <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
            <body style="margin:0;background:#000;">
            <div id="player"></div>
            <script>
            var tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            var first = document.getElementsByTagName('script')[0];
            first.parentNode.insertBefore(tag, first);
            var player;
            var vid = "\(videoId.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\""))";
            function onYouTubeIframeAPIReady() {
              player = new YT.Player('player', {
                width: '1', height: '1',
                videoId: vid,
                playerVars: { playsinline: 1, autoplay: \(autoplayVal), controls: 0 },
                events: {
                  'onReady': function(e) {
                    if ("\(autoplayVal)" === "1") e.target.playVideo();
                    try { if (window.webkit && window.webkit.messageHandlers.playerReady) window.webkit.messageHandlers.playerReady.postMessage(''); } catch(err) {}
                  },
                  'onStateChange': function(e) { if (e.data === YT.PlayerState.ENDED) window.webkit.messageHandlers.ended.postMessage(''); }
                }
              });
            }
            function play() { try { if (player && player.playVideo) player.playVideo(); } catch(e){} }
            function pause() { try { if (player && player.pauseVideo) player.pauseVideo(); } catch(e){} }
            function getCurrentTime() { try { return player && player.getCurrentTime ? player.getCurrentTime() : 0; } catch(e){ return 0; } }
            function getDuration() { try { return player && player.getDuration ? player.getDuration() : 0; } catch(e){ return 0; } }
            function seekTo(sec) { try { if (player && player.seekTo) player.seekTo(sec, true); } catch(e){} }
            </script></body></html>
            """
            webView?.loadHTMLString(html, baseURL: URL(string: "https://www.youtube.com"))
            startTimePolling()
        }

        func loadDirectAudio(url: URL, autoplay: Bool) {
            let urlString = url.absoluteString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
                .replacingOccurrences(of: "&", with: "&amp;")
                .replacingOccurrences(of: "<", with: "&lt;")
                .replacingOccurrences(of: ">", with: "&gt;")
            let html = """
            <!DOCTYPE html><html><body style="margin:0;background:#000;">
            <audio id="a" src='\(urlString)'></audio>
            <script>
            var a = document.getElementById('a');
            a.addEventListener('ended', function() { window.webkit.messageHandlers.ended.postMessage(''); });
            function play() { a.play().catch(function(){}); }
            function pause() { a.pause(); }
            function getCurrentTime() { return a.currentTime || 0; }
            function getDuration() { return a.duration || 0; }
            function seekTo(sec) { a.currentTime = sec; }
            </script></body></html>
            """
            webView?.loadHTMLString(html, baseURL: nil)
            if autoplay {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    self?.applyPlayPause(true)
                }
            }
            startTimePolling()
        }

        func applyPlayPause(_ play: Bool) {
            if play {
                configureAudioSessionForPlayback()
                // iOS often ignores the first programmatic play; retry a few times after player is ready.
                attemptPlay(retriesLeft: 3)
            } else {
                let cmd = "pause()"
                webView?.evaluateJavaScript(cmd) { _, _ in }
            }
        }

        private func configureAudioSessionForPlayback() {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default)
                try session.setActive(true, options: [])
            } catch {}
        }

        private func attemptPlay(retriesLeft: Int) {
            guard retriesLeft > 0 else { return }
            webView?.evaluateJavaScript("play()") { [weak self] _, _ in
                guard let self = self, retriesLeft > 1 else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    self.attemptPlay(retriesLeft: retriesLeft - 1)
                }
            }
        }

        func applySeek(seconds: TimeInterval) {
            let cmd = "seekTo(\(seconds));"
            webView?.evaluateJavaScript(cmd) { _, _ in }
        }

        func startTimePolling() {
            stopTimePolling()
            timePolling = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                self?.pollTime()
            }
            RunLoop.main.add(timePolling!, forMode: .common)
        }

        func stopTimePolling() {
            timePolling?.invalidate()
            timePolling = nil
        }

        private func pollTime() {
            guard let webView = webView, let store = store else { return }
            webView.evaluateJavaScript("getCurrentTime();") { cur, _ in
                let t = (cur as? NSNumber)?.doubleValue ?? 0
                webView.evaluateJavaScript("getDuration();") { dur, _ in
                    let d = (dur as? NSNumber)?.doubleValue ?? 0
                    Task { @MainActor in
                        store.setPlaybackTime(current: t, duration: d)
                    }
                }
            }
        }
    }
}
