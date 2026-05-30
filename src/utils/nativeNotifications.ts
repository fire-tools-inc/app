/**
 * Native OS notifications.
 *
 * Strategy:
 *  1. In Electron, prefer the main-process `Notification` API via the
 *     `fireTools.showNativeNotification` IPC bridge — guarantees true
 *     OS-native toasts on macOS / Windows / Linux even on `file://` origins
 *     where the renderer's `Notification` constructor may not behave.
 *  2. In a regular browser, fall back to the Web Notification API after
 *     requesting permission. Best-effort: silently no-op if blocked.
 */

import type { Notification as AppNotification } from '../types/notification';

interface NativeNotificationBridge {
  showNativeNotification?: (opts: {
    title: string;
    body: string;
    urgency?: 'low' | 'normal' | 'critical';
  }) => Promise<boolean>;
}

const getBridge = (): NativeNotificationBridge | undefined => {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { fireTools?: NativeNotificationBridge }).fireTools;
};

const isElectron = (): boolean => Boolean(getBridge()?.showNativeNotification);

/**
 * Request permission to show Web Notifications. No-op in Electron (handled
 * by main process). Returns true if granted (or in Electron).
 */
export async function ensureNativeNotificationPermission(): Promise<boolean> {
  if (isElectron()) return true;
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
}

const priorityToUrgency = (
  priority: AppNotification['priority']
): 'low' | 'normal' | 'critical' => {
  if (priority === 'HIGH') return 'critical';
  if (priority === 'LOW') return 'low';
  return 'normal';
};

/**
 * Show a native OS notification for the given app notification. Returns
 * true if the notification was successfully dispatched (best-effort).
 */
export async function showNativeNotification(
  notification: Pick<AppNotification, 'title' | 'message' | 'priority'>
): Promise<boolean> {
  const title = notification.title;
  const body = notification.message;
  const urgency = priorityToUrgency(notification.priority);

  const bridge = getBridge();
  if (bridge?.showNativeNotification) {
    try {
      return await bridge.showNativeNotification({ title, body, urgency });
    } catch (error) {
      console.error('Failed to show native notification via Electron:', error);
      return false;
    }
  }

  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }

  if (Notification.permission !== 'granted') {
    // Permission not granted — caller should have requested via
    // ensureNativeNotificationPermission() first.
    return false;
  }

  try {
    new Notification(title, { body });
    return true;
  } catch (error) {
    console.error('Failed to show web notification:', error);
    return false;
  }
}
