# HiveAI — Mobile App

Collaborate. Chat. Create. With AI.

## What's included

- **Expo SDK 57** (React Native 0.86 / React 19.2) mobile app
- **Firebase** — Auth, Firestore (real-time), Storage
- **Theme system** — Dark/light mode with persistence
- **Auth flow** — Splash, Login, Sign Up, Forgot Password
- **Dashboard** — Groups list with search + create group
- **Friends** — Send/accept requests by email, tabs (All / Requests / Sent)
- **Group Chat** — Real-time messages via Firestore, file attachments
- **@HiveAI mentions** — AI replies in group chat when you mention `@HiveAI` or `@AI`
- **AI Assistant tab** — Standalone 1:1 chat with HiveAI
- **File Analysis** — Upload + AI analysis of documents
- **Notifications** — Friend requests, AI replies, etc.
- **Subscription plans** — Free / Pro / Team (demo activation)
- **AI Usage tracking** — Monthly usage meter per plan
- **Profile & Settings** — Edit profile, account, privacy, help

## Setup

### Step 1: Create environment file

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Example:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456

EXPO_PUBLIC_OPENAI_API_KEY=sk-your-key-here
EXPO_PUBLIC_OPENROUTER_API_KEY=your_openrouter_key_optional
```

### Step 2: Firebase

In the Firebase Console, enable:
- **Authentication → Email/Password**
- **Firestore Database**
- **Storage**

Then paste your project credentials into the env variables above.

Suggested Firestore rules (dev):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 3: OpenAI / AI providers (optional)

If you want AI features to use a real model, add:

```env
EXPO_PUBLIC_OPENAI_API_KEY=sk-your-key-here
```

Without a key, AI features run in **demo mode** with sample responses.

### Step 4: Run the app

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** or press `w` for web.

## How to use

1. **Sign up** with email/password
2. **Create a group** from the Home tab
3. **Chat** — type messages; use `@HiveAI` for AI help
4. **Attach files** — tap 📎 in chat → auto-opens File Analysis
5. **Add friends** — Friends tab → enter their registered email
6. **AI tab** — direct conversation with HiveAI

## Folder structure

```
HiveAI/
├── App.js
├── src/
│   ├── components/     # Button, FormInput, Avatar, MessageBubble
│   ├── config.js       # Env-based app config
│   ├── context/        # AuthContext
│   ├── navigation/     # Root, Auth, Tab navigators
│   ├── screens/        # All app screens
│   ├── services/       # firebase, groups, messages, friends, ai, storage
│   ├── theme/          # Design tokens
│   └── utils/          # Shared helpers
```

## Roadmap

- [x] **Step 1** — Project scaffold, theme, navigation
- [x] **Step 2** — Splash / Onboarding screens
- [x] **Step 3** — Auth screens (Login, Signup, Forgot Password)
- [x] **Step 4** — Dashboard (Home) + Friends (Firestore)
- [x] **Step 5** — Group Chat + @HiveAI mentions + AI typing
- [x] **Step 6** — File Sharing + Analysis
- [x] **Step 7** — Members + Subscription + AI Usage
- [x] **Step 8** — Profile / Settings screens
- [x] **Step 9** — Firebase (Auth, Firestore, Storage)
- [x] **Step 10** — OpenAI integration (demo mode without key)
- [x] **Step 11** — RAG: document chunking (LangChain.js splitter) + embeddings (OpenRouter free model) + retrieval-grounded answers, in Group Chat and the AI Assistant tab

## RAG (Document Q&A)

- Supported file types: `.txt`, `.md`, `.csv`, `.json`, `.log`. PDF/DOCX text extraction needs native code or a backend, which this project intentionally avoids to keep running in plain **Expo Go**. Export those as `.txt` first.
- Pipeline (fully client-side, no backend): `expo-document-picker` → Firebase Storage upload → `@langchain/textsplitters` chunking → OpenRouter embeddings (`nvidia/nemotron-3-embed-1b:free`) → chunks + vectors stored in Firestore (`.../ragDocuments/{docId}/chunks`) → cosine-similarity retrieval at query time → answer generated only from retrieved passages.
- Attach a supported file in a **Group Chat** or the **AI Assistant** tab to open the Document Q&A screen (upload/processing status shown live), or just ask a question afterwards in that same group/chat — HiveAI will automatically use the uploaded document(s) as context.
- Requires `EXPO_PUBLIC_OPENROUTER_API_KEY` (same key already used for chat replies).

## Notes

- Real-time chat uses **Firestore listeners** (no separate Socket.io server needed)
- For production, move OpenAI calls to a backend to protect API keys
- Friend requests require the other user to be registered with the same email
