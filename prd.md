# Project Overview & PRD: Acuspeak

## 1. Executive Summary

- Executive Brief
  - Acuspeak is a mobile-first English speaking practice platform that connects learners with bite-sized lessons, peer voice calls, challenges, and premium learning paths.
  - The app combines live partner matching, guided content, and gamification to help users build speaking confidence, vocabulary, and real-world conversation skills.

- Problem Statement
  - English learners often struggle to practice speaking in authentic contexts, access structured progress tracking, and stay motivated without accountability.
  - Existing language apps emphasize reading and listening, but many users need safe, easy access to live speaking practice with measurable progress.

- Proposed Solution & Unique Value Proposition (UVP)
  - Provide a single app where learners can join live rooms, match with real peers for voice practice, complete lessons and speaking tests, and earn recognition through streaks, certificates, and leaderboards.
  - Acuspeak stands out through peer voice interactions, phone and OAuth onboarding, referrals and premium subscriptions, and an integrated social safety/feedback loop.

## 2. Target Audience & User Personas

- Primary Persona
  - Demographics: English learners aged 16-40, including students, young professionals, exam takers, and travelers.
  - Pain Points:
    1. Lack of real speaking practice partners.
    2. Difficulty sustaining daily learning habits.
    3. Unclear progress across speaking, vocabulary, and confidence.
  - Goals:
    1. Practice conversation skills daily in a low-pressure environment.
    2. Track improvement with XP, certificates, and progress metrics.
    3. Access affordable premium content and live sessions.

- Secondary Persona
  - Use Cases:
    1. Casual learners who want topic-based conversation rooms and vocabulary review.
    2. Frequent travelers or professionals preparing for interviews and international communication.
    3. Learners who prefer phone-based OTP signup instead of OAuth.

## 3. Core Capabilities & Feature Requirements

### Feature 1: Onboarding & Authentication
- Description & Objective
  - Smooth user entry via onboarding slides, Google OAuth, and phone OTP signup.
  - Make registration fast, secure, and flexible for web/mobile.

- Functional Requirements
  1. Display onboarding carousel with brand vision and CTA.
  2. Allow users to skip to login.
  3. Support OAuth session exchange via `/api/auth/session`.
  4. Support phone OTP flow with `/api/auth/phone/send-otp` and `/api/auth/phone/verify-otp`.
  5. Persist session token securely using Expo Secure Store.
  6. Provide `/api/auth/me` to refresh user state.

- Edge Cases & Considerations
  - OTP mode currently supports mock verification; plan for Twilio integration later.
  - Handle expired sessions and invalid tokens by clearing local storage and redirecting to login.
  - Enforce unique referral code generation and avoid duplicate referral codes.

### Feature 2: Live Rooms and Voice Matching
- Description & Objective
  - Enable learners to join live rooms, host private or public practice sessions, and match with another learner for a voice call.

- Functional Requirements
  1. Fetch live rooms via `/api/rooms` and render in a discovery screen.
  2. Host a new room using `/api/rooms` with title, topic, and privacy settings.
  3. Join a room with `/api/rooms/join` and receive a room-specific voice token.
  4. Match with a partner using `/api/match?gender=` and navigate to the call flow.
  5. Use ZEGOCLOUD token endpoint `/api/zego/token` for real-time voice connection.
  6. Store call metadata via `/api/calls` and show call history.

- Edge Cases & Considerations
  - Do not generate ZEGOCLOUD room IDs on the client; server must issue them.
  - Handle voice engine lifecycle carefully to avoid re-render side effects during live calls.
  - Support room join failures and partner match timeouts gracefully.

### Feature 3: Lessons, Vocabulary, and Progress
- Description & Objective
  - Provide structured lessons, vocabulary review, and progress tracking to help learners stay on a learning path.

- Functional Requirements
  1. Fetch lesson categories with `/api/lessons/categories`.
  2. List lessons per category using `/api/lessons` and detail view `/api/lessons/{id}`.
  3. Mark lesson completion via `/api/lessons/complete`.
  4. Fetch lesson progress `/api/lessons/progress/all`.
  5. Provide vocabulary with `/api/vocab`, word of the day with `/api/vocab/word-of-the-day`, and save/unsave actions.
  6. Deliver quizzes via `/api/quiz` and speaking test submission `/api/speaking-test` with history `/api/speaking-test/history`.

- Edge Cases & Considerations
  - Ensure lessons load even if a category has no items.
  - Preserve lesson progress when the user returns after a break.
  - Avoid duplicate saved words and handle unsave idempotently.

### Feature 4: Gamification, Achievements, and Social Feed
- Description & Objective
  - Keep users motivated with XP, streaks, certificates, leaderboards, and friend interactions.

- Functional Requirements
  1. Track XP events with `/api/xp` and surface progress in the home/dashboard screen.
  2. Display achievements from `/api/achievements` and certificates earned by the user.
  3. Show leaderboard data from `/api/leaderboard`.
  4. Support friend requests via `/api/friends/request` and retrieval from `/api/friends/requests`.
  5. Allow report/block actions using `/api/reports` and `/api/block`.

- Edge Cases & Considerations
  - Prevent self-friend requests and duplicate friend request submissions.
  - Protect against fraudulent XP updates by validating reason and amount server-side.
  - Display fallback states when no leaderboard or achievements are available.

### Feature 5: Referral and Premium Subscription
- Description & Objective
  - Drive user acquisition through referrals and convert engaged users through premium plans.

- Functional Requirements
  1. Expose referral status via `/api/referral` and referral apply via `/api/referral/apply`.
  2. Generate shareable referral codes automatically for each user.
  3. Retrieve subscription plans from `/api/subscription/plans`.
  4. Create Stripe checkout sessions via `/api/subscription/checkout` and poll payment status `/api/subscription/status/{session_id}`.
  5. Surface premium benefits in the app and acknowledge successful payments on `/premium/success`.

- Edge Cases & Considerations
  - Use server-authoritative Stripe pricing and do not rely on client-side plan pricing.
  - Ensure referral discounts activate only after valid referral code application.
  - Manage session-based checkout state safely; do not expose user session tokens in checkout URLs.

## 4. Technical Architecture & Stack Specs

- Frontend Stack & UI Component Library
  - Expo-managed React Native with `expo-router`, `react-native-safe-area-context`, `expo-secure-store`, `expo-linear-gradient`, `react-native-reanimated`, and `react-native-svg`.
  - Core UI built in native React Native components with custom theming in `frontend/src/theme.ts`.
  - Navigation via file-based routing under `frontend/app/` and tabbed flows under `frontend/app/(tabs)/`.

- Backend / Database / API Integrations
  - FastAPI backend in `backend/server.py`.
  - MongoDB via Motor async client.
  - Stripe integration through `emergentintegrations.payments.stripe.checkout`.
  - ZEGOCLOUD voice token endpoint for real-time voice sessions.
  - Emergent OAuth session exchange for Google sign-in.

- Authentication & Authorization Flow
  - Public auth endpoints: `/api/auth/session`, `/api/auth/phone/send-otp`, `/api/auth/phone/verify-otp`, `/api/auth/phone/link`.
  - Protected API endpoints require `Authorization: Bearer <token>`.
  - Session token persistence on the client via secure storage and refresh via `/api/auth/me`.
  - Backend validates token existence and expiry against `user_sessions` collection.

- Folder/Directory Structure Proposal (AI Agent Readable)
  - `/app/prd.md` — product requirement document, single source of truth.
  - `/app/backend/` — FastAPI service, MongoDB models, server logic, integration with Stripe and ZEGOCLOUD.
    - `backend/server.py`
    - `backend/requirements.txt`
    - `backend/tests/` — backend API tests.
  - `/app/frontend/` — Expo app and UI.
    - `frontend/app/` — screen routes and pages.
    - `frontend/src/api/client.ts` — centralized API client.
    - `frontend/src/context/AuthContext.tsx` — auth state provider.
    - `frontend/src/theme.ts` — design tokens.
    - `frontend/src/utils/storage/` — secure storage wrappers.
    - `frontend/constants/testIds/` — UI automation identifiers.
  - `/app/design_guidelines.json` — brand and style reference.

## 5. System Workflows & User Flow

- User Journey
  1. Landing / Onboarding
     - User opens the app, sees onboarding slides, and taps "Get Started" or "Skip".
  2. Authentication
     - User selects login method: OAuth on web or phone OTP on mobile.
     - For OAuth, the frontend navigates to `/auth`, obtains `session_id`, and exchanges it for a `session_token`.
     - For OTP, the frontend sends phone number to `/api/auth/phone/send-otp`, then verifies code via `/api/auth/phone/verify-otp`.
  3. Home / Dashboard
     - Authenticated user lands in the main tab view, sees daily goals, active rooms, lessons, and progress.
  4. Core Learning
     - The user can consume lessons, save vocabulary, complete quizzes, and run speaking tests.
     - Lesson completion is recorded and progress is updated.
  5. Live Practice
     - User joins or hosts a room, receives room credentials, and connects to a voice call via ZEGOCLOUD.
     - Upon ending the call, the app logs call metadata to the backend.
  6. Engagement & Monetization
     - The user earns XP, collects achievements, invites friends via referral, and can upgrade to premium.
     - Premium unlocks additional live sessions, lessons, and rewards.

## 6. AI Agent Guidelines & Context Rules

- Coding Standards & Conventions
  - Prefer React Native functional components and hooks.
  - Keep API calls centralized in `frontend/src/api/client.ts`.
  - Use TypeScript types for props, API payloads, and response objects.
  - Follow existing naming conventions: camelCase for JS/TS, PascalCase for components, snake_case for backend JSON fields.

- Rules for State Management, API Error Handling, and Folder Organization
  - Manage authentication state in `AuthContext` only.
  - Keep UI state local to screens unless shared by multiple routes.
  - Use `expo-secure-store` through `frontend/src/utils/storage/` for tokens.
  - Handle API errors by parsing `response.detail` or `response.message` and surfacing concise UI feedback.
  - Do not introduce new routing patterns outside `frontend/app/` file-based routing without approval.
  - Keep backend routing under `/api` and maintain a clear separation between auth paths and feature paths.

- What NOT to Change / Modify Without Permission
  - Do not alter existing session and auth flow logic in `frontend/src/context/AuthContext.tsx` and `/api/auth/*` endpoints unless fixing critical bugs.
  - Do not change the ZEGOCLOUD token generation contract or client-side room ID handling; room IDs must remain server-issued.
  - Do not modify Stripe plan IDs or pricing logic without syncing with backend `STRIPE_PLANS` and Stripe dashboard.
  - App name and brand identity is Acuspeak across the repository.

## Appendix: Immediate Priorities for AI Agents

- Implement or extend missing backend API routes only after verifying existing route signatures in `backend/server.py`.
- Respect the current app architecture: Expo Router on the frontend, FastAPI + MongoDB on the backend.
- Keep PRD-based feature work incremental: start with auth, then lessons/vocab, then live rooms, then premium/referrals.
- Always write tests for backend endpoints and preserve security guards for protected paths.
