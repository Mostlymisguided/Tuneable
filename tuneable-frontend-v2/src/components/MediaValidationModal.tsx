import React from 'react';
import { AlertTriangle, Music, Clock, X } from 'lucide-react';

interface MediaValidationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  mediaTitle?: string;
  mediaArtist?: string;
  warnings: {
    category?: boolean; // Category is not Music
    duration?: boolean; // Duration > 11:11
  };
  category?: string;
  duration?: number;
}

const MediaValidationModal: React.FC<MediaValidationModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  mediaTitle,
  mediaArtist,
  warnings,
  category,
  duration
}) => {
  if (!isOpen) return null;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 10001 }}>
      <div className="bg-gray-900 rounded-lg max-w-md w-full p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">Please Confirm</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Media Info */}
        <div className="mb-4 p-3 bg-gray-800 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Music className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Adding to party:</span>
          </div>
          <p className="text-white font-medium">{mediaTitle || 'Unknown Media'}</p>
          {mediaArtist && (
            <p className="text-gray-400 text-sm">by {mediaArtist}</p>
          )}
        </div>

        {/* Warnings */}
        <div className="mb-4 space-y-3">
          {warnings.category && (
            <div className="p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-300 mb-1">
                    Category Check
                  </p>
                  <p className="text-xs text-gray-300">
                    This video is categorized as <span className="font-semibold">"{category}"</span> on YouTube, not "Music".
                    Please confirm this is actually music before adding it to the party.
                  </p>
                </div>
              </div>
            </div>
          )}

          {warnings.duration && (
            <div className="p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
              <div className="flex items-start space-x-2">
                <Clock className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-yellow-300 mb-1">
                    Duration Check
                  </p>
                  <p className="text-xs text-gray-300">
                    This video is <span className="font-semibold">{duration ? formatDuration(duration) : 'long'}</span> long (over 11:11).
                    Please confirm this is a single tune, not a mix or compilation.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Yes, Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaValidationModal;

