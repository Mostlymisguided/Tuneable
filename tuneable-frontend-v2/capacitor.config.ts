import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'stream.tuneable.app',
  appName: 'Tuneable',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
