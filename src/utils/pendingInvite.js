import AsyncStorage from '@react-native-async-storage/async-storage';

// If someone taps an invite link while logged out, we can't join the group
// yet (Firestore rules require a signed-in uid) — so the code is parked
// here, survives the Login/SignUp screens (and even an app restart), and
// RootNavigator replays it into the JoinGroup screen the moment `user`
// becomes truthy.
const KEY = 'hiveai_pending_invite_code';

export async function setPendingInviteCode(code) {
  if (!code) return;
  try {
    await AsyncStorage.setItem(KEY, code);
  } catch (e) {
    console.warn('[pendingInvite] setPendingInviteCode failed', e?.message);
  }
}

export async function getPendingInviteCode() {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch (e) {
    console.warn('[pendingInvite] getPendingInviteCode failed', e?.message);
    return null;
  }
}

export async function clearPendingInviteCode() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    console.warn('[pendingInvite] clearPendingInviteCode failed', e?.message);
  }
}
