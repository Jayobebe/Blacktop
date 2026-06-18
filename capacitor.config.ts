import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8006f12bbc88412abd3c677561cc727f',
  appName: 'Blacktop',
  webDir: 'dist',
  server: {
    url: 'https://convoy-comms.lovable.app',
    cleartext: true
  },
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic'
  },
  android: {
    backgroundColor: '#0a0a0a'
  },
  plugins: {
    Geolocation: {
      // iOS: Request "always" permission for background tracking
      // Android: Uses foreground service for background tracking
    }
  }
};

export default config;
