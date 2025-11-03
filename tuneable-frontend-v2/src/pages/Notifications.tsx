import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, ArrowLeft } from 'lucide-react';
import { notificationAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { io, Socket } from 'socket.io-client';

interface Notification {
  _id: string;
  uuid?: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  linkText?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
  relatedMediaId?: any;
  relatedPartyId?: any;
  relatedUserId?: any;
}

const Notifications: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  // Get API base URL for Socket.IO connection
  const getSocketIOUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';
    return apiUrl;
  };

  // Fetch notifications
  const fetchNotifications = async (pageNum: number = 1, append: boolean = false) => {
    setIsLoading(true);
    try {
      const response = await notificationAPI.getNotifications(pageNum, 20, false);
      const newNotifications = response.notifications || [];
      
      if (append) {
        setNotifications(prev => [...prev, ...newNotifications]);
      } else {
        setNotifications(newNotifications);
      }
      
      setUnreadCount(response.unreadCount || 0);
      setHasMore(response.pagination.pages > pageNum);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Set up Socket.IO connection
  useEffect(() => {
    if (!user?._id && !user?.uuid) return;

    const socketUrl = getSocketIOUrl();
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.warn('No token found for Socket.IO authentication');
      return;
    }
    
    try {
      socketRef.current = io(socketUrl, {
        transports: ['websocket', 'polling'],
        withCredentials: true,
        auth: {
          token // Send token in auth object (alternative to emit)
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 5000
      });

      socketRef.current.on('connect', () => {
        console.log('Socket.IO connected');
        // Authenticate with JWT token
        socketRef.current?.emit('authenticate', { token });
      });

      socketRef.current.on('connect_error', (error) => {
        console.warn('Socket.IO connection error (non-critical):', error.message);
        // Silently fail - notifications will work via polling
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
      });

      socketRef.current.on('notification', (notification: Notification) => {
        console.log('New notification received:', notification);
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      });

      socketRef.current.on('unread-count', (data: { count: number }) => {
        setUnreadCount(data.count);
      });

      socketRef.current.on('error', (error) => {
        console.warn('Socket.IO error (non-critical):', error);
      });
    } catch (error) {
      console.warn('Socket.IO initialization failed (non-critical):', error);
      // Continue without Socket.IO - notifications will work via polling
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user) {
      fetchNotifications(1, false);
    }
  }, [user]);

  // Handle mark as read
  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications(prev =>
        prev.map(n =>
          n._id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Handle delete
  const handleDelete = async (notificationId: string) => {
    try {
      await notificationAPI.deleteNotification(notificationId);
      const notification = notifications.find(n => n._id === notificationId);
      if (notification && !notification.isRead) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
      setNotifications(prev => prev.filter(n => n._id !== notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification._id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  // Load more
  const loadMore = () => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchNotifications(nextPage, true);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
              <Bell className="h-6 w-6 md:h-8 md:w-8" />
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-gray-400 mt-1">
                {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="space-y-2">
        {isLoading && notifications.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="card p-8 text-center text-gray-400">
            <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No notifications yet</p>
            <p className="text-sm mt-2">You'll see notifications here when something happens</p>
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <div
                key={notification._id}
                onClick={() => handleNotificationClick(notification)}
                className={`card p-4 hover:bg-gray-700/50 transition-colors cursor-pointer ${
                  !notification.isRead ? 'bg-gray-800/50 border-l-4 border-purple-500' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-3">
                      <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                        notification.isRead ? 'bg-gray-600' : 'bg-purple-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-white">
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {notification.message}
                        </p>
                        {notification.linkText && (
                          <span className="text-xs text-purple-400 mt-2 inline-block">
                            {notification.linkText} →
                          </span>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          {formatDate(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!notification.isRead && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(notification._id);
                        }}
                        className="p-2 text-purple-400 hover:bg-purple-500/20 rounded transition-colors"
                        title="Mark as read"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(notification._id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="text-center mt-4">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Notifications;

