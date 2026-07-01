import { Capacitor } from '@capacitor/core';

/** Native shell setup — safe to call on web (no-ops). */
export async function bootstrapCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // Splash/status bar use native LaunchScreen + Info.plist styling (no plugins needed).
}
