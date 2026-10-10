import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { collectiveAPI } from '../lib/api';
import { toast } from '../utils/toast';
import { DEFAULT_PROFILE_PIC } from '../constants';

interface CollectiveInvite {
  id: string;
  role: 'admin' | 'member' | string;
  instrument?: string | null;
  invitedAt?: string;
  collective: {
    _id?: string;
    name: string;
    slug: string;
    profilePicture?: string | null;
  };
  invitedBy?: {
    username?: string;
  } | null;
}

const CollectiveInvitations: React.FC = () => {
  const [invites, setInvites] = useState<CollectiveInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadInvites = async () => {
    try {
      const data = await collectiveAPI.getMyInvites();
      setInvites(data.invites || []);
    } catch (error) {
      console.error('Error loading collective invitations:', error);
      setInvites([]);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void loadInvites();
  }, []);

  const respond = async (invite: CollectiveInvite, accept: boolean) => {
    setBusyId(invite.id);
    try {
      if (accept) {
        await collectiveAPI.acceptInvite(invite.collective.slug);
        toast.success(`You joined ${invite.collective.name}`);
      } else {
        await collectiveAPI.declineInvite(invite.collective.slug);
        toast.success('Invitation declined');
      }
      setInvites((current) => current.filter((item) => item.id !== invite.id));
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to ${accept ? 'accept' : 'decline'} invitation`);
    } finally {
      setBusyId(null);
    }
  };

  if (!loaded || invites.length === 0) return null;

  return (
    <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-purple-500/30">
      <div className="flex items-center space-x-2 mb-4">
        <Users className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Invitations</h3>
      </div>
      <div className="space-y-3">
        {invites.map((invite) => {
          const roleLabel = invite.role === 'admin' ? 'an admin' : 'a member';
          const inviter = invite.invitedBy?.username;
          return (
            <div
              key={invite.id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-gray-800 rounded-lg border border-gray-700"
            >
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={invite.collective.profilePicture || DEFAULT_PROFILE_PIC}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover border border-white/10"
                  onError={(event) => {
                    event.currentTarget.src = DEFAULT_PROFILE_PIC;
                  }}
                />
                <div className="min-w-0">
                  <h4 className="text-white font-medium">
                    Join{' '}
                    <Link to={`/collective/${invite.collective.slug}`} className="text-purple-300 hover:text-purple-200">
                      {invite.collective.name}
                    </Link>
                  </h4>
                  <p className="text-sm text-gray-400">
                    {inviter ? `${inviter} invited you` : 'You were invited'} to join as {roleLabel}
                    {invite.instrument ? ` (${invite.instrument})` : ''}. You are not a member until you accept.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => respond(invite, true)}
                  disabled={busyId === invite.id}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => respond(invite, false)}
                  disabled={busyId === invite.id}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CollectiveInvitations;
