import { openLocalFile } from '../utils/localFile';
import { RAG_SUPPORTED_EXTENSIONS, UPLOAD_LIMITS } from '../config';
import { extractPdfText, extractDocxText, cleanText } from './textExtractCore';

function extensionOf(fileName = '') {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

// Turns a picked file (local file:// URI) into plain text for document Q&A.
//  - .pdf / .docx are parsed on-device (pure JS, no native module)
//  - everything else supported (txt, md, csv, json, log) is read as UTF-8
//
// Reads through expo-file-system's `File` class, never `fetch(fileUri)`: RN's
// fetch would build a Blob from raw bytes, which throws "Creating blobs from
// 'ArrayBuffer' and 'ArrayBufferView' are not supported".
//
// Returns { text, truncated } — text is capped at UPLOAD_LIMITS.documentTextMaxChars
// so a huge file can't trigger thousands of embedding requests.
export async function extractTextFromFile(uri, fileName) {
  const ext = extensionOf(fileName);
  if (!RAG_SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new Error(`.${ext || 'this'} files can't be read by the AI yet.`);
  }

  const file = openLocalFile(uri);
  if (!file.exists) throw new Error('Could not read the file from the device.');

  let text;
  if (ext === 'pdf') {
    text = extractPdfText(await file.bytes());
  } else if (ext === 'docx') {
    text = extractDocxText(await file.bytes());
  } else {
    text = cleanText(await file.text());
  }

  const max = UPLOAD_LIMITS.documentTextMaxChars;
  if (text.length > max) return { text: text.slice(0, max), truncated: true };
  return { text, truncated: false };
}
