/**
 * Expo config plugin — adds the official Polar BLE SDK (iOS + Android)
 * to the AFEtm Safety Check native builds.
 *
 * IMPORTANT:
 *  • This plugin runs at `expo prebuild` / EAS build time. It DOES NOT
 *    affect Expo Go or the web preview — those still use the
 *    react-native-ble-plx fallback.
 *  • The Polar SDK is a real-time HR source ONLY. It never computes an
 *    AFE result. Classification remains 100% on the Replit backend.
 *  • No AccessLink / no Polar Flow cloud sync in this phase.
 *
 * References (provided by Polar to WeWoN Smart Sport Solutions LLC):
 *   iOS  → https://github.com/polarofficial/polar-ble-sdk (CocoaPods
 *          `PolarBleSdk`)
 *   Android → same repo (Maven `com.github.polarofficial:polar-ble-sdk`
 *          via JitPack).
 */

const {
  withInfoPlist,
  withAndroidManifest,
  withProjectBuildGradle,
  withPodfileProperties,
  withAppBuildGradle,
  AndroidConfig,
} = require('@expo/config-plugins');

const BLUETOOTH_ALWAYS_MSG =
  'AFEtm uses Bluetooth to connect to your Polar heart-rate sensor during the Safety Check.';
const BLUETOOTH_PERIPHERAL_MSG =
  'AFEtm reads your live heart-rate from the Polar sensor to guide the Safety Check.';

function withIos(config) {
  return withInfoPlist(config, (cfg) => {
    const p = cfg.modResults;
    p.NSBluetoothAlwaysUsageDescription =
      p.NSBluetoothAlwaysUsageDescription || BLUETOOTH_ALWAYS_MSG;
    p.NSBluetoothPeripheralUsageDescription =
      p.NSBluetoothPeripheralUsageDescription || BLUETOOTH_PERIPHERAL_MSG;
    const bg = new Set(p.UIBackgroundModes || []);
    bg.add('bluetooth-central');
    p.UIBackgroundModes = Array.from(bg);
    return cfg;
  });
}

function withAndroid(config) {
  // Permissions (BLE scan + connect on API 31+ + legacy location on <31).
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.ACCESS_FINE_LOCATION',
  ]);

  // Inject JitPack repository (Polar SDK is published there).
  config = withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('jitpack')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /allprojects\s*{\s*repositories\s*{/,
        `allprojects { repositories {\n        maven { url 'https://jitpack.io' }`
      );
    }
    return cfg;
  });

  // Add the Polar SDK + RxJava/RxAndroid dependencies once.
  config = withAppBuildGradle(config, (cfg) => {
    const marker = 'polar-ble-sdk';
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*{/,
        `dependencies {
    implementation 'com.github.polarofficial:polar-ble-sdk:5.5.0'
    implementation 'io.reactivex.rxjava3:rxjava:3.1.6'
    implementation 'io.reactivex.rxjava3:rxandroid:3.0.2'`
      );
    }
    return cfg;
  });

  return config;
}

module.exports = function withPolarBle(config) {
  config = withIos(config);
  config = withAndroid(config);
  return config;
};
