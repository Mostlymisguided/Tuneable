import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Search, Mail, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import { labelAPI, userAPI } from '../../lib/api';
import { DEFAULT_PROFILE_PIC } from '../../constants';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  labelSlug: string;
  inviteType: 'admin' | 'artist';
  onSuccess: () => void;
}

const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  labelSlug,
  inviteType,
  onSuccess
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [email, setEmail] = useState('');
  const [useEmail, setUseEmail] = useState(false);
  const [role, setRole] = useState<'artist' | 'producer' | 'manager' | 'staff'>('artist');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle search with debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= 2 && !useEmail) {
      searchTimeoutRef.current = setTimeout(() => {
        handleSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, useEmail]);

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    try {
      const results = await userAPI.searchUsers({ search: query, limit: 10 });
      setSearchResults(results.users || []);
    } catch (error) {
      console.error('Error searching users:', error);
      toast.error('Failed to search users');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedUser && !email.trim()) {
      toast.error('Please select a user or enter an email');
      return;
    }

    setIsSubmitting(true);
    try {
      const data: any = {};
      if (selectedUser) {
        data.userId = selectedUser._id || selectedUser.id;
      } else {
        data.email = email.trim();
      }
      
      if (inviteType === 'artist') {
        data.role = role;
        await labelAPI.inviteArtist(labelSlug, data);
      } else {
        await labelAPI.inviteAdmin(labelSlug, data);
      }
      
      toast.success(`${inviteType === 'admin' ? 'Admin' : 'Artist'} invited successfully!`);
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error inviting member:', error);
      toast.error(error.response?.data?.error || 'Failed to invite member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedUser(null);
    setEmail('');
    setSearchQuery('');
    setSearchResults([]);
    setUseEmail(false);
    setRole('artist');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div ref={modalRef} className="bg-gray-800 rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">
            Invite {inviteType === 'admin' ? 'Admin' : 'Artist'}
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {inviteType === 'artist' && (
          <div className="mb-4">
            <label className="block text-white font-medium mb-2">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="artist">Artist</option>
              <option value="producer">Producer</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
            </select>
          </div>
        )}

        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <button
              onClick={() => {
                setUseEmail(false);
                setSelectedUser(null);
                setEmail('');
              }}
              className={`px-3 py-1 rounded text-sm ${!useEmail ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              <Search className="h-4 w-4 inline mr-1" />
              Search User
            </button>
            <button
              onClick={() => {
                setUseEmail(true);
                setSelectedUser(null);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className={`px-3 py-1 rounded text-sm ${useEmail ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
            >
              <Mail className="h-4 w-4 inline mr-1" />
              Enter Email
            </button>
          </div>

          {!useEmail ? (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={selectedUser ? (selectedUser.artistName || selectedUser.username) : searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedUser(null);
                  }}
                  placeholder="Search by username or artist name..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
                )}
              </div>
              
              {selectedUser && (
                <div className="mt-2 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg flex items-center space-x-3">
                  <img
                    src={selectedUser.profilePic || DEFAULT_PROFILE_PIC}
                    alt={selectedUser.artistName || selectedUser.username}
                    className="h-10 w-10 rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_PIC;
                    }}
                  />
                  <div className="flex-1">
                    <div className="text-white font-medium">
                      {selectedUser.artistName || selectedUser.username}
                    </div>
                    {selectedUser.artistName && (
                      <div className="text-gray-400 text-sm">@{selectedUser.username}</div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedUser(null);
                      setSearchQuery('');
                    }}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              
              {searchResults.length > 0 && !selectedUser && (
                <div className="mt-2 max-h-48 overflow-y-auto bg-gray-700 rounded-lg border border-gray-600">
                  {searchResults.map((user) => (
                    <button
                      key={user._id || user.id}
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchQuery(user.artistName || user.username);
                        setSearchResults([]);
                      }}
                      className="w-full px-4 py-2 text-left hover:bg-gray-600 flex items-center space-x-3 border-b border-gray-600 last:border-b-0"
                    >
                      <img
                        src={user.profilePic || DEFAULT_PROFILE_PIC}
                        alt={user.artistName || user.username}
                        className="h-8 w-8 rounded-full"
                        onError={(e) => {
                          e.currentTarget.src = DEFAULT_PROFILE_PIC;
                        }}
                      />
                      <div className="flex-1">
                        <div className="text-white">
                          {user.artistName || user.username}
                        </div>
                        {user.artistName && (
                          <div className="text-gray-400 text-xs">@{user.username}</div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                User must have an account with this email address
              </p>
            </div>
          )}
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (!selectedUser && !email.trim())}
            className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center space-x-2 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Inviting...</span>
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                <span>Send Invite</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InviteMemberModal;

