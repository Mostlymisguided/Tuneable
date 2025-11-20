import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { partyAPI } from '../lib/api';
import { usePlayerWarning } from '../hooks/usePlayerWarning';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { useAuth } from '../contexts/AuthContext';
import PlayerWarningModal from '../components/PlayerWarningModal';
import { toast } from 'react-toastify';
import { Music, Users, MapPin, Coins } from 'lucide-react';
import { penceToPounds } from '../utils/currency';

// Define types directly to avoid import issues
interface PartyType {
  _id?: string; // MongoDB ObjectId (from backend)
  id?: string; // Transformed ID (may be _id or uuid)
  uuid?: string; // UUID for external API
  name: string;
  location: string;
  host: string | { id: string; username: string; uuid?: string; userId?: string; _id?: string };
  partyCode: string;
  partiers: (string | { id: string; username: string; uuid?: string; userId?: string; _id?: string })[];
  media?: any[];
  songs?: any[]; // Legacy support
  mediaCount?: number; // Count of queued media (from backend)
  partyAggregate?: number; // Total party aggregate (sum of all active media partyMediaAggregate)
  startTime: string;
  endTime?: string;
  privacy: 'public' | 'private';
  type: 'remote' | 'live' | 'global';
  status: 'scheduled' | 'active' | 'ended';
  watershed: boolean;
  tags?: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const Parties: React.FC = () => {
  const [parties, setParties] = useState<PartyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [currentSearchInput, setCurrentSearchInput] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { showWarning, isWarningOpen, warningAction, onConfirm, onCancel, currentMediaTitle, currentMediaArtist } = usePlayerWarning();
  const { currentPartyId } = useWebPlayerStore();

  // Check if user is already part of a party
  const isUserInParty = (party: PartyType) => {
    if (!user) return false;
    
    // Global Tunes is always considered joined for all users
    if (party.type === 'global') {
      console.log('🌍 Global Tunes - always joined');
      return true;
    }
    
    // Use the new joinedParties field for reliable checking
    if (user.joinedParties && user.joinedParties.length > 0) {
      console.log(`🔍 Checking party membership for: ${party.name}`);
      console.log(`  - Party _id: ${party._id}`);
      console.log(`  - User joinedParties:`, user.joinedParties.map(jp => jp.partyId));
      
      const isJoined = user.joinedParties.some((jp: { partyId: string; joinedAt: string; role: string }) => {
        // Now using ObjectIds directly - much simpler!
        const match = jp.partyId === party._id;
        console.log(`  - Checking joinedParty: ${jp.partyId} vs party._id: ${party._id}, match: ${match}`);
        return match;
      });
      
      console.log(`🔍 Party membership check for ${party.name}: ${isJoined}`);
      return isJoined;
    }
    
    // Fallback to old logic if joinedParties is not available
    console.log('⚠️  Using fallback logic - joinedParties not available');
    const isInParty = party.partiers.some(partier => {
      if (typeof partier === 'string') {
        return partier === user._id || partier === user.id || partier === user.uuid;
      } else {
        return partier.id === user._id || partier.id === user.id || partier.uuid === user.uuid;
      }
    });
    
    console.log(`  - Fallback result: ${isInParty}`);
    return isInParty;
  };

  useEffect(() => {
    const fetchParties = async () => {
      try {
        // First update party statuses based on current time
        await partyAPI.updateStatuses();
        
        // Then fetch the updated parties
        const response = await partyAPI.getParties();
        setParties(response.parties);
      } catch (error) {
        console.error('Error fetching parties:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchParties();
  }, []);

  // Handle invite links from URL params
  useEffect(() => {
    const inviteCode = searchParams.get('code');
    const partyId = searchParams.get('partyId');
    
    if (inviteCode) {
      // User came from an invite link with party code
      const handleInviteLink = async () => {
        try {
          const response = await partyAPI.searchByCode(inviteCode);
          if (response.party) {
            const foundParty = response.party;
            
            // If already joined, navigate to party
            if (foundParty.isJoined || foundParty.isHost) {
              navigate(`/party/${foundParty._id}`);
              return;
            }
            
            // If private party, prompt for code and join
            if (foundParty.privacy === 'private') {
              const enteredCode = prompt(`You've been invited to "${foundParty.name}"! Enter the party code to join:`);
              if (enteredCode) {
                try {
                  await partyAPI.joinParty(foundParty._id, enteredCode);
                  toast.success(`Joined ${foundParty.name}!`);
                  navigate(`/party/${foundParty._id}`);
                } catch (error: any) {
                  toast.error(error.response?.data?.message || 'Failed to join party');
                }
              }
            } else {
              // Public party, join directly
              try {
                await partyAPI.joinParty(foundParty._id);
                toast.success(`Joined ${foundParty.name}!`);
                navigate(`/party/${foundParty._id}`);
              } catch (error: any) {
                toast.error(error.response?.data?.message || 'Failed to join party');
              }
            }
          }
        } catch (error: any) {
          if (error.response?.status === 404) {
            toast.error('Party not found. The invite link may be invalid.');
          } else {
            toast.error('Error processing invite link');
            console.error('Error handling invite link:', error);
          }
        }
      };
      
      handleInviteLink();
    } else if (partyId) {
      // Direct party ID in URL, navigate to party
      navigate(`/party/${partyId}`);
    }
  }, [searchParams, navigate]);

  // Filter parties based on search terms and current search input (real-time filtering)
  const filteredParties = parties.filter(party => {
    // Combine search terms and current input for real-time filtering
    const allSearchTerms = [...searchTerms];
    if (currentSearchInput.trim()) {
      allSearchTerms.push(currentSearchInput.trim().toLowerCase());
    }
    
    if (allSearchTerms.length === 0) return true;
    
    // Check if any search term matches party name, description, tags, or party code
    return allSearchTerms.some(term => {
      const lowerTerm = term.toLowerCase();
      return party.name.toLowerCase().includes(lowerTerm) ||
        (party.description && party.description.toLowerCase().includes(lowerTerm)) ||
        (party.tags && party.tags.some(tag => tag.toLowerCase().includes(lowerTerm))) ||
        party.partyCode.toLowerCase().includes(lowerTerm);
    });
  }).sort((a, b) => {
    // Sort by party aggregate (descending)
    const aggregateA = (a as any).partyAggregate || 0;
    const aggregateB = (b as any).partyAggregate || 0;
    return aggregateB - aggregateA;
  });

  // Separate parties into joined and available (already sorted by partyAggregate)
  const joinedParties = filteredParties.filter(party => isUserInParty(party));
  const availableParties = filteredParties.filter(party => !isUserInParty(party));
  
  // Debug logging
  console.log('📊 Party separation results:', {
    totalParties: filteredParties.length,
    joinedParties: joinedParties.length,
    availableParties: availableParties.length,
    joinedPartyNames: joinedParties.map(p => p.name),
    availablePartyNames: availableParties.map(p => p.name),
    user: user ? { 
      id: user.id, 
      _id: user._id, 
      uuid: user.uuid,
      joinedParties: user.joinedParties || []
    } : null,
    allParties: filteredParties.map(p => ({
      name: p.name,
      id: p.id,
      _id: p._id,
      uuid: p.uuid,
      type: p.type
    }))
  });

  // Handle adding search terms
  const handleAddSearchTerm = (term: string) => {
    const trimmedTerm = term.trim().toLowerCase();
    if (trimmedTerm && !searchTerms.includes(trimmedTerm)) {
      setSearchTerms([...searchTerms, trimmedTerm]);
      setCurrentSearchInput('');
    }
  };

  // Handle removing search terms
  const handleRemoveSearchTerm = (termToRemove: string) => {
    setSearchTerms(searchTerms.filter(term => term !== termToRemove));
  };

  // Handle search input key press
  const handleSearchKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && currentSearchInput.trim()) {
      e.preventDefault();
      const trimmedInput = currentSearchInput.trim();
      
      // Check if input looks like a party code (typically uppercase alphanumeric, 5-10 chars)
      const looksLikePartyCode = /^[A-Z0-9]{4,10}$/i.test(trimmedInput);
      
      if (looksLikePartyCode) {
        // Try to search by party code
        try {
          const response = await partyAPI.searchByCode(trimmedInput);
          if (response.party) {
            const foundParty = response.party;
            
            // If already joined, navigate to party
            if (foundParty.isJoined || foundParty.isHost) {
              navigate(`/party/${foundParty._id}`);
              setCurrentSearchInput('');
              return;
            }
            
            // If private party and not joined, show join modal
            if (foundParty.privacy === 'private') {
              const inviteCode = prompt(`Found private party "${foundParty.name}". Enter party code to join:`);
              if (inviteCode) {
                try {
                  await partyAPI.joinParty(foundParty._id, inviteCode);
                  toast.success(`Joined ${foundParty.name}!`);
                  navigate(`/party/${foundParty._id}`);
                } catch (error: any) {
                  toast.error(error.response?.data?.message || 'Failed to join party');
                }
              }
              setCurrentSearchInput('');
              return;
            }
            
            // Public party, add to search terms
            handleAddSearchTerm(trimmedInput);
          }
        } catch (error: any) {
          // Party not found by code, treat as regular search term
          if (error.response?.status === 404) {
            handleAddSearchTerm(trimmedInput);
          } else {
            toast.error('Error searching for party');
            console.error('Error searching by code:', error);
          }
        }
      } else {
        // Regular search term
        handleAddSearchTerm(trimmedInput);
      }
    }
  };

  const handleJoinParty = async (partyId: string, partyName: string, partyPrivacy: string, partyHost: any, partyPartiers: any[]) => {
    try {
      // Check if this is a different party than the current one
      const isDifferentParty = currentPartyId && currentPartyId !== partyId;
      
      if (isDifferentParty) {
        showWarning(
          `join "${partyName}"`,
          () => joinPartyWithPrivacyCheck(partyId, partyPrivacy, partyHost, partyPartiers)
        );
      } else {
        // Same party or no current party, join directly
        await joinPartyWithPrivacyCheck(partyId, partyPrivacy, partyHost, partyPartiers);
      }
    } catch (error) {
      console.error('Error joining party:', error);
    }
  };

  const joinPartyWithPrivacyCheck = async (partyId: string, partyPrivacy: string, partyHost: any, partyPartiers: any[]) => {
    try {
      // Check if current user is the host
      const currentUserId = user?.id;
      const isHost = partyHost && (
        (typeof partyHost === 'string' && partyHost === currentUserId) ||
        (typeof partyHost === 'object' && partyHost.id === currentUserId)
      );

      // Check if user is already a partier
      const isAlreadyPartier = partyPartiers.some(partier => {
        if (typeof partier === 'string') {
          return partier === currentUserId;
        } else if (typeof partier === 'object' && partier.id) {
          return partier.id === currentUserId;
        }
        return false;
      });

      // If user is already a partier, just navigate without calling join API
      if (isAlreadyPartier) {
        navigate(`/party/${partyId}`);
        return;
      }

      if (partyPrivacy === 'private' && !isHost) {
        // Prompt for party code (only if not host and not already a partier)
        const inviteCode = prompt('This is a private party. Please enter the party code:');
        if (!inviteCode) {
          return; // User cancelled
        }
        
        // Call join API with invite code
        await partyAPI.joinParty(partyId, inviteCode);
      } else {
        // Public party or host joining, join without invite code
        await partyAPI.joinParty(partyId);
      }
      
      // Navigate to party page after successful join
      navigate(`/party/${partyId}`);
    } catch (error: any) {
      console.error('Error joining party:', error);
      alert(error.response?.data?.message || 'Failed to join party');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-purple-200 text-purple-900';
      case 'ended':
        return 'bg-pink-400 text-white font-bold';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Component for rendering party cards
  const renderPartyCard = (party: PartyType) => (
    <div 
      key={party._id || party.id || party.uuid} 
      className={`card transition-all duration-200 relative overflow-hidden ${
        isUserInParty(party) || party.type === 'global'
          ? 'hover:shadow-lg hover:scale-105 hover:bg-gray-800/50 cursor-pointer group'
          : 'hover:shadow-md'
      }`}
      onClick={isUserInParty(party) || party.type === 'global' ? () => navigate(`/party/${party._id || party.id || party.uuid}`) : undefined}
    >
      {/* Purple overlay for clickable cards */}
      {(isUserInParty(party) || party.type === 'global') && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/85 to-slate-900/85 backdrop-blur-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
          <span className="bg-slate-900/50 text-white/70 font-semibold text-base px-4 py-2 rounded-lg shadow-lg hover:bg-gradient-to-r hover:from-pink-500 hover:to-purple-500 hover:text-white hover:shadow-lg hover:shadow-pink-500/30 transition-all">
            Go To Party
          </span>
        </div>
      )}
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-white">{party.name}</h3>
        <span 
          className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(party.status)}`}
          style={party.status === 'ended' ? { backgroundColor: '#ec4899', color: 'white', fontWeight: 'bold' } : {}}
        >
          {party.status}
        </span>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center text-sm text-white">
          <Music className="h-4 w-4 mr-2" />
          <span>
            {party.mediaCount ?? (party.media?.length || party.songs?.length || 0)} {(party.mediaCount ?? (party.media?.length || party.songs?.length || 0)) === 1 ? 'tune' : 'tunes'}
          </span>
        </div>

        <div className="flex items-center text-sm text-white">
          <Users className="h-4 w-4 mr-2" />
          <span>
            {party.type === 'global' 
              ? `${Array.isArray(party.partiers) ? party.partiers.length : 0} partiers`
              : `${Array.isArray(party.partiers) ? party.partiers.length : 0} partiers`
            }
          </span>
        </div>

        <div className="flex items-center text-sm text-white">
          <Coins className="h-4 w-4 mr-2" />
          <span>
            {party.partyAggregate !== undefined && party.partyAggregate > 0
              ? penceToPounds(party.partyAggregate)
              : '£0.00'}
          </span>
        </div>

        <div className="flex items-center text-sm text-white">
          <MapPin className="h-4 w-4 mr-2" />
          <span>{party.location}</span>
        </div>

        {/* Tags Display */}
        {party.tags && party.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {party.tags.slice(0, 3).map((tag: string, index: number) => (
              <span
                key={index}
                className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full"
              >
                #{tag}
              </span>
            ))}
            {party.tags.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{party.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Description Display */}
        {party.type === 'global' ? (
          <div className="text-sm text-gray-300 mt-2">
            <p className="line-clamp-2">
              The global community party where all users discover and share music together
            </p>
          </div>
        ) : party.description ? (
          <div className="text-sm text-gray-300 mt-2">
            <p className="line-clamp-2">
              {party.description.length > 100 
                ? `${party.description.substring(0, 100)}...` 
                : party.description}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex justify-between items-center">
        <div className="text-sm text-white">
          Host: {typeof party.host === 'object' ? party.host?.username || 'Unknown' : party.host}
        </div>
        {party.type === 'global' ? (
          <div className="text-sm text-green-400 font-medium">
            Auto-joined
          </div>
        ) : isUserInParty(party) ? (
          <div className="text-sm text-purple-400 font-medium">
            Joined
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation(); // Prevent card click
              const partyId = party._id || party.id || party.uuid;
              if (partyId) {
                handleJoinParty(partyId, party.name, party.privacy, party.host, party.partiers);
              } else {
                toast.error('Unable to join party: Party ID not found');
              }
            }}
            className="btn-primary text-base"
          >
            Join Party
          </button>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-center items-center mb-8">
        <div className="text-center center-justify">
          <h1 className="text-3xl font-bold text-white">Tunes</h1>
          <p className="text-gray-300 mt-2">Discover Tunes and Join Parties</p>
        </div>
      </div>
     
      {/* Search Section */}
      <div className="mb-6">
        <div className="flex flex-col gap-4">
          {/* Search Input */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search Parties by Tags, Name, Description, or Party Code... (Press Enter to Add as Filter)"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              value={currentSearchInput}
              onChange={(e) => setCurrentSearchInput(e.target.value)}
              onKeyPress={handleSearchKeyPress}
            />
          </div>
          
          {/* Search Term Pills */}
          {searchTerms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {searchTerms.map((term, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded-full flex items-center gap-2"
                >
                  {term}
                  <button
                    onClick={() => handleRemoveSearchTerm(term)}
                    className="text-purple-200 hover:text-white ml-1"
                    type="button"
                  >
                    ×
                  </button>
                </span>
              ))}
              {searchTerms.length > 0 && (
                <button
                  onClick={() => setSearchTerms([])}
                  className="px-3 py-1 bg-gray-600 text-gray-300 text-sm rounded-full hover:bg-gray-500"
                  type="button"
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Your Parties Section */}
      {joinedParties.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">Your Parties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {joinedParties.map(renderPartyCard)}
          </div>
        </div>
      )}

      {/* Active Parties Section */}
      {availableParties.length > 0 && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-white mb-6">Active Parties</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableParties.map(renderPartyCard)}
          </div>
        </div>
      )}

      {/* No Parties Found */}
      {filteredParties.length === 0 && (
        <div className="text-center py-12">
          <Music className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No parties found</h3>
          <p className="text-gray-600">
            {user?.role?.includes('admin') 
              ? "No parties yet. You can create one from the admin panel." 
              : "Check back later for new parties!"}
          </p>
        </div>
      )}

      <PlayerWarningModal
        isOpen={isWarningOpen}
        onConfirm={onConfirm}
        onCancel={onCancel}
        action={warningAction}
        currentMediaTitle={currentMediaTitle}
        currentMediaArtist={currentMediaArtist}
      />
    </div>
  );
};

export default Parties;
