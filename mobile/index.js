import {AppRegistry} from 'react-native';
import App from './src/App';
import {name as appName} from './app.json';

// Global error handler — log errors but prevent the default React Native
// behavior of crashing the app on every unhandled JS exception.
// The default handler calls RNExceptionsManager.reportException() which
// triggers a native crash. We only forward truly fatal errors.
const originalHandler = global.ErrorUtils.getGlobalHandler();
global.ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error(
    'Global error:',
    error?.message ?? error,
    isFatal ? '(fatal)' : '(non-fatal)',
  );
  // Only forward fatal errors to the original handler (which may show
  // a red screen in dev or crash in production). Non-fatal errors
  // are swallowed to prevent app crashes.
  if (isFatal && originalHandler) {
    originalHandler(error, isFatal);
  }
});

// Prevent unhandled promise rejections from crashing the app on Hermes.
// Hermes kills the app on unhandled rejections by default.
const rejectionTracker = global.ErrorUtils?.setUnhandledPromiseRejectionHandler;
if (typeof rejectionTracker === 'function') {
  const originalRejectionHandler = global.ErrorUtils?.getUnhandledPromiseRejectionHandler?.();
  global.ErrorUtils?.setUnhandledPromiseRejectionHandler?.((id, rejection) => {
    const message =
      rejection?.message ?? rejection?.toString?.() ?? 'Unknown rejection';
    console.error('Unhandled promise rejection:', message);
    // Swallow — do not forward to original handler to prevent crash
  });
}

AppRegistry.registerComponent(appName, () => App);
