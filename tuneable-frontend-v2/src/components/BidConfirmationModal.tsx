import React, { useState } from 'react';
import { X, Music, Tag, AlertCircle } from 'lucide-react';

interface BidConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tags: string[]) => void;
  bidAmount: number;
  mediaTitle: string;
  mediaArtist?: string;
  currentBid?: number;
  userBalance?: number;
  isLoading?: boolean;
}

const BidConfirmationModal: React.FC<BidConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  bidAmount,
  mediaTitle,
  mediaArtist,
  currentBid,
  userBalance = 0,
  isLoading = false,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim().toLowerCase();
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 5) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = () => {
    onConfirm(tags);
    setTags([]);
    setTagInput('');
  };

  const handleSkip = () => {
    onConfirm([]);
    setTags([]);
    setTagInput('');
  };

  const handleClose = () => {
    setTags([]);
    setTagInput('');
    onClose();
  };

  if (!isOpen) return null;

  const balanceAfterBid = userBalance - bidAmount;
  const hasInsufficientFunds = bidAmount > userBalance;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Confirm Your Bid</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isLoading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Media Info */}
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Music className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Bidding on:</span>
          </div>
          <p className="text-gray-900 font-medium">{mediaTitle}</p>
          {mediaArtist && (
            <p className="text-gray-600 text-sm">by {mediaArtist}</p>
          )}
        </div>

        {/* Bid Amount Summary */}
        <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-700">Your Bid Amount:</span>
            <span className="text-2xl font-bold text-purple-600">£{bidAmount.toFixed(2)}</span>
          </div>
          {currentBid !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Current bid:</span>
              <span className="font-medium text-gray-900">£{currentBid.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-purple-200">
            <span className="text-gray-600">Your balance:</span>
            <span className={`font-medium ${hasInsufficientFunds ? 'text-red-600' : 'text-gray-900'}`}>
              £{userBalance.toFixed(2)}
            </span>
          </div>
          {!hasInsufficientFunds && (
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-gray-600">Balance after bid:</span>
              <span className="font-medium text-gray-900">£{balanceAfterBid.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Insufficient Funds Warning */}
        {hasInsufficientFunds && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">Insufficient Funds</p>
              <p className="text-xs text-red-600 mt-1">
                You need £{bidAmount.toFixed(2)} but only have £{userBalance.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Tag Input Section */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Tag className="h-4 w-4 text-purple-600" />
            <label className="text-sm font-medium text-gray-700">
              Add Tags (Optional)
            </label>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Help others discover this tune with tags like genre, mood, or setting
          </p>
          
          <div className="flex space-x-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., chill, electronic, workout"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              maxLength={20}
              disabled={isLoading}
            />
            <button
              onClick={handleAddTag}
              disabled={!tagInput.trim() || tags.length >= 5 || isLoading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Press Enter to add • Max 5 tags • {tags.length}/5 used
          </p>

          {/* Tags Display */}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded-full flex items-center gap-2"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="text-purple-200 hover:text-white ml-1"
                    type="button"
                    disabled={isLoading}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            disabled={isLoading || hasInsufficientFunds}
          >
            Skip Tags
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || hasInsufficientFunds}
          >
            {isLoading ? 'Placing Bid...' : 'Confirm Bid'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BidConfirmationModal;


