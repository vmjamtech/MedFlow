import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.medflow.app',
  appName: 'MedFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#fffbfe',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
    LocalNotifications: {
      requestPermission: true,
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#14b8a6',
    },
  },
};

export default config;
