import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AudioLines, Globe, Coins, Gift, UserPlus, Users } from 'lucide-react';
import { partyAPI, userAPI } from '../lib/api';
import { useNavigate } from 'react-router-dom';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [globalParty, setGlobalParty] = useState<any>(null);
  const [invitedUsers, setInvitedUsers] = useState<any[]>([]);
  const [isLoadingInvited, setIsLoadingInvited] = useState(false);

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
        
        {isLoadingInvited ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        ) : invitedUsers.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-500" />
            <p>No users have signed up with your invite code yet.</p>
            <p className="text-sm mt-2">Share your invite code: <span className="font-mono text-purple-400">{user?.personalInviteCode}</span></p>
          </div>
        ) : (
          <div className="space-y-3">
            {invitedUsers.map((invitedUser) => (
              <div key={invitedUser._id || invitedUser.id} className="flex items-center justify-between bg-black/20 rounded px-4 py-3">
                <div className="flex items-center gap-3">
                  {invitedUser.profilePic ? (
                    <img 
                      src={invitedUser.profilePic} 
                      alt={invitedUser.username} 
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-purple-900 flex items-center justify-center">
                      <Users className="h-5 w-5 text-purple-300" />
                    </div>
                  )}
                <div>
                  <div className="text-white font-medium">{invitedUser.username}</div>
                  <div className="text-gray-400 text-sm">
                    {(invitedUser.givenName || invitedUser.familyName) ? (
                      `${invitedUser.givenName || ''} ${invitedUser.familyName || ''}`.trim()
                    ) : (
                      `Joined ${new Date(invitedUser.createdAt).toLocaleDateString()}`
                    )}
                  </div>
                  {(invitedUser.givenName || invitedUser.familyName) && (
                    <div className="text-gray-500 text-xs mt-1">
                      Joined {new Date(invitedUser.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
