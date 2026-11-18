import React from 'react';
import { Heart, Loader2 } from 'lucide-react';

type TipHeartSize = 'queue' | 'chart' | 'compact';

const BUTTON_SIZE: Record<TipHeartSize, string> = {
  queue: 'h-10 w-10 md:h-11 md:w-11',
  chart: 'h-10 w-10 md:w-12 md:h-12',
  compact: 'h-10 w-10',
};

const HEART_SIZE: Record<TipHeartSize, string> = {
  queue: 'h-5 w-5',
  chart: 'h-5 w-5 md:h-6 md:w-6',
  compact: 'h-5 w-5',
};

export interface TipHeartButtonProps {
  tipped?: boolean;
  loading?: boolean;
  disabled?: boolean;
  size?: TipHeartSize;
  title?: string;
  heartClassName?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/** Tip control. A filled rose heart means the signed-in viewer has already tipped. */
const TipHeartButton: React.FC<TipHeartButtonProps> = ({
  tipped = false,
  loading = false,
  disabled = false,
  size = 'chart',
  title,
  heartClassName,
  onClick,
}) => {
  const label = title || (tipped ? 'You tipped this. Send another tip' : 'Send a tip');
  const palette = tipped
    ? 'border-rose-400/70 bg-rose-950/60 text-rose-300 hover:border-rose-300 hover:bg-rose-600 hover:text-white'
    : 'border-purple-500/40 bg-purple-900/40 text-purple-300 hover:border-purple-500 hover:bg-purple-600 hover:text-white';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      aria-pressed={tipped}
      className={`group flex items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_SIZE[size]} ${palette}`}
    >
      {loading ? (
        <Loader2 className={`${heartClassName || HEART_SIZE[size]} animate-spin`} />
      ) : (
        <Heart
          className={`${heartClassName || HEART_SIZE[size]} transition-transform group-hover:scale-110 ${
            tipped ? 'fill-current' : ''
          }`}
        />
      )}
    </button>
  );
};

export default TipHeartButton;
