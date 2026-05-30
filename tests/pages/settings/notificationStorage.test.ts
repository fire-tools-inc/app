import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  saveNotificationState,
  loadNotificationState,
  clearNotifications,
  addNotification,
  markNotificationAsRead,
  markNotificationAsUnread,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadCount,
  getActiveNotifications,
  updateNotificationPreferences,
} from '../../../src/utils/notificationStorage';
import {
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_NOTIFICATION_PREFERENCES,
  createNotification,
  type NotificationState,
  type NotificationPreferences,
} from '../../../src/types/notification';

// Mock document.cookie
const cookieMock = (() => {
  let cookies: Record<string, string> = {};

  return {
    get: () => {
      return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    },
    set: (value: string) => {
      const [cookiePair] = value.split(';');
      const [key, val] = cookiePair.split('=');
      if (key && val !== undefined) {
        if (val === '' || value.includes('max-age=0') || value.includes('expires=Thu, 01 Jan 1970')) {
          delete cookies[key.trim()];
        } else {
          cookies[key.trim()] = val.trim();
        }
      }
    },
    clear: () => {
      cookies = {};
    },
  };
})();

Object.defineProperty(document, 'cookie', {
  get: () => cookieMock.get(),
  set: (value: string) => cookieMock.set(value),
  configurable: true,
});

describe('Notification Storage utilities', () => {
  beforeEach(() => {
    cookieMock.clear();
    // SafeCookies dual-writes to localStorage in addition to cookies; clear it
    // so state cannot leak between tests in environments where localStorage
    // is fully functional (CI / modern jsdom).
    try {
      window.localStorage.clear();
    } catch {
      // localStorage may be unavailable in some test envs; ignore.
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
  });

  describe('saveNotificationState', () => {
    it('should save notification state to cookies', () => {
      const state: NotificationState = {
        ...DEFAULT_NOTIFICATION_STATE,
        lastChecked: '2024-06-15T10:00:00Z',
      };
      
      saveNotificationState(state);
      
      const cookieValue = document.cookie;
      expect(cookieValue).toContain('fire-tools-notifications');
    });

    it('should encrypt notification data in cookies', () => {
      const notification = createNotification(
        'WELCOME',
        'Welcome to Fire Tools',
        'Start your journey to financial independence!'
      );
      
      const state: NotificationState = {
        ...DEFAULT_NOTIFICATION_STATE,
        notifications: [notification],
      };
      
      saveNotificationState(state);
      
      const cookieValue = document.cookie;
      expect(cookieValue).not.toContain('Welcome to Fire Tools');
      expect(cookieValue).not.toContain('financial independence');
    });
  });

  describe('loadNotificationState', () => {
    it('should return DEFAULT_NOTIFICATION_STATE when no state saved', () => {
      const loaded = loadNotificationState();
      
      expect(loaded).toEqual(DEFAULT_NOTIFICATION_STATE);
    });

    it('should load saved notification state', () => {
      const notification = createNotification(
        'TAX_REMINDER',
        'Tax Due',
        'Quarterly taxes are due soon!'
      );
      
      const state: NotificationState = {
        notifications: [notification],
        lastChecked: '2024-06-15T10:00:00Z',
        preferences: DEFAULT_NOTIFICATION_PREFERENCES,
      };
      
      saveNotificationState(state);
      const loaded = loadNotificationState();
      
      expect(loaded.notifications).toHaveLength(1);
      expect(loaded.notifications[0].title).toBe('Tax Due');
      expect(loaded.lastChecked).toBe('2024-06-15T10:00:00Z');
    });

    it('should handle corrupted data gracefully', () => {
      document.cookie = 'fire-tools-notifications=invalid-encrypted-data';
      
      const loaded = loadNotificationState();
      expect(loaded).toEqual(DEFAULT_NOTIFICATION_STATE);
    });

    it('should merge with defaults to ensure all fields exist', () => {
      const partialState = {
        notifications: [],
        lastChecked: null,
        preferences: {
          enableInAppNotifications: false,
        },
      };
      
      // Manually set a partial state (simulating old version)
      saveNotificationState(partialState as NotificationState);
      const loaded = loadNotificationState();
      
      // Should have merged with defaults
      expect(loaded.preferences.enableInAppNotifications).toBe(false);
      expect(loaded.preferences.newMonthReminders).toBe(DEFAULT_NOTIFICATION_PREFERENCES.newMonthReminders);
    });
  });

  describe('clearNotifications', () => {
    it('should clear all notifications but preserve preferences', () => {
      const notification = createNotification('WELCOME', 'Welcome', 'Hello!');
      const state: NotificationState = {
        notifications: [notification],
        lastChecked: '2024-06-15T10:00:00Z',
        preferences: {
          ...DEFAULT_NOTIFICATION_PREFERENCES,
          enableInAppNotifications: false,
        },
      };
      
      saveNotificationState(state);
      clearNotifications();
      
      const loaded = loadNotificationState();
      expect(loaded.notifications).toHaveLength(0);
      expect(loaded.preferences.enableInAppNotifications).toBe(false);
    });
  });

  describe('addNotification', () => {
    it('should add a new notification to the state', () => {
      const notification = createNotification(
        'NEW_MONTH',
        'New Month Started',
        'Time to log your financial data!'
      );
      
      addNotification(notification);
      
      const loaded = loadNotificationState();
      expect(loaded.notifications).toHaveLength(1);
      expect(loaded.notifications[0].title).toBe('New Month Started');
    });

    it('should add notification to the beginning of the list', () => {
      const first = createNotification('WELCOME', 'First', 'First notification');
      const second = createNotification('NEW_MONTH', 'Second', 'Second notification');
      
      addNotification(first);
      addNotification(second);
      
      const loaded = loadNotificationState();
      expect(loaded.notifications).toHaveLength(2);
      expect(loaded.notifications[0].title).toBe('Second');
      expect(loaded.notifications[1].title).toBe('First');
    });

    it('should limit total notifications to prevent cookie overflow', () => {
      // Add 60 notifications (more than the limit)
      for (let i = 0; i < 60; i++) {
        const notification = createNotification('SYSTEM', `Notification ${i}`, `Message ${i}`);
        addNotification(notification);
      }
      
      const loaded = loadNotificationState();
      // Should be capped at 50 notifications
      expect(loaded.notifications.length).toBeLessThanOrEqual(50);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark a specific notification as read', () => {
      const notification = createNotification('WELCOME', 'Welcome', 'Hello!');
      addNotification(notification);
      
      markNotificationAsRead(notification.id);
      
      const loaded = loadNotificationState();
      expect(loaded.notifications[0].read).toBe(true);
    });

    it('should not affect other notifications', () => {
      const first = createNotification('WELCOME', 'First', 'First');
      const second = createNotification('NEW_MONTH', 'Second', 'Second');
      
      addNotification(first);
      addNotification(second);
      
      markNotificationAsRead(second.id);
      
      const loaded = loadNotificationState();
      const firstNotif = loaded.notifications.find(n => n.id === first.id);
      const secondNotif = loaded.notifications.find(n => n.id === second.id);
      
      expect(firstNotif?.read).toBe(false);
      expect(secondNotif?.read).toBe(true);
    });
  });

  describe('markNotificationAsUnread', () => {
    it('should mark a read notification as unread', () => {
      const notification = createNotification('WELCOME', 'Welcome', 'Hello!');
      addNotification(notification);
      
      // First mark as read
      markNotificationAsRead(notification.id);
      let loaded = loadNotificationState();
      expect(loaded.notifications[0].read).toBe(true);
      
      // Then mark as unread
      markNotificationAsUnread(notification.id);
      loaded = loadNotificationState();
      expect(loaded.notifications[0].read).toBe(false);
    });

    it('should not affect other notifications', () => {
      const first = createNotification('WELCOME', 'First', 'First');
      const second = createNotification('NEW_MONTH', 'Second', 'Second');
      
      addNotification(first);
      addNotification(second);
      
      // Mark both as read
      markNotificationAsRead(first.id);
      markNotificationAsRead(second.id);
      
      // Then mark only first as unread
      markNotificationAsUnread(first.id);
      
      const loaded = loadNotificationState();
      const firstNotif = loaded.notifications.find(n => n.id === first.id);
      const secondNotif = loaded.notifications.find(n => n.id === second.id);
      
      expect(firstNotif?.read).toBe(false);
      expect(secondNotif?.read).toBe(true);
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should mark all notifications as read', () => {
      const first = createNotification('WELCOME', 'First', 'First');
      const second = createNotification('NEW_MONTH', 'Second', 'Second');
      
      addNotification(first);
      addNotification(second);
      
      markAllNotificationsAsRead();
      
      const loaded = loadNotificationState();
      expect(loaded.notifications.every(n => n.read)).toBe(true);
    });

    it('should update lastChecked timestamp', () => {
      const notification = createNotification('WELCOME', 'Test', 'Test');
      addNotification(notification);
      
      markAllNotificationsAsRead();
      
      const loaded = loadNotificationState();
      expect(loaded.lastChecked).toBe('2024-06-15T10:00:00.000Z');
    });
  });

  describe('deleteNotification', () => {
    it('should delete a specific notification', () => {
      const notification = createNotification('WELCOME', 'To Delete', 'Delete me');
      addNotification(notification);
      
      deleteNotification(notification.id);
      
      const loaded = loadNotificationState();
      expect(loaded.notifications).toHaveLength(0);
    });

    it('should only delete the specified notification', () => {
      const first = createNotification('WELCOME', 'Keep', 'Keep this');
      const second = createNotification('NEW_MONTH', 'Delete', 'Delete this');
      
      addNotification(first);
      addNotification(second);
      
      deleteNotification(second.id);
      
      const loaded = loadNotificationState();
      expect(loaded.notifications).toHaveLength(1);
      expect(loaded.notifications[0].title).toBe('Keep');
    });
  });

  describe('getUnreadCount', () => {
    it('should return 0 when no notifications', () => {
      const count = getUnreadCount();
      expect(count).toBe(0);
    });

    it('should return count of unread notifications', () => {
      const first = createNotification('WELCOME', 'First', 'First');
      const second = createNotification('NEW_MONTH', 'Second', 'Second');
      
      addNotification(first);
      addNotification(second);
      
      expect(getUnreadCount()).toBe(2);
      
      markNotificationAsRead(first.id);
      
      expect(getUnreadCount()).toBe(1);
    });
  });

  describe('getActiveNotifications', () => {
    it('should return all non-expired notifications', () => {
      const active = createNotification('WELCOME', 'Active', 'Still active');
      addNotification(active);
      
      const notifications = getActiveNotifications();
      expect(notifications).toHaveLength(1);
    });

    it('should filter out expired notifications', () => {
      vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
      
      const expired = createNotification('WELCOME', 'Expired', 'Expired', {
        expiresAt: '2024-06-14T10:00:00Z', // Yesterday
      });
      const active = createNotification('NEW_MONTH', 'Active', 'Still active');
      
      addNotification(expired);
      addNotification(active);
      
      const notifications = getActiveNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Active');
    });
  });

  describe('updateNotificationPreferences', () => {
    it('should update notification preferences', () => {
      const updates: Partial<NotificationPreferences> = {
        enableInAppNotifications: false,
        taxReminders: false,
      };
      
      updateNotificationPreferences(updates);
      
      const loaded = loadNotificationState();
      expect(loaded.preferences.enableInAppNotifications).toBe(false);
      expect(loaded.preferences.taxReminders).toBe(false);
      // Other preferences should remain default
      expect(loaded.preferences.newMonthReminders).toBe(true);
    });

    it('should preserve existing preferences not in the update', () => {
      // First update
      updateNotificationPreferences({ enableInAppNotifications: false });
      
      // Second update
      updateNotificationPreferences({ taxReminders: false });
      
      const loaded = loadNotificationState();
      expect(loaded.preferences.enableInAppNotifications).toBe(false);
      expect(loaded.preferences.taxReminders).toBe(false);
    });

    it('should update email preferences', () => {
      updateNotificationPreferences({
        enableEmailNotifications: true,
        emailAddress: 'test@example.com',
        emailFrequency: 'WEEKLY',
      });
      
      const loaded = loadNotificationState();
      expect(loaded.preferences.enableEmailNotifications).toBe(true);
      expect(loaded.preferences.emailAddress).toBe('test@example.com');
      expect(loaded.preferences.emailFrequency).toBe('WEEKLY');
    });

    it('should update tax reminder settings', () => {
      updateNotificationPreferences({
        taxReminderMonths: [4, 7, 10, 1],
        taxReminderDaysBefore: 14,
      });
      
      const loaded = loadNotificationState();
      expect(loaded.preferences.taxReminderMonths).toEqual([4, 7, 10, 1]);
      expect(loaded.preferences.taxReminderDaysBefore).toBe(14);
    });
  });
});
