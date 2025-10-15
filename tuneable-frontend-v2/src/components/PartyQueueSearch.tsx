import React, { useState, useEffect } from 'react';
import { Search, X, Music, Database, Youtube, Loader2, Clock } from 'lucide-react';
import { searchAPI, partyAPI } from '../lib/api';
import { toast } from 'react-toastify';

interface SearchResult {
  id: string;
  uuid?: string;
  title: string;
  artist: string;
  coverArt: string;
  duration: number;
  sources: Record<string, string>;
  globalMediaAggregate?: number;
  partyMediaAggregate?: number;
  addedBy?: string;
  isLocal?: boolean;
  tags?: string[];
  category?: string;
  resultSource?: 'queue' | 'database' | 'youtube'; // Track where result came from
}

interface PartyQueueSearchProps {
  partyId: string;
  musicSource: 'youtube' | 'spotify';
  onBidClick: (media: any) => void; // Callback to open bid modal
}

const PartyQueueSearch: React.FC<PartyQueueSearchProps> = ({ 
  partyId, 
  musicSource,
  onBidClick 
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [results, setResults] = useState<{
    queue: SearchResult[];
    database: SearchResult[];
    external: SearchResult[];
  }>({
    queue: [],
    database: [],
    external: []
  });
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Perform search whenever search terms change
  useEffect(() => {
    if (searchTerms.length > 0) {
      console.log('🔍 Triggering cascading search for terms:', searchTerms);
      performCascadingSearch();
    } else {
      setResults({ queue: [], database: [], external: [] });
      setShowResults(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerms]);

  const addSearchTerm = (term: string) => {
    const trimmedTerm = term.trim();
    if (trimmedTerm && !searchTerms.includes(trimmedTerm)) {
      setSearchTerms([...searchTerms, trimmedTerm]);
      setSearchInput('');
      setShowResults(true);
    }
  };

  const removeSearchTerm = (term: string) => {
    setSearchTerms(searchTerms.filter(t => t !== term));
    if (searchTerms.length === 1) {
      // Last term being removed
      setShowResults(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSearchTerm(searchInput);
    }
  };

  const performCascadingSearch = async () => {
    setIsSearching(true);
    console.log('🚀 Starting cascading search...');
    
    try {
      // Step 1: Search party queue
      console.log('📀 Step 1: Searching party queue...');
      const queueResults = await searchPartyQueue();
      console.log(`✅ Found ${queueResults.length} results in party queue`);
      
      // Step 2: Search local database (if no queue results)
      let databaseResults: SearchResult[] = [];
      if (queueResults.length === 0) {
        console.log('📚 Step 2: Searching local database...');
        databaseResults = await searchLocalDatabase();
        console.log(`✅ Found ${databaseResults.length} results in database`);
      } else {
        console.log('⏭️  Skipping database search (found queue results)');
      }
      
      // Step 3: Search YouTube (if no database results)
      let externalResults: SearchResult[] = [];
      if (queueResults.length === 0 && databaseResults.length === 0) {
        console.log('🎥 Step 3: Searching YouTube...');
        externalResults = await searchExternal();
        console.log(`✅ Found ${externalResults.length} results on YouTube`);
      } else if (queueResults.length > 0 || databaseResults.length > 0) {
        console.log('⏭️  Skipping YouTube search (found local results)');
      }
      
      console.log('📊 Final results:', {
        queue: queueResults.length,
        database: databaseResults.length,
        external: externalResults.length
      });
      
      setResults({
        queue: queueResults,
        database: databaseResults,
        external: externalResults
      });
      
    } catch (error) {
      console.error('❌ Search error:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const searchPartyQueue = async (): Promise<SearchResult[]> => {
    try {
      // Use backend API to search party queue
      const combinedQuery = searchTerms.join(' ');
      const response = await partyAPI.searchPartyQueue(partyId, combinedQuery);
      
      if (response.results && response.results.length > 0) {
        return response.results.map((r: any) => ({
          ...r,
          resultSource: 'queue' as const
        }));
      }
      return [];
    } catch (error) {
      console.error('Party queue search error:', error);
      return [];
    }
  };

  const searchLocalDatabase = async (): Promise<SearchResult[]> => {
    try {
      // Search with all terms combined (OR matching handled by backend)
      const combinedQuery = searchTerms.join(' ');
      const response = await searchAPI.search(combinedQuery, musicSource);
      
      if (response.videos && response.videos.length > 0) {
        return response.videos.map((v: any) => ({
          ...v,
          resultSource: 'database' as const
        }));
      }
      return [];
    } catch (error) {
      console.error('Database search error:', error);
      return [];
    }
  };

  const searchExternal = async (): Promise<SearchResult[]> => {
    try {
      // Search with all terms combined
      const combinedQuery = searchTerms.join(' ');
      const response = await searchAPI.search(combinedQuery, musicSource, undefined, undefined, true);
      
      if (response.videos && response.videos.length > 0) {
        return response.videos.map((v: any) => ({
          ...v,
          resultSource: 'youtube' as const
        }));
      }
      return [];
    } catch (error) {
      console.error('External search error:', error);
      return [];
    }
  };

  const handleResultClick = (result: SearchResult) => {
    onBidClick(result);
  };

  const totalResults = results.queue.length + results.database.length + results.external.length;

  return (
    <div className="w-auto">
      {/* Search Input */}
      <div className="relative">
        <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 focus-within:border-purple-500 transition-colors">
          <Search className="ml-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search party queue, library, or YouTube... (Press Enter to add term)"
            className="flex-1 bg-transparent p-3 rounded-lg px-3 py-2.5 text-slate placeholder-gray-400 focus:outline-none"
          />
          {isSearching && (
            <Loader2 className="mr-3 h-5 w-5 text-purple-400 animate-spin" />
          )}
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
                  className="ml-2 hover:bg-slate-600 rounded-full p-0.5 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search Results */}
      {showResults && (
        <div className="mt-4 space-y-4">
          {/* No Results */}
          {totalResults === 0 && !isSearching && (
            <div className="text-center py-8 bg-gray-800 rounded-lg border border-gray-700">
              <Music className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">
                No results found for "{searchTerms.join(', ')}"
              </p>
            </div>
          )}

          {/* Queue Results */}
          {results.queue.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="bg-purple-900/30 px-4 py-2 border-b border-gray-700 flex items-center">
                <Music className="h-4 w-4 text-purple-400 mr-2" />
                <h3 className="text-sm font-semibold text-purple-300">
                  In Party Queue ({results.queue.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-700">
                {results.queue.map((result) => (
                  <SearchResultCard 
                    key={result.id} 
                    result={result} 
                    onClick={handleResultClick}
                    showPartyBid={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Database Results */}
          {results.database.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="bg-green-900/30 px-4 py-2 border-b border-gray-700 flex items-center">
                <Database className="h-4 w-4 text-green-400 mr-2" />
                <h3 className="text-sm font-semibold text-green-300">
                  In Tuneable Library ({results.database.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-700">
                {results.database.map((result) => (
                  <SearchResultCard 
                    key={result.id} 
                    result={result} 
                    onClick={handleResultClick}
                  />
                ))}
              </div>
            </div>
          )}

          {/* External Results */}
          {results.external.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="bg-red-900/30 px-4 py-2 border-b border-gray-700 flex items-center">
                <Youtube className="h-4 w-4 text-red-400 mr-2" />
                <h3 className="text-sm font-semibold text-red-300">
                  From YouTube ({results.external.length})
                </h3>
              </div>
              <div className="divide-y divide-gray-700">
                {results.external.map((result) => (
                  <SearchResultCard 
                    key={result.id} 
                    result={result} 
                    onClick={handleResultClick}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Search Result Card Component
interface SearchResultCardProps {
  result: SearchResult;
  onClick: (result: SearchResult) => void;
  showPartyBid?: boolean;
}

const SearchResultCard: React.FC<SearchResultCardProps> = ({ result, onClick, showPartyBid = false }) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="p-4 hover:bg-gray-700/50 transition-colors cursor-pointer"
      onClick={() => onClick(result)}
    >
      <div className="flex items-center space-x-4">
        {/* Cover Art */}
        <div className="flex-shrink-0">
          <img
            src={result.coverArt || '/default-cover.jpg'}
            alt={result.title}
            className="h-16 w-16 rounded-lg object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-medium truncate">{result.title}</h4>
          <p className="text-gray-400 text-sm truncate">{result.artist}</p>
          <div className="flex items-center space-x-3 mt-1">
            <span className="text-xs text-gray-500">
              <Clock className="inline h-3 w-3 mr-1" />
              {formatDuration(result.duration)}
            </span>
            {showPartyBid && result.partyMediaAggregate !== undefined && (
              <span className="text-xs text-purple-400 font-medium">
                Party: £{result.partyMediaAggregate.toFixed(2)}
              </span>
            )}
            {result.globalMediaAggregate !== undefined && result.globalMediaAggregate > 0 && (
              <span className="text-xs text-green-400 font-medium">
                Global: £{result.globalMediaAggregate.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        {/* Source Badge */}
        <div className="flex-shrink-0">
          {result.resultSource === 'queue' && (
            <div className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full font-medium">
              In Queue
            </div>
          )}
          {result.resultSource === 'database' && (
            <div className="px-2 py-1 bg-green-600 text-white text-xs rounded-full font-medium">
              Library
            </div>
          )}
          {result.resultSource === 'youtube' && (
            <div className="px-2 py-1 bg-red-600 text-white text-xs rounded-full font-medium">
              YouTube
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartyQueueSearch;

