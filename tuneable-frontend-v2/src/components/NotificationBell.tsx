import React, { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { io, Socket } from 'socket.io-client';
import NotificationArtwork from './NotificationArtwork';
import {
  isExternalNotificationLink,
  notificationDestination,
  notificationLinkLabel,
  type NotificationLinkSource,
} from '../utils/notificationLink';

interface Notification extends NotificationLinkSource {
  _id: string;
  uuid?: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedUserId?: any;
}

const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const seenNotificationIds = useRef<Set<string>>(new Set());
  const userSocketId = user?._id || user?.uuid || null;

  // Get API base URL for Socket.IO connection
  const getSocketIOUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';
    return apiUrl;
  };

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const response = await notificationAPI.getUnreadCount();
      setUnreadCount(response.count || 0);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  // Fetch recent notifications
  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const response = await notificationAPI.getNotifications(1, 5, false);
      const list: Notification[] = response.notifications || [];
      list.forEach((item) => {
        if (item._id) seenNotificationIds.current.add(item._id);
      });
      setNotifications(list);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Set up Socket.IO connection
  useEffect(() => {
    if (!userSocketId) return;

    const socketUrl = getSocketIOUrl();
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.warn('No token found for Socket.IO authentication');
      return;
    }
    
    // Connect to Socket.IO server. Depend on the user id, not the user
    // object: a tip updates the balance and would otherwise open a second
    // socket that is still in the room when the earn event arrives.
    let socket: Socket;
    try {
      socket = io(socketUrl, {
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
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Socket.IO connected');
        socket.emit('authenticate', { token });
      });

      socket.on('authenticated', (data) => {
        console.log('Socket.IO authenticated:', data);
      });

      socket.on('connect_error', (error) => {
        console.warn('Socket.IO connection error (non-critical):', error.message);
        // Silently fail - notifications will work via polling
      });

      socket.on('disconnect', (reason) => {
        console.log('Socket.IO disconnected:', reason);
      });

      socket.on('notification', (notification: Notification) => {
        console.log('New notification received:', notification);
        const id = notification?._id;
        if (id && seenNotificationIds.current.has(id)) return;
        if (id) seenNotificationIds.current.add(id);
        setNotifications(prev => {
          if (id && prev.some((item) => item._id === id)) return prev;
          return [notification, ...prev];
        });
        setUnreadCount(prev => prev + 1);
      });

      socket.on('unread-count', (data: { count: number }) => {
        setUnreadCount(data.count);
      });

      socket.on('error', (error) => {
        console.warn('Socket.IO error (non-critical):', error);
      });
    } catch (error) {
      console.warn('Socket.IO initialization failed (non-critical):', error);
      // Continue without Socket.IO - notifications will work via polling
      return;
    }

    return () => {
      socket.io.reconnection(false);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [userSocketId]);

  // Fetch initial data
  useEffect(() => {
    if (userSocketId) {
      fetchUnreadCount();
      fetchNotifications();
    }
  }, [userSocketId]);

  // Toggle dropdown
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const markAsReadInternal = async (notificationId: string) => {
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

  // Handle mark as read from icon button
  const handleMarkAsRead = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await markAsReadInternal(notificationId);
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationAPI.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
      // Refetch unread count to ensure it's in sync with backend
      await fetchUnreadCount();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Open the tune, collective, party, or other record this notification is about.
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsReadInternal(notification._id);
    }
    const destination = notificationDestination(notification);
    setIsOpen(false);
    if (!destination) {
      navigate('/notifications');
      return;
    }
    if (isExternalNotificationLink(destination)) {
      window.location.assign(destination);
      return;
    }
    navigate(destination);
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-300 hover:text-white transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center min-w-[1.25rem]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-gray-800 rounded-lg shadow-xl border border-gray-700 z-50 max-h-[500px] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  title="Mark all as read"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => navigate('/notifications')}
                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              >
                View all
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-4 text-center text-gray-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-400">No notifications ✨</div>
            ) : (
              <div className="divide-y divide-gray-700">
                {notifications.map((notification) => {
                  const destinationLabel = notificationLinkLabel(notification);
                  return (
                  <div
                    key={notification._id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-gray-700/50 transition-colors cursor-pointer ${
                      !notification.isRead ? 'bg-gray-900/50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <NotificationArtwork
                        notification={notification}
                        size="sm"
                        unread={!notification.isRead}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {notification.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        {destinationLabel && (
                          <span className="text-xs text-purple-400 mt-1 inline-flex items-center gap-1">
                            {destinationLabel} <span aria-hidden="true">→</span>
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleMarkAsRead(notification._id, e)}
                        className={`flex-shrink-0 p-1 rounded transition-colors ${
                          notification.isRead
                            ? 'text-gray-500'
                            : 'text-purple-400 hover:bg-purple-500/20'
                        }`}
                        title={notification.isRead ? 'Read' : 'Mark as read'}
                      >
                        {notification.isRead ? (
                          <CheckCheck className="h-4 w-4" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;

