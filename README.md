# HiveAI --- AI Group Chat Mobile App

> **Collaborate. Chat. Create. With AI.**

HiveAI is a mobile-first AI collaboration platform built with **React
Native and Expo**. It combines real-time group chat, an AI assistant,
document-based Q&A (RAG), friends, notifications, file sharing, and
subscription-ready AI usage management in one application.

------------------------------------------------------------------------

## ✨ Project Overview

HiveAI allows users to:

-   Create and manage collaborative groups
-   Invite and communicate with friends
-   Chat in real time
-   Get AI responses directly inside group conversations
-   Use HiveAI as a standalone 1:1 AI assistant
-   Upload supported documents and ask questions about them
-   Store and retrieve document chunks using RAG
-   Track monthly AI usage
-   Use Free, Pro, Team, and Demo subscription experiences
-   Manage profile, privacy, account, and application settings
-   Receive notifications for important activity

### Core product idea

``` text
User
  ↓
Create / Join Group
  ↓
Group Chat
  ↓
Friends + Files + AI
  ↓
HiveAI understands the conversation
  ↓
AI response / RAG answer
```

------------------------------------------------------------------------

# 🚀 Main Features

## 1. Authentication

Complete authentication flow:

-   Splash screen
-   Login
-   Sign Up
-   Forgot Password
-   Create New Password
-   Persistent Firebase authentication session
-   Logout

Authentication is powered by **Firebase Authentication**.

------------------------------------------------------------------------

## 2. Dashboard / Home

The Home screen provides:

-   Groups list
-   Group search
-   Create group
-   Group navigation
-   Theme-aware UI
-   Quick access to the application's main features

------------------------------------------------------------------------

## 3. Friends

Users can connect with other registered users using email.

Supported flows:

-   Send friend request
-   Accept request
-   Reject request
-   View all friends
-   View received requests
-   View sent requests
-   Search by registered email

Friend data is stored in Firestore.

------------------------------------------------------------------------

## 4. Real-Time Group Chat

HiveAI provides collaborative real-time group messaging.

Features include:

-   Real-time messages
-   Firestore listeners
-   User avatars
-   Message bubbles
-   AI messages
-   File attachments
-   Group members
-   Conversation summary
-   AI typing state
-   Message timestamps

No Socket.io server is required for the current real-time messaging
implementation.

``` text
User A ──┐
User B ──┼──→ Firestore ←──→ HiveAI
User C ──┘
```

------------------------------------------------------------------------

## 5. AI Inside Group Chat

HiveAI can participate directly in group conversations.

Normal text messages can be processed by the AI according to the
application's AI flow.

Explicit AI mentions are also supported:

``` text
@HiveAI explain this problem
```

or:

``` text
@AI summarize this discussion
```

The mention is removed before the prompt is sent to the AI provider.

### AI flow

``` text
Group Message
     ↓
AI Processing
     ↓
Conversation / RAG Context
     ↓
AI Provider
     ↓
HiveAI Response
     ↓
Group Chat
```

------------------------------------------------------------------------

## 6. AI Assistant

The AI Assistant provides a standalone 1:1 conversation with HiveAI.

Users can:

-   Ask questions
-   Continue conversations
-   Receive AI-generated answers
-   Use uploaded documents as context
-   Use the same AI/RAG infrastructure independently of group chat

------------------------------------------------------------------------

# 📄 7. File Sharing & Document Analysis

Users can attach supported files from Group Chat or the AI Assistant.

Current document-oriented RAG support includes:

-   `.txt`
-   `.md`
-   `.csv`
-   `.json`
-   `.log`

### Current limitation

PDF and DOCX text extraction is intentionally not handled by the current
plain Expo Go implementation.

For those formats, export the document as `.txt` before uploading, or
introduce a backend/native extraction service in a future production
version.

------------------------------------------------------------------------

# 🧠 8. RAG --- Document Q&A

HiveAI includes a client-side Retrieval-Augmented Generation pipeline
using **LangChain.js text splitting** and OpenRouter embeddings.

### RAG pipeline

``` text
Document
   ↓
Document Picker
   ↓
Firebase Storage
   ↓
LangChain Text Splitter
   ↓
Document Chunks
   ↓
OpenRouter Embeddings
   ↓
Vectors
   ↓
Firestore
   ↓
Cosine Similarity Retrieval
   ↓
Relevant Passages
   ↓
AI Model
   ↓
Grounded Answer
```

Current embedding model:

``` text
nvidia/nemotron-3-embed-1b:free
```

Document chunks and vectors are stored under the application's RAG
document structure, including:

``` text
ragDocuments/{docId}/chunks
```

The AI uses retrieved passages as context when answering
document-related questions.

------------------------------------------------------------------------

# 💳 9. Subscription System

HiveAI includes a subscription experience with:

-   Free
-   Pro
-   Team
-   Demo mode

The current application includes subscription screens and usage
management.

## Recommended production subscription architecture

For a production release, subscription status should be validated
server-side rather than trusted from the mobile client.

Recommended model:

``` text
Mobile App
    ↓
Subscription Provider
    ↓
Verified Entitlement
    ↓
HiveAI Backend
    ↓
Group Subscription
    ↓
AI Usage Limits
```

Because HiveAI is designed around collaborative groups, subscription
ownership should be **group-wise**, rather than requiring every group
member to purchase an individual subscription.

### Example plans

  Plan               Groups   AI Usage RAG        Team Features
  ------ ------------------ ---------- ---------- ---------------
  Free              Limited    Limited Basic      Basic
  Pro                  More     Higher Yes        Yes
  Team     High / Unlimited       High Advanced   Advanced
  Demo                 Demo     Sample Limited    Demo

> Pricing, limits, and provider entitlements should be configured
> according to the final business model before production launch.

------------------------------------------------------------------------

# 📊 10. AI Usage Tracking

HiveAI includes monthly AI usage tracking.

The usage system can be used to display:

``` text
AI Usage

1,420 / 2,000

████████████░░░░

580 remaining
```

For production, usage enforcement should be handled by the backend.

Recommended tracked fields:

``` text
userId
groupId
subscriptionId
model
inputTokens
outputTokens
totalTokens
estimatedCost
createdAt
```

This makes it possible to monitor both user usage and AI operating cost.

------------------------------------------------------------------------

# 🔔 11. Notifications

The application supports notification flows for events such as:

-   Friend requests
-   Friend request updates
-   AI replies
-   Group activity
-   Other important application events

Expo notifications are used for mobile notification functionality.

------------------------------------------------------------------------

# 👤 12. Profile & Settings

Users can manage:

-   Profile
-   Edit profile
-   Account
-   Privacy & Security
-   Help & Support
-   AI Usage
-   Subscription
-   Theme

------------------------------------------------------------------------

# 🌗 13. Theme System

HiveAI supports:

-   Light mode
-   Dark mode
-   Persistent theme preference
-   Theme-aware components and screens

The theme system is implemented using shared design tokens and a
`ThemeContext`.

------------------------------------------------------------------------

# 🛠 Tech Stack

## Mobile

-   React Native
-   Expo SDK 57
-   React 19
-   React Native 0.86
-   React Navigation
-   Expo Dev Client
-   Expo Notifications
-   Expo Document Picker
-   Expo Image Picker
-   Expo Image Manipulator
-   React Native Safe Area Context

## Backend / Cloud Services

-   Firebase Authentication
-   Firebase Firestore
-   Firebase Storage

## AI

-   OpenAI
-   OpenRouter
-   LangChain.js
-   `@langchain/textsplitters`
-   Embeddings
-   Retrieval-Augmented Generation (RAG)
-   Cosine similarity retrieval

## Local Persistence

-   AsyncStorage

## Development

-   JavaScript
-   TypeScript configuration
-   Babel
-   Metro
-   npm
-   EAS Build

------------------------------------------------------------------------

# 📁 Project Structure

``` text
HiveAI/
│
├── App.js
├── index.ts
├── app.json
├── babel.config.js
├── metro.config.js
├── eas.json
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
│
├── assets/
│
└── src/
    │
    ├── components/
    │   ├── Avatar.js
    │   ├── Button.js
    │   ├── FormInput.js
    │   └── MessageBubble.js
    │
    ├── config.js
    │
    ├── context/
    │   └── AuthContext.js
    │
    ├── navigation/
    │   ├── AuthNavigator.js
    │   ├── MainTabNavigator.js
    │   └── RootNavigator.js
    │
    ├── screens/
    │   ├── auth/
    │   ├── chat/
    │   ├── main/
    │   ├── onboarding/
    │   └── settings/
    │
    ├── services/
    │   ├── ai.js
    │   ├── aiChats.js
    │   ├── embeddings.js
    │   ├── firebase.js
    │   ├── friends.js
    │   ├── groups.js
    │   ├── messages.js
    │   ├── notifications.js
    │   ├── push.js
    │   ├── rag.js
    │   ├── storage.js
    │   └── users.js
    │
    ├── theme/
    │   ├── colors.js
    │   └── ThemeContext.js
    │
    └── utils/
        └── user.js
```

------------------------------------------------------------------------

# ⚙️ Installation & Setup

## Prerequisites

Install:

-   Node.js
-   npm
-   Expo CLI / EAS CLI as required
-   Firebase project
-   OpenAI API key and/or OpenRouter API key for real AI features

------------------------------------------------------------------------

## Step 1 --- Clone / Open Project

``` bash
cd HiveAI
```

------------------------------------------------------------------------

## Step 2 --- Install Dependencies

``` bash
npm install
```

------------------------------------------------------------------------

# 🔐 Step 3 --- Environment Variables

Create `.env` from `.env.example`.

``` bash
cp .env.example .env
```

Configure Firebase:

``` env
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

AI provider variables:

``` env
EXPO_PUBLIC_OPENAI_API_KEY=your_openai_key
EXPO_PUBLIC_OPENROUTER_API_KEY=your_openrouter_key
```

### Security warning

Do **not** commit `.env` to Git.

Do not expose production OpenAI or OpenRouter secrets in a publicly
distributed mobile application.

For production, move AI provider calls to a secure backend/API and keep
provider secrets server-side.

------------------------------------------------------------------------

# 🔥 Step 4 --- Firebase Configuration

Create or select a Firebase project.

Enable:

``` text
Firebase Console
    │
    ├── Authentication
    │      └── Email/Password
    │
    ├── Firestore Database
    │
    └── Storage
```

Add the Firebase configuration values to `.env`.

------------------------------------------------------------------------

# 🛡 Firestore Security

Production Firestore rules must enforce access based on:

-   Authenticated user
-   Group membership
-   Group ownership
-   Friend relationships
-   Document ownership/access
-   User-specific data

Avoid using an unrestricted rule such as:

``` text
allow read, write: if request.auth != null;
```

for production.

Deploy the project's production rules when available:

``` bash
firebase deploy --only firestore:rules
```

------------------------------------------------------------------------

# 🤖 Step 5 --- AI Configuration

## Demo Mode

If a real AI provider key is unavailable, HiveAI can operate in demo
mode with sample AI responses where supported by the application.

``` text
No API key
    ↓
Demo Mode
    ↓
Sample AI response
```

## Real AI Mode

``` text
API key configured
    ↓
AI service
    ↓
OpenAI / OpenRouter
    ↓
Real response
```

------------------------------------------------------------------------

# ▶️ Step 6 --- Run the App

Start Expo:

``` bash
npx expo start
```

Then use:

``` text
Android device → Expo Go / Development Build
iOS device     → Expo Go / Development Build
Web            → Press W
```

For a native Android development build:

``` bash
npx expo run:android
```

------------------------------------------------------------------------

# 📱 Basic User Flow

``` text
Launch HiveAI
      ↓
Splash
      ↓
Login / Sign Up
      ↓
Home Dashboard
      ↓
Create Group
      ↓
Invite / Add Friends
      ↓
Open Group Chat
      ↓
Send Message
      ↓
HiveAI processes the conversation
      ↓
AI Response
```

### Document Q&A flow

``` text
Group Chat / AI Assistant
          ↓
       Attach File
          ↓
    Document Q&A
          ↓
      Upload File
          ↓
     Process Chunks
          ↓
      Create Embeddings
          ↓
     Store in Firestore
          ↓
       Ask Question
          ↓
    Retrieve Relevant Text
          ↓
       AI Answer
```

------------------------------------------------------------------------

# 🧪 Testing Checklist

Before release, test:

## Authentication

-   [ ] Sign Up
-   [ ] Login
-   [ ] Logout
-   [ ] Forgot Password
-   [ ] Session persistence
-   [ ] Invalid credentials

## Groups

-   [ ] Create group
-   [ ] Open group
-   [ ] Add members
-   [ ] Remove members
-   [ ] Group permissions

## Chat

-   [ ] Send message
-   [ ] Receive message in real time
-   [ ] AI response
-   [ ] `@HiveAI`
-   [ ] `@AI`
-   [ ] Attach file
-   [ ] Conversation summary

## Friends

-   [ ] Send request
-   [ ] Accept request
-   [ ] Reject request
-   [ ] Sent requests
-   [ ] Registered email validation

## RAG

-   [ ] Upload `.txt`
-   [ ] Upload `.md`
-   [ ] Upload `.csv`
-   [ ] Upload `.json`
-   [ ] Upload `.log`
-   [ ] Chunking
-   [ ] Embeddings
-   [ ] Retrieval
-   [ ] Grounded answer
-   [ ] Delete document

## Subscription

-   [ ] Free plan
-   [ ] Pro plan
-   [ ] Team plan
-   [ ] Demo mode
-   [ ] Usage meter
-   [ ] Usage limit
-   [ ] Expiry handling
-   [ ] Upgrade flow

## UI

-   [ ] Light theme
-   [ ] Dark theme
-   [ ] Small screen
-   [ ] Large screen
-   [ ] Keyboard behavior
-   [ ] Loading states
-   [ ] Error states

------------------------------------------------------------------------

# 🗺️ Development Roadmap

## Completed

-   [x] Project scaffold
-   [x] Theme system
-   [x] Navigation
-   [x] Splash / onboarding
-   [x] Login
-   [x] Sign Up
-   [x] Forgot Password
-   [x] Dashboard
-   [x] Groups
-   [x] Friends
-   [x] Real-time group chat
-   [x] AI group chat integration
-   [x] `@HiveAI` / `@AI` mentions
-   [x] AI Assistant
-   [x] File sharing
-   [x] File analysis
-   [x] Group members
-   [x] Subscription UI / demo activation
-   [x] AI usage screen
-   [x] Profile
-   [x] Settings
-   [x] Firebase Authentication
-   [x] Firestore
-   [x] Firebase Storage
-   [x] OpenAI integration
-   [x] Demo AI mode
-   [x] LangChain.js document splitting
-   [x] OpenRouter embeddings
-   [x] RAG retrieval
-   [x] Document-grounded answers

------------------------------------------------------------------------

# 🔮 Recommended Production Roadmap

### Phase 1 --- Real Subscription

-   [ ] Production subscription provider
-   [ ] Real Free / Pro / Team entitlements
-   [ ] Group-wise subscription ownership
-   [ ] Subscription renewal handling
-   [ ] Cancellation handling
-   [ ] Expiry handling

### Phase 2 --- Secure AI Backend

-   [ ] Backend API
-   [ ] Server-side OpenAI integration
-   [ ] Server-side OpenRouter integration
-   [ ] API key protection
-   [ ] Rate limiting
-   [ ] Server-side usage enforcement

### Phase 3 --- AI Cost & Analytics

-   [ ] Token tracking
-   [ ] AI request tracking
-   [ ] Cost estimation
-   [ ] Group usage analytics
-   [ ] Revenue vs AI cost dashboard

### Phase 4 --- Advanced RAG

-   [ ] Better retrieval
-   [ ] Re-ranking
-   [ ] Source citations
-   [ ] Document management
-   [ ] PDF extraction
-   [ ] DOCX extraction
-   [ ] Group document permissions

### Phase 5 --- Advanced Group AI

-   [ ] AI conversation memory
-   [ ] Message summarization
-   [ ] AI commands
-   [ ] Action-item extraction
-   [ ] AI task generation
-   [ ] AI streaming responses
-   [ ] Reply/thread context

### Phase 6 --- Admin Platform

-   [ ] Admin dashboard
-   [ ] User management
-   [ ] Group analytics
-   [ ] Subscription analytics
-   [ ] AI usage analytics
-   [ ] AI cost monitoring
-   [ ] Revenue monitoring

------------------------------------------------------------------------

# 🔒 Production Security Checklist

Before publishing HiveAI:

-   [ ] Remove production secrets from the mobile bundle
-   [ ] Move OpenAI/OpenRouter calls to a backend
-   [ ] Validate Firebase authentication server-side
-   [ ] Validate group membership
-   [ ] Protect Firestore collections
-   [ ] Protect Storage paths
-   [ ] Validate subscription entitlements server-side
-   [ ] Enforce AI usage limits server-side
-   [ ] Add rate limiting
-   [ ] Add abuse protection
-   [ ] Validate uploaded files
-   [ ] Restrict document access by group/user
-   [ ] Never trust subscription or usage values supplied only by the
    client

------------------------------------------------------------------------

# 💡 Product Vision

HiveAI is designed to go beyond a normal AI chatbot.

The long-term product direction is:

``` text
                  HIVEAI
                    │
        ┌───────────┴───────────┐
        │                       │
   Collaboration             AI
        │                       │
   ┌────┼────┐          ┌───────┼───────┐
   │    │    │          │       │       │
 Groups Friends Chat    Chat    RAG   Automation
   │         │          │       │       │
   └─────────┴──────────┴───────┴───────┘
                    │
               AI Workspace
```

The goal is to provide a shared workspace where people can **chat,
collaborate, share knowledge, and work with AI together**.

------------------------------------------------------------------------

# 📌 Important Notes

-   HiveAI currently uses Firebase Firestore listeners for real-time
    messaging.
-   No separate Socket.io server is required for the current chat
    implementation.
-   RAG currently supports text-oriented document formats listed above.
-   PDF/DOCX extraction requires additional native or backend
    processing.
-   Demo mode is useful for development and product demonstrations.
-   Production AI API keys should be kept on a secure backend.
-   Subscription and AI usage enforcement should be server-side in
    production.
-   Friend requests depend on the target user being registered with the
    relevant email.

------------------------------------------------------------------------

# 📄 License

This project is distributed under the license included in the
repository's `LICENSE` file.

------------------------------------------------------------------------

## HiveAI

**Collaborate. Chat. Create. With AI.**

Built with React Native, Expo, Firebase, OpenAI, OpenRouter, and
LangChain.js.
