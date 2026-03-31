import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { notificationApi } from "../lib/api";

export function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // Load unread count on mount and periodically
  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadUnreadCount = async () => {
    try {
      const data = await notificationApi.getUnreadCount();
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  };

  const loadNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await notificationApi.getAll({ limit: 20 });
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      loadNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.is_read) {
      try {
        await notificationApi.markAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error("Failed to mark as read:", err);
      }
    }

    // Navigate to expense if applicable
    if (notification.expense_id) {
      navigate(`/app/expenses/${notification.expense_id}`);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'approval_needed': return '⏳';
      case 'expense_approved': return '✅';
      case 'expense_rejected': return '❌';
      case 'expense_paid': return '💰';
      case 'step_approved': return '👍';
      case 'special_approval': return '⭐';
      default: return '🔔';
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        title="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-slate-500">
                <span className="animate-spin inline-block">⏳</span> Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <span className="text-4xl mb-2 block">🔔</span>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors ${
                    notification.is_read 
                      ? 'bg-white hover:bg-slate-50' 
                      : 'bg-indigo-50 hover:bg-indigo-100'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${notification.is_read ? 'text-slate-600' : 'text-slate-900 font-medium'}`}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatTime(notification.created_at)}
                    </p>
                  </div>
                  {!notification.is_read && (
                    <span className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-2"></span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2">
              <button
                onClick={() => {
                  navigate('/app/notifications');
                  setIsOpen(false);
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium w-full text-center"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
