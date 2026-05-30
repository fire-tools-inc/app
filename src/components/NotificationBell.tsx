import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MaterialIcon } from './MaterialIcon';
import {
  loadNotificationState,
  getActiveNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markNotificationAsUnread,
  markAllNotificationsAsRead,
  deleteNotification,
  addNotification,
} from '../utils/notificationStorage';
import {
  checkAndGenerateTimeBasedNotifications,
  generateWelcomeNotification,
} from '../utils/notificationGenerator';
import {
  type Notification,
  getNotificationTypeInfo,
} from '../types/notification';
import { loadSettings, type DateFormat } from '../utils/cookieSettings';
import { formatDate } from '../utils/dateFormatter';
import './NotificationBell.css';

interface NotificationBellProps {
  onNotificationClick?: (notification: Notification) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onNotificationClick,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');
  const panelRef = useRef<HTMLDivElement>(null);
  const hasCheckedRef = useRef(false);

  // Load notifications and check for time-based notifications
  const refreshNotifications = useCallback(() => {
    const active = getActiveNotifications();
    setNotifications(active);
    setUnreadCount(getUnreadCount());
  }, []);

  // Check for time-based notifications on mount (once per session)
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const state = loadNotificationState();
    
    // Load user's date format preference
    const settings = loadSettings();
    setDateFormat(settings.dateFormat);
    
    // Generate time-based notifications
    const newNotifications = checkAndGenerateTimeBasedNotifications(
      state.preferences,
      state.lastChecked
    );
    
    // Add any new time-based notifications
    newNotifications.forEach(notification => {
      addNotification(notification);
    });
    
    // If no notifications at all and this appears to be a new user, add welcome
    if (state.notifications.length === 0 && newNotifications.length === 0) {
      addNotification(generateWelcomeNotification());
    }
    
    refreshNotifications();
  }, [refreshNotifications]);

  // Refresh on open
  useEffect(() => {
    if (isOpen) {
      refreshNotifications();
    }
  }, [isOpen, refreshNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read
    markNotificationAsRead(notification.id);
    refreshNotifications();
    
    // Navigate if action URL provided
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
      setIsOpen(false);
    }
    
    onNotificationClick?.(notification);
  };

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead();
    refreshNotifications();
  };

  const handleToggleReadStatus = (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation();
    if (notification.read) {
      markNotificationAsUnread(notification.id);
    } else {
      markNotificationAsRead(notification.id);
    }
    refreshNotifications();
  };

  const handleDeleteNotification = (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    deleteNotification(notificationId);
    refreshNotifications();
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return t('notifications.justNow');
    if (diffMins < 60) return t('notifications.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', { count: diffDays });
    
    return formatDate(then, dateFormat);
  };

  return (
    <div className="notification-bell-container" ref={panelRef}>
      <button
        className="notification-bell-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? t('notifications.bellAriaUnread', { count: unreadCount }) : t('notifications.bellAria')}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <MaterialIcon name="notifications" />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-panel" role="menu" aria-label={t('notifications.title')}>
          <div className="notification-panel-header">
            <h3>{t('notifications.title')}</h3>
            {unreadCount > 0 && (
              <button
                className="mark-all-read-btn"
                onClick={handleMarkAllRead}
                aria-label={t('notifications.markAllAsRead')}
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <MaterialIcon name="notifications_none" />
                <p>{t('notifications.empty')}</p>
              </div>
            ) : (
              notifications.map(notification => {
                const typeInfo = getNotificationTypeInfo(notification.type);
                
                return (
                  <div
                    key={notification.id}
                    className={`notification-item ${notification.read ? 'read' : 'unread'} priority-${notification.priority.toLowerCase()}`}
                    onClick={() => handleNotificationClick(notification)}
                    role="menuitem"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        handleNotificationClick(notification);
                      }
                    }}
                  >
                    <div className="notification-icon">
                      <MaterialIcon name={typeInfo.icon} />
                    </div>
                    <div className="notification-content">
                      <div className="notification-title">{notification.title}</div>
                      <div className="notification-message">{notification.message}</div>
                      <div className="notification-time">{formatTimeAgo(notification.timestamp)}</div>
                    </div>
                    <div className="notification-actions">
                      <button
                        className="notification-read-btn"
                        onClick={(e) => handleToggleReadStatus(e, notification)}
                        aria-label={notification.read ? t('notifications.markAsUnread') : t('notifications.markAsRead')}
                        title={notification.read ? t('notifications.markAsUnread') : t('notifications.markAsRead')}
                      >
                        <MaterialIcon name={notification.read ? 'mark_email_unread' : 'mark_email_read'} size="small" />
                      </button>
                      <button
                        className="notification-delete-btn"
                        onClick={(e) => handleDeleteNotification(e, notification.id)}
                        aria-label={t('notifications.deleteNotification')}
                        title={t('common.delete')}
                      >
                        <MaterialIcon name="close" size="small" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {notifications.length > 0 && (
            <div className="notification-panel-footer">
              <button
                className="view-settings-btn"
                onClick={() => {
                  navigate('/settings');
                  setIsOpen(false);
                }}
              >
                <MaterialIcon name="settings" size="small" /> {t('notifications.settings')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
