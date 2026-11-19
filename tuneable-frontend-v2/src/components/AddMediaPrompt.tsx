import React from 'react';
import { Loader, Plus } from 'lucide-react';

interface AddMediaPromptProps {
  onClick: () => void;
  loading?: boolean;
}

const AddMediaPrompt: React.FC<AddMediaPromptProps> = ({ onClick, loading = false }) => (
  <div className="flex flex-col items-center gap-2">
    <p className="text-sm text-gray-400">Can&apos;t find it?</p>
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
    >
      {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      Add Media
    </button>
  </div>
);

export default AddMediaPrompt;
