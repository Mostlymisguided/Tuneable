import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Copy, CheckCircle, Gift, MapPin, Calendar, Plus, Edit2, Trash2, X, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import { authAPI } from '../lib/api';
import { DEFAULT_PROFILE_PIC } from '../constants';
import type { InviteCode, Referral, ReferralsResponse } from '../types';

const InviteReferrals: React.FC = () => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [selectedCodeFilter, setSelectedCodeFilter] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCodeLabel, setNewCodeLabel] = useState('');
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadReferrals();
  }, []);

  useEffect(() => {
    if (selectedCodeFilter) {
      loadReferrals(selectedCodeFilter);
    } else {
      loadReferrals();
    }
  }, [selectedCodeFilter]);

  const loadReferrals = async (code?: string) => {
    try {
      const response = await authAPI.getReferrals(code) as ReferralsResponse;
      setReferrals(response.referrals || []);
      setInviteCodes(response.personalInviteCodes || []);
    } catch (error) {
      console.error('Error loading referrals:', error);
      toast.error('Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCode = async () => {
    if (!newCodeLabel.trim()) {
      toast.error('Please enter a label for your invite code');
      return;
    }

    try {
      await authAPI.createInviteCode(newCodeLabel.trim());
      toast.success('Invite code created successfully!');
      setShowCreateModal(false);
      setNewCodeLabel('');
      await loadReferrals();
    } catch (error: any) {
      console.error('Error creating invite code:', error);
      toast.error(error.response?.data?.error || 'Failed to create invite code');
    }
  };

  const handleUpdateCode = async (codeId: string, isActive?: boolean, label?: string) => {
    try {
      await authAPI.updateInviteCode(codeId, { isActive, label });
      toast.success('Invite code updated successfully!');
      setEditingCode(null);
      setEditLabel('');
      await loadReferrals();
    } catch (error: any) {
      console.error('Error updating invite code:', error);
      toast.error(error.response?.data?.error || 'Failed to update invite code');
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this invite code?')) {
      return;
    }

    try {
      await authAPI.deleteInviteCode(codeId);
      toast.success('Invite code deactivated successfully!');
      await loadReferrals();
    } catch (error: any) {
      console.error('Error deleting invite code:', error);
      toast.error(error.response?.data?.error || 'Failed to deactivate invite code');
    }
  };

  const copyInviteLink = (code: string) => {
    const inviteLink = `${window.location.origin}/register?invite=${code}`;
    navigator.clipboard.writeText(inviteLink);
    setCopiedCode(code);
    toast.success('Invite link copied to clipboard!');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success('Invite code copied!');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const activeCodes = inviteCodes.filter(ic => ic.isActive);
  const inactiveCodes = inviteCodes.filter(ic => !ic.isActive);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Invite Codes Management */}
      <div className="card bg-gradient-to-br from-purple-900/40 to-pink-900/40 border-2 border-purple-500/30 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Gift className="h-6 w-6 text-yellow-400 mr-2" />
            <h3 className="text-xl font-bold text-white">Your Invite Codes</h3>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>New Code</span>
          </button>
        </div>
        
        <p className="text-gray-300 mb-4">
          Create multiple invite codes to track signups from different sources (Reddit, Twitter, etc.)
        </p>

        {/* Active Invite Codes */}
        <div className="space-y-3 mb-4">
          {activeCodes.length === 0 ? (
            <div className="text-center py-4 text-gray-400">
              No active invite codes. Create one to get started!
            </div>
          ) : (
            activeCodes.map((inviteCode) => (
              <div
                key={inviteCode._id}
                className="bg-black/40 rounded-lg p-4 border border-purple-500/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <p className="text-xs text-gray-400">
                        {inviteCode.label || 'Primary'}
                      </p>
                      {inviteCode.usageCount > 0 && (
                        <span className="text-xs text-purple-400">
                          {inviteCode.usageCount} {inviteCode.usageCount === 1 ? 'signup' : 'signups'}
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-mono font-bold text-white tracking-wider">
                      {inviteCode.code}
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => copyInviteCode(inviteCode.code)}
                      className="p-2 bg-purple-600/50 hover:bg-purple-600 text-white rounded transition-colors"
                      title="Copy code"
                    >
                      {copiedCode === inviteCode.code ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => copyInviteLink(inviteCode.code)}
                      className="p-2 bg-pink-600/50 hover:bg-pink-600 text-white rounded transition-colors"
                      title="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    {editingCode === inviteCode._id ? (
                      <>
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Label (e.g., Reddit)"
                          className="px-2 py-1 bg-black/60 text-white rounded text-sm w-24"
                          autoFocus
                        />
                        <button
                          onClick={() => handleUpdateCode(inviteCode._id, undefined, editLabel)}
                          className="p-2 bg-green-600/50 hover:bg-green-600 text-white rounded transition-colors"
                          title="Save"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingCode(null);
                            setEditLabel('');
                          }}
                          className="p-2 bg-gray-600/50 hover:bg-gray-600 text-white rounded transition-colors"
                          title="Cancel"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingCode(inviteCode._id);
                            setEditLabel(inviteCode.label || '');
                          }}
                          className="p-2 bg-blue-600/50 hover:bg-blue-600 text-white rounded transition-colors"
                          title="Edit label"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        {activeCodes.length > 1 && (
                          <button
                            onClick={() => handleDeleteCode(inviteCode._id)}
                            className="p-2 bg-red-600/50 hover:bg-red-600 text-white rounded transition-colors"
                            title="Deactivate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {window.location.origin}/register?invite={inviteCode.code}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Inactive Invite Codes */}
        {inactiveCodes.length > 0 && (
          <div className="mt-4 pt-4 border-t border-purple-500/20">
            <p className="text-sm text-gray-400 mb-2">Inactive Codes</p>
            <div className="space-y-2">
              {inactiveCodes.map((inviteCode) => (
                <div
                  key={inviteCode._id}
                  className="bg-black/20 rounded-lg p-3 border border-gray-600/30 opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-gray-500">{inviteCode.label || 'Unlabeled'}</p>
                      <p className="text-lg font-mono text-gray-400">{inviteCode.code}</p>
                    </div>
                    <button
                      onClick={() => handleUpdateCode(inviteCode._id, true)}
                      className="px-3 py-1 bg-green-600/50 hover:bg-green-600 text-white rounded text-sm transition-colors"
                    >
                      Reactivate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Code Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full mx-4 border border-purple-500/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">Create New Invite Code</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCodeLabel('');
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-gray-300 mb-4">
              Add a label to track where you'll share this code (e.g., "Reddit", "Twitter", "Discord")
            </p>
            <input
              type="text"
              value={newCodeLabel}
              onChange={(e) => setNewCodeLabel(e.target.value)}
              placeholder="Label (optional)"
              className="w-full px-4 py-2 bg-black/60 text-white rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateCode();
                }
              }}
            />
            <div className="flex space-x-3">
              <button
                onClick={handleCreateCode}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              >
                Create Code
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewCodeLabel('');
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Referrals List */}
      <div className="card bg-black/20 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Users className="h-6 w-6 text-purple-400 mr-2" />
            <h3 className="text-xl font-bold text-white">
              People You've Invited
            </h3>
          </div>
          <div className="flex items-center space-x-3">
            {activeCodes.length > 1 && (
              <select
                value={selectedCodeFilter}
                onChange={(e) => setSelectedCodeFilter(e.target.value)}
                className="px-3 py-1 bg-black/60 text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Codes</option>
                {activeCodes.map((code) => (
                  <option key={code._id} value={code.code}>
                    {code.label || code.code} ({code.usageCount})
                  </option>
                ))}
              </select>
            )}
            <span className="text-purple-400 font-bold">
              {referrals.length}
            </span>
          </div>
        </div>

        {referrals.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">No referrals yet</p>
            <p className="text-sm text-gray-500">
              Share your invite codes to grow the Tuneable community!
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
                      src={referral.profilePic || DEFAULT_PROFILE_PIC}
                      alt={referral.username}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = DEFAULT_PROFILE_PIC;
                      }}
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
                      {referral.usedCode && activeCodes.length > 1 && (
                        <div className="flex items-center space-x-1">
                          <span className="text-purple-400 font-mono text-xs">
                            {referral.usedCode}
                          </span>
                        </div>
                      )}
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
