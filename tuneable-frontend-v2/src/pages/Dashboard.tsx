import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AudioLines, Globe, Coins, Gift, UserPlus, Users, Music, Play, Plus, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { partyAPI, userAPI, mediaAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC } from '../constants';

interface LibraryItem {
  mediaId: string;
  mediaUuid: string;
  title: string;
  artist: string;
  coverArt?: string;
  duration?: number;
  bpm?: number;
  globalMediaAggregate: number;
  globalMediaAggregateAvg: number;
  globalUserMediaAggregate: number;
  bidCount: number;
  tuneBytesEarned: number;
  lastBidAt: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setCurrentMedia, setQueue, setGlobalPlayerActive } = useWebPlayerStore();
  const [globalParty, setGlobalParty] = useState<any>(null);
  const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
  const [isLoadingInvited, setIsLoadingInvited] = useState(false);
  const [tuneLibrary, setTuneLibrary] = useState<LibraryItem[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [sortField, setSortField] = useState<string>('lastBidAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showAllInvitedUsers, setShowAllInvitedUsers] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await partyAPI.getParties();
        const g = (res.parties || []).find((p: any) => p.type === 'global');
        setGlobalParty(g || null);
      } catch (error) {
        console.error('Failed to load global party:', error);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadInvitedUsers = async () => {
      try {
        setIsLoadingInvited(true);
        const data = await userAPI.getInvitedUsers();
        setInvitedUsers(data.invitedUsers || []);
      } catch (error) {
        console.error('Failed to load invited users:', error);
      } finally {
        setIsLoadingInvited(false);
      }
    };
    loadInvitedUsers();
  }, []);

  useEffect(() => {
    const loadTuneLibrary = async () => {
      try {
        setIsLoadingLibrary(true);
        const data = await userAPI.getTuneLibrary();
        setTuneLibrary(data.library || []);
      } catch (error) {
        console.error('Failed to load tune library:', error);
        toast.error('Failed to load tune library');
      } finally {
        setIsLoadingLibrary(false);
      }
    };
    loadTuneLibrary();
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortedLibrary = () => {
    return [...tuneLibrary].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'artist':
          aValue = a.artist?.toLowerCase() || '';
          bValue = b.artist?.toLowerCase() || '';
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        case 'globalMediaAggregateAvg':
          aValue = a.globalMediaAggregateAvg || 0;
          bValue = b.globalMediaAggregateAvg || 0;
          break;
        case 'globalUserMediaAggregate':
          aValue = a.globalUserMediaAggregate || 0;
          bValue = b.globalUserMediaAggregate || 0;
          break;
        case 'tuneBytesEarned':
          aValue = a.tuneBytesEarned || 0;
          bValue = b.tuneBytesEarned || 0;
          break;
        case 'lastBidAt':
        default:
          aValue = new Date(a.lastBidAt).getTime();
          bValue = new Date(b.lastBidAt).getTime();
          break;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 text-gray-400" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1 text-purple-400" />
      : <ArrowDown className="h-4 w-4 ml-1 text-purple-400" />;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlay = async (item: LibraryItem) => {
    try {
      // Fetch full media details with sources
      const mediaId = item.mediaUuid || item.mediaId;
      const mediaData = await mediaAPI.getProfile(mediaId);
      const media = mediaData.media || mediaData;

      // Clean and format sources
      let sources: any = {};
      if (media.sources) {
        if (Array.isArray(media.sources)) {
          for (const source of media.sources) {
            if (source?.platform === 'youtube' && source?.url) {
              sources.youtube = source.url;
            }
          }
        } else if (typeof media.sources === 'object') {
          sources = media.sources;
        }
      }

      const formattedMedia = {
        id: item.mediaUuid || item.mediaId,
        _id: item.mediaId,
        title: item.title,
        artist: item.artist,
        duration: item.duration,
        coverArt: item.coverArt,
        sources: sources,
        globalMediaAggregate: item.globalMediaAggregate,
        bids: [],
        addedBy: null,
        totalBidValue: item.globalMediaAggregate
      } as any;

      setQueue([formattedMedia]);
      setCurrentMedia(formattedMedia, 0, true);
      setGlobalPlayerActive(true);
      toast.success(`Now playing: ${item.title}`);
    } catch (error) {
      console.error('Error loading media for playback:', error);
      toast.error('Failed to load media for playback');
    }
  };

  const handleIncreaseBid = async (item: LibraryItem) => {
    if (!user) {
      toast.info('Please log in to place a bid');
      navigate('/login');
      return;
    }

    const amountStr = prompt(`Enter bid amount for "${item.title}" (minimum £0.33):`);
    if (!amountStr) return;

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount < 0.33) {
      toast.error('Minimum bid is £0.33');
      return;
    }

    if ((user as any)?.balance < amount) {
      toast.error('Insufficient balance');
      return;
    }

    try {
      await mediaAPI.placeGlobalBid(item.mediaUuid || item.mediaId, amount);
      toast.success(`Bid of £${amount.toFixed(2)} placed successfully!`);
      // Reload library to update bid amounts
      const data = await userAPI.getTuneLibrary();
      setTuneLibrary(data.library || []);
    } catch (error: any) {
      console.error('Error placing bid:', error);
      toast.error(error.response?.data?.error || 'Failed to place bid');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl text-center font-bold text-gray-300">
          Welcome back, {user?.username}!
        </h1>
        <p className="text-center text-gray-400 mt-2">
          Ready to create some amazing music experiences?
        </p>
      </div>

      {/* Global Tunes Hero */}
      <div className="card mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Global Tunes</h2>
            <p className="text-gray-400">What everyone is playing and bidding on right now</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => navigate(`/party/${globalParty._id || globalParty.id}`)}>Browse Tunes</button>
          </div>
        </div>

        {/* Mini queue preview */}
        <div className="mt-4 space-y-2">
          {(globalParty?.media || []).slice(0, 5).map((m: any) => (
            <div key={m._id || m.id} className="flex items-center justify-between bg-black/20 rounded px-3 py-2">
              <div className="flex items-center gap-3">
                {m.coverArt && <img src={m.coverArt} alt="" className="h-10 w-10 rounded object-cover" />}
                <div>
                  <div className="text-white">{m.title}</div>
                  <div className="text-gray-400 text-sm">{m.artist}</div>
                </div>
              </div>
              <div className="text-gray-300 text-sm">£{(m.globalMediaAggregate || 0).toFixed(2)}</div>
            </div>
          ))}
      
        </div>
      </div>


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="bg-primary-100 p-3 rounded-lg">
              <Coins className="h-6 w-6 text-primary-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Balance</p>
              <p className="text-2xl font-semibold text-white">
                £{user?.balance?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-green-100 p-3 rounded-lg">
              <Globe className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Global Rank</p>
              <p className="text-2xl font-semibold text-white">
                #{user?.globalUserAggregateRank || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Gift className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">TuneBytes</p>
              <p className="text-2xl font-semibold text-white">
                {(user as any)?.tuneBytes?.toFixed(0) || '0'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Coins className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Avg Bid</p>
              <p className="text-2xl font-semibold text-white">
                £{user?.globalUserBidAvg?.toFixed(2) || '0.00'}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-purple-100 p-3 rounded-lg">
              <AudioLines className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Total Bids</p>
              <p className="text-2xl font-semibold text-white">
                {user?.globalUserBids || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="bg-orange-100 p-3 rounded-lg">
              <UserPlus className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-white">Invite Credits</p>
              <p className="text-2xl font-semibold text-white">
                {user?.inviteCredits ?? 10}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invited Users Section */}
      <div className="card mt-8">
        <div className="flex items-center mb-4">
          <Users className="h-6 w-6 text-purple-400 mr-2" />
          <h2 className="text-2xl font-semibold text-white">Invited Users</h2>
          <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
            {invitedUsers.length}
          </span>
        </div>
        
        {isLoadingInvited && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        )}
        {!isLoadingInvited && invitedUsers.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-500" />
            <p>No users have signed up with your invite code yet.</p>
            <p className="text-sm mt-2">Share your invite code: <span className="font-mono text-purple-400">{user?.personalInviteCode}</span></p>
          </div>
        )}
        {!isLoadingInvited && invitedUsers.length > 0 && (
          <div className="space-y-3">
            {(showAllInvitedUsers ? invitedUsers : invitedUsers.slice(0, 3)).map((invitedUser) => {
              const userName = (invitedUser.givenName || invitedUser.familyName) 
                ? `${invitedUser.givenName || ''} ${invitedUser.familyName || ''}`.trim()
                : `Joined ${new Date(invitedUser.createdAt).toLocaleDateString()}`;
              
              return (
                <div key={invitedUser._id || invitedUser.id} className="flex items-center gap-3 bg-black/20 rounded px-4 py-3">
                  <img 
                    src={invitedUser.profilePic || DEFAULT_PROFILE_PIC} 
                    alt={invitedUser.username} 
                    className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-white font-medium">{invitedUser.username}</div>
                    <div className="text-gray-400 text-sm">
                      {userName}
                    </div>
                    {(invitedUser.givenName || invitedUser.familyName) && (
                      <div className="text-gray-500 text-xs mt-1">
                        Joined {new Date(invitedUser.createdAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {invitedUsers.length > 3 && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowAllInvitedUsers(!showAllInvitedUsers)}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <span>{showAllInvitedUsers ? 'Show Less' : `Show More (${invitedUsers.length - 3} more)`}</span>
                  {showAllInvitedUsers ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tune Library Section */}
      <div className="card mt-8">
        <div className="flex items-center mb-4">
          <Music className="h-6 w-6 text-purple-400 mr-2" />
          <h2 className="text-2xl font-semibold text-white">Tune Library</h2>
          <span className="ml-3 px-3 py-1 bg-purple-900 text-purple-200 text-sm rounded-full">
            {tuneLibrary.length}
          </span>
        </div>
        
        {isLoadingLibrary ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        ) : tuneLibrary.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Music className="h-12 w-12 mx-auto mb-4 text-gray-500" />
            <p>You haven't bid on any media yet.</p>
            <p className="text-sm mt-2">Start bidding on tunes to build your library!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Artwork
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('title')}
                  >
                    <div className="flex items-center">
                      Title
                      {getSortIcon('title')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('artist')}
                  >
                    <div className="flex items-center">
                      Artist
                      {getSortIcon('artist')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('duration')}
                  >
                    <div className="flex items-center">
                      Duration
                      {getSortIcon('duration')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('globalMediaAggregateAvg')}
                  >
                    <div className="flex items-center">
                      Avg Bid
                      {getSortIcon('globalMediaAggregateAvg')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('globalUserMediaAggregate')}
                  >
                    <div className="flex items-center">
                      Your Bid
                      {getSortIcon('globalUserMediaAggregate')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:bg-gray-700 transition-colors"
                    onClick={() => handleSort('tuneBytesEarned')}
                  >
                    <div className="flex items-center">
                      TuneBytes
                      {getSortIcon('tuneBytesEarned')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {getSortedLibrary().map((item) => (
                  <tr key={item.mediaId} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="relative w-12 h-12 group cursor-pointer" onClick={() => handlePlay(item)}>
                        {item.coverArt ? (
                          <img 
                            src={item.coverArt} 
                            alt={item.title}
                            className="w-full h-full rounded object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-700 rounded flex items-center justify-center">
                            <Music className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors shadow-lg">
                            <Play className="h-4 w-4 text-white ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{item.title}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-300">{item.artist}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-300">{formatDuration(item.duration)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm text-gray-300">£{item.globalMediaAggregateAvg.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-semibold text-green-400">£{item.globalUserMediaAggregate.toFixed(2)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-semibold text-yellow-400">{item.tuneBytesEarned.toFixed(1)}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => handleIncreaseBid(item)}
                        className="inline-flex items-center px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded transition-colors"
                        title="Increase bid"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Bid
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
