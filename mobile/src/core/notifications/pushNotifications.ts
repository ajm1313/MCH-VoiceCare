/**
 * Push notification service using Firebase Cloud Messaging (spec §27).
 *
 * Wraps the native PushNotificationModule to provide:
 * - FCM token registration
 * - Topic subscription for org-scoped notifications
 * - Local notification display for foreground messages
 * - Notification channel management
 *
 * Privacy (spec §26): notification content MUST NOT include clinical
 * details (diagnosis, danger signs, pregnancy status). Only generic
 * messages like "You have a new task" are shown. Clinical details are
 * only visible inside the authenticated app.
 */
import {NativeModules, Platform} from 'react-native';
import {logLocalAudit} from '../utils/audit';

const {PushNotificationModule} = NativeModules;

export interface FcmTokenResult {
  token: string;
  error?: string;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
}

/**
 * Initialize push notifications.
 * Creates notification channels and registers the FCM token.
 *
 * @param orgUnitId  Organisation unit ID for topic subscription
 * @param regionId   Optional region ID for regional notifications
 * @returns FCM token, or null if FCM is unavailable
 */
export async function initPushNotifications(
  orgUnitId: string,
  regionId?: string,
): Promise<string | null> {
  if (!PushNotificationModule || Platform.OS !== 'android') {
    return null;
  }

  // Create notification channels
  try {
    await PushNotificationModule.createNotificationChannels();
  } catch {
    // Non-fatal — channels may already exist
  }

  // Get FCM token
  const tokenResult = await getFcmToken();
  if (!tokenResult.token) {
    return null;
  }

  // Subscribe to org-scoped topic
  await subscribeToTopic(`org_${orgUnitId}`);

  // Subscribe to regional topic if provided
  if (regionId) {
    await subscribeToTopic(`region_${regionId}`);
  }

  // Subscribe to global broadcast topic
  await subscribeToTopic('all_users');

  logLocalAudit({
    action: 'PUSH_NOTIFICATION_REGISTERED',
    entity_type: 'device',
    details: {orgUnitId, regionId},
  });

  return tokenResult.token;
}

/**
 * Get the FCM token for this device.
 */
export async function getFcmToken(): Promise<FcmTokenResult> {
  if (!PushNotificationModule || Platform.OS !== 'android') {
    return {token: '', error: 'FCM not available on this platform'};
  }
  try {
    const result = await PushNotificationModule.getToken();
    return {
      token: result.token || '',
      error: result.error,
    };
  } catch (err: any) {
    return {token: '', error: err?.message || 'Failed to get FCM token'};
  }
}

/**
 * Subscribe to an FCM topic.
 * Topics are used for org-scoped and regional notifications.
 */
export async function subscribeToTopic(topic: string): Promise<NotificationResult> {
  if (!PushNotificationModule || Platform.OS !== 'android') {
    return {success: false, error: 'FCM not available'};
  }
  try {
    const result = await PushNotificationModule.subscribeToTopic(topic);
    return {
      success: result.success as boolean,
      error: result.error,
    };
  } catch (err: any) {
    return {success: false, error: err?.message || 'Subscribe failed'};
  }
}

/**
 * Unsubscribe from an FCM topic.
 */
export async function unsubscribeFromTopic(topic: string): Promise<NotificationResult> {
  if (!PushNotificationModule || Platform.OS !== 'android') {
    return {success: false, error: 'FCM not available'};
  }
  try {
    const result = await PushNotificationModule.unsubscribeFromTopic(topic);
    return {
      success: result.success as boolean,
      error: result.error,
    };
  } catch (err: any) {
    return {success: false, error: err?.message || 'Unsubscribe failed'};
  }
}

/**
 * Show a local notification (for foreground FCM messages).
 *
 * PRIVACY (spec §26): The body MUST be sanitized before calling this.
 * No clinical details, diagnosis, danger signs, or pregnancy status.
 * Use sanitizeNotificationBody() to ensure compliance.
 *
 * @param title   Notification title (generic, e.g. "New Task")
 * @param body    Sanitized body (e.g. "You have 1 new item in your worklist")
 * @param urgent  If true, uses high-importance channel with vibration
 */
export async function showLocalNotification(
  title: string,
  body: string,
  urgent: boolean = false,
): Promise<NotificationResult> {
  if (!PushNotificationModule || Platform.OS !== 'android') {
    return {success: false, error: 'Notifications not available'};
  }

  // Double-check sanitization (spec §26)
  const sanitized = sanitizeNotificationBody(body);

  try {
    const result = await PushNotificationModule.showLocalNotification(
      title,
      sanitized,
      urgent,
    );
    return {
      success: result.success as boolean,
      error: result.error,
    };
  } catch (err: any) {
    return {success: false, error: err?.message || 'Failed to show notification'};
  }
}

/**
 * Sanitize notification body to comply with spec §26.
 *
 * Removes any clinical terms that must not appear in notifications.
 * The notification should only indicate that something needs attention,
 * not what the clinical content is.
 */
const CLINICAL_TERMS = [
  'pregnant', 'pregnancy', 'anc', 'danger sign', 'hemorrhage', 'eclampsia',
  'preeclampsia', 'sepsis', 'obstructed', 'miscarriage', 'abortion',
  'hiv', 'aids', 'sti', 'std', 'tuberculosis', 'tb',
  'diagnosis', 'diagnosed', 'positive', 'negative', 'abnormal',
  'blood pressure', 'bp ', 'fetal', 'foetal', 'stillbirth',
];

export function sanitizeNotificationBody(body: string): string {
  const lower = body.toLowerCase();
  for (const term of CLINICAL_TERMS) {
    if (lower.includes(term)) {
      // Replace with generic message
      return 'You have a new notification. Open the app to view details.';
    }
  }
  return body;
}

/**
 * Unregister from push notifications (on logout).
 */
export async function unregisterPushNotifications(
  orgUnitId: string,
  regionId?: string,
): Promise<void> {
  await unsubscribeFromTopic(`org_${orgUnitId}`);
  if (regionId) {
    await unsubscribeFromTopic(`region_${regionId}`);
  }
  await unsubscribeFromTopic('all_users');

  logLocalAudit({
    action: 'PUSH_NOTIFICATION_UNREGISTERED',
    entity_type: 'device',
    details: {orgUnitId},
  });
}
