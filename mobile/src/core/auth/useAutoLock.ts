/**
 * useAutoLock — tracks user interaction and locks the app after a
 * configured period of inactivity (spec §22.2).
 *
 * The hook listens to touch events via AppState and a periodic timer.
 * When the inactivity timeout is exceeded, it calls the onLock callback
 * (typically to clear the auth token and navigate to the login screen).
 *
 * The timeout is configurable via AppConfig.security.autoLockTimeoutSeconds
 * and can be overridden by server config CFG_AUTO_LOCK_TIMEOUT_SECONDS.
 */
import {useEffect, useRef, useCallback} from 'react';
import {AppState, AppStateStatus} from 'react-native';
import {AppConfig} from '../../config/appConfig';
import {getConfigNumber} from '../sync/configStore';

export function useAutoLock(onLock: () => void, enabled: boolean): void {
  const lastActivityRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockedRef = useRef<boolean>(false);

  const getTimeoutMs = useCallback((): number => {
    const configured = getConfigNumber('CFG_AUTO_LOCK_TIMEOUT_SECONDS', 0);
    const timeout = configured > 0 ? configured : AppConfig.security.autoLockTimeoutSeconds;
    return timeout * 1000;
  }, []);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    lockedRef.current = false;
  }, []);

  const checkInactivity = useCallback(() => {
    if (lockedRef.current) return;
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= getTimeoutMs()) {
      lockedRef.current = true;
      onLock();
    }
  }, [getTimeoutMs, onLock]);

  useEffect(() => {
    if (!enabled) return;

    // Start periodic check (every 10 seconds)
    intervalRef.current = setInterval(checkInactivity, 10000);

    // Listen to app state changes — when app goes to background, record the time
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // App returned to foreground — check if it was away long enough to lock
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= getTimeoutMs()) {
          lockedRef.current = true;
          onLock();
        } else {
          recordActivity();
        }
      } else if (nextState === 'background' || nextState === 'inactive') {
        // Record when app went to background
        lastActivityRef.current = Date.now();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      subscription.remove();
    };
  }, [enabled, checkInactivity, getTimeoutMs, onLock, recordActivity]);

  // Expose a function to manually record activity (e.g. on navigation events)
  // This is called via the global reference pattern
  useEffect(() => {
    (globalThis as any).__mchRecordActivity = recordActivity;
    return () => {
      delete (globalThis as any).__mchRecordActivity;
    };
  }, [recordActivity]);
}

/**
 * Call this from any screen to record user activity (resets the inactivity timer).
 * Typically called on navigation focus or scroll events.
 */
export function recordUserActivity(): void {
  const fn = (globalThis as any).__mchRecordActivity;
  if (typeof fn === 'function') fn();
}
