import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.milacoach.app',
  appName: 'MilaCoach',
  webDir: 'www',
  // The app is a server-rendered Next.js site (SSR + API proxy + cookie login),
  // so it cannot be exported statically. Instead the native shell loads the live
  // site directly. The `www` webDir above is only a placeholder for `cap sync`.
  server: {
    url: 'https://www.mila-coach.com',
    cleartext: false,
    allowNavigation: ['www.mila-coach.com', 'mila-coach.com'],
  },
  // Dark native shell so there is no white flash before/while the live site loads.
  backgroundColor: '#050504',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#050504',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
