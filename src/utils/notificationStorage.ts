/**
 * Notification Storage utilities
 * Handles saving/loading notification state to/from encrypted cookies
 */

import SafeCookies from './safeCookies';
import type { CookieAttributes } from './safeCookies';
import { encryptData, decryptData } from './cookieEncryption';
import {
  type Notification,
  type NotificationState,
  type NotificationPreferences,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../types/notification';
import { showNativeNotification } from './nativeNotifications';
import { logger } from './logger';

const NOTIFICATIONS_KEY = 'fire-tools-notifications';
const MAX_NOTIFICATIONS = 50; // Limit to prevent cookie overflow

/**
 * Event dispatched on `window` whenever the notification state changes
 * (add / mark read / delete / clear / preferences). UI surfaces such as
 * the bell badge listen for this so they refresh immediately instead of
 * waiting for the user to open the panel.
 */
export const NOTIFICATIONS_CHANGED_EVENT = 'fire-tools:notifications-changed';

const emitNotificationsChanged = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
  } catch (error) {
    logger.error('notification-storage', 'dispatch-failed', 'failed to dispatch notifications-changed event', { pii: { error: (error as Error)?.message } });
  }
};

// Cookie options (only used when SafeCookies routes to real cookies)
const COOKIE_OPTIONS: CookieAttributes = {
  expires: 365, // 1 year
  sameSite: 'strict',
  secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
  path: '/',
};

/**
 * Save notification state to encrypted storage
 */
export function saveNotificationState(state: NotificationState): void {
  try {
    const stateJson = JSON.stringify(state);
    const encryptedState = encryptData(stateJson);
    SafeCookies.set(NOTIFICATIONS_KEY, encryptedState, COOKIE_OPTIONS);
  } catch (error) {
    logger.error('notification-storage', 'save-failed', 'failed to save notification state', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Load notification state from encrypted storage
 */
export function loadNotificationState(): NotificationState {
  try {
    const encryptedState = SafeCookies.get(NOTIFICATIONS_KEY);
    if (encryptedState) {
      const decryptedState = decryptData(encryptedState);
      if (decryptedState) {
        const parsed = JSON.parse(decryptedState);
        // Merge with defaults to ensure all fields exist
        return {
          ...DEFAULT_NOTIFICATION_STATE,
          ...parsed,
          preferences: {
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...(parsed.preferences || {}),
          },
        };
      }
    }
    return DEFAULT_NOTIFICATION_STATE;
  } catch (error) {
    logger.error('notification-storage', 'load-failed', 'failed to load notification state', { pii: { error: (error as Error)?.message } });
    return DEFAULT_NOTIFICATION_STATE;
  }
}

/**
 * Clear all notifications but preserve preferences
 */
export function clearNotifications(): void {
  try {
    const state = loadNotificationState();
    const clearedState: NotificationState = {
      ...state,
      notifications: [],
      lastChecked: null,
    };
    saveNotificationState(clearedState);
    emitNotificationsChanged();
  } catch (error) {
    logger.error('notification-storage', 'clear-failed', 'failed to clear notifications', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Add a new notification to the state
 * Notifications are added to the beginning of the list (newest first)
 */
export function addNotification(notification: Notification): void {
  try {
    const state = loadNotificationState();
    
    // Add new notification at the beginning
    const notifications = [notification, ...state.notifications];
    
    // Limit total notifications to prevent cookie overflow
    const limitedNotifications = notifications.slice(0, MAX_NOTIFICATIONS);
    
    const updatedState: NotificationState = {
      ...state,
      notifications: limitedNotifications,
    };
    
    saveNotificationState(updatedState);
    emitNotificationsChanged();

    // Best-effort: also fire a native OS notification when the user has
    // opted in. Errors are swallowed by the helper.
    if (state.preferences.enableNativeNotifications) {
      void showNativeNotification({
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
      });
    }
  } catch (error) {
    logger.error('notification-storage', 'add-failed', 'failed to add notification', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Mark a specific notification as read
 */
export function markNotificationAsRead(notificationId: string): void {
  try {
    const state = loadNotificationState();
    
    const updatedNotifications = state.notifications.map(n =>
      n.id === notificationId ? { ...n, read: true } : n
    );
    
    const updatedState: NotificationState = {
      ...state,
      notifications: updatedNotifications,
    };
    
    saveNotificationState(updatedState);
    emitNotificationsChanged();
  } catch (error) {
    logger.error('notification-storage', 'read-failed', 'failed to mark notification as read', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Mark a specific notification as unread
 */
export function markNotificationAsUnread(notificationId: string): void {
  try {
    const state = loadNotificationState();
    
    const updatedNotifications = state.notifications.map(n =>
      n.id === notificationId ? { ...n, read: false } : n
    );
    
    const updatedState: NotificationState = {
      ...state,
      notifications: updatedNotifications,
    };
    
    saveNotificationState(updatedState);
    emitNotificationsChanged();
  } catch (error) {
    logger.error('notification-storage', 'unread-failed', 'failed to mark notification as unread', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Mark all notifications as read and update lastChecked timestamp
 */
export function markAllNotificationsAsRead(): void {
  try {
    const state = loadNotificationState();
    
    const updatedNotifications = state.notifications.map(n => ({
      ...n,
      read: true,
    }));
    
    const updatedState: NotificationState = {
      ...state,
      notifications: updatedNotifications,
      lastChecked: new Date().toISOString(),
    };
    
    saveNotificationState(updatedState);
    emitNotificationsChanged();
  } catch (error) {
    logger.error('notification-storage', 'mark-all-failed', 'failed to mark all notifications as read', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Delete a specific notification
 */
export function deleteNotification(notificationId: string): void {
  try {
    const state = loadNotificationState();
    
    const updatedNotifications = state.notifications.filter(n => n.id !== notificationId);
    
    const updatedState: NotificationState = {
      ...state,
      notifications: updatedNotifications,
    };
    
    saveNotificationState(updatedState);
    emitNotificationsChanged();
  } catch (error) {
    logger.error('notification-storage', 'delete-failed', 'failed to delete notification', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Get count of unread notifications
 */
export function getUnreadCount(): number {
  try {
    const state = loadNotificationState();
    return state.notifications.filter(n => !n.read).length;
  } catch (error) {
    logger.error('notification-storage', 'unread-count-failed', 'failed to get unread count', { pii: { error: (error as Error)?.message } });
    return 0;
  }
}

/**
 * Get all active (non-expired) notifications
 */
export function getActiveNotifications(): Notification[] {
  try {
    const state = loadNotificationState();
    const now = new Date();
    
    return state.notifications.filter(notification => {
      // If no expiration, notification is always active
      if (!notification.expiresAt) {
        return true;
      }
      
      // Check if notification has expired
      const expiresAt = new Date(notification.expiresAt);
      return expiresAt > now;
    });
  } catch (error) {
    logger.error('notification-storage', 'get-active-failed', 'failed to get active notifications', { pii: { error: (error as Error)?.message } });
    return [];
  }
}

/**
 * Update notification preferences
 */
export function updateNotificationPreferences(
  updates: Partial<NotificationPreferences>
): void {
  try {
    const state = loadNotificationState();
    
    const updatedState: NotificationState = {
      ...state,
      preferences: {
        ...state.preferences,
        ...updates,
      },
    };
    
    saveNotificationState(updatedState);
    emitNotificationsChanged();
  } catch (error) {
    logger.error('notification-storage', 'update-prefs-failed', 'failed to update notification preferences', { pii: { error: (error as Error)?.message } });
  }
}

/**
 * Check if notifications are enabled
 */
export function areNotificationsEnabled(): boolean {
  try {
    const state = loadNotificationState();
    return state.preferences.enableInAppNotifications;
  } catch (error) {
    logger.error('notification-storage', 'check-prefs-failed', 'failed to check notification preferences', { pii: { error: (error as Error)?.message } });
    return true;
  }
}

/**
 * Get notification preferences
 */
export function getNotificationPreferences(): NotificationPreferences {
  try {
    const state = loadNotificationState();
    return state.preferences;
  } catch (error) {
    logger.error('notification-storage', 'get-prefs-failed', 'failed to get notification preferences', { pii: { error: (error as Error)?.message } });
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}
