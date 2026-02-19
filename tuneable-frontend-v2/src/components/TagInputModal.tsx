import React, { useState } from 'react';
import { X, Music, Tag } from 'lucide-react';

interface TagInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (tags: string[]) => void;
  mediaTitle?: string;
  mediaArtist?: string;
}

const TagInputModal: React.FC<TagInputModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  mediaTitle,
  mediaArtist
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
    onSubmit(tags);
    setTags([]);
    setTagInput('');
    onClose();
  };

  const handleSkip = () => {
    onSubmit([]);
    setTags([]);
    setTagInput('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 10000 }}>
      <div className="bg-gray-900 rounded-lg max-w-md w-full p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2">
            <Tag className="h-5 w-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Add Tags</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Media Info */}
        {mediaTitle && (
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-2 mb-1">
              <Music className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-medium text-gray-300">Adding to library:</span>
            </div>
            <p className="text-white font-medium">{mediaTitle}</p>
            {mediaArtist && (
              <p className="text-gray-400 text-sm">by {mediaArtist}</p>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="mb-4">
          <p className="text-gray-300 text-sm mb-2">
            Add tags to help others discover this tune. Think about:
          </p>
          <ul className="text-gray-400 text-xs space-y-1 ml-4">
            <li>• Genre (electronic, hip-hop, rock, etc.)</li>
            <li>• Mood (chill, energetic, nostalgic, etc.)</li>
            <li>• Setting (workout, party, study, etc.)</li>
            <li>• Era (90s, 2000s, current, etc.)</li>
          </ul>
        </div>

        {/* Tag Input */}
        <div className="mb-4">
          <div className="flex space-x-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., chill, electronic, workout"
              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              maxLength={20}
            />
            <button
              onClick={handleAddTag}
              disabled={!tagInput.trim() || tags.length >= 5}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Press Enter to add • Max 5 tags • {tags.length}/5 used
          </p>
        </div>

        {/* Tags Display */}
        {tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
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
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleSkip}
            className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Add to Library
          </button>
        </div>

        {/* Help Text */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Tags help others find music they'll love. You can always edit them later.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TagInputModal;
