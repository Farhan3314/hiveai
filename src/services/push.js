import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

// Show notifications with a banner + sound even while the app is in the
// foreground (the default handler suppresses them, which made it look like
// pushes "didn't arrive" whenever the app happened to be open).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Registers this device for push notifications and returns the Expo push
// token, or null if registration isn't possible (simulator, permission
// denied, or running inside Expo Go on SDK 53+, which dropped support for
// remote push notifications entirely). Never throws — every failure mode
// is logged and resolved as null so callers can safely fire-and-forget.
export async function registerForPushNotificationsAsync() {
  console.log('[push] registerForPushNotificationsAsync: starting');

  if (Constants.appOwnership === 'expo') {
    console.log(
      '[push] Running inside Expo Go — remote push notifications are NOT supported here since SDK 53. This is expected and does not affect any other feature. Build a Development Build to actually receive pushes (npx expo install expo-dev-client && eas build --profile development).'
    );
    return null;
  }

  if (!Device.isDevice) {
    console.log('[push] Skipping registration — push notifications require a physical device.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[push] Permission not granted, cannot get push token.');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    console.log('[push] Got Expo push token:', tokenResponse.data);
    return tokenResponse.data;
  } catch (e) {
    console.error('[push] Failed to get Expo push token:', e.message);
    return null;
  }
}

// Persists the Expo push token on the user's Firestore doc so other users'
// devices can look it up when they need to notify this person.
export async function savePushToken(uid, token) {
  if (!uid || !token) return;
  try {
    await updateDoc(doc(db, 'users', uid), { pushToken: token });
    console.log('[push] savePushToken: saved for', uid);
  } catch (e) {
    console.error('[push] savePushToken FAILED', { uid, message: e.message });
  }
}

// Looks up the recipient's saved push token and sends them a push via
// Expo's push API. Fire-and-forget from the caller's perspective — every
// failure is caught and logged here so it never surfaces as an unhandled
// rejection or interrupts the in-app notification flow.
export async function sendPushNotification(userId, { title, body, data } = {}) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const token = snap.exists() ? snap.data().pushToken : null;
    if (!token) {
      console.log('[push] sendPushNotification: no token for', userId, '— skipping');
      return;
    }

    const message = {
      to: token,
      sound: 'default',
      title: title || 'HiveAI',
      body: body || '',
      data: data || {},
    };

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
    if (result?.data?.status === 'error') {
      console.error('[push] sendPushNotification: Expo push service returned an error', result.data);
    } else {
      console.log('[push] sendPushNotification: sent to', userId);
    }
  } catch (e) {
    console.error('[push] sendPushNotification FAILED', { userId, message: e.message });
  }
}
