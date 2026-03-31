import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle, XCircle, Clock, Star, DollarSign, ThumbsUp } from "lucide-react";
import { notificationApi } from "../lib/api";

const NOTIF_ICONS = {
  approval_needed: { icon: Clock, color: "var(--warning)" },
  expense_approved: { icon: CheckCircle, color: "var(--success)" },
  expense_rejected: { icon: XCircle, color: "var(--danger)" },
  expense_paid: { icon: DollarSign, color: "var(--success)" },
  step_approved: { icon: ThumbsUp, color: "var(--accent)" },
  special_approval: { icon: Star, color: "var(--purple)" },
};

export function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

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
    if (!isOpen) loadNotifications();
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = async (notification) => {
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

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
        style={{
          color: "var(--text-muted)",
          background: isOpen ? "var(--bg-elevated)" : "transparent"
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.color = "var(--text-primary)"; }}
        onMouseOut={(e) => { if (!isOpen) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}}
      >
        <Bell size={18} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full"
              style={{
                background: "var(--danger)",
                color: "white",
                fontSize: "9px",
                fontWeight: 700,
                width: 16,
                height: 16,
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 overflow-hidden z-50"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
                Notifications
              </h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold"
                  style={{ color: "var(--accent)" }}
                  onMouseOver={(e) => e.currentTarget.style.opacity = "0.7"}
                  onMouseOut={(e) => e.currentTarget.style.opacity = "1"}
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto">
              {isLoading ? (
                <div className="p-6 text-center">
                  <div className="spinner mx-auto mb-2" />
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell size={32} style={{ color: "var(--border-light)", margin: "0 auto 8px" }} />
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>No notifications yet</p>
                </div>
              ) : (
                notifications.map((n) => {
                  const iconData = NOTIF_ICONS[n.type] || { icon: Bell, color: "var(--text-muted)" };
                  const IconComp = iconData.icon;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className="flex gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={{
                        background: n.is_read ? "transparent" : "var(--accent-subtle)",
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = n.is_read ? "var(--bg-card-hover)" : "var(--accent-muted)"}
                      onMouseOut={(e) => e.currentTarget.style.background = n.is_read ? "transparent" : "var(--accent-subtle)"}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: `${iconData.color}15` }}
                      >
                        <IconComp size={14} style={{ color: iconData.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] leading-snug" style={{ color: n.is_read ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: n.is_read ? 400 : 500 }}>
                          {n.message}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{formatTime(n.created_at)}</p>
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: "var(--accent)" }} />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
