import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { embedTexts, embedOne, cosineSimilarity } from './embeddings';
import { RAG_SUPPORTED_EXTENSIONS } from '../config';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 150;
const EMBED_BATCH_SIZE = 8;
const MIN_SIMILARITY = 0.15;

export function getFileExtension(fileName = '') {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function isRAGSupported(fileName) {
  return RAG_SUPPORTED_EXTENSIONS.includes(getFileExtension(fileName));
}

async function chunkText(text) {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const chunks = await splitter.splitText(text || '');
  // Drop near-empty fragments (e.g. trailing whitespace-only chunks) so we
  // never waste an embedding call — and never store a chunk with no content.
  return chunks.map((c) => c.trim()).filter((c) => c.length > 0);
}

function ragDocsCollection(scopePath) {
  return collection(db, ...scopePath.split('/'), 'ragDocuments');
}

function ragChunksCollection(scopePath, docId) {
  return collection(db, ...scopePath.split('/'), 'ragDocuments', docId, 'chunks');
}

/**
 * Turns raw uploaded text into a searchable set of embedded chunks stored in
 * Firestore under `${scopePath}/ragDocuments/{docId}/chunks`.
 *
 * scopePath examples:
 *   - `groups/${groupId}`               (shared with the whole group)
 *   - `users/${uid}/aiChats/${chatId}`  (private to one AI Assistant chat)
 *
 * onProgress(status, detail) is called as processing advances so the UI can
 * show "Uploading -> Processing -> Completed" (FR-028 style feedback).
 */
export async function ingestDocument({ scopePath, fileName, fileUrl, text, onProgress }) {
  const notify = (status, detail) => onProgress && onProgress(status, detail);

  const docsRef = ragDocsCollection(scopePath);
  const docRef = await addDoc(docsRef, {
    fileName,
    fileUrl: fileUrl || null,
    status: 'processing',
    chunkCount: 0,
    error: null,
    createdAt: serverTimestamp(),
  });

  try {
    notify('processing', 'Splitting document into chunks...');
    const chunks = await chunkText(text);

    if (chunks.length === 0) {
      await setDoc(docRef, { status: 'error', error: 'No readable text found in this file.' }, { merge: true });
      notify('error', 'No readable text found in this file.');
      return { docId: docRef.id, chunkCount: 0 };
    }

    let embedded = 0;
    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await embedTexts(batch);

      const writeBatchOp = writeBatch(db);
      batch.forEach((chunkStr, j) => {
        const chunkRef = doc(ragChunksCollection(scopePath, docRef.id));
        writeBatchOp.set(chunkRef, {
          text: chunkStr,
          embedding: vectors[j],
          order: i + j,
        });
      });
      await writeBatchOp.commit();

      embedded += batch.length;
      notify('processing', `Embedding chunk ${embedded}/${chunks.length}...`);
    }

    await setDoc(docRef, { status: 'ready', chunkCount: chunks.length }, { merge: true });
    notify('ready', `Ready — ${chunks.length} chunks indexed.`);
    return { docId: docRef.id, chunkCount: chunks.length };
  } catch (e) {
    console.error('ingestDocument error:', e);
    await setDoc(docRef, { status: 'error', error: e.message }, { merge: true }).catch(() => {});
    notify('error', e.message);
    throw e;
  }
}

/**
 * Retrieves the topK most relevant chunks for a question across every
 * "ready" document in scopePath (or a single docId, if provided).
 */
export async function retrieveContext({ scopePath, docId, question, topK = 4 }) {
  const docsRef = ragDocsCollection(scopePath);
  const readyQuery = query(docsRef, where('status', '==', 'ready'));
  const docsSnap = docId
    ? { docs: [await getDoc(doc(db, ...scopePath.split('/'), 'ragDocuments', docId))] }
    : await getDocs(readyQuery);

  const readyDocs = docsSnap.docs.filter((d) => d.exists() && d.data().status === 'ready');
  if (readyDocs.length === 0) return [];

  const allChunks = [];
  for (const d of readyDocs) {
    const chunksSnap = await getDocs(ragChunksCollection(scopePath, d.id));
    chunksSnap.docs.forEach((c) => {
      const data = c.data();
      allChunks.push({ text: data.text, embedding: data.embedding, fileName: d.data().fileName });
    });
  }
  if (allChunks.length === 0) return [];

  const questionVector = await embedOne(question);
  const scored = allChunks
    .map((c) => ({ ...c, score: cosineSimilarity(questionVector, c.embedding) }))
    .filter((c) => c.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ text, fileName, score }) => ({ text, fileName, score }));
}

export async function hasReadyDocuments(scopePath) {
  const docsRef = ragDocsCollection(scopePath);
  const readyQuery = query(docsRef, where('status', '==', 'ready'));
  const snap = await getDocs(readyQuery);
  return !snap.empty;
}
