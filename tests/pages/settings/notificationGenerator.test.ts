import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  generateNewMonthNotification,
  generateNewQuarterNotification,
  generateTaxReminderNotification,
  generateWelcomeNotification,
  generateDemoTourNotifications,
  checkAndGenerateTimeBasedNotifications,
  shouldGenerateTaxReminder,
} from '../../../src/utils/notificationGenerator';
import {
  type NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
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

describe('Notification Generator', () => {
  beforeEach(() => {
    cookieMock.clear();
    try { window.localStorage.clear(); } catch { /* no-op */ }
    vi.useFakeTimers();
  });

  describe('generateNewMonthNotification', () => {
    it('should create a new month notification', () => {
      vi.setSystemTime(new Date('2024-06-01T10:00:00Z'));
      
      const notification = generateNewMonthNotification();
      
      expect(notification.type).toBe('NEW_MONTH');
      expect(notification.title).toContain('June');
      expect(notification.message).toContain('financial');
      expect(notification.actionUrl).toBe('/net-worth-tracker');
    });

    it('should set correct priority', () => {
      vi.setSystemTime(new Date('2024-06-01T10:00:00Z'));
      
      const notification = generateNewMonthNotification();
      
      expect(notification.priority).toBe('MEDIUM');
    });
  });

  describe('generateNewQuarterNotification', () => {
    it('should create a new quarter notification for Q2', () => {
      vi.setSystemTime(new Date('2024-04-01T10:00:00Z'));
      
      const notification = generateNewQuarterNotification(2);
      
      expect(notification.type).toBe('NEW_QUARTER');
      expect(notification.title).toContain('Q2');
      expect(notification.message).toContain('quarter');
    });

    it('should include action to view analytics', () => {
      const notification = generateNewQuarterNotification(1);
      
      expect(notification.actionUrl).toBe('/expense-tracker');
      expect(notification.actionLabel).toContain('Review');
    });
  });

  describe('generateTaxReminderNotification', () => {
    it('should create a tax reminder notification', () => {
      const notification = generateTaxReminderNotification('June 2024');
      
      expect(notification.type).toBe('TAX_REMINDER');
      expect(notification.title).toContain('Tax');
      expect(notification.message).toContain('June 2024');
      expect(notification.priority).toBe('HIGH');
    });

    it('should have action to track taxes', () => {
      const notification = generateTaxReminderNotification('March 2024');
      
      expect(notification.actionUrl).toBe('/net-worth-tracker');
      expect(notification.actionLabel).toContain('Track');
    });
  });

  describe('generateWelcomeNotification', () => {
    it('should create a welcome notification', () => {
      const notification = generateWelcomeNotification();
      
      expect(notification.type).toBe('WELCOME');
      expect(notification.title).toContain('Welcome');
      expect(notification.message).toContain('Financial Independence');
    });

    it('should link to settings or tour', () => {
      const notification = generateWelcomeNotification();
      
      expect(notification.actionUrl).toBeDefined();
    });
  });

  describe('generateDemoTourNotifications', () => {
    it('should generate multiple demo notifications', () => {
      vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
      
      const notifications = generateDemoTourNotifications();
      
      expect(notifications.length).toBeGreaterThanOrEqual(3);
    });

    it('should include various notification types', () => {
      const notifications = generateDemoTourNotifications();
      
      const types = notifications.map(n => n.type);
      expect(types).toContain('WELCOME');
      expect(types).toContain('NEW_MONTH');
    });

    it('should include a tax reminder in demo notifications', () => {
      const notifications = generateDemoTourNotifications();
      
      const hasTaxReminder = notifications.some(n => n.type === 'TAX_REMINDER');
      expect(hasTaxReminder).toBe(true);
    });
  });

  describe('shouldGenerateTaxReminder', () => {
    it('should return true when current month is in tax reminder months and within days before', () => {
      vi.setSystemTime(new Date('2024-03-25T10:00:00Z')); // 6 days before month end
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        taxReminderMonths: [3, 6, 9, 12],
        taxReminderDaysBefore: 7,
      };
      
      const result = shouldGenerateTaxReminder(preferences);
      
      expect(result).toBe(true);
    });

    it('should return false when not in a tax reminder month', () => {
      vi.setSystemTime(new Date('2024-05-25T10:00:00Z')); // May is not in default tax months
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        taxReminderMonths: [3, 6, 9, 12],
        taxReminderDaysBefore: 7,
      };
      
      const result = shouldGenerateTaxReminder(preferences);
      
      expect(result).toBe(false);
    });

    it('should return false when earlier in the month', () => {
      vi.setSystemTime(new Date('2024-03-10T10:00:00Z')); // Too early in the month
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        taxReminderMonths: [3, 6, 9, 12],
        taxReminderDaysBefore: 7,
      };
      
      const result = shouldGenerateTaxReminder(preferences);
      
      expect(result).toBe(false);
    });

    it('should return false when tax reminders are disabled', () => {
      vi.setSystemTime(new Date('2024-03-25T10:00:00Z'));
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        taxReminders: false,
        taxReminderMonths: [3, 6, 9, 12],
        taxReminderDaysBefore: 7,
      };
      
      const result = shouldGenerateTaxReminder(preferences);
      
      expect(result).toBe(false);
    });
  });

  describe('checkAndGenerateTimeBasedNotifications', () => {
    it('should generate new month notification on first day of month', () => {
      vi.setSystemTime(new Date('2024-06-01T10:00:00Z'));
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        enableInAppNotifications: true,
        newMonthReminders: true,
      };
      
      const notifications = checkAndGenerateTimeBasedNotifications(preferences, null);
      
      const hasNewMonth = notifications.some(n => n.type === 'NEW_MONTH');
      expect(hasNewMonth).toBe(true);
    });

    it('should generate quarter notification on first day of quarter', () => {
      vi.setSystemTime(new Date('2024-04-01T10:00:00Z')); // Q2 start
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        enableInAppNotifications: true,
        newQuarterReminders: true,
      };
      
      const notifications = checkAndGenerateTimeBasedNotifications(preferences, null);
      
      const hasNewQuarter = notifications.some(n => n.type === 'NEW_QUARTER');
      expect(hasNewQuarter).toBe(true);
    });

    it('should not generate notifications when disabled', () => {
      vi.setSystemTime(new Date('2024-06-01T10:00:00Z'));
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        enableInAppNotifications: false,
      };
      
      const notifications = checkAndGenerateTimeBasedNotifications(preferences, null);
      
      expect(notifications).toHaveLength(0);
    });

    it('should not duplicate notifications from same day', () => {
      vi.setSystemTime(new Date('2024-06-01T14:00:00Z'));
      
      const preferences: NotificationPreferences = {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        enableInAppNotifications: true,
        newMonthReminders: true,
      };
      
      // First check - should generate
      const first = checkAndGenerateTimeBasedNotifications(preferences, null);
      expect(first.some(n => n.type === 'NEW_MONTH')).toBe(true);
      
      // Second check with lastChecked from today - should not generate
      const second = checkAndGenerateTimeBasedNotifications(
        preferences,
        '2024-06-01T10:00:00Z'
      );
      expect(second.some(n => n.type === 'NEW_MONTH')).toBe(false);
    });
  });
});
