import React, { useEffect, useMemo, useState } from 'react';
import { partyAPI } from '../lib/api';
import { Play, Coins, Tag, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import TopSupporters from '../components/TopSupporters';
import ClickableArtistDisplay from '../components/ClickableArtistDisplay';

const GlobalTunes: React.FC = () => {
  const navigate = useNavigate();
  const { setQueue, setCurrentMedia, setGlobalPlayerActive } = useWebPlayerStore();

  const [globalParty, setGlobalParty] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await partyAPI.getParties();
        const g = (res.parties || []).find((p: any) => p.type === 'global');
        setGlobalParty(g || null);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const allMedia = globalParty?.media || [];

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of allMedia) {
      (m.tags || []).forEach((t: string) => {
        const key = (t || '').trim().toLowerCase();
        if (!key) return;
        counts[key] = (counts[key] || 0) + 1;
      });
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24);
  }, [allMedia]);

  const filteredMedia = useMemo(() => {
    if (selectedTags.length === 0) return allMedia;
    return allMedia.filter((m: any) => {
      const tags = (m.tags || []).map((t: string) => (t || '').toLowerCase());
      return selectedTags.every(t => tags.includes(t));
    });
  }, [allMedia, selectedTags]);

  const allBids = useMemo(() => {
    const bids: any[] = [];
    for (const m of allMedia) {
      (m.bids || []).forEach((b: any) => bids.push(b));
    }
    return bids;
  }, [allMedia]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const playItem = (item: any) => {
    setQueue(filteredMedia);
    const idx = filteredMedia.findIndex((m: any) => (m._id || m.id) === (item._id || item.id));
    setCurrentMedia(item, Math.max(0, idx), true);
    setGlobalPlayerActive(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600"></div>
        </div>
      </div>
    );
  }

  if (!globalParty) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-white mb-2">Global Tunes</h1>
        <p className="text-gray-400">No global queue found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Global Tunes</h1>
            <p className="text-gray-400">Ranked by the community in real-time</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => navigate('/parties')}>Browse Tunes</button>
            {allMedia.length > 0 && (
              <button className="btn-primary inline-flex items-center gap-2" onClick={() => playItem(allMedia[0])}>
                <Play className="h-4 w-4" /> Play First
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tag Cloud */}
      {tagCounts.length > 0 && (
        <div className="card">
          <div className="flex items-center mb-3">
            <Tag className="h-4 w-4 text-purple-400 mr-2" />
            <h2 className="text-xl font-semibold text-white">Top Tags</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {tagCounts.map(([tag]) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${active ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  #{tag}
                </button>
              );
            })}
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="px-3 py-1.5 rounded-full text-sm bg-black/30 text-gray-300 hover:bg-black/40">
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Queue */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Queue</h2>
          <button className="text-purple-400 inline-flex items-center" onClick={() => navigate(`/party/${globalParty._id || globalParty.id}`)}>
            Open Full Queue <ArrowRight className="h-4 w-4 ml-1" />
          </button>
        </div>
        <div className="space-y-2">
          {filteredMedia.map((m: any) => (
            <div key={m._id || m.id} className="flex items-center justify-between bg-black/20 rounded px-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                {m.coverArt && <img src={m.coverArt} alt="" className="h-12 w-12 rounded object-cover" />}
                <div className="min-w-0">
                  <div className="text-white truncate">{m.title}</div>
                  <div className="text-gray-400 text-sm truncate">
                    <ClickableArtistDisplay media={m} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-green-400">
                  <Coins className="h-4 w-4" />
                  <span>£{(m.globalMediaAggregate || 0).toFixed(2)}</span>
                </div>
                <button className="btn-primary" onClick={() => playItem(m)}>Play</button>
              </div>
            </div>
          ))}
          {filteredMedia.length === 0 && (
            <div className="text-gray-400">No tunes match the selected tags.</div>
          )}
        </div>
      </div>

      {/* Top Supporters */}
      {allBids.length > 0 && (
        <div className="card">
          <h2 className="text-xl font-semibold text-white mb-4">Top Supporters</h2>
          <TopSupporters bids={allBids} maxDisplay={10} />
        </div>
      )}
    </div>
  );
};

export default GlobalTunes;


