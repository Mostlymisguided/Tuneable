import React from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import {
  formatBytes,
  formatDuration,
  type UploadProgressState,
} from '../hooks/useUploadProgress';

interface UploadProgressProps {
  progress: UploadProgressState;
  fileName?: string;
  processingLabel?: string;
  onCancel?: () => void;
  className?: string;
}

const UploadProgress: React.FC<UploadProgressProps> = ({
  progress,
  fileName,
  processingLabel = 'Processing on server…',
  onCancel,
  className = '',
}) => {
  if (progress.phase === 'idle') return null;

  const processing = progress.phase === 'processing';
  const details: string[] = [];
  if (!processing) {
    if (progress.total > 0) {
      details.push(`${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}`);
    }
    if (progress.bytesPerSecond) {
      details.push(`${formatBytes(progress.bytesPerSecond)}/s`);
    }
    if (progress.secondsRemaining != null) {
      details.push(`${formatDuration(progress.secondsRemaining)} left`);
    }
  }

  return (
    <div
      className={`bg-purple-900/20 border border-purple-500/30 rounded-lg p-4 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {processing ? (
            <Loader2 className="h-4 w-4 text-purple-400 animate-spin shrink-0" />
          ) : progress.percent >= 100 ? (
            <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
          ) : null}
          <span className="text-white font-medium truncate">
            {processing ? processingLabel : `Uploading${fileName ? ` ${fileName}` : '…'}`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!processing && (
            <span className="text-purple-300 font-bold tabular-nums">{progress.percent}%</span>
          )}
          {onCancel && !processing && (
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-white transition-colors p-1 rounded"
              aria-label="Cancel upload"
              title="Cancel upload"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div
        className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={processing ? undefined : progress.percent}
      >
        {processing ? (
          <div className="h-full w-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 bg-[length:200%_100%] animate-upload-shimmer" />
        ) : (
          <div
            className="bg-gradient-to-r from-purple-600 to-pink-600 h-full transition-[width] duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        )}
      </div>

      <p className="text-xs text-gray-400 mt-2 tabular-nums min-h-[1rem]">
        {processing
          ? 'Upload complete. Saving your track — this can take a moment for large files.'
          : details.join(' · ')}
      </p>
    </div>
  );
};

export default UploadProgress;
