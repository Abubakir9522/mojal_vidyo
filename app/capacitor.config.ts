import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uz.mojal.video',
  appName: "Mo'jal Video",
  webDir: 'dist',
  android: { allowMixedContent: false, backgroundColor: '#11142a' },
  plugins: {
    SplashScreen: { launchShowDuration: 500, backgroundColor: '#11142a', showSpinner: false },
    StatusBar: { backgroundColor: '#11142a', style: 'DARK', overlaysWebView: false },
  },
};
export default config;
