import React from 'react';
import { Music, AlertTriangle, X } from 'lucide-react';

interface PlayerWarningModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  action: string;
  currentSongTitle?: string;
  currentSongArtist?: string;
}

const PlayerWarningModal: React.FC<PlayerWarningModalProps> = ({
  isOpen,
  onConfirm,
  onCancel,
  action,
  currentSongTitle,
  currentSongArtist,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center space-x-3 mb-4">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">
              Music Playing Warning
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-3">
            <Music className="w-5 h-5 text-gray-500" />
            <div className="text-sm text-gray-600">
              <span className="font-medium">Currently playing:</span>
              <br />
              <span className="text-gray-900">
                {currentSongTitle && currentSongArtist 
                  ? `${currentSongTitle} by ${currentSongArtist}`
                  : 'Unknown song'
                }
              </span>
            </div>
          </div>
          
          <p className="text-gray-700">
            You're about to <span className="font-medium">{action}</span>, which will 
            change your current music context. This may interrupt your listening experience.
          </p>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayerWarningModal;
