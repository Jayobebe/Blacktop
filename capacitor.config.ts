import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blacktoplive.app',
  appName: 'Blacktop',
  webDir: 'dist',

  // Assets are bundled locally for store submissions.
  // Run `npm run build && npx cap sync` before opening in Android Studio / Xcode.
  // If you ever need to point at a remote URL for testing, temporarily add:
  //   server: { url: 'https://blacktoplive.com', cleartext: false }

  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: false,
    // Required for background GPS during active rides
    backgroundModes: ['location'],
  },

  android: {
    backgroundColor: '#0a0a0a',
    useLegacyBridge: false,
  },

  plugins: {
    Geolocation: {
      iosLocationTitle: 'Blacktop needs your location',
      iosLocationMessage:
        'Your GPS position is used during rides to track distance and sync your location with convoy members. It is never shared outside an active ride.',
    },

    PushNotifications: {
      presentationOptions: ['alert', 'sound'],
    },

    LocalNotifications: {
      // Replace with your actual Android notification icon asset name
      smallIcon: 'ic_notification',
      iconColor: '#F97316',
      sound: 'default',
    },
  },
};

export default config;
