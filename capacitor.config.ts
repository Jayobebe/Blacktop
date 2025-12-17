import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.8006f12bbc88412abd3c677561cc727f',
  appName: 'Blacktop',
  webDir: 'dist',
  server: {
    url: 'https://8006f12b-bc88-412a-bd3c-677561cc727f.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  ios: {
    backgroundColor: '#0a0a0a',
    contentInset: 'automatic'
  },
  android: {
    backgroundColor: '#0a0a0a'
  }
};

export default config;
