// File handling for avatars, chat attachments (images/documents), and the
// AI Assistant's own attachments.
//
// REVERTED: chat/AI attachments are embedded as base64 directly inside the
// Firestore message document again, instead of being uploaded to Cloud
// Storage for Firebase. Cloud Storage requires the project to be upgraded
// to the Blaze (pay-as-you-go) billing plan — Google no longer allows
// provisioning or using Storage buckets on the free Spark plan, even if
// actual usage would stay within the no-cost quota — and this project
// stays on Spark, so nothing here calls Firebase Storage at all anymore.
//
// What this means in practice: Firestore hard-caps a single document at
// 1 MiB, and base64 text is ~33% bigger than the raw file, so:
//   - Images are compressed on-device (see compressImage) until their
//     base64 form comfortably fits under CHAT_IMAGE_TARGET_BYTES, then
//     stored as a `data:image/jpeg;base64,...` URI directly on the message.
//   - Documents are NOT compressible, so anything over DOCUMENT_MAX_BYTES
//     raw is rejected up front with a clear message instead of silently
//     failing later. Small documents (the common case: notes, résumés,
//     short reports, .txt/.csv exports, etc.) are read as raw bytes and
//     stored the same way, as a `data:<mime>;base64,...` URI.
// Either way, the AI still gets what it needs: image analysis already runs
// off this same base64 (see AIAssistantScreen), and document Q&A (RAG) reads
// the file's text straight from the on-device URI at upload time (see
// FileAnalysisScreen/rag.js) — neither of those ever depended on Storage.
//
// Avatars were never affected by any of this — they've always been small (a
// few hundred KB after compression) and stayed embedded as base64 on the
// user's profile document.

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
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { UPLOAD_LIMITS, RAG_SUPPORTED_EXTENSIONS } from '../config';
import { openLocalFile } from '../utils/localFile';

const AVATAR_TARGET_BYTES = 300 * 1024; // final base64 size we aim the avatar under

// Chat/AI photos are compressed before being embedded — not just to fit
// under Firestore's 1 MiB document cap, but because (a) a raw 12MP+ camera
// photo is pointlessly large to store/sync for a chat thumbnail, and (b)
// the vision AI is only ever given this same compressed copy, never the
// original — sending it multiple MB of pixels it doesn't need just slows
// down (and can fail) the analyze call. 650KB comfortably holds enough
// detail for both a chat preview and accurate AI analysis, while leaving
// plenty of headroom under the 1 MiB document limit for the rest of the
// message's fields.
const CHAT_IMAGE_TARGET_BYTES = 650 * 1024;

// Documents can't be compressed like photos, so their raw bytes are only
// embedded (as base64) in the Firestore message when they're small enough to
// fit under the 1 MiB document limit (see UPLOAD_LIMITS in config.js).
// Larger documents that the AI can read are still analysed — the text is
// extracted on-device — they're just not stored inside the message.
const DOCUMENT_MAX_BYTES = UPLOAD_LIMITS.documentStoredMaxBytes;
const MAX_PICKED_IMAGE_BYTES = UPLOAD_LIMITS.imagePickedMaxBytes;
const DOCUMENT_ANALYSIS_MAX_BYTES = UPLOAD_LIMITS.documentAnalysisMaxBytes;

const fileExtension = (fileName = '') => {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
};

const formatBytes = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

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

// Base64-encodes raw bytes without ever constructing a Blob — plain
// arithmetic over the byte array, chunked so it's safe for files up to a
// few hundred KB (which is all DOCUMENT_MAX_BYTES ever allows through).
// There's no built-in btoa()-for-bytes on React Native and no reason to
// pull in a dependency just for this.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes) {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;

    result += BASE64_CHARS[(triplet >> 18) & 0x3f];
    result += BASE64_CHARS[(triplet >> 12) & 0x3f];
    result += i + 1 < len ? BASE64_CHARS[(triplet >> 6) & 0x3f] : '=';
    result += i + 2 < len ? BASE64_CHARS[triplet & 0x3f] : '=';
  }
  return result;
}

// Reads a local file URI's raw bytes and returns a `data:` URI holding it as
// base64 — the document equivalent of what compressImage() already does for
// images. This is what gets stored directly on the Firestore message (no
// network upload, no Cloud Storage bucket involved).
async function fileToDataUri(uri, fileName) {
  const file = openLocalFile(uri);
  const bytes = await file.bytes();
  const base64 = bytesToBase64(bytes);
  const contentType = detectContentType(fileName);
  return `data:${contentType};base64,${base64}`;
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

// Checks a picked file RIGHT AWAY (at pick time), so the user hears about a
// too-big/empty file immediately instead of after typing a message and
// pressing send. Throws an Error with a user-friendly message; returns the
// file size in bytes when the file is acceptable.
export function validateAttachment(uri, fileName, kind = 'document') {
  if (kind !== 'image') {
    const ext = fileExtension(fileName);
    if (!RAG_SUPPORTED_EXTENSIONS.includes(ext)) {
      throw new Error(
        `.${ext || 'this'} files can't be read by HiveAI yet. Please choose a ${RAG_SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(', ')} file.`
      );
    }
  }
  let file;
  try {
    file = openLocalFile(uri);
  } catch (error) {
    throw new Error(`Could not read ${fileName || 'this file'} from the device.`);
  }
  if (!file.exists) throw new Error(`Could not read ${fileName || 'this file'} from the device.`);
  const size = file.size || 0;
  if (size === 0) throw new Error(`"${fileName || 'This file'}" is empty.`);

  if (kind === 'image') {
    if (size > MAX_PICKED_IMAGE_BYTES) {
      throw new Error(
        `"${fileName || 'This photo'}" is too large (${formatBytes(size)}). Photos can be up to ${formatBytes(MAX_PICKED_IMAGE_BYTES)}.`
      );
    }
    return size;
  }

  const analysable = RAG_SUPPORTED_EXTENSIONS.includes(fileExtension(fileName));
  const limit = analysable ? DOCUMENT_ANALYSIS_MAX_BYTES : DOCUMENT_MAX_BYTES;
  if (size > limit) {
    throw new Error(
      `"${fileName || 'This file'}" is too large (${formatBytes(size)}). ` +
        (analysable
          ? `Documents can be up to ${formatBytes(limit)}.`
          : `This file type can be up to ${formatBytes(limit)} (PDF, Word and text files up to ${formatBytes(DOCUMENT_ANALYSIS_MAX_BYTES)}).`)
    );
  }
  return size;
}

// kind: 'image' | 'document'. Neither path touches Cloud Storage.
// Images: compressed on-device (see compressImage); returns a `data:` URI to
// store on the Firestore message, plus the same compressed base64 so callers
// can hand it straight to the vision AI.
// Documents: small ones (<= documentStoredMaxBytes) are embedded as a `data:`
// URI. Bigger PDF/Word/text files return `url: null, stored: false` — the
// message is still sent (name only) and the AI still reads the file from the
// device, but the bytes themselves aren't kept in the chat.
export async function uploadChatFile(groupId, uri, fileName, kind = 'document') {
  const safeName = sanitizeFileName(fileName || 'file');
  const size = validateAttachment(uri, fileName, kind);

  if (kind === 'image') {
    const { dataUri, base64 } = await compressImage(uri, CHAT_IMAGE_TARGET_BYTES);
    return { url: dataUri, fileName: safeName, base64 };
  }

  if (size > DOCUMENT_MAX_BYTES) {
    return { url: null, fileName: safeName, stored: false, size };
  }
  const url = await fileToDataUri(uri, safeName);
  return { url, fileName: safeName, stored: true, size };
}

// Same as uploadChatFile but scoped to a user's personal AI Assistant
// conversation. Kept as a separate export (same implementation) since the
// two call sites pass different arguments (userId/chatId vs groupId) and
// may diverge again later.
export async function uploadAIChatFile(userId, chatId, uri, fileName, kind = 'document') {
  return uploadChatFile(chatId, uri, fileName, kind);
}

// ---------------------------------------------------------------------------
// Opening a stored attachment
// ---------------------------------------------------------------------------
// `data:` URIs can't be opened by Linking on either platform, so tapping a
// document used to always fail with "Preview not available". Instead, write
// the bytes to the app's cache folder and hand that file to the system share
// sheet ("Open with…" / Save / Send), via expo-sharing.
function base64ToBytes(b64) {
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, '');
  const lookup = new Uint8Array(128);
  for (let i = 0; i < BASE64_CHARS.length; i += 1) lookup[BASE64_CHARS.charCodeAt(i)] = i;
  const outLen = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)];
    const e2 = lookup[clean.charCodeAt(i + 1)];
    const e3 = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)] : 0;
    const e4 = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)] : 0;
    if (p < outLen) out[p++] = (e1 << 2) | (e2 >> 4);
    if (p < outLen) out[p++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (p < outLen) out[p++] = ((e3 & 3) << 6) | e4;
  }
  return out;
}

export async function openStoredFile(dataUri, fileName) {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUri || '');
  if (!match) throw new Error('This file is not stored in the chat, so it can\'t be opened.');
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Opening files is not supported on this device.');
  }

  const mimeType = match[1] || detectContentType(fileName);
  const target = new File(Paths.cache, sanitizeFileName(fileName || 'file'));
  try {
    if (target.exists) target.delete();
  } catch (e) {
    // fall through — create() below will report a real problem if there is one
  }
  target.create();
  target.write(base64ToBytes(match[2]));
  await Sharing.shareAsync(target.uri, { mimeType, dialogTitle: fileName || 'Open file' });
}
