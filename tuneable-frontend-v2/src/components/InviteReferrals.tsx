import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Copy, CheckCircle, Gift, MapPin, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { authAPI } from '../lib/api';

interface Referral {
  username: string;
  profilePic: string;
  joinedAt: string;
  location: {
    city: string;
    country: string;
  };
  uuid: string;
}

const InviteReferrals: React.FC = () => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [personalInviteCode, setPersonalInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadReferrals();
  }, []);

  const loadReferrals = async () => {
    try {
      const response = await authAPI.getReferrals();
      setReferrals(response.referrals || []);
      setPersonalInviteCode(response.personalInviteCode || '');
    } catch (error) {
      console.error('Error loading referrals:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/register?invite=${personalInviteCode}`;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('Invite link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(personalInviteCode);
    setCopied(true);
    toast.success('Invite code copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Code Card */}
      <div className="card bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Gift className="h-6 w-6 text-yellow-400 mr-2" />
          <h3 className="text-xl font-bold text-white">Your Invite Code</h3>
        </div>
        
        <p className="text-gray-300 mb-4">
          Share your invite code with friends to invite them to Tuneable
        </p>

        {/* Invite Code Display */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 bg-black/40 rounded-lg p-4 border border-purple-500/30">
            <p className="text-xs text-gray-400 mb-1">Your Code</p>
            <p className="text-3xl font-mono font-bold text-white tracking-wider">
              {personalInviteCode}
            </p>
          </div>
          
          <div className="flex sm:flex-col gap-2">
            <button
              onClick={copyInviteCode}
              className="flex-1 sm:flex-none px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              {copied ? <CheckCircle className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
              <span className="hidden sm:inline">Copy Code</span>
            </button>
            <button
              onClick={copyInviteLink}
              className="flex-1 sm:flex-none px-4 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Copy className="h-5 w-5" />
              <span className="hidden sm:inline">Copy Link</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Share: <span className="text-purple-400">{window.location.origin}/register?invite={personalInviteCode}</span>
        </p>
      </div>

      {/* Referrals List */}
      <div className="card bg-black/20 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Users className="h-6 w-6 text-purple-400 mr-2" />
            <h3 className="text-xl font-bold text-white">
              People You've Invited
            </h3>
          </div>
          <span className="text-purple-400 font-bold">
            {referrals.length}
          </span>
        </div>

        {referrals.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">No referrals yet</p>
            <p className="text-sm text-gray-500">
              Share your invite code to grow the Tuneable community!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {referrals.map((referral) => (
              <div
                key={referral.uuid}
                onClick={() => navigate(`/user/${referral.uuid}`)}
                className="flex items-center justify-between p-4 bg-purple-900/20 rounded-lg border border-purple-500/20 hover:border-purple-500/40 transition-all cursor-pointer"
              >
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                  {/* Profile Picture */}
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-800 border-2 border-purple-500 flex-shrink-0">
                    <img
                      src={referral.profilePic || '/Tuneable-Logo-180x180.svg'}
                      alt={referral.username}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-semibold text-lg truncate">
                      {referral.username}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                      {referral.location?.city && (
                        <div className="flex items-center space-x-1">
                          <MapPin className="h-3 w-3" />
                          <span className="truncate">
                            {referral.location.city}
                            {referral.location.country && `, ${referral.location.country}`}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>Joined {formatDate(referral.joinedAt)}</span>
                      </div>
                    </div>
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

export default InviteReferrals;

