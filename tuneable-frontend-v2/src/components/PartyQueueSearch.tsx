import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

interface PartyQueueSearchProps {
  onSearchTermsChange: (terms: string[]) => void; // Pass search terms to parent
}

const PartyQueueSearch: React.FC<PartyQueueSearchProps> = ({ 
  onSearchTermsChange 
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);

  // Notify parent whenever search terms change
  useEffect(() => {
    console.log('🔍 Search terms updated:', searchTerms);
    onSearchTermsChange(searchTerms);
  }, [searchTerms, onSearchTermsChange]);

  const addSearchTerm = (term: string) => {
    const trimmedTerm = term.trim();
    if (trimmedTerm && !searchTerms.includes(trimmedTerm)) {
      setSearchTerms([...searchTerms, trimmedTerm]);
      setSearchInput('');
    }
  };

  const removeSearchTerm = (term: string) => {
    setSearchTerms(searchTerms.filter(t => t !== term));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSearchTerm(searchInput);
    }
  };

  return (
    <div className="w-full">
      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 focus-within:border-purple-500 transition-colors">
          <Search className="ml-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter party tunes... (Press Enter to add search term)"
            className="flex-1 p-2 rounded-full bg-transparent px-3 py-2.5 text-slate placeholder-gray-400 focus:outline-none"
          />
        </div>
        
        {/* Search Term Pills */}
        {searchTerms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {searchTerms.map((term, index) => (
              <div
                key={index}
                className="inline-flex items-center bg-slate-700 text-slate-100 px-3 py-1.5 rounded-full text-sm font-medium"
              >
                <span>{term}</span>
                <button
                  onClick={() => removeSearchTerm(term)}
                  className="rounded-xl items-center"
                >
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x rounded-xl items-center" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </button>
                
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PartyQueueSearch;
