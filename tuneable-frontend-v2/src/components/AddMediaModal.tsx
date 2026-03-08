import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Download, Upload } from 'lucide-react';

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AddMediaModal: React.FC<AddMediaModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handleSearch = () => {
    onClose();
    navigate('/dashboard', { state: { openAddTune: true } });
  };

  const handleImport = () => {
    onClose();
    navigate('/creator/import-youtube');
  };

  const handleUpload = () => {
    onClose();
    navigate('/creator/upload');
  };

  if (!isOpen) return null;

  const options = [
    {
      label: 'Search Library / YouTube',
      description: 'Find tunes in our database or add from YouTube',
      icon: Search,
      onClick: handleSearch,
      className: 'hover:bg-purple-600/30 border-purple-500/50',
    },
    {
      label: 'Import from YouTube',
      description: 'Import your liked videos from YouTube',
      icon: Download,
      onClick: handleImport,
      className: 'hover:bg-red-600/30 border-red-500/50',
    },
    {
      label: 'Upload MP3',
      description: 'Upload your own audio file',
      icon: Upload,
      onClick: handleUpload,
      className: 'hover:bg-pink-600/30 border-pink-500/50',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
      <div
        ref={modalRef}
        className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700"
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Add Media</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {options.map(({ label, description, icon: Icon, onClick, className }) => (
            <button
              key={label}
              onClick={onClick}
              className={`w-full flex items-center gap-4 p-4 rounded-lg border text-left transition-colors ${className}`}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-700/50 flex items-center justify-center">
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white">{label}</div>
                <div className="text-sm text-gray-400 truncate">{description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AddMediaModal;
