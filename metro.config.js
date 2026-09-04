// Metro config — required to fix a known Firebase JS SDK v10+ issue in
// Expo/React Native: "Component auth has not been registered yet".
//
// Cause: Metro's newer "package exports" resolution picks the wrong
// entry point for the `firebase/auth` package on native platforms.
// Disabling unstable_enablePackageExports makes Metro fall back to the
// main/browser fields, which resolves correctly for React Native.
//
// Reference: https://github.com/firebase/firebase-js-sdk/issues/...
// (this is Firebase + Expo's officially recommended workaround)

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix 1: stop Metro from using the "exports" field in Firebase's
// package.json — it points to the wrong (non-RN) build on native.
config.resolver.unstable_enablePackageExports = false;

// Fix 2: Firebase's React Native build ships as .cjs files — make sure
// Metro's resolver looks at that extension too.
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
