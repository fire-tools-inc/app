/**
 * Notification System Types
 * Data model for in-app notifications and notification preferences
 */

/**
 * Notification types for different events
 */
export type NotificationType = 
  | 'NEW_MONTH'           // Reminder to log new month data
  | 'NEW_QUARTER'         // New quarter started
  | 'TAX_REMINDER'        // Tax payment reminder
  | 'INCOME_LOGGED'       // New income was logged
  | 'EXPENSE_LOGGED'      // New expense was logged
  | 'NET_WORTH_UPDATE'    // Net worth tracking reminder
  | 'DCA_REMINDER'        // Dollar cost averaging reminder
  | 'FIRE_MILESTONE'      // FIRE goal milestone reached
  | 'PORTFOLIO_REBALANCE' // Portfolio needs rebalancing
  | 'SYSTEM'              // General system notification
  | 'WELCOME';            // Welcome notification for new users

/**
 * Priority levels for notifications
 */
export type NotificationPriority = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Individual notification structure
 */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string; // ISO date string
  read: boolean;
  priority: NotificationPriority;
  actionUrl?: string; // Optional URL to navigate to when clicking notification
  actionLabel?: string; // Optional label for the action button
  expiresAt?: string; // Optional expiration date (ISO string)
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  // In-app notification settings
  enableInAppNotifications: boolean;

  // Native OS notifications (Electron / browser Notification API)
  enableNativeNotifications: boolean;

  // Specific notification type toggles
  newMonthReminders: boolean;
  newQuarterReminders: boolean;
  taxReminders: boolean;
  dcaReminders: boolean;
  portfolioAlerts: boolean;
  fireMilestones: boolean;
  
  // Email settings (placeholder - client-side only, would need backend)
  enableEmailNotifications: boolean;
  emailAddress: string;
  emailFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'NEVER';
  
  // Tax reminder settings
  taxReminderMonths: number[]; // Months (1-12) when tax reminders should be sent
  taxReminderDaysBefore: number; // Days before end of month to send reminder
}

/**
 * Notification storage state
 */
export interface NotificationState {
  notifications: Notification[];
  lastChecked: string | null; // ISO date string of last check
  preferences: NotificationPreferences;
}

/**
 * Default notification preferences
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enableInAppNotifications: true,
  enableNativeNotifications: true,
  newMonthReminders: true,
  newQuarterReminders: true,
  taxReminders: true,
  dcaReminders: true,
  portfolioAlerts: true,
  fireMilestones: true,
  enableEmailNotifications: false,
  emailAddress: '',
  emailFrequency: 'NEVER',
  taxReminderMonths: [3, 6, 9, 12], // End of each quarter
  taxReminderDaysBefore: 7,
};

/**
 * Default notification state
 */
export const DEFAULT_NOTIFICATION_STATE: NotificationState = {
  notifications: [],
  lastChecked: null,
  preferences: DEFAULT_NOTIFICATION_PREFERENCES,
};

/**
 * Generate unique notification ID
 */
export function generateNotificationId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new notification
 */
export function createNotification(
  type: NotificationType,
  title: string,
  message: string,
  options?: {
    priority?: NotificationPriority;
    actionUrl?: string;
    actionLabel?: string;
    expiresAt?: string;
  }
): Notification {
  return {
    id: generateNotificationId(),
    type,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
    priority: options?.priority ?? 'MEDIUM',
    actionUrl: options?.actionUrl,
    actionLabel: options?.actionLabel,
    expiresAt: options?.expiresAt,
  };
}

/**
 * Notification type display info
 */
export interface NotificationTypeInfo {
  type: NotificationType;
  icon: string;
  defaultTitle: string;
}

export const NOTIFICATION_TYPE_INFO: NotificationTypeInfo[] = [
  { type: 'NEW_MONTH', icon: 'calendar_today', defaultTitle: 'New Month' },
  { type: 'NEW_QUARTER', icon: 'event_note', defaultTitle: 'New Quarter' },
  { type: 'TAX_REMINDER', icon: 'account_balance', defaultTitle: 'Tax Reminder' },
  { type: 'INCOME_LOGGED', icon: 'trending_up', defaultTitle: 'Income Logged' },
  { type: 'EXPENSE_LOGGED', icon: 'trending_down', defaultTitle: 'Expense Logged' },
  { type: 'NET_WORTH_UPDATE', icon: 'bar_chart', defaultTitle: 'Net Worth Update' },
  { type: 'DCA_REMINDER', icon: 'payments', defaultTitle: 'DCA Reminder' },
  { type: 'FIRE_MILESTONE', icon: 'local_fire_department', defaultTitle: 'FIRE Milestone' },
  { type: 'PORTFOLIO_REBALANCE', icon: 'balance', defaultTitle: 'Rebalancing' },
  { type: 'SYSTEM', icon: 'info', defaultTitle: 'System' },
  { type: 'WELCOME', icon: 'waving_hand', defaultTitle: 'Welcome' },
];

/**
 * Get notification type info
 */
export function getNotificationTypeInfo(type: NotificationType): NotificationTypeInfo {
  return NOTIFICATION_TYPE_INFO.find(info => info.type === type) 
    ?? { type: 'SYSTEM', icon: 'info', defaultTitle: 'Notification' };
}
