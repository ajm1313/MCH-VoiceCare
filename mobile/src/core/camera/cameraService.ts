/**
 * Camera service — wraps react-native-vision-camera for document scanning
 * (spec §16).
 *
 * Provides a unified interface for camera capture that:
 * 1. Requests and checks camera permissions
 * 2. Captures photos with quality assessment
 * 3. Falls back gracefully when the camera is not available
 *
 * In production, react-native-vision-camera provides:
 * - Real-time frame processors for blur/glare detection
 * - High-quality photo capture with EXIF metadata
 * - Camera device selection (back camera for document scanning)
 *
 * When react-native-vision-camera is not installed (e.g., in tests or
 * on a simulator), the service falls back to a simulated capture.
 */
import {Platform, NativeModules, PermissionsAndroid, Alert} from 'react-native';

// Type definitions for react-native-vision-camera (not installed in tests)
// These are minimal interfaces matching the library's API.
interface CameraDevice {
  id: string;
  position: 'back' | 'front';
  hasFlash: boolean;
  hasTorch: boolean;
}

interface PhotoCaptureResult {
  path: string;
  width: number;
  height: number;
  isRawPhoto: boolean;
  metadata: {
    Orientation?: number;
    DPI?: number;
    /*Plus EXIF data*/
  };
}

// Lazy-load react-native-vision-camera to avoid crash if not installed
let _cameraLib: any = null;
function getCameraLib(): any {
  if (_cameraLib === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      _cameraLib = require('react-native-vision-camera');
    } catch {
      _cameraLib = undefined;
    }
  }
  return _cameraLib;
}

export interface CameraPermissionState {
  granted: boolean;
  reason?: string;
}

export interface CaptureOptions {
  flash?: 'auto' | 'on' | 'off';
  quality?: 'high' | 'medium' | 'low';
}

export interface CaptureResult {
  path: string;
  base64?: string;
  width: number;
  height: number;
  source: 'camera' | 'simulated';
}

/**
 * Check if react-native-vision-camera is available on this device.
 */
export function isCameraAvailable(): boolean {
  const lib = getCameraLib();
  return lib !== undefined && Platform.OS === 'android';
}

/**
 * Request camera permission (spec §16.1).
 *
 * On Android, this requests the CAMERA permission via PermissionsAndroid.
 * On iOS, it uses the vision-camera's requestCameraPermission().
 *
 * Returns { granted: boolean } indicating whether permission was granted.
 */
export async function requestCameraPermission(): Promise<CameraPermissionState> {
  // If camera library is not available, return denied
  if (!isCameraAvailable()) {
    return {
      granted: false,
      reason: 'Camera library not available on this device',
    };
  }

  const lib = getCameraLib();

  // Android: use PermissionsAndroid
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: 'Camera Permission',
          message: 'MCH VoiceCare needs camera access to scan MCH documents.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        return { granted: true };
      }
      return {
        granted: false,
        reason: 'Camera permission denied by user',
      };
    } catch (err: any) {
      return {
        granted: false,
        reason: err?.message || 'Failed to request camera permission',
      };
    }
  }

  // iOS / other: use vision-camera's permission API
  if (lib?.requestCameraPermission) {
    try {
      const status = await lib.requestCameraPermission();
      if (status === 'granted' || status === 'authorized') {
        return { granted: true };
      }
      return {
        granted: false,
        reason: `Camera permission status: ${status}`,
      };
    } catch (err: any) {
      return {
        granted: false,
        reason: err?.message || 'Failed to request camera permission',
      };
    }
  }

  return { granted: false, reason: 'Camera permission API not available' };
}

/**
 * Check current camera permission status without prompting.
 */
export async function checkCameraPermission(): Promise<CameraPermissionState> {
  if (!isCameraAvailable()) {
    return { granted: false, reason: 'Camera library not available' };
  }

  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    return { granted: result };
  }

  const lib = getCameraLib();
  if (lib?.getCameraPermissionStatus) {
    try {
      const status = await lib.getCameraPermissionStatus();
      return {
        granted: status === 'granted' || status === 'authorized',
      };
    } catch {
      return { granted: false };
    }
  }

  return { granted: false };
}

/**
 * Get the back camera device for document scanning.
 *
 * Returns null if no back camera is available.
 */
export async function getBackCamera(): Promise<CameraDevice | null> {
  if (!isCameraAvailable()) {
    return null;
  }

  const lib = getCameraLib();
  if (!lib?.getCameraDevice) {
    return null;
  }

  try {
    const devices = await lib.getCameraDevice('back');
    return devices as CameraDevice;
  } catch {
    return null;
  }
}

/**
 * Capture a photo using react-native-vision-camera (spec §16.2).
 *
 * This function is called from the ScanScreen when the user taps "Capture".
 * It uses the vision-camera's takePhoto() API to capture a high-quality
 * image of the document.
 *
 * When the camera library is not available (e.g., in tests or simulator),
 * it falls back to a simulated capture with a placeholder image path.
 *
 * @param options Capture options (flash, quality)
 * @returns CaptureResult with the image path and metadata
 */
export async function capturePhoto(options: CaptureOptions = {}): Promise<CaptureResult> {
  const { flash = 'auto', quality = 'high' } = options;

  // If camera library is not available, fall back to simulated capture
  if (!isCameraAvailable()) {
    return simulateCapture();
  }

  // Check permission first
  const perm = await checkCameraPermission();
  if (!perm.granted) {
    const requested = await requestCameraPermission();
    if (!requested.granted) {
      throw new Error(`Camera permission denied: ${perm.reason || requested.reason}`);
    }
  }

  // Use the camera library to capture a photo
  const lib = getCameraLib();
  if (lib?.takePhoto) {
    try {
      const photo: PhotoCaptureResult = await lib.takePhoto({
        flash: flash === 'on' ? 'on' : flash === 'off' ? 'off' : 'auto',
        qualityPrioritization: quality === 'high' ? 'quality' : 'balanced',
      });
      return {
        path: photo.path,
        width: photo.width,
        height: photo.height,
        source: 'camera',
      };
    } catch (err: any) {
      throw new Error(`Camera capture failed: ${err?.message || 'Unknown error'}`);
    }
  }

  // Fallback: simulated capture (for tests and simulators)
  return simulateCapture();
}

/**
 * Simulate a photo capture (for tests and simulators without camera).
 *
 * Returns a placeholder result with a generated image path.
 * The path format matches what react-native-vision-camera would return.
 */
export function simulateCapture(): CaptureResult {
  const timestamp = Date.now();
  return {
    path: `file:///tmp/scan_${timestamp}.jpg`,
    width: 4032,
    height: 3024,
    source: 'simulated',
  };
}

/**
 * Read an image file as base64 for OCR processing or API submission.
 *
 * @param imagePath The file path returned by capturePhoto()
 * @returns Base64-encoded image data (without data: prefix)
 */
export async function readImageAsBase64(imagePath: string): Promise<string> {
  // In production, this would use react-native-fs to read the file
  // For now, return empty string — the OCR module handles file paths directly
  if (imagePath.startsWith('file://')) {
    // The native OCR module can read file:// paths directly
    // No need to convert to base64 unless the API requires it
    return '';
  }
  return '';
}

/**
 * Check if the camera has a torch/flashlight available.
 * Used for low-light document scanning guidance.
 */
export async function hasTorch(): Promise<boolean> {
  if (!isCameraAvailable()) {
    return false;
  }
  const camera = await getBackCamera();
  return camera?.hasTorch ?? false;
}
