# HiveAI — fixes & new features

## Upload rules (final)

| Type | What you can pick | Max size | What happens |
|------|-------------------|----------|--------------|
| Photo (JPG/PNG/WEBP/…) | any image from the gallery | **25 MB** picked | compressed on-device to ~650 KB and saved as JPEG (animated GIFs become still images). AI analyses it. |
| Document the AI can read | **PDF, Word (.docx), .txt, .md, .csv, .json, .log** | **8 MB** | text is extracted on the phone and indexed for Q&A. If the file is ≤ 700 KB it is also kept inside the chat (tap to open/share); bigger files are analysed but not stored in the chat. |
| Other files | not offered in the picker any more | 700 KB | — |
| Profile photo | any image | compressed to ~300 KB | — |

Extra limits: only the first 200,000 characters of a document are indexed (a note is shown); scanned/image-only PDFs and password-protected PDFs can't be read (clear message is shown).

## Bugs fixed
- **Documents could never be opened** from a chat bubble ("Preview not available") → now opens via the system share sheet (needs `expo-sharing`).
- **PDF / Word files were rejected by the AI** ("unsupported") → on-device extraction added (`src/services/textExtractCore.js`, uses `fflate`).
- **Size errors appeared only after pressing Send** → files are now validated the moment they are picked.
- **Big documents were rejected outright (700 KB)** → they can now be analysed up to 8 MB.
- Document bytes were **duplicated into `ragDocuments`** (~930 KB, near Firestore's 1 MiB limit) → removed.
- **/summarize and /tasks used the OLDEST messages** (first 200 messages / first 6000 characters) → now use the newest.
- **Chat screens downloaded the entire message history** (every photo included) → live window of the newest 300 messages.
- **Editing a message in the AI Assistant fed the old text + stale reply back to the AI as history** → fixed.
- **Internal "(debug: …)" details, provider names and version stamps were shown to end users** → now only in dev builds.
- **Security rule hole:** any signed-in user who knew a group id could rewrite the whole group by adding themselves to `memberIds` → non-members may now only add *themselves* (`memberIds`/`membersCount` only). **Redeploy `firestore.rules`.**
- `.env` (contains the OpenRouter key) was **not in `.gitignore`** → added.
- Embedding requests batched 16 per call (was 8) to save free-tier OpenRouter requests.

## After unzipping
1. `npm install`
2. Because `expo-sharing` is a native module, rebuild the dev client once: `npx expo run:android` (Expo Go already includes it).
3. `firebase deploy --only firestore:rules`

## Known limitations (need a backend, not fixable in the app alone)
- `EXPO_PUBLIC_OPENROUTER_API_KEY` is bundled into the app, so anyone can extract it. Rotate the key you shared and, before a public release, route AI calls through a small server/Cloud Function.
- Monthly AI limits are enforced on the client; a modified client could reset its own counter.
- Every signed-in user can read every profile (needed for find-by-email).
