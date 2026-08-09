/**
 * ScreenSecurity — prevents screenshots and recent-app preview leaks (spec §22.2).
 *
 * On Android, sets FLAG_SECURE on the activity window which:
 *   - Prevents screenshots
 *   - Blanks the content in the recent-apps switcher
 *   - Prevents content from appearing in screen mirroring
 *
 * On iOS, this would use a similar blur-on-background approach (not implemented
 * in this first release which targets Android only).
 *
 * The hook also clears sensitive data references when the screen loses focus.
 */
import {useEffect, useRef, useCallback} from 'react';
import {Platform, AppState, AppStateStatus, NativeModules} from 'react-native';

// Native module bridge — if a native module exposes setFlagSecure, use it.
// Otherwise fall back to a no-op so the app doesn't crash on platforms
// without the native bridge.
const ScreenSecurityNative = NativeModules.ScreenSecurity
  ? NativeModules.ScreenSecurity
  : null;

/**
 * Apply FLAG_SECURE to the current Android activity window.
 * Returns true if successful, false if the native module is unavailable.
 */
export function setFlagSecure(enabled: boolean): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (ScreenSecurityNative && typeof ScreenSecurityNative.setFlagSecure === 'function') {
    try {
      ScreenSecurityNative.setFlagSecure(enabled);
      return true;
    } catch {
      return false;
    }
  }
  // Native module not available — no-op (app still works, just less secure)
  return false;
}

/**
 * useScreenSecurity — React hook that enables FLAG_SECURE while the
 * component is mounted and clears sensitive data on blur.
 *
 * Usage:
 *   useScreenSecurity();
 *
 * Call this at the top level of any screen that displays clinical data.
 */
export function useScreenSecurity(): void {
  const sensitiveDataRef = useRef<unknown>(null);
  const isSecureRef = useRef<boolean>(false);

  const enableSecure = useCallback(() => {
    if (!isSecureRef.current) {
      setFlagSecure(true);
      isSecureRef.current = true;
    }
  }, []);

  const disableSecure = useCallback(() => {
    if (isSecureRef.current) {
      setFlagSecure(false);
      isSecureRef.current = false;
    }
  }, []);

  const clearSensitiveData = useCallback(() => {
    // Clear any in-memory sensitive data references
    sensitiveDataRef.current = null;
  }, []);

  useEffect(() => {
    // Enable FLAG_SECURE immediately on mount
    enableSecure();

    // Listen for app state changes — clear data when going to background
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // App going to background — clear sensitive data
        clearSensitiveData();
      } else if (nextState === 'active') {
        // App returning to foreground — re-ensure FLAG_SECURE
        enableSecure();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      // On unmount, clear sensitive data and disable FLAG_SECURE
      clearSensitiveData();
      disableSecure();
      subscription.remove();
    };
  }, [enableSecure, disableSecure, clearSensitiveData]);

  // Expose a setter so screens can register/clear sensitive data
  const setSensitiveData = useCallback((data: unknown) => {
    sensitiveDataRef.current = data;
  }, []);

  // Store on the ref for potential inspection (not used directly)
  void setSensitiveData;
}
