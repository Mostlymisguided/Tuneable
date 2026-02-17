import SwiftUI
import WebKit

/// Hosts the actual playback (YouTube embed or direct audio) in a hidden WKWebView.
/// Observes MusicPlayerStore and loads/plays the current item; pushes time updates back to the store.
struct MusicPlayerHostView: View {
    @ObservedObject var store: MusicPlayerStore

    var body: some View {
        MusicPlayerWebViewRepresentable(store: store)
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .allowsHitTesting(false)
    }
}

private struct MusicPlayerWebViewRepresentable: UIViewRepresentable {
    let store: MusicPlayerStore

    func makeCoordinator() -> Coordinator {
        Coordinator(store: store)
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

        init(store: MusicPlayerStore) {
            self.store = store
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "ended" {
                Task { @MainActor in
                    store?.next()
                }
            }
        }

        func loadYouTube(videoId: String, autoplay: Bool) {
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
                events: { 'onStateChange': function(e) { if (e.data === YT.PlayerState.ENDED) window.webkit.messageHandlers.ended.postMessage(''); } }
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
            let cmd = play ? "play()" : "pause()"
            webView?.evaluateJavaScript(cmd) { _, _ in }
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
