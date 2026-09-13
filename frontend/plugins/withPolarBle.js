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
 */

const fs = require('fs');
const path = require('path');
const {
  withInfoPlist,
  withPodfile,
  withXcodeProject,
  withProjectBuildGradle,
  withAppBuildGradle,
  AndroidConfig,
  IOSConfig,
} = require('@expo/config-plugins');

const POLAR_IOS_VERSION = '5.5.0';
const RXSWIFT_IOS_VERSION = '6.5.0';
const IOS_BRIDGE_FILES = ['PolarBleModule.swift', 'PolarBleModule.m'];

const BLUETOOTH_ALWAYS_MSG =
  'AFEtm uses Bluetooth to connect to your Polar heart-rate sensor during the Safety Check.';
const BLUETOOTH_PERIPHERAL_MSG =
  'AFEtm reads your live heart-rate from the Polar sensor to guide the Safety Check.';

function withPolarInfoPlist(config) {
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

function withPolarPods(config) {
  return withPodfile(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes("pod 'PolarBleSdk'")) {
      return cfg;
    }

    const podLines = [
      `  # Polar BLE native bridge dependencies (AFEtm acquisition only)`,
      `  pod 'PolarBleSdk', '${POLAR_IOS_VERSION}'`,
      `  pod 'RxSwift', '${RXSWIFT_IOS_VERSION}'`,
      '',
    ].join('\n');

    const targetPattern = /(target\s+['"][^'"]+['"]\s+do\s*\n)/;
    if (!targetPattern.test(contents)) {
      throw new Error('withPolarBle: unable to locate the iOS app target in Podfile.');
    }

    contents = contents.replace(targetPattern, `$1${podLines}`);
    cfg.modResults.contents = contents;
    return cfg;
  });
}

function hasFileReference(project, relativePath) {
  const refs = project.pbxFileReferenceSection();
  return Object.values(refs).some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const filePath = String(entry.path || '').replace(/^"|"$/g, '');
    return filePath === relativePath;
  });
}

function withPolarNativeBridge(config) {
  return withXcodeProject(config, (cfg) => {
    const { projectName, platformProjectRoot, projectRoot } = cfg.modRequest;
    const project = cfg.modResults;

    if (!projectName) {
      throw new Error('withPolarBle: iOS projectName is unavailable.');
    }

    const targets = IOSConfig.Target.findSignableTargets(project);
    if (!targets.length) {
      throw new Error('withPolarBle: no signable iOS app target was found.');
    }

    const targetUuid = targets[0].uuid;
    const destinationDir = path.join(platformProjectRoot, projectName, 'PolarBle');
    fs.mkdirSync(destinationDir, { recursive: true });

    for (const fileName of IOS_BRIDGE_FILES) {
      const source = path.join(projectRoot, 'plugins', fileName);
      const destination = path.join(destinationDir, fileName);
      if (!fs.existsSync(source)) {
        throw new Error(`withPolarBle: missing canonical bridge source ${source}`);
      }

      fs.copyFileSync(source, destination);

      const relativePath = `${projectName}/PolarBle/${fileName}`;
      if (!hasFileReference(project, relativePath)) {
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
          filepath: relativePath,
          groupName: projectName,
          project,
          targetUuid,
        });
      }
    }

    return cfg;
  });
}

function withIos(config) {
  config = withPolarInfoPlist(config);
  config = withPolarPods(config);
  config = withPolarNativeBridge(config);
  return config;
}

function withAndroid(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.BLUETOOTH',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH_SCAN',
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.ACCESS_FINE_LOCATION',
  ]);

  config = withProjectBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('jitpack')) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /allprojects\s*{\s*repositories\s*{/,
        `allprojects { repositories {\n        maven { url 'https://jitpack.io' }`
      );
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    const marker = 'polar-ble-sdk';
    if (!cfg.modResults.contents.includes(marker)) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /dependencies\s*{/,
        `dependencies {\n    implementation 'com.github.polarofficial:polar-ble-sdk:5.5.0'\n    implementation 'io.reactivex.rxjava3:rxjava:3.1.6'\n    implementation 'io.reactivex.rxjava3:rxandroid:3.0.2'`
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
