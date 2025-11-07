import React, { useState, useEffect } from 'react';
import { Send, Users, Search, X, Check, Globe } from 'lucide-react';
import { notificationAPI, userAPI } from '../lib/api';
import { toast } from 'react-toastify';
import { DEFAULT_PROFILE_PIC } from '../constants';

interface User {
  _id: string;
  username: string;
  email?: string;
  profilePic?: string;
  role?: string[];
}

const notificationTypes = [
  { value: 'admin_announcement', label: 'Admin Announcement' },
  { value: 'bid_received', label: 'Bid Received' },
  { value: 'bid_outbid', label: 'Bid Outbid' },
  { value: 'comment_reply', label: 'Comment Reply' },
  { value: 'creator_approved', label: 'Creator Approved' },
  { value: 'creator_rejected', label: 'Creator Rejected' },
  { value: 'claim_approved', label: 'Claim Approved' },
  { value: 'claim_rejected', label: 'Claim Rejected' },
  { value: 'party_invite', label: 'Party Invite' },
  { value: 'tune_bytes_earned', label: 'TuneBytes Earned' },
  { value: 'party_media_played', label: 'Party Media Played' },
  { value: 'media_claimed', label: 'Media Claimed' },
];

const NotificationsManager: React.FC = () => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'admin_announcement',
    link: '',
    linkText: '',
  });

  const [sendMode, setSendMode] = useState<'specific' | 'broadcast'>('specific');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'creator' | 'admin'>('all');

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Filter users based on search query and filter
  useEffect(() => {
    let filtered = availableUsers;

    // Apply role filter
    if (userFilter === 'creator') {
      filtered = filtered.filter(user => user.role?.includes('creator'));
    } else if (userFilter === 'admin') {
      filtered = filtered.filter(user => user.role?.includes('admin'));
    } else if (userFilter === 'active') {
      // Note: We'd need isActive field from API, assuming it's included
      filtered = filtered; // Would filter by isActive if available
    }

    // Apply search query
    if (userSearchQuery.trim()) {
      const query = userSearchQuery.toLowerCase();
      filtered = filtered.filter(user => 
        user.username.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query)
      );
    }

    setFilteredUsers(filtered);
  }, [userSearchQuery, userFilter, availableUsers]);

  const loadUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const data = await userAPI.getAllUsers(1000); // Load up to 1000 users
      setAvailableUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(id => id !== userId));
  };

  const getSelectedUserDetails = () => {
    return availableUsers.filter(user => selectedUsers.includes(user._id));
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return false;
    }
    if (!formData.message.trim()) {
      toast.error('Message is required');
      return false;
    }
    if (sendMode === 'specific' && selectedUsers.length === 0) {
      toast.error('Please select at least one user');
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (!validateForm()) return;

    setIsSending(true);
    try {
      if (sendMode === 'broadcast') {
        await notificationAPI.broadcastNotification(
          formData.title,
          formData.message,
          formData.link || undefined,
          formData.linkText || undefined,
          formData.type
        );
        toast.success('Notification broadcasted to all users successfully!');
      } else {
        await notificationAPI.sendNotification(
          selectedUsers,
          formData.title,
          formData.message,
          formData.link || undefined,
          formData.linkText || undefined,
          formData.type
        );
        toast.success(`Notification sent to ${selectedUsers.length} user(s) successfully!`);
      }

      // Reset form
      setFormData({
        title: '',
        message: '',
        type: 'admin_announcement',
        link: '',
        linkText: '',
      });
      setSelectedUsers([]);
      setUserSearchQuery('');
    } catch (error: any) {
      console.error('Error sending notification:', error);
      toast.error(error.response?.data?.error || 'Failed to send notification');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Notifications Manager</h2>
          <p className="text-gray-400 mt-1">Compose and send notifications to users</p>
        </div>
      </div>

      {/* Compose Form */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Notification Type
          </label>
          <select
            name="type"
            value={formData.type}
            onChange={handleInputChange}
            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {notificationTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="Enter notification title"
            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Message <span className="text-red-400">*</span>
          </label>
          <textarea
            name="message"
            value={formData.message}
            onChange={handleInputChange}
            placeholder="Enter notification message"
            rows={5}
            className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Link (optional)
            </label>
            <input
              type="text"
              name="link"
              value={formData.link}
              onChange={handleInputChange}
              placeholder="/tune/123 or /wallet"
              className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Link Text (optional)
            </label>
            <input
              type="text"
              name="linkText"
              value={formData.linkText}
              onChange={handleInputChange}
              placeholder="View Media, View Wallet, etc."
              className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Recipient Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Recipients
          </label>
          
          <div className="space-y-4">
            {/* Send Mode Selection */}
            <div className="flex space-x-4">
              <button
                onClick={() => {
                  setSendMode('specific');
                  setSelectedUsers([]);
                }}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                  sendMode === 'specific'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Users className="h-4 w-4 mr-2" />
                Specific Users
              </button>
              <button
                onClick={() => {
                  setSendMode('broadcast');
                  setSelectedUsers([]);
                }}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors ${
                  sendMode === 'broadcast'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                <Globe className="h-4 w-4 mr-2" />
                Broadcast to All
              </button>
            </div>

            {/* User Selection (only for specific mode) */}
            {sendMode === 'specific' && (
              <div className="space-y-3">
                {/* Selected Users Display */}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {getSelectedUserDetails().map(user => (
                      <div
                        key={user._id}
                        className="flex items-center bg-purple-600/20 text-purple-300 px-3 py-1 rounded-lg text-sm"
                      >
                        <img
                          src={user.profilePic || DEFAULT_PROFILE_PIC}
                          alt={user.username}
                          className="w-5 h-5 rounded-full mr-2"
                        />
                        <span>{user.username}</span>
                        <button
                          onClick={() => removeUser(user._id)}
                          className="ml-2 hover:text-red-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* User Search */}
                <div className="relative">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        onFocus={() => setShowUserSearch(true)}
                        placeholder="Search users by username or email..."
                        className="w-full bg-gray-700 text-white border border-gray-600 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value as any)}
                      className="bg-gray-700 text-white border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="all">All Users</option>
                      <option value="active">Active Users</option>
                      <option value="creator">Creators</option>
                      <option value="admin">Admins</option>
                    </select>
                  </div>

                  {/* User Search Results */}
                  {showUserSearch && (
                    <div className="absolute z-10 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {isLoadingUsers ? (
                        <div className="p-4 text-center text-gray-400">Loading users...</div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="p-4 text-center text-gray-400">No users found</div>
                      ) : (
                        filteredUsers.map(user => {
                          const isSelected = selectedUsers.includes(user._id);
                          return (
                            <button
                              key={user._id}
                              onClick={() => {
                                toggleUserSelection(user._id);
                              }}
                              className={`w-full flex items-center px-4 py-2 hover:bg-gray-600 transition-colors ${
                                isSelected ? 'bg-purple-600/20' : ''
                              }`}
                            >
                              <img
                                src={user.profilePic || DEFAULT_PROFILE_PIC}
                                alt={user.username}
                                className="w-8 h-8 rounded-full mr-3"
                              />
                              <div className="flex-1 text-left">
                                <div className="text-white font-medium">{user.username}</div>
                                {user.email && (
                                  <div className="text-sm text-gray-400">{user.email}</div>
                                )}
                              </div>
                              {isSelected && (
                                <Check className="h-5 w-5 text-purple-400" />
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {selectedUsers.length > 0 && (
                  <div className="text-sm text-gray-400">
                    {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
                  </div>
                )}
              </div>
            )}

            {sendMode === 'broadcast' && (
              <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4">
                <div className="flex items-center text-blue-300">
                  <Globe className="h-5 w-5 mr-2" />
                  <span className="font-medium">This notification will be sent to all active users</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Send Button */}
        <div className="flex justify-end pt-4 border-t border-gray-700">
          <button
            onClick={handleSend}
            disabled={isSending}
            className="flex items-center px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {sendMode === 'broadcast' ? 'Broadcast Notification' : `Send to ${selectedUsers.length || 0} User(s)`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationsManager;

