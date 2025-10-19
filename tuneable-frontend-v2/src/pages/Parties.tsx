import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { partyAPI } from '../lib/api';
import { usePlayerWarning } from '../hooks/usePlayerWarning';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import { useAuth } from '../contexts/AuthContext';
import PlayerWarningModal from '../components/PlayerWarningModal';
import { Music, Users, MapPin, Clock } from 'lucide-react';

// Define types directly to avoid import issues
interface PartyType {
  id: string;
  name: string;
  location: string;
  host: string | { id: string; username: string; uuid?: string; userId?: string; _id?: string };
  partyCode: string;
  partiers: (string | { id: string; username: string; uuid?: string; userId?: string; _id?: string })[];
  media?: any[];
  songs?: any[]; // Legacy support
  startTime: string;
  endTime?: string;
  privacy: 'public' | 'private';
  type: 'remote' | 'live';
  status: 'scheduled' | 'active' | 'ended';
  watershed: boolean;
  createdAt: string;
  updatedAt: string;
}

const Parties: React.FC = () => {
  const [parties, setParties] = useState<PartyType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showWarning, isWarningOpen, warningAction, onConfirm, onCancel, currentMediaTitle, currentMediaArtist } = usePlayerWarning();
  const { currentPartyId } = useWebPlayerStore();

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Parties</h1>
          <p className="text-gray-300 mt-2">Discover and join music parties</p>
        </div>
        <Link
          to="/create-party"
          className="btn-primary flex items-center space-x-2"
        >
          <Music className="h-4 w-4" />
          <span className="text-base font-semibold no-underline">Create Party</span>
        </Link>
      </div>

      {parties.length === 0 ? (
        <div className="text-center py-12">
          <Music className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-300 mb-2">No parties found</h3>
          <p className="text-gray-600 mb-6">Be the first to create a party!</p>
          <Link to="/create-party" className="btn-primary">
            Create Your First Party
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {parties.map((party) => (
            <div key={party.id} className="card hover:shadow-md transition-shadow">
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
                  <MapPin className="h-4 w-4 mr-2" />
                  <span>{party.location}</span>
                </div>
                

                <div className="flex items-center text-sm text-white">
                  <Clock className="h-4 w-4 mr-2" />
                  <span>{formatDate(party.startTime)}</span>
                </div>

                <div className="flex items-center text-sm text-white">
                  <Users className="h-4 w-4 mr-2" />
                  <span>{Array.isArray(party.partiers) ? party.partiers.length : 0} partiers</span>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="text-sm text-white">
                  Host: {typeof party.host === 'object' ? party.host?.username || 'Unknown' : party.host}
                </div>
                <button
                  onClick={() => handleJoinParty(party.id, party.name, party.privacy, party.host, party.partiers)}
                  className="btn-primary text-base"
                >
                  Join Party
                </button>
              </div>
            </div>
          ))}
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
