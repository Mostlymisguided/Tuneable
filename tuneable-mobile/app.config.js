/**
 * Extends app.json. Production / EAS builds should set EXPO_PUBLIC_API_URL
 * (see eas.json). Local .env still wins for development.
 */
export default ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    buildNumber: process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber || '1',
    usesAppleSignIn: true,
    infoPlist: {
      ...(config.ios?.infoPlist || {}),
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        config.ios?.infoPlist?.NSLocationWhenInUseUsageDescription ||
        'Tuneable uses your location so tips can influence charts where you are.',
    },
  },
  android: {
    ...config.android,
    versionCode: Number(
      process.env.ANDROID_VERSION_CODE || config.android?.versionCode || 1
    ),
  },
  extra: {
    ...(config.extra || {}),
    apiUrl:
      process.env.EXPO_PUBLIC_API_URL ||
      config.extra?.apiUrl ||
      'http://localhost:8000',
    defaultInviteCode:
      process.env.EXPO_PUBLIC_DEFAULT_INVITE_CODE ||
      config.extra?.defaultInviteCode ||
      'PE856',
    eas: {
      projectId:
        process.env.EAS_PROJECT_ID || config.extra?.eas?.projectId,
    },
  },
});
