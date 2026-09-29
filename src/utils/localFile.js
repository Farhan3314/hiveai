import { File } from 'expo-file-system';

// Picker URIs can contain %20 / other escapes (file names with spaces, Urdu
// names, brackets…). Try the URI as given first, then the decoded form.
export function openLocalFile(uri) {
  const candidates = [uri];
  try {
    const decoded = decodeURI(uri);
    if (decoded !== uri) candidates.push(decoded);
  } catch (e) {
    // ignore malformed escape sequences
  }
  let first;
  for (const c of candidates) {
    try {
      const f = new File(c);
      if (!first) first = f;
      if (f.exists) return f;
    } catch (e) {
      // try next candidate
    }
  }
  return first || new File(uri);
}
