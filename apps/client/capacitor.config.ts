import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kartarenasi.app',
  appName: 'Kart Arenası',
  webDir: 'dist',
  backgroundColor: '#2B1A12',
  android: { allowMixedContent: true },
  server: { androidScheme: 'https' },
};

export default config;
