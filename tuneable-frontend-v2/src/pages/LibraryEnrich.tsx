import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LibraryXmlEnrich from '../components/LibraryXmlEnrich';

const LibraryEnrich: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-900 text-white py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <LibraryXmlEnrich scope="mine" />

        <p className="text-gray-500 text-sm mt-8">
          Tip: export your Rekordbox collection via File → Export Collection in xml format, or use iTunes/Music&apos;s{' '}
          <code className="text-purple-300">Library.xml</code>. Only tunes you uploaded or imported are updated.
          {' '}
          <Link to="/creator/upload" className="text-purple-400 hover:underline">
            Upload page
          </Link>
          {' '}also supports XML for new uploads.
        </p>
      </div>
    </div>
  );
};

export default LibraryEnrich;
