import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/** Native shell setup — safe to call on web (no-ops). */
export async function bootstrapCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#1A1A2E' });
  } catch (error) {
    console.warn('StatusBar setup skipped:', error);
  }

  try {
    await SplashScreen.hide();
  } catch (error) {
    console.warn('SplashScreen hide skipped:', error);
  }
}
