// Local file handling — Firebase Storage (Blaze/paid plan) has been removed.
//
// Instead of uploading bytes to a paid storage bucket, files picked on the
// device are read locally and converted into a base64 "data:" URI. That
// string is then saved directly on the Firestore message/profile document
// (e.g. `fileUrl`, `photoURL`), which is what every screen already expects.
// This keeps everything on Firebase's free Spark plan (Auth + Firestore only).
//
// Trade-off to be aware of: Firestore caps a single document at 1 MiB, and
// base64 text is ~33% bigger than the raw file. Avatars get around this
// automatically — see compressAvatar() below, which resizes/re-compresses
// the photo on-device until it comfortably fits, so ANY original photo size
// (a 12MP camera shot, a screenshot, whatever) is accepted. Chat/AI file
// attachments (PDFs, docs, etc.) can't be losslessly shrunk the same way, so
// those still enforce MAX_FILE_BYTES and ask the user to pick a smaller file.

import * as ImageManipulator from 'expo-image-manipulator';

const MAX_FILE_BYTES = 700 * 1024; // ~700KB raw -> ~950KB base64, safely under 1MiB
const AVATAR_TARGET_BYTES = 300 * 1024; // final base64 size we aim the avatar under

const sanitizeFileName = (fileName = 'file') =>
  String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');

const detectContentType = (fileName, fallback = 'application/octet-stream') => {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.csv')) return 'text/csv';
  return fallback;
};

const readBlobFromUri = async (uri, fileName) => {
  if (!uri) {
    throw new Error('No file URI was provided.');
  }

  try {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`File read failed with status ${response.status}`);
    }
    return await response.blob();
  } catch (error) {
    const xhr = new XMLHttpRequest();
    return await new Promise((resolve, reject) => {
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`File read failed with status ${xhr.status}`));
        }
      };
      xhr.onerror = () => {
        reject(new Error(`Could not read ${fileName || 'file'} from the device.`));
      };
      xhr.open('GET', uri);
      xhr.send();
    });
  }
};

const blobToDataUri = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file into memory.'));
    reader.readAsDataURL(blob);
  });

const fileToDataUri = async (uri, fileName, { maxBytes } = {}) => {
  const blob = await readBlobFromUri(uri, fileName);

  if (maxBytes && blob.size > maxBytes) {
    const limitKb = Math.round(maxBytes / 1024);
    throw new Error(
      `"${fileName || 'This file'}" is too large (${Math.round(blob.size / 1024)}KB). ` +
        `Please choose a file under ${limitKb}KB — attachments are stored locally, not in paid cloud storage.`
    );
  }

  let dataUri = await blobToDataUri(blob);

  // Some RN environments return a generic "application/octet-stream" mime
  // from FileReader; normalize it using the file extension when possible.
  const contentType = detectContentType(fileName, blob.type || 'application/octet-stream');
  if (contentType && !dataUri.startsWith(`data:${contentType}`)) {
    const commaIndex = dataUri.indexOf(',');
    if (commaIndex !== -1) {
      dataUri = `data:${contentType};base64,${dataUri.slice(commaIndex + 1)}`;
    }
  }

  return dataUri;
};

// Resizes + compresses a photo on-device until its base64 form comfortably
// fits in a Firestore field, no matter how large the original file was.
// Shrinks width and JPEG quality step by step, so a huge camera photo still
// converges to a small, sharp-enough profile picture in a few iterations.
async function compressAvatar(uri) {
  let width = 512;
  let quality = 0.7;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );

    const dataUri = `data:image/jpeg;base64,${result.base64}`;
    const isLastAttempt = attempt === 5;
    if (dataUri.length <= AVATAR_TARGET_BYTES || isLastAttempt) {
      return dataUri;
    }

    // Still too big — shrink dimensions and quality further, then retry.
    width = Math.max(96, Math.round(width * 0.75));
    quality = Math.max(0.3, quality - 0.15);
  }

  throw new Error('Could not process this image. Please try a different photo.');
}

export async function uploadAvatar(uid, uri) {
  if (!uid) throw new Error('User account is not available. Please log in again.');

  try {
    return await compressAvatar(uri);
  } catch (error) {
    console.error('uploadAvatar error:', error);
    throw new Error(error?.message || 'Image processing failed.');
  }
}

export async function uploadChatFile(groupId, uri, fileName) {
  const safeName = sanitizeFileName(fileName || 'file');
  const url = await fileToDataUri(uri, fileName, { maxBytes: MAX_FILE_BYTES });
  return { url, fileName: safeName };
}

// Same as uploadChatFile but scoped to a user's personal AI Assistant
// conversation (users/{uid}/aiChats/{chatId}) instead of a group.
export async function uploadAIChatFile(userId, chatId, uri, fileName) {
  const safeName = sanitizeFileName(fileName || 'file');
  const url = await fileToDataUri(uri, fileName, { maxBytes: MAX_FILE_BYTES });
  return { url, fileName: safeName };
}