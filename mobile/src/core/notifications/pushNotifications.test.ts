/**
 * Tests for push notification service (spec §27).
 *
 * Verifies:
 * - getFcmToken returns token or error
 * - subscribeToTopic / unsubscribeFromTopic
 * - showLocalNotification displays notification
 * - sanitizeNotificationBody removes clinical terms
 * - initPushNotifications full flow
 * - unregisterPushNotifications
 */
import {
  getFcmToken,
  subscribeToTopic,
  unsubscribeFromTopic,
  showLocalNotification,
  sanitizeNotificationBody,
  initPushNotifications,
  unregisterPushNotifications,
} from './pushNotifications';

// Mock NativeModules
jest.mock('react-native', () => ({
  NativeModules: {
    PushNotificationModule: {
      getToken: jest.fn(),
      subscribeToTopic: jest.fn(),
      unsubscribeFromTopic: jest.fn(),
      createNotificationChannels: jest.fn(),
      showLocalNotification: jest.fn(),
    },
  },
  Platform: {OS: 'android'},
}));

// Mock audit
jest.mock('../utils/audit', () => ({
  logLocalAudit: jest.fn(),
}));

describe('Push Notifications Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFcmToken', () => {
    it('returns token when FCM is available', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.getToken.mockResolvedValue({
        token: 'fcm_token_123',
      });

      const result = await getFcmToken();
      expect(result.token).toBe('fcm_token_123');
      expect(result.error).toBeUndefined();
    });

    it('returns error when FCM unavailable', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.getToken.mockResolvedValue({
        token: '',
        error: 'FCM not available',
      });

      const result = await getFcmToken();
      expect(result.token).toBe('');
      expect(result.error).toBe('FCM not available');
    });
  });

  describe('subscribeToTopic', () => {
    it('returns success on valid topic', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.subscribeToTopic.mockResolvedValue({
        success: true,
      });

      const result = await subscribeToTopic('org_123');
      expect(result.success).toBe(true);
    });

    it('returns failure on error', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.subscribeToTopic.mockResolvedValue({
        success: false,
        error: 'Subscribe failed',
      });

      const result = await subscribeToTopic('invalid_topic');
      expect(result.success).toBe(false);
    });
  });

  describe('unsubscribeFromTopic', () => {
    it('returns success', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.unsubscribeFromTopic.mockResolvedValue({
        success: true,
      });

      const result = await unsubscribeFromTopic('org_123');
      expect(result.success).toBe(true);
    });
  });

  describe('showLocalNotification', () => {
    it('shows notification with sanitized body', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.showLocalNotification.mockResolvedValue({
        success: true,
      });

      const result = await showLocalNotification('New Task', 'You have 1 new item', false);
      expect(result.success).toBe(true);
    });

    it('shows urgent notification', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.showLocalNotification.mockResolvedValue({
        success: true,
      });

      const result = await showLocalNotification('Urgent Alert', 'New referral received', true);
      expect(result.success).toBe(true);
    });
  });

  describe('sanitizeNotificationBody', () => {
    it('passes through non-clinical messages', () => {
      expect(sanitizeNotificationBody('You have a new task')).toBe('You have a new task');
      expect(sanitizeNotificationBody('Sync completed successfully')).toBe('Sync completed successfully');
      expect(sanitizeNotificationBody('You have 3 items in your worklist')).toBe('You have 3 items in your worklist');
    });

    it('sanitizes messages containing pregnancy', () => {
      const result = sanitizeNotificationBody('New pregnancy alert for patient');
      expect(result).toBe('You have a new notification. Open the app to view details.');
      expect(result).not.toContain('pregnancy');
    });

    it('sanitizes messages containing danger signs', () => {
      const result = sanitizeNotificationBody('Danger sign: severe headache reported');
      expect(result).toBe('You have a new notification. Open the app to view details.');
      expect(result).not.toContain('danger sign');
      expect(result).not.toContain('headache');
    });

    it('sanitizes messages containing diagnosis', () => {
      const result = sanitizeNotificationBody('New diagnosis: preeclampsia');
      expect(result).toBe('You have a new notification. Open the app to view details.');
      expect(result).not.toContain('diagnosis');
      expect(result).not.toContain('preeclampsia');
    });

    it('sanitizes messages containing blood pressure', () => {
      const result = sanitizeNotificationBody('Blood pressure reading: 160/110');
      expect(result).toBe('You have a new notification. Open the app to view details.');
      expect(result).not.toContain('blood pressure');
    });

    it('sanitizes messages containing HIV', () => {
      const result = sanitizeNotificationBody('HIV test result available');
      expect(result).toBe('You have a new notification. Open the app to view details.');
      expect(result).not.toContain('HIV');
    });
  });

  describe('initPushNotifications', () => {
    it('returns token on successful init', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.createNotificationChannels.mockResolvedValue({success: true});
      NativeModules.PushNotificationModule.getToken.mockResolvedValue({token: 'fcm_token_123'});
      NativeModules.PushNotificationModule.subscribeToTopic.mockResolvedValue({success: true});

      const token = await initPushNotifications('org_123', 'region_northern');
      expect(token).toBe('fcm_token_123');
    });

    it('returns null when FCM unavailable', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.createNotificationChannels.mockResolvedValue({success: true});
      NativeModules.PushNotificationModule.getToken.mockResolvedValue({token: '', error: 'FCM not available'});

      const token = await initPushNotifications('org_123');
      expect(token).toBeNull();
    });
  });

  describe('unregisterPushNotifications', () => {
    it('unsubscribes from all topics', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.PushNotificationModule.unsubscribeFromTopic.mockResolvedValue({success: true});

      await unregisterPushNotifications('org_123', 'region_northern');
      // Should have been called 3 times: org, region, all_users
      expect(NativeModules.PushNotificationModule.unsubscribeFromTopic).toHaveBeenCalledTimes(3);
    });
  });
});
