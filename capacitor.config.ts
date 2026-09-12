import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.blacktoplive.app',
  appName: 'Blacktop',
  webDir: 'dist',

  // Remote URL so the native shell always runs the deployed production build.
  // When self-hosting is set up, swap this to your own domain and remove the
  // cleartext flag. To ship fully bundled assets instead (no internet required
  // to load the app), remove the entire `server` block and run `npx cap sync`.
  server: {
    url: 'https://blacktoplive.com',
    cleartext: false,
  },

  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic',
    // Allows WKWebView to use camera / mic without additional prompts
    allowsLinkPreview: false,
    scrollEnabled: false,
  },

  android: {
    backgroundColor: '#0a0a0a',
    // Keeps the splash screen dark to match the app theme
    useLegacyBridge: false,
  },

  plugins: {
    // Geolocation — request fine accuracy; iOS "always" permission enables
    // background location updates while a ride is active.
    Geolocation: {
      iosLocationTitle: 'Blacktop needs your location',
      iosLocationMessage:
        'Your GPS position is used during rides to track distance and sync your location with convoy members. It is never shared outside an active ride.',
    },

    // Push notifications — not used yet; placeholder so the permission string
    // is available if local crash-alert notifications are added later.
    PushNotifications: {
      presentationOptions: ['alert', 'sound'],
    },

    // LocalNotifications — used by the crash detection confirmation timer.
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#F97316',
      sound: 'default',
    },
  },
};

export default config;
