import * as Linking from 'expo-linking';

// Builds the shareable link for a given invite code. Uses expo-linking so
// the SAME code works correctly in three situations without special-casing
// any of them:
//  - Expo Go (dev):      exp://192.168.x.x:8081/--/join/ABC123
//  - Dev client / a real standalone build: hiveai://join/ABC123
//    (registered via the "scheme" field in app.json)
// Recipients on Expo Go need the sender's dev server on the same network
// to actually open the app from the link — that's an Expo Go limitation,
// not this feature's. Once this project is built as a standalone app (EAS
// build / `expo run:android`), the hiveai:// link works for anyone with
// the app installed, from anywhere.
export function buildGroupInviteLink(code) {
  return Linking.createURL(`join/${code}`);
}

export function buildGroupInviteMessage(groupName, code) {
  const link = buildGroupInviteLink(code);
  return (
    `Join "${groupName}" on HiveAI!\n\n` +
    `Tap this link if you already have the app installed:\n${link}\n\n` +
    `Or open HiveAI → Home → "Join with a code" and enter: ${code}`
  );
}

// Pulls an invite code out of any URL this app might be opened with.
// Handles every shape a code could realistically arrive in:
//  - hiveai://join/ABC123
//  - exp://.../--/join/ABC123          (Expo Go dev deep link)
//  - https://hiveai.app/join/ABC123    (future universal link)
//  - anything/?code=ABC123
export function extractInviteCodeFromUrl(url) {
  if (!url) return null;

  try {
    const { path, queryParams, hostname } = Linking.parse(url);

    if (queryParams?.code) {
      return String(queryParams.code).trim().toUpperCase();
    }

    const segments = [hostname, ...(path ? path.split('/') : [])].filter(Boolean);
    const joinIndex = segments.findIndex((s) => s.toLowerCase() === 'join');
    if (joinIndex !== -1 && segments[joinIndex + 1]) {
      return segments[joinIndex + 1].trim().toUpperCase();
    }
  } catch (e) {
    console.warn('[inviteLink] Linking.parse failed, falling back to regex', e?.message);
  }

  // Regex fallback — covers any URL shape Linking.parse doesn't recognise
  // (e.g. it was pasted as plain text rather than actually opened).
  const match = /join\/([A-Za-z0-9]{4,10})/i.exec(url);
  return match ? match[1].toUpperCase() : null;
}
