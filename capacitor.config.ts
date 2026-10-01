import type { CapacitorConfig } from '@capacitor/cli';

// Two ways to build the shells:
// - `npm run cap:sync` (default): the shell loads the live site, so it always
//   runs the deployed web build. For testing on a phone.
// - `npm run cap:sync:store`: the app's own files are bundled in (CAP_BUNDLED=1),
//   so a cold start works offline. This is the store build.
const bundled = process.env.CAP_BUNDLED === '1';

const config: CapacitorConfig = {
  appId: 'com.blacktoplive.app',
  appName: 'Blacktop',
  webDir: 'dist',

  ...(bundled
    ? {}
    : {
        server: {
          url: 'https://blacktoplive.com',
          cleartext: false,
        },
      }),

  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic',
    // Allows WKWebView to use camera / mic without additional prompts
    allowsLinkPreview: false,
    scrollEnabled: false,
  },

  android: {
    backgroundColor: '#0a0a0a',
    // The legacy bridge keeps ride GPS (background-geolocation) coming after
    // 5 minutes in the background; the newer one lets Android throttle it.
    useLegacyBridge: true,
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
