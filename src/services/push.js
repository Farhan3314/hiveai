// Push notification service.
//
// IMPORTANT (read this before testing):
// As of Expo SDK 53+, REMOTE push notifications no longer work inside the
// plain "Expo Go" app — Expo Go simply cannot receive them anymore
// (local/in-app notifications still work, but that's not what we need
// here). This project is on SDK 57, so to actually test any of this you
// must run a Development Build, e.g.:
//
//   npx expo install expo-dev-client
//   eas build --profile development --platform android   (or ios)
//
// CRITICAL: 'expo-notifications' must NEVER be statically imported at the
// top of this file (or of any file loaded on app boot). Its package entry
// point eagerly runs a side-effect module (DevicePushTokenAutoRegistration)
// that immediately calls addPushTokenListener() -> warnOfExpoGoPushUsage(),
// which does `console.error(...)` on Android the instant the module loads —
// before any of our own Expo-Go checks ever get a chance to run. In dev mode
// that console.error is promoted to a full-screen fatal "[runtime not
// ready]" LogBox error, because it fires during initial bundle evaluation,
// before the app has even rendered. (This is exactly the crash reported —
// it happens on *import*, not from any button press.)
//
// The fix is to only ever import 'expo-notifications' lazily, and only
// after confirming we're NOT running inside Expo Go — see
// loadNotificationsModule() below. Do not change this back to a static
// `import * as Notifications from 'expo-notifications'` at the top of the
// file, even though the SDK docs' React lifecycle happens to be fine with it
// on real Development Builds — Expo Go, which is what most people run this
// project in during development, will get to this file (via AuthContext ->
// registerForPushNotificationsAsync) on every single app launch.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

let notificationsModulePromise = null;
let handlerConfigured = false;
let warnedExpoGoOnce = false;

// Lazily (and only once) imports 'expo-notifications' — never call this
// before checking isExpoGo() first.
async function loadNotificationsModule() {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications');
  }
  const Notifications = await notificationsModulePromise;

  if (!handlerConfigured) {
    handlerConfigured = true;
    // Foreground notifications: show the OS banner + play sound even while
    // the app is open (default expo-notifications behavior is to hide them).
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }

  return Notifications;
}

function isExpoGo() {
  return Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
}

// Registers this device for push notifications and returns the Expo push
// token (a string like "ExponentPushToken[xxxxxxxx]"). Returns null (and
// logs why) if it can't — e.g. running in Expo Go, no physical device,
// permission denied, etc.
export async function registerForPushNotificationsAsync() {
  console.log('[push] registerForPushNotificationsAsync: starting');

  if (isExpoGo()) {
    // Not an error — this is expected every time the app runs inside Expo
    // Go, since remote push simply isn't available there (SDK 53+). Using
    // console.log instead of console.warn keeps this out of the in-app
    // LogBox banner (console.warn/error both trigger it) — it's still
    // visible in the terminal for anyone who wants it, exactly once per
    // app session instead of on every login/auth-state change.
    if (!warnedExpoGoOnce) {
      warnedExpoGoOnce = true;
      console.log(
        '[push] Running inside Expo Go — remote push notifications are NOT supported here ' +
          'since SDK 53. This is expected and does not affect any other feature. Build a ' +
          'Development Build to actually receive pushes ' +
          '(npx expo install expo-dev-client && eas build --profile development).'
      );
    }
    return null;
  }

  if (!Device.isDevice) {
    console.warn('[push] Not a physical device (simulator/emulator without Play services) — skipping push registration.');
    return null;
  }

  const Notifications = await loadNotificationsModule();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('[push] existing permission status:', existingStatus);
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('[push] requested permission, result:', status);
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] Permission not granted — cannot register for push notifications.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;

    if (!projectId) {
      console.error(
        '[push] No EAS projectId found in app config (app.json extra.eas.projectId). ' +
          'Run `eas init` (or add it manually) before push tokens can be generated.'
      );
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;
    console.log('[push] Got Expo push token:', token);
    return token;
  } catch (e) {
    console.error('[push] Failed to get Expo push token:', e.message);
    return null;
  }
}

// Saves this device's Expo push token onto the user's Firestore doc
// (users/{uid}.expoPushToken) so other users' devices can look it up and
// send this user a push.
export async function savePushToken(userId, token) {
  if (!userId || !token) {
    console.warn('[push] savePushToken: missing userId or token, skipping', { userId, token });
    return;
  }
  try {
    await updateDoc(doc(db, 'users', userId), { expoPushToken: token });
    console.log('[push] savePushToken: saved to Firestore for user', userId);
  } catch (e) {
    console.error('[push] savePushToken FAILED', { userId, code: e.code, message: e.message });
  }
}

// Looks up a user's saved Expo push token and sends them a push via the
// Expo Push API (https://exp.host/--/api/v2/push/send). Expo relays this to
// FCM (Android) / APNs (iOS) on our behalf. Logs the outgoing payload and
// Expo's response ("ticket") so you can confirm in the console whether the
// notification actually made it out or was rejected (e.g. DeviceNotRegistered,
// InvalidCredentials, MessageTooBig, etc.)
export async function sendPushNotification(userId, { title, body, data = {} }) {
  console.log('[push] sendPushNotification: preparing', { userId, title, body, data });

  if (!userId) {
    console.warn('[push] sendPushNotification: no userId given, skipping');
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    const token = userSnap.exists() ? userSnap.data()?.expoPushToken : null;

    if (!token) {
      // Not an error — this is the normal case whenever the target user
      // is testing in Expo Go (push registration is skipped there, see
      // the top of this file) or simply hasn't granted permission yet.
      // Using console.log instead of console.warn keeps this out of the
      // in-app LogBox banner, same reasoning as the isExpoGo() check in
      // registerForPushNotificationsAsync above — this branch runs on
      // EVERY notification (friend requests, group invites, AI replies,
      // ...), so leaving it as console.warn meant the full-screen LogBox
      // popped up constantly during ordinary testing even though nothing
      // was actually wrong.
      console.log(
        `[push] sendPushNotification: user ${userId} has no expoPushToken saved ` +
          '(they may not have opened the app on a development build yet, or denied permission). Skipping push.'
      );
      return;
    }

    const message = {
      to: token,
      sound: 'default',
      title,
      body,
      data,
    };

    console.log('[push] Sending to Expo push API:', message);

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('[push] Expo push API response:', JSON.stringify(result));

    const ticket = result?.data;
    if (ticket?.status === 'error') {
      console.error('[push] Expo rejected the push:', ticket.message, ticket.details);
    } else {
      console.log('[push] Push accepted by Expo, ticket id:', ticket?.id);
    }
  } catch (e) {
    console.error('[push] sendPushNotification FAILED', { userId, message: e.message });
  }
}