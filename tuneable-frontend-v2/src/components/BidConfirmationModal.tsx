import React, { useState } from 'react';
import { X, Music, Tag, AlertCircle, Loader2 } from 'lucide-react';

interface BidConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tags: string[]) => void;
  bidAmount: number;
  mediaTitle: string;
  mediaArtist?: string;
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
  userBalance = 0,
  isLoading = false,
}) => {
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Capitalize tag: first letter of each word (title case)
  const capitalizeTag = (tag: string): string => {
    if (!tag || typeof tag !== 'string') return tag;
    return tag
      .trim()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const handleAddTag = () => {
    const input = tagInput.trim();
    if (!input) return;

    // Split by comma and process each tag
    const newTags = input
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
      .map(tag => capitalizeTag(tag))
      .filter(tag => {
        // Check if tag already exists (case-insensitive comparison)
        const tagLower = tag.toLowerCase();
        return !tags.some(existingTag => existingTag.toLowerCase() === tagLower);
      });

    // Add new tags (respecting the 5 tag limit)
    const remainingSlots = 5 - tags.length;
    if (remainingSlots > 0 && newTags.length > 0) {
      const tagsToAdd = newTags.slice(0, remainingSlots);
      setTags([...tags, ...tagsToAdd]);
      setTagInput('');
    } else if (remainingSlots === 0) {
      // Already at max tags
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

  const handleClose = () => {
    setTags([]);
    setTagInput('');
    onClose();
  };

  if (!isOpen) return null;

  const hasInsufficientFunds = bidAmount > userBalance;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Confirm Your Tip</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-200 transition-colors"
            disabled={isLoading}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Media Info */}
        <div className="mb-4 p-3 bg-gray-700 rounded-lg">
          <div className="flex items-center space-x-2 mb-1">
            <Music className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Tipping on:</span>
          </div>
          <p className="text-white font-medium">{mediaTitle}</p>
          {mediaArtist && (
            <p className="text-gray-400 text-sm">by {mediaArtist}</p>
          )}
        </div>

        {/* Bid Amount Summary */}
        <div className="mb-4 p-4 bg-purple-900/30 rounded-lg border border-purple-600">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Your Tip Amount:</span>
            <span className="text-2xl font-bold text-purple-400">£{bidAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Insufficient Funds Warning */}
        {hasInsufficientFunds && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded-lg flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">Insufficient Funds</p>
              <p className="text-xs text-red-400 mt-1">
                You need £{bidAmount.toFixed(2)} but only have £{userBalance.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Tag Input Section */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <Tag className="h-4 w-4 text-purple-400" />
            <label className="text-sm font-medium text-gray-300">
              Add Tags (Optional)
            </label>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Help others discover this tune with tags like genre, mood, or setting
          </p>
          
          <div className="flex space-x-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., chill, electronic, workout"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              maxLength={20}
              disabled={isLoading}
            />
            <button
              onClick={handleAddTag}
              disabled={!tagInput.trim() || tags.length >= 5 || isLoading}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-400">
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
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded-md transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={isLoading || hasInsufficientFunds}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Placing Tip...</span>
              </>
            ) : (
              'Confirm Tip'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BidConfirmationModal;


