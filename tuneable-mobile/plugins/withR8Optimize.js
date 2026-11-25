const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo's Android template enables R8 with proguard-android.txt, which includes
 * -dontoptimize. Play Console's optimization score stays empty until the
 * optimizing rules file is used. Prebuild regenerates android/, so this has to
 * run as a config plugin rather than a hand edit.
 */
function withR8Optimize(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('Expected Groovy android/app/build.gradle from Expo prebuild');
    }

    const contents = config.modResults.contents;
    if (contents.includes('proguard-android-optimize.txt')) {
      return config;
    }
    if (!contents.includes('getDefaultProguardFile("proguard-android.txt")')) {
      throw new Error(
        'Could not find proguard-android.txt in android/app/build.gradle'
      );
    }

    config.modResults.contents = contents.replace(
      'getDefaultProguardFile("proguard-android.txt")',
      'getDefaultProguardFile("proguard-android-optimize.txt")'
    );
    return config;
  });
}

module.exports = withR8Optimize;
