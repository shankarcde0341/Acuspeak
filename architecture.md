# Project Architecture

## Overview
This repository contains a mobile/web app built with Expo + React Native and a backend API built with FastAPI. The app is a language learning platform named Acuspeak with authentication, lessons, speaking tests, live rooms, and referral features.

## High-level App Flow

1. App startup
   - `frontend/app/_layout.tsx` initializes fonts, icons, splash screen, gesture handling, and the auth provider.
   - `AuthGate` in `_layout.tsx` checks user authentication state and routes users to either public screens or the authenticated tabbed experience.

2. Authentication flow
   - The app supports OAuth sign-in via Emergent-managed auth redirect and phone OTP sign-in.
   - `frontend/app/auth.tsx` handles OAuth redirect callback and exchanges `session_id` with backend using `AuthContext`.
   - `frontend/app/login.tsx` renders the login screen and handles Google sign-in, email/phone OTP, and referral input.
   - `frontend/src/context/AuthContext.tsx` stores user state, bootstrap auth data on load, and provides sign-in/sign-out methods.
   - `frontend/src/api/client.ts` manages backend calls, session token storage, and headers for authenticated API requests.

3. Authenticated app navigation
   - Once authenticated, the user is routed to `frontend/app/(tabs)/_layout.tsx`, which renders bottom tabs for Home, Practice, Live, and Profile.
   - Main authenticated screens are located under `frontend/app/` and include core features like lessons, call history, challenges, leaderboard, and referrals.

4. Backend API and data flow
   - The backend is implemented in `backend/server.py` using FastAPI and MongoDB.
   - The backend exposes an `/api` router with routes for auth, profile, lessons, vocabulary, matching, calls, friends, reports, rooms, leaderboard, achievements, subscription, and Zego token generation.
   - `frontend/src/api/client.ts` calls backend endpoints under `/api`, using `process.env.EXPO_PUBLIC_BACKEND_URL` as the backend base URL.

## Folder Structure

- `/app`
  - `architecture.md` - project architecture summary (this file)
  - `backend/` - Python backend service
    - `server.py` - main FastAPI application and route definitions
    - `requirements.txt` - Python dependencies
    - `tests/` - backend unit tests
  - `frontend/` - Expo-managed React Native app
    - `app/` - Expo Router entry routes and screen files
      - `+html.tsx` - main HTML shell for web
      - `_layout.tsx` - root layout with auth gating and global providers
      - `auth.tsx` - OAuth return callback handler
      - `login.tsx` - login and phone OTP flow
      - `onboarding.tsx` - onboarding/public entry screen
      - `premium.tsx`, `settings.tsx`, `privacy.tsx`, `terms.tsx` - supporting screens
      - `room/`, `lesson/`, `lessons/`, `premium/`, `(tabs)/` - route groups and nested navigation
    - `src/` - shared app utilities and theme
      - `api/client.ts` - API client wrapper and request handling
      - `context/AuthContext.tsx` - auth provider and user session management
      - `hooks/` - custom hooks for fonts and icons
      - `theme.ts` - design tokens and styling constants
      - `utils/storage/` - secure storage abstraction for tokens
    - `package.json` - frontend dependency and script definitions
    - `tsconfig.json` - TypeScript configuration
    - `eslint.config.js` - linting config
    - `scripts/` - project support scripts
  - `memory/`, `test_reports/`, `tests/`, `README.md`, `prd.md`, `rules.md` - supporting documentation and QA data

## Key Files

- `frontend/app/_layout.tsx` - application shell, splash screen, auth gate, provider wrappers
- `frontend/app/login.tsx` - sign-in screen and authentication entry points
- `frontend/app/auth.tsx` - OAuth callback and session exchange handler
- `frontend/app/(tabs)/_layout.tsx` - tab navigation bar and authenticated layout
- `frontend/src/context/AuthContext.tsx` - user auth state and local token management
- `frontend/src/api/client.ts` - fetch wrapper and backend endpoint definitions
- `backend/server.py` - FastAPI app, models, auth helpers, and API route implementations
- `backend/requirements.txt` - backend Python dependency list

## Tech Stack

- Frontend:
  - Expo Router
  - React Native
  - React 19
  - TypeScript
  - Expo packages: `expo`, `expo-linear-gradient`, `expo-linking`, `expo-splash-screen`, `expo-web-browser`, `expo-secure-store`, `expo-image`, `expo-speech`, `expo-blur`
  - React Native libraries: `react-native-gesture-handler`, `react-native-reanimated`, `react-native-safe-area-context`, `react-native-svg`, `react-native-webview`
  - State management: React Context (`AuthContext`)
  - Navigation: file-based routing via Expo Router

- Backend:
  - Python / FastAPI
  - MongoDB via `motor` and `pymongo`
  - Async HTTP client: `httpx`
  - Environment loading: `python-dotenv`
  - Auth utilities: `pyjwt`, `bcrypt`, `passlib`
  - Data validation: `pydantic`
  - Stripe integration: `emergentintegrations.payments.stripe`

- Other:
  - `yarn` for frontend package management
  - `uvicorn` for serving FastAPI
  - `pytest` for backend tests
  - Linting / formatting tools: `black`, `isort`, `flake8`, `mypy`

## Runtime Architecture

- Mobile/web frontend renders using Expo Router and conditional auth gating.
- Auth state is persisted in secure storage and refreshed from backend `/auth/me`.
- Backend stores users, sessions, and app data in MongoDB.
- API endpoints are exposed under `/api` and accessed by the frontend client.
- Live room token generation is delegated through a `/api/zego/token` endpoint.
- Payment checkout and status polling are handled via subscription endpoints and Stripe webhooks.

## Notes for AI Agents

- The app uses file-system routing under `frontend/app` to derive navigation.
- The main entry is `frontend/app/_layout.tsx`.
- Cross-cutting auth logic lives in `frontend/src/context/AuthContext.tsx` and `frontend/src/api/client.ts`.
- The backend is a single-file FastAPI service in `backend/server.py`; this is the primary source for API behavior.
- Environment configuration is loaded from `.env` files in frontend and backend.
- The default API prefix is `/api` and backend calls are made from `frontend/src/api/client.ts`.
