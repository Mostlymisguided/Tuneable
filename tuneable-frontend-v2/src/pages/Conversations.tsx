import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessagesSquare, Plus, Search, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import { conversationAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { penceToPounds } from '../utils/currency';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'funded', label: 'Funded' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
];

const statusColor: Record<string, string> = {
  open: 'bg-emerald-500/20 text-emerald-300',
  funded: 'bg-amber-500/20 text-amber-300',
  scheduled: 'bg-sky-500/20 text-sky-300',
  completed: 'bg-violet-500/20 text-violet-300',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

const Conversations: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const status = searchParams.get('status') || '';
  const mine = searchParams.get('mine') === 'true';

  const load = async () => {
    setLoading(true);
    try {
      const data = await conversationAPI.list({
        status: status || undefined,
        search: search.trim() || undefined,
        mine: mine && !!user,
        limit: 30,
      });
      setConversations(data.conversations || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mine]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (search.trim()) next.set('q', search.trim());
    else next.delete('q');
    setSearchParams(next);
    load();
  };

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900 text-white pt-16 sm:pt-20 pb-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-purple-300 mb-2">
              <MessagesSquare className="h-5 w-5" />
              <span className="text-sm font-medium tracking-wide uppercase">Tuneable Conversations</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold">Pledge the talk you want to hear</h1>
            <p className="text-gray-300 mt-2 max-w-2xl">
              Suggest people or podcasts, fund a goal, and unlock the conversation when it&apos;s ready to stream.
            </p>
          </div>
          {user && (
            <button
              onClick={() => navigate('/conversations/new')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-lg font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              Propose
            </button>
          )}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles, topics, people..."
              className="w-full bg-gray-800/80 border border-gray-700 rounded-lg pl-10 pr-3 py-2.5 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button type="submit" className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg">
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mb-6">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              onClick={() => setFilter('status', f.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                status === f.value ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
          {user && (
            <button
              onClick={() => setFilter('mine', mine ? '' : 'true')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                mine ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Mine
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-16">Loading conversations...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 bg-gray-900/40 border border-gray-800 rounded-xl">
            <Users className="h-10 w-10 mx-auto text-gray-500 mb-3" />
            <p className="text-gray-300 mb-4">No conversations yet. Be the first to propose one.</p>
            {user && (
              <button
                onClick={() => navigate('/conversations/new')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg"
              >
                Propose a conversation
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c) => {
              const id = c.uuid || c._id;
              const progress = c.goalAmount ? Math.min(100, Math.round((c.totalPledged / c.goalAmount) * 100)) : 0;
              const names = (c.participants || []).map((p: any) => p.displayName).join(' × ');
              return (
                <Link
                  key={id}
                  to={`/conversations/${id}`}
                  className="block bg-gray-900/50 hover:bg-gray-800/60 border border-gray-800 rounded-xl p-4 sm:p-5 transition-colors"
                  style={{ textDecoration: 'none' }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${statusColor[c.status] || statusColor.open}`}>
                          {c.status}
                        </span>
                        {c.topic && <span className="text-xs text-gray-400">#{c.topic}</span>}
                      </div>
                      <h2 className="text-lg font-semibold text-white truncate">{c.title}</h2>
                      <p className="text-sm text-purple-200/90 mt-1 truncate">{names}</p>
                      {c.description && (
                        <p className="text-sm text-gray-400 mt-2 line-clamp-2">{c.description}</p>
                      )}
                    </div>
                    <div className="sm:text-right shrink-0 w-full sm:w-44">
                      <div className="text-sm text-gray-300">
                        {penceToPounds(c.totalPledged)} / {penceToPounds(c.goalAmount)}
                      </div>
                      <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{progress}% funded</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Conversations;
