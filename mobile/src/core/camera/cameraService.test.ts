/**
 * Tests for the camera service (spec §16).
 *
 * Verifies that:
 * - isCameraAvailable returns false in test environment (no native module)
 * - simulateCapture returns a valid CaptureResult
 * - requestCameraPermission returns denied when camera is not available
 * - checkCameraPermission returns denied when camera is not available
 * - capturePhoto falls back to simulated capture
 * - readImageAsBase64 handles file:// paths
 * - hasTorch returns false when camera is not available
 */
import {
  isCameraAvailable,
  simulateCapture,
  requestCameraPermission,
  checkCameraPermission,
  capturePhoto,
  readImageAsBase64,
  hasTorch,
  getBackCamera,
} from './cameraService';

// Mock react-native PermissionsAndroid
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: {},
  PermissionsAndroid: {
    PERMISSIONS: { CAMERA: 'android.permission.CAMERA' },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
    },
    request: jest.fn(() => Promise.resolve('granted')),
    check: jest.fn(() => Promise.resolve(true)),
  },
  Alert: {
    alert: jest.fn(),
  },
}));

describe('cameraService — react-native-vision-camera integration (spec §16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isCameraAvailable', () => {
    it('returns false when react-native-vision-camera is not installed', () => {
      // In the test environment, the vision-camera library is not installed
      expect(isCameraAvailable()).toBe(false);
    });
  });

  describe('simulateCapture', () => {
    it('returns a valid CaptureResult with a file:// path', () => {
      const result = simulateCapture();
      expect(result.path).toMatch(/^file:\/\//);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.source).toBe('simulated');
    });

    it('generates valid paths for each call', () => {
      const result1 = simulateCapture();
      const result2 = simulateCapture();
      // Both should be valid file:// paths
      expect(result1.path).toMatch(/^file:\/\//);
      expect(result2.path).toMatch(/^file:\/\//);
    });
  });

  describe('requestCameraPermission', () => {
    it('returns denied when camera library is not available', async () => {
      const result = await requestCameraPermission();
      expect(result.granted).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('checkCameraPermission', () => {
    it('returns denied when camera library is not available', async () => {
      const result = await checkCameraPermission();
      expect(result.granted).toBe(false);
    });
  });

  describe('capturePhoto', () => {
    it('falls back to simulated capture when camera is not available', async () => {
      // Since camera is not available, capturePhoto should fall back
      // to simulateCapture instead of throwing
      const result = await capturePhoto();
      expect(result.source).toBe('simulated');
      expect(result.path).toMatch(/^file:\/\//);
    });

    it('accepts capture options', async () => {
      const result = await capturePhoto({ flash: 'on', quality: 'medium' });
      expect(result).toBeDefined();
      expect(result.source).toBe('simulated');
    });
  });

  describe('readImageAsBase64', () => {
    it('returns empty string for file:// paths', async () => {
      const result = await readImageAsBase64('file:///tmp/test.jpg');
      expect(result).toBe('');
    });

    it('returns empty string for non-file paths', async () => {
      const result = await readImageAsBase64('/tmp/test.jpg');
      expect(result).toBe('');
    });
  });

  describe('hasTorch', () => {
    it('returns false when camera is not available', async () => {
      const result = await hasTorch();
      expect(result).toBe(false);
    });
  });

  describe('getBackCamera', () => {
    it('returns null when camera is not available', async () => {
      const result = await getBackCamera();
      expect(result).toBeNull();
    });
  });
});
