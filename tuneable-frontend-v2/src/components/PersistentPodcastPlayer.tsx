import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { usePodcastPlayerStore, getEpisodeAudioUrl } from '../stores/podcastPlayerStore';
import { DEFAULT_COVER_ART } from '../constants';
import { Play, Pause, Volume2, VolumeX, X } from 'lucide-react';

const PersistentPodcastPlayer: React.FC = () => {
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSeekingRef = useRef(false);

  const {
    currentEpisode,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    togglePlayPause,
    setCurrentTime,
    setDuration,
    setVolume,
    toggleMute,
    clear,
  } = usePodcastPlayerStore();

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const audioUrl = getEpisodeAudioUrl(currentEpisode);

  const resolveFullUrl = (url: string): string => {
    if (url.startsWith('http')) return url;
    if (url.startsWith('/uploads/media-uploads/')) {
      const r2Key = url.replace('/uploads/', '');
      return `https://uploads.tuneable.stream/${r2Key}`;
    }
    if (url.startsWith('/uploads/')) return `https://uploads.tuneable.stream${url}`;
    return `${window.location.origin}${url}`;
  };

  useEffect(() => {
    if (!currentEpisode || !audioUrl || !audioRef.current) {
      setIsPlayerReady(false);
      setIsLoading(false);
      return;
    }

    const fullUrl = resolveFullUrl(audioUrl);
    setIsPlayerReady(false);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);

    const el = audioRef.current;
    el.src = fullUrl;
    el.volume = volume / 100;
    el.muted = isMuted;

    el.onloadedmetadata = () => {
      if (el.duration && isFinite(el.duration)) {
        setDuration(el.duration);
      } else if (currentEpisode.duration) {
        setDuration(currentEpisode.duration);
      }
      setIsPlayerReady(true);
      setIsLoading(false);
    };

    el.onerror = () => {
      setIsLoading(false);
    };

    el.onended = () => {
      usePodcastPlayerStore.getState().pause();
    };

    el.load();
    return () => {
      el.pause();
      el.src = '';
    };
  }, [currentEpisode?._id ?? currentEpisode?.id, audioUrl]);

  useEffect(() => {
    if (!audioRef.current || !isPlayerReady) return;
    if (isPlaying) {
      const p = audioRef.current.play();
      if (p?.catch) p.catch(() => usePodcastPlayerStore.getState().pause());
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, isPlayerReady]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume / 100;
    audioRef.current.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    if (!audioRef.current || !isPlayerReady || isSeekingRef.current) return;
    const t = setInterval(() => {
      if (audioRef.current && !isSeekingRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    }, 500);
    return () => clearInterval(t);
  }, [isPlayerReady]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlayPause]);

  const handleSeek = (newTime: number) => {
    if (!audioRef.current) return;
    isSeekingRef.current = true;
    const t = Math.max(0, Math.min(newTime, duration || 0));
    setCurrentTime(t);
    audioRef.current.currentTime = t;
    setTimeout(() => { isSeekingRef.current = false; }, 100);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleSeek(parseFloat(e.target.value));
  };

  const formatTime = (s: number): string => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const episodeId = currentEpisode?._id ?? currentEpisode?.id;
  const cover = currentEpisode?.coverArt ?? currentEpisode?.podcastSeries?.coverArt ?? DEFAULT_COVER_ART;
  const showTitle = currentEpisode?.podcastSeries?.title ?? currentEpisode?.podcastTitle ?? '';

  if (!user || !currentEpisode) return null;

  return (
    <>
      <audio ref={audioRef} className="hidden" />
      <div
        className="fixed bottom-0 left-0 right-0 z-[9999] backdrop-blur-xl border-t border-gray-700/50 shadow-2xl"
        style={{
          background: 'linear-gradient(to top, rgba(17, 24, 39, 0.95), rgba(31, 41, 55, 0.9))',
        }}
      >
        <div
          className="w-full h-1 bg-gray-800/80 cursor-pointer group"
          onClick={(e) => {
            if (!duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            handleSeek((x / rect.width) * duration);
          }}
        >
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all"
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>

        <div className="px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            {episodeId ? (
              <Link
                to={`/podcasts/${episodeId}`}
                className="flex w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800/50 hover:opacity-90 transition-opacity"
              >
                <img src={cover} alt={currentEpisode.title} className="w-full h-full object-cover" />
              </Link>
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-800/50 flex-shrink-0 flex items-center justify-center">
                <Play className="w-5 h-5 text-amber-400/70" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {episodeId && (
                  <Link to={`/podcasts/${episodeId}`} className="hover:opacity-90 transition-opacity min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">{currentEpisode.title}</h4>
                  </Link>
                )}
                {!episodeId && <h4 className="text-sm font-semibold text-gray-400 truncate">No episode</h4>}
              </div>
              {showTitle && (
                <p className="text-xs text-amber-200/80 truncate mt-0.5">{showTitle}</p>
              )}
            </div>

            <div className="text-xs text-gray-400 font-mono tabular-nums hidden sm:block">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            <div className="flex-1 max-w-xs hidden md:block">
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleScrubberChange}
                disabled={!isPlayerReady}
                className="w-full h-2 bg-gray-600/50 rounded-full appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed slider-thumb"
                style={{
                  background: duration
                    ? `linear-gradient(to right, #d97706 0%, #d97706 ${(currentTime / duration) * 100}%, rgba(75,85,99,0.5) ${(currentTime / duration) * 100}%, rgba(75,85,99,0.5) 100%)`
                    : undefined,
                }}
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={togglePlayPause}
                disabled={!isPlayerReady || isLoading}
                className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-gray-900 transition-colors"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" />
                )}
              </button>

              <button
                onClick={toggleMute}
                className="w-9 h-9 rounded-full bg-gray-700/80 hover:bg-gray-600 flex items-center justify-center text-gray-300 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              <input
                type="range"
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setVolume(v);
                  if (v > 0 && isMuted) toggleMute();
                }}
                className="w-20 h-1.5 bg-gray-600/50 rounded-full appearance-none cursor-pointer slider-thumb hidden lg:block"
              />

              <button
                onClick={clear}
                className="w-9 h-9 rounded-full bg-gray-700/80 hover:bg-gray-600 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                title="Close player"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .slider-thumb::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 0;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
      `}</style>
    </>
  );
};

export default PersistentPodcastPlayer;
