// File handling for avatars, chat attachments (images/documents), and the
// AI Assistant's own attachments.
//
// UPDATE: chat/AI attachments now upload to Cloud Storage for Firebase
// instead of being embedded as base64 inside a Firestore document. This
// requires the project to be on the Blaze (pay-as-you-go) billing plan —
// Google no longer allows Storage buckets on the free Spark plan — but
// usage stays at $0 as long as it's within the no-cost quota (5GB stored,
// 1GB downloaded/day). See storage.rules for the access rules.
//
// Why this changed: Firestore hard-caps a single document at 1 MiB, and
// base64 text is ~33% bigger than the raw file, so documents were capped at
// ~700KB raw and anything bigger was rejected outright before it ever
// reached the AI. Real files in Storage aren't limited by that — the app
// now allows up to MAX_UPLOAD_BYTES (25MB) per file, which is enforced both
// here (fast client-side check) and again in storage.rules (server-side,
// so it can't be bypassed by a modified client).
//
// Avatars are unaffected — they're small (a few hundred KB after
// compression) and stay embedded as base64 on the user's profile document,
// which is simpler and avoids an extra Storage round-trip for something
// this size.

import * as ImageManipulator from 'expo-image-manipulator';
// IMPORTANT (Expo SDK 54+): `expo-file-system`'s main entrypoint now points
// at the new object-based File/Directory API, not the old function-based one
// (getInfoAsync, readAsStringAsync, ...). Those old functions were moved to
// `expo-file-system/legacy` and calling them from the main import throws
// "Method ... is deprecated" — which is exactly what was breaking every
// image/document upload here (assertSizeWithinLimit below always threw,
// so handlePickImage/handlePickDocument's upload step never completed).
// Use the new `File` class instead of switching to the legacy import, since
// it's the supported long-term API.
import { File } from 'expo-file-system';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

const AVATAR_TARGET_BYTES = 300 * 1024; // final base64 size we aim the avatar under

// Chat/AI photos are still compressed before upload — not to satisfy a
// Firestore size cap anymore, but because (a) a raw 12MP+ camera photo is
// pointlessly large to store/download for a chat thumbnail, and (b) the
// vision AI is only ever given this same compressed copy, never the
// original — sending it multiple MB of pixels it doesn't need just slows
// down (and can fail) the analyze call. 650KB comfortably holds enough
// detail for both a chat preview and accurate AI analysis.
const CHAT_IMAGE_TARGET_BYTES = 650 * 1024;

// Hard ceiling on what a user can pick, applied BEFORE any upload/compression
// work starts (documents) or is attempted (images), so a huge/wrong file is
// rejected instantly with a clear message instead of hanging on a slow
// read/compress/upload that was always going to fail.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

const sanitizeFileName = (fileName = 'file') =>
  String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');

const detectContentType = (fileName, fallback = 'application/octet-stream') => {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.doc')) return 'application/msword';
  if (name.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.csv')) return 'text/csv';
  return fallback;
};

const assertSizeWithinLimit = async (uri, fileName) => {
  let file;
  try {
    // `File` reads `.exists`/`.size` as plain (synchronous) properties on
    // the new expo-file-system API — no separate async "getInfoAsync" call.
    file = new File(uri);
  } catch (error) {
    throw new Error(`Could not read ${fileName || 'this file'} from the device.`);
  }

  if (!file.exists) {
    throw new Error(`Could not read ${fileName || 'this file'} from the device.`);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const limitMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    const gotMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(
      `"${fileName || 'This file'}" is too large (${gotMb}MB). Please choose a file under ${limitMb}MB.`
    );
  }

  return file;
};

// Reads a local file URI and uploads it to Cloud Storage, returning a
// public HTTPS download URL.
//
// IMPORTANT — history of this function, because the bug it works around is
// easy to reintroduce by "simplifying" this later:
//   1. It used to do `fetch(uri).blob()` then hand that Blob to
//      `uploadBytes()`. That throws "Creating blobs from 'ArrayBuffer' and
//      'ArrayBufferView' are not supported" on React Native.
//   2. Reading the file as base64 and calling `uploadString(..., 'base64')`
//      looked like a fix (and does avoid the fetch().blob() call), but it
//      throws the *exact same* error, because `uploadString` internally
//      calls the same non-resumable "multipart" upload path as
//      `uploadBytes`. That path builds the HTTP body by merging a text
//      preamble + the file's raw bytes + a text postamble into ONE Blob via
//      `new Blob([preamble, bytes, postamble])` (see
//      @firebase/storage/dist/index.esm.js, function `multipartUpload`) —
//      and constructing a Blob from raw bytes is exactly what RN's Blob
//      polyfill refuses to do. So neither `uploadBytes` nor `uploadString`
//      actually works here, no matter what data type they're given.
//   3. `uploadBytesResumable` is the one Storage upload function that never
//      takes that code path — the resumable protocol sends the metadata as
//      a plain JSON string in one request and the raw bytes as the body of
//      separate requests, with no Blob merging anywhere. That's what's used
//      below, with the file read as raw bytes (`File.bytes()`) instead of
//      base64, since there's no more reason to base64-encode/decode at all.
async function uploadUriToStorage(storagePath, uri, fileName) {
  const file = new File(uri);
  const bytes = await file.bytes();
  const contentType = detectContentType(fileName);
  const storageRef = ref(storage, storagePath);
  await uploadBytesResumable(storageRef, bytes, { contentType });
  return getDownloadURL(storageRef);
}

// Same as uploadUriToStorage, for the resized/compressed image file that
// compressImage() writes to disk. Takes a file URI (not a base64 string) so
// this can read raw bytes directly too — see uploadUriToStorage's comment
// for why raw bytes + uploadBytesResumable is the only combination that
// actually works on React Native.
async function uploadImageToStorage(storagePath, uri, contentType) {
  const file = new File(uri);
  const bytes = await file.bytes();
  const storageRef = ref(storage, storagePath);
  await uploadBytesResumable(storageRef, bytes, { contentType });
  return getDownloadURL(storageRef);
}

// Resizes + compresses a photo on-device until its base64 form comfortably
// fits within CHAT_IMAGE_TARGET_BYTES, no matter how large the original
// file was. Shrinks width and JPEG quality step by step, so a huge camera
// photo still converges to a small, sharp-enough image in a few iterations.
async function compressImage(uri, targetBytes, startWidth = 1280, minWidth = 320) {
  let width = startWidth;
  let quality = 0.7;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    const dataUri = `data:image/jpeg;base64,${result.base64}`;
    const isLastAttempt = attempt === 5;
    if (dataUri.length <= targetBytes || isLastAttempt) {
      // `result.uri` is the resized/compressed JPEG that ImageManipulator
      // wrote to disk — returned alongside the base64 so callers can upload
      // straight from it as raw bytes (see uploadImageToStorage) instead of
      // decoding the base64 string back into bytes themselves.
      return { dataUri, base64: result.base64, uri: result.uri };
    }

    width = Math.max(minWidth, Math.round(width * 0.75));
    quality = Math.max(0.3, quality - 0.15);
  }
}

export async function uploadAvatar(uid, uri) {
  if (!uid) throw new Error('User account is not available. Please log in again.');

  try {
    const { dataUri } = await compressImage(uri, AVATAR_TARGET_BYTES, 512, 96);
    return dataUri;
  } catch (error) {
    console.error('uploadAvatar error:', error);
    throw new Error(error?.message || 'Image processing failed.');
  }
}

// kind: 'image' | 'document'.
// Images: compressed on-device (see compressImage) then uploaded to
// Storage; the same compressed base64 is also returned so callers can hand
// it straight to the vision AI without re-reading/re-compressing the file.
// Documents: size-checked, then uploaded to Storage as-is (up to 25MB) —
// no more silent rejection of anything over ~700KB.
export async function uploadChatFile(groupId, uri, fileName, kind = 'document') {
  const safeName = sanitizeFileName(fileName || 'file');
  const stamp = Date.now();

  if (kind === 'image') {
    await assertSizeWithinLimit(uri, fileName);
    const { base64, uri: resizedUri } = await compressImage(uri, CHAT_IMAGE_TARGET_BYTES);
    const url = await uploadImageToStorage(`groupFiles/${groupId}/${stamp}_${safeName}.jpg`, resizedUri, 'image/jpeg');
    return { url, fileName: safeName, base64 };
  }

  await assertSizeWithinLimit(uri, fileName);
  const url = await uploadUriToStorage(`groupFiles/${groupId}/${stamp}_${safeName}`, uri, safeName);
  return { url, fileName: safeName };
}

// Same as uploadChatFile but scoped to a user's personal AI Assistant
// conversation (users/{uid}/aiChats/{chatId}) instead of a group.
export async function uploadAIChatFile(userId, chatId, uri, fileName, kind = 'document') {
  const safeName = sanitizeFileName(fileName || 'file');
  const stamp = Date.now();

  if (kind === 'image') {
    await assertSizeWithinLimit(uri, fileName);
    const { base64, uri: resizedUri } = await compressImage(uri, CHAT_IMAGE_TARGET_BYTES);
    const url = await uploadImageToStorage(
      `aiChatFiles/${userId}/${chatId}/${stamp}_${safeName}.jpg`,
      resizedUri,
      'image/jpeg'
    );
    return { url, fileName: safeName, base64 };
  }

  await assertSizeWithinLimit(uri, fileName);
  const url = await uploadUriToStorage(`aiChatFiles/${userId}/${chatId}/${stamp}_${safeName}`, uri, safeName);
  return { url, fileName: safeName };
}