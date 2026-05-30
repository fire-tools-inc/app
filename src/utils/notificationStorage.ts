/**
 * Notification Storage utilities
 * Handles saving/loading notification state to/from encrypted cookies
 */

import Cookies from 'js-cookie';
import { encryptData, decryptData } from './cookieEncryption';
import {
  type Notification,
  type NotificationState,
  type NotificationPreferences,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../types/notification';
import { showNativeNotification } from './nativeNotifications';

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
    console.error('Failed to dispatch notifications-changed event:', error);
  }
};

// Cookie options
const COOKIE_OPTIONS: Cookies.CookieAttributes = {
  expires: 365, // 1 year
  sameSite: 'strict',
  secure: window.location.protocol === 'https:',
  path: '/',
};

/**
 * Save notification state to encrypted cookies
 */
export function saveNotificationState(state: NotificationState): void {
  try {
    const stateJson = JSON.stringify(state);
    const encryptedState = encryptData(stateJson);
    Cookies.set(NOTIFICATIONS_KEY, encryptedState, COOKIE_OPTIONS);
  } catch (error) {
    console.error('Failed to save notification state to cookies:', error);
  }
}

/**
 * Load notification state from encrypted cookies
 */
export function loadNotificationState(): NotificationState {
  try {
    const encryptedState = Cookies.get(NOTIFICATIONS_KEY);
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
    console.error('Failed to load notification state from cookies:', error);
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
    console.error('Failed to clear notifications:', error);
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
    console.error('Failed to add notification:', error);
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
    console.error('Failed to mark notification as read:', error);
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
    console.error('Failed to mark notification as unread:', error);
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
    console.error('Failed to mark all notifications as read:', error);
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
    console.error('Failed to delete notification:', error);
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
    console.error('Failed to get unread count:', error);
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
    console.error('Failed to get active notifications:', error);
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
    console.error('Failed to update notification preferences:', error);
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
    console.error('Failed to check notification preferences:', error);
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
    console.error('Failed to get notification preferences:', error);
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}
