import React, { useEffect, useState } from 'react';

export type LoaderFlavor = 'podcast' | 'music' | 'books' | 'party' | 'generic';
export type LoaderSize = 'page' | 'section' | 'inline';

interface EntertainingLoaderProps {
  flavor?: LoaderFlavor;
  size?: LoaderSize;
  headline?: string;
  detail?: string;
  progress?: number;
  meta?: string;
  className?: string;
}

const ROTATING: Record<LoaderFlavor, string[]> = {
  podcast: [
    'Warming up the mics…',
    'First visit to a show? We import the catalogue from the RSS feed — next time this is instant.',
    'Paging through episodes like a producer with too many tabs open.',
    'Some shows have hundreds of episodes. Grabbing a first batch so you can start listening.',
    'Asking the feed nicely for titles, durations, and cover art.',
    'RSS is “Really Simple Syndication.” Importing it is less simple. Hang tight.',
    'Tip an episode once this lands and it charts on Tuneable.',
    'Checking the green room for extra episodes…',
    'If this is taking a while, the back catalogue is probably huge. Worth it.',
    'Counting ad-reads so you don’t have to.',
  ],
  music: [
    'Flipping through crates…',
    'Asking MusicBrainz who recorded this, and when.',
    'Matching titles across Tuneable and the wider catalogue.',
    'Good metadata takes a second. Bad metadata takes a lifetime.',
    'Cueing the next needle drop…',
    'If it’s not on Tuneable yet, you can still tip it and we’ll add it.',
  ],
  books: [
    'Checking the stacks…',
    'Open Library is flipping pages. Google Books is still in the Dewey Decimal.',
    'Matching ISBNs so you don’t get the wrong edition.',
    'Cover art incoming — some of these jackets are older than the internet.',
    'Cataloguing titles, authors, and the occasional subtitle that won’t quit.',
  ],
  party: [
    'Assembling the queue…',
    'Counting tips in the room.',
    'Syncing who’s playing, who’s next, and who’s been vetoed.',
    'Parties with a long history take a moment to load. The chart is worth it.',
    'Tuning the room…',
  ],
  generic: [
    'Just a moment…',
    'Fetching the good stuff.',
    'Almost there.',
    'Worth the wait — promise.',
  ],
};

const WAITING_HINTS: Record<LoaderFlavor, { after: number; text: string }[]> = {
  podcast: [
    { after: 8, text: 'Still going — big shows take a bit on the first visit.' },
    { after: 20, text: 'Importing the back catalogue so this page is instant next time.' },
    { after: 40, text: 'This one’s a marathon. Thanks for hanging in.' },
  ],
  music: [
    { after: 8, text: 'Still searching — MusicBrainz can be a bit leisurely.' },
    { after: 20, text: 'Wide catalogue, lots of metadata. Nearly there.' },
  ],
  books: [
    { after: 8, text: 'Still in the stacks…' },
    { after: 20, text: 'Libraries are thorough. That’s a compliment, mostly.' },
  ],
  party: [
    { after: 8, text: 'Still assembling the room…' },
    { after: 20, text: 'Busy parties take a moment to load the full queue.' },
  ],
  generic: [
    { after: 8, text: 'Still going — thanks for waiting.' },
    { after: 20, text: 'Almost there.' },
  ],
};

function Equalizer({ compact }: { compact?: boolean }) {
  const heights = compact ? [14, 22, 18, 26, 16] : [22, 36, 28, 42, 24, 34, 20];
  return (
    <div className={`flex items-end justify-center gap-1 ${compact ? 'h-8' : 'h-12'}`} aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className="entertaining-loader-bar w-1.5 rounded-full bg-gradient-to-t from-purple-600 to-pink-400"
          style={{ height: h, animationDelay: `${i * 0.11}s` }}
        />
      ))}
    </div>
  );
}

const EntertainingLoader: React.FC<EntertainingLoaderProps> = ({
  flavor = 'generic',
  size = 'section',
  headline,
  detail,
  progress,
  meta,
  className = '',
}) => {
  const lines = ROTATING[flavor];
  const [lineIndex, setLineIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const rotate = window.setInterval(() => {
      setLineIndex((i) => (i + 1) % lines.length);
    }, 3800);
    const tick = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      window.clearInterval(rotate);
      window.clearInterval(tick);
    };
  }, [lines.length]);

  const waitingHint = [...WAITING_HINTS[flavor]].reverse().find((h) => elapsed >= h.after)?.text;
  const clampedProgress =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : null;

  const inner = (
    <div
      role="status"
      aria-live="polite"
      className={`text-center ${size === 'inline' ? 'py-4' : 'py-10 px-4'} ${className}`}
    >
      <div className="mb-5">
        <Equalizer compact={size === 'inline'} />
      </div>

      {headline ? (
        <p className={`${size === 'page' ? 'text-xl' : 'text-lg'} font-semibold text-white mb-2`}>
          {headline}
        </p>
      ) : null}

      {detail ? <p className="text-purple-200/90 text-sm mb-3">{detail}</p> : null}

      {meta ? (
        <div className="inline-flex items-center gap-2 bg-purple-600/20 border border-purple-500/30 rounded-lg px-3 py-1.5 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
          <span className="text-purple-200 text-sm font-medium">{meta}</span>
        </div>
      ) : null}

      <p
        key={lineIndex}
        className="entertaining-loader-line text-gray-400 text-sm max-w-md mx-auto min-h-[2.5rem] leading-relaxed"
      >
        {lines[lineIndex]}
      </p>

      {clampedProgress !== null ? (
        <div className="w-full max-w-md mx-auto mt-5">
          <div className="bg-gray-700/80 rounded-full h-2.5 overflow-hidden shadow-inner">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <p className="text-purple-300 text-xs mt-2 tabular-nums">{clampedProgress}% complete</p>
        </div>
      ) : null}

      {waitingHint && clampedProgress === null ? (
        <p className="text-gray-500 text-xs mt-4 max-w-sm mx-auto">{waitingHint}</p>
      ) : null}

      {waitingHint && clampedProgress !== null && clampedProgress < 95 ? (
        <p className="text-gray-500 text-xs mt-3 max-w-sm mx-auto">{waitingHint}</p>
      ) : null}
    </div>
  );

  if (size === 'page') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">{inner}</div>
      </div>
    );
  }

  if (size === 'section') {
    return (
      <div className="bg-gray-800/40 rounded-xl border border-gray-700/60">
        {inner}
      </div>
    );
  }

  return inner;
};

export default EntertainingLoader;
