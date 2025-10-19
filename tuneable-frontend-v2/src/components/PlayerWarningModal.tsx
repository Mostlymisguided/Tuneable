import React from 'react';
import { Music, AlertTriangle } from 'lucide-react';

interface PlayerWarningModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  action: string;
  currentMediaTitle?: string;
  currentMediaArtist?: string;
}

const PlayerWarningModal: React.FC<PlayerWarningModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  action,
  currentMediaTitle,
  currentMediaArtist,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] max-w-sm" style={{ zIndex: 9999 }} data-warning-popup>
      <div className="bg-gray-800 border-2 border-yellow-500 rounded-lg shadow-2xl p-4 animate-slide-in animate-pulse animate-highlight" style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)' }}>
        {/* Header */}
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
          <h3 className="text-lg font-bold text-white">
            Music Playing Warning
          </h3>
        </div>

        {/* Current Song Info */}
        <div className="bg-gray-700 rounded-lg p-3 mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
              <Music className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-300 mb-1">Currently playing:</p>
              <p className="text-sm font-medium text-white truncate">
                {currentMediaTitle || 'Unknown media'}
              </p>
              {currentMediaArtist && (
                <p className="text-xs text-gray-400 truncate">by {currentMediaArtist}</p>
              )}
            </div>
          </div>
        </div>

        {/* Warning Message */}
        <div className="mb-4">
          <p className="text-sm text-gray-300">
            You're about to <span className="font-semibold text-purple-400">{action}</span>, which will 
            change your current music context.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm shadow-sm bg-gray-700 border border-gray-500 text-white rounded-lg font-medium hover:bg-gray-600 transition-colors"
            style={{backgroundColor: 'rgba(55, 65, 81, 0.2)'}}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 text-sm bg-gradient-button text-white rounded-lg font-medium hover:opacity-90 transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerWarningModal;
