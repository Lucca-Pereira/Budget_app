// react-native-get-random-values MUST be the very first import
// so that uuid can use a cryptographically secure random source.
import 'react-native-get-random-values';

import {AppRegistry} from 'react-native';
import notifee from '@notifee/react-native';
import App from './src/App';
import {name as appName} from './app.json';

// Notifee background event handler.
// Must be registered outside of any React component, at the top level.
// This handles notification events when the app is in the background or closed.
notifee.onBackgroundEvent(async ({type, detail}) => {
  // EventType.PRESS = 1
  // We don't need to do anything special when the user taps the reminder,
  // but the handler must be registered or Notifee will log a warning.
  if (__DEV__) {
    console.log('[Notifee] Background event', type, detail.notification?.id);
  }
});

AppRegistry.registerComponent(appName, () => App);
