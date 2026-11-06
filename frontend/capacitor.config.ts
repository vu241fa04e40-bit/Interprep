import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hackathon.aihumanizer',
  appName: 'AI Humanizer',
  webDir: 'build',
  server: {
    cleartext: true
  }
};

export default config;