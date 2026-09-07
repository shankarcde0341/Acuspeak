# Acuspeak — Agent Memory File

> **Purpose:** This file is the single source of truth for any AI agent working on this project.
> Read this file BEFORE making any changes. Update the **Change Log** section after every successful change.
> Do NOT create a new memory file — always append dated entries to the Change Log below.

---

## Project Overview

| Field | Value |
|---|---|
| **Name** | Acuspeak |
| **Type** | Mobile-first English speaking practice app |
| **Platform** | Expo / React Native (web-compatible via Expo Web) |
| **Target Audience** | Indian English learners (beginners → advanced), job seekers, travelers, working professionals who want to improve spoken English fluency through structured lessons and interactive conversation practice |
| **Design Language** | Blue & white gradient, glassmorphism cards, rounded corners, smooth animations, Manrope font family |
| **Status** | Active development — backend + frontend both running locally |

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Expo 54 / React 19 / React Native 0.81.5, TypeScript, `expo-router` (file-based routing) |
| **Backend** | FastAPI (Python) + Motor (async MongoDB driver) |
| **Database** | MongoDB — collections listed below |
| **Auth** | Emergent demo OAuth (session exchange) + Phone OTP (mock mode) |
| **Payments** | Stripe via `emergentintegrations` wrapper (server-side only) |
| **RTC / Voice** | ZEGOCLOUD Token04 (server-side token generation; voice UI is mocked) |
| **Dev Server (Frontend)** | `npx expo start --web --port 8081` |
| **Dev Server (Backend)** | `uvicorn server:app --host 0.0.0.0 --port 8000` |
| **Backend venv** | `d:\SETUP\PRACTICE\Lingua_app\backend\venv\` |

---

## Workspace Layout

```
Lingua_app/
├── backend/
│   ├── server.py          ← Single-file FastAPI app (ALL backend logic here)
│   ├── requirements.txt
│   ├── venv/
│   └── tests/
├── frontend/
│   ├── app/               ← Expo Router file-based pages
│   │   ├── (tabs)/        ← Bottom tab screens (index, practice, live, profile)
│   │   ├── lesson/[id].tsx
│   │   ├── lessons/[categoryId].tsx
│   │   ├── login.tsx, onboarding.tsx, call.tsx, match.tsx, etc.
│   │   └── premium/, room/, etc.
│   ├── src/
│   │   ├── api/client.ts  ← All API calls (uses EXPO_PUBLIC_BACKEND_URL)
│   │   ├── context/AuthContext.tsx
│   │   ├── components/
│   │   │   ├── ScriptRolePlayer.tsx  ← Interactive lesson component
│   │   │   └── ui/  ← Shared UI components
│   │   └── theme.ts
│   └── package.json
├── memory/
│   └── PRD.md             ← Original product requirements doc
├── memory.md              ← THIS FILE — agent memory
├── rules.md               ← AI agent operating rules (read before working)
├── architecture.md        ← System architecture overview
├── design.md              ← Design system reference
├── design_guidelines.json ← Detailed visual design spec
└── prd.md                 ← Full product requirements
```

---

## MongoDB Collections

| Collection | Key Fields |
|---|---|
| `users` | `user_id`, `email`, `name`, `picture`, `english_level`, `xp`, `streak`, `last_active_date`, `daily_goal_minutes`, `daily_goal_completed_minutes`, `is_premium`, `premium_plan`, `premium_until`, `saved_words`, `friends`, `blocked`, `achievements`, `certificates`, `phone`, `referral_code`, `referred_by`, `referral_count`, `referral_discount_active`, `created_at` |
| `user_sessions` | `session_token`, `user_id`, `expires_at` (TTL index), `created_at` |
| `rooms` | `room_id`, `title`, `topic`, `host_name`, `host_avatar`, `participant_count`, `is_private`, `is_seed`, `created_at` |
| `calls` | `call_id`, `user_id`, `partner_name`, `partner_avatar`, `duration_seconds`, `created_at` |
| `payments` | Stripe checkout session data |
| `phone_otps` | `phone`, `code`, `expires_at` (TTL), `attempts` |
| `lesson_progress` | per-user lesson completion records |
| `speaking_tests` | scored test results |
| `daily_challenges` | challenge completion records |
| `friend_requests` | user-to-user friend request records |
| `reports` | user report records |

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Notes |
|---|---|
| `MONGO_URL` | **Required.** MongoDB connection string |
| `DB_NAME` | Optional; defaults to `acuspeak` |
| `STRIPE_API_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `ZEGO_APP_ID` | ZEGOCLOUD App ID |
| `ZEGO_SERVER_SECRET` | Must be exactly 32 chars for Token04 |
| `OTP_MODE` | `mock` (default) or `twilio` |

### Frontend (`frontend/.env`)
| Variable | Notes |
|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | Points at running backend, e.g. `http://localhost:8000` |

---

## Lesson Content Architecture

All lesson content is defined in `backend/server.py` as Python data structures. No external DB or CMS is used for lesson content.

### Lesson Categories (4 active categories)

| Category ID | Display Name | Lessons | Status |
|---|---|---|---|
| `daily` | Daily English | 10 | ✅ All interactive (have scripts) |
| `business` | Business English | 10 | ✅ All interactive (have scripts) |
| `interview` | Interview English | 10 | ✅ All interactive (have scripts) |
| `travel` | Travel English | 10 | ✅ All interactive (have scripts) |

> **IELTS & Exams** category was removed per user request (2026-08-08).

### Interactive Lesson Pattern

Each lesson with a `script` is rendered by `ScriptRolePlayer` on the frontend. Lessons WITHOUT a script fall back to the static `content[]` card layout.

**Backend pattern:**
```python
SCRIPT_NAME = [
    {"line_id": "xx-l1", "speaker": "Speaker A", "text": "Dialogue line..."},
    ...  # 10 lines per lesson
]
# In LESSONS list:
_lesson("category", number, "Title", "Description", "Level", duration_minutes, script=SCRIPT_NAME)
```

**`_lesson()` helper** produces a dict with: `id` (e.g. `daily-1`), `category_id`, `title`, `description`, `level`, `duration_minutes`, `xp_reward`, `content` (static fallback), `script` (list of dicts or empty).

### All Lesson Scripts (module-level variables in server.py)

**Daily English:**
`DAILY_1_SCRIPT`, `ORDERING_AT_CAFE_SCRIPT`, `CASUAL_CONVERSATION_SCRIPT`, `SHOPPING_CONVERSATION_SCRIPT`, `DIRECTIONS_SCRIPT`, `RESTAURANT_SCRIPT`, `WEEKENDS_SCRIPT`, `DOCTOR_SCRIPT`, `PHONE_SCRIPT`, `OPINIONS_SCRIPT`

**Business English:**
`BUSINESS_MEETING_SCRIPT`, `PROFESSIONAL_EMAIL_SCRIPT`, `NEGOTIATION_SCRIPT`, `PRESENTATION_SCRIPT`, `NETWORKING_SCRIPT`, `DIFFICULT_CONVERSATION_SCRIPT`, `CORPORATE_ETIQUETTE_SCRIPT`, `REMOTE_WORK_SCRIPT`, `SALES_SCRIPT`, `LEADERSHIP_SCRIPT`

**Interview English:**
`INTERVIEW_INTRO_SCRIPT`, `INTERVIEW_BEHAVIORAL_SCRIPT`, `INTERVIEW_MOTIVATION_SCRIPT`, `INTERVIEW_STRENGTHS_SCRIPT`, `INTERVIEW_WEAKNESSES_SCRIPT`, `INTERVIEW_TECHNICAL_SCRIPT`, `INTERVIEW_SALARY_SCRIPT`, `INTERVIEW_QUESTIONS_SCRIPT`, `INTERVIEW_DIFFICULT_SCRIPT`, `INTERVIEW_CLOSING_SCRIPT`

**Travel English:**
`TRAVEL_AIRPORT_SCRIPT`, `TRAVEL_HOTEL_SCRIPT`, `TRAVEL_RESTAURANT_SCRIPT`, `TRAVEL_TRANSPORT_SCRIPT`, `TRAVEL_DIRECTIONS_SCRIPT`, `TRAVEL_SHOPPING_SCRIPT`, `TRAVEL_EMERGENCY_SCRIPT`, `TRAVEL_ETIQUETTE_SCRIPT`, `TRAVEL_PLANNING_SCRIPT`, `TRAVEL_PROBLEMS_SCRIPT`

> **Note:** `LESSONS` is a Python list. Travel lessons are appended via `LESSONS += [...]` (after their script variables are defined) due to the ordering constraint of module-level script definitions.

---

## API Endpoints Reference

All routes are prefixed `/api`. Auth requires `Authorization: Bearer <session_token>` header.

| Method | Path | Description |
|---|---|---|
| POST | `/auth/session` | Exchange Emergent session_id for app token |
| POST | `/auth/phone/send-otp` | Send OTP (mock mode: any 6-digit code works) |
| POST | `/auth/phone/verify-otp` | Verify OTP and issue session |
| POST | `/auth/phone/link` | Link phone to existing account |
| GET | `/auth/me` | Get current user profile |
| POST | `/auth/logout` | Invalidate session |
| PUT | `/profile` | Update profile fields |
| POST | `/xp` | Award XP + update streak/achievements |
| GET | `/home` | Dashboard data (word-of-day, lessons, challenges) |
| GET | `/lessons/categories` | All lesson categories |
| GET | `/lessons?category_id=X` | Lessons for a category |
| GET | `/lessons/{id}` | Single lesson detail (includes script) |
| POST | `/lessons/complete` | Mark lesson complete, award XP |
| GET | `/lessons/progress/all` | All completed lesson IDs for user |
| GET | `/vocab` | Vocabulary word list |
| GET | `/vocab/word-of-the-day` | Today's vocab word |
| POST | `/vocab/save` | Save word to user |
| POST | `/vocab/unsave` | Remove saved word |
| GET | `/challenges` | Today's daily challenges |
| POST | `/challenges/{id}/complete` | Mark challenge done |
| GET | `/quiz` | Quiz questions |
| POST | `/speaking-test` | Submit speaking test result |
| GET | `/speaking-test/history` | Speaking test history |
| GET | `/match` | Get mocked speaking partner |
| POST | `/calls` | Log a completed call |
| GET | `/calls` | Call history |
| GET | `/rooms` | List seeded + user-created rooms |
| POST | `/rooms` | Create a room |
| POST | `/rooms/join` | Join a room |
| GET | `/leaderboard` | Top-20 users by XP |
| GET | `/achievements` | User achievements |
| POST | `/friends/request` | Send friend request |
| GET | `/friends/requests` | List friend requests |
| POST | `/reports` | Report a user |
| POST | `/block` | Block a user |
| GET | `/referral` | Get/generate referral code |
| POST | `/referral/apply` | Apply a referral code |
| GET | `/subscription/plans` | Available subscription plans |
| POST | `/subscription/checkout` | Create Stripe checkout session |
| GET | `/subscription/status/{session_id}` | Poll checkout status |
| POST | `/subscription/cancel` | Cancel active user subscription |
| POST | `/webhook/stripe` | Stripe webhook handler |
| GET | `/zego/token` | Generate ZEGO voice token |

---

## Frontend Key Files

| File | Purpose |
|---|---|
| `frontend/src/api/client.ts` | All API calls; uses `EXPO_PUBLIC_BACKEND_URL` |
| `frontend/src/context/AuthContext.tsx` | Auth state, session token, user object |
| `frontend/src/theme.ts` | Design tokens (colors, typography, radii, shadows) |
| `frontend/src/components/ScriptRolePlayer.tsx` | Interactive lesson conversation player |
| `frontend/src/components/ui/` | Shared UI: `ScreenHeader`, `GradientButton`, etc. |
| `frontend/app/(tabs)/index.tsx` | Home/Dashboard tab |
| `frontend/app/(tabs)/practice.tsx` | Practice tab (lesson categories) |
| `frontend/app/lesson/[id].tsx` | Lesson detail screen |
| `frontend/app/lessons/[categoryId].tsx` | Category lesson list |
| `frontend/app/onboarding.tsx` | Onboarding slides |
| `frontend/app/login.tsx` | Sign-in screen |
| `frontend/app/call.tsx` | Mocked call UI |
| `frontend/app/match.tsx` | Partner matching screen |
| `frontend/app/speaking-test.tsx` | Speaking test |
| `frontend/app/premium.tsx` | Subscription/premium screen |

---

## Rules Compliance Status (rules.md audit — 2026-08-08)

| Rule | Status | Notes |
|---|---|---|
| 1. Environment Isolation | ✅ Compliant | All secrets in backend `.env` only; never exposed to frontend |
| 1. Client-Side Protection | ✅ Compliant | Frontend accesses data only via `/api` endpoints |
| 1. Dependency Minimization | ✅ Compliant | No unnecessary packages added |
| 2. Silent Failures / Logging | ✅ Acceptable | Uses Python `logging` module (structured); no raw errors sent to client |
| 2. Obfuscated Responses | ✅ Compliant | Only `HTTPException` with safe messages returned |
| 2. Error Boundaries | ⚠️ Pending | React Error Boundaries not yet implemented in frontend |
| 3. Rate Limiting | ⚠️ Pending | No rate-limit middleware on API routes yet — **requires user confirmation before adding** (security middleware change per Rule 5) |
| 3. Input Sanitization | ✅ Compliant | All request bodies validated via Pydantic models |
| 4. Directory Separation | ✅ Compliant | `backend/` and `frontend/` are cleanly separated |
| 4. WebRTC Security | ✅ Compliant | ZEGO token generated server-side with app secret |
| 5. No Verbose Comments | ✅ Compliant | Code is clean, minimal comments |
| 5. Strict Typing | ✅ Fixed (2026-08-08) | Replaced `any` types in `lesson/[id].tsx` with `Lesson`, `ContentItem`, `ScriptLine` interfaces |
| 5. Confirmation for Schema/Security Changes | ✅ Acknowledged | Rate limiting flagged as pending user confirmation |

---

## Known Issues / Pending Work

| Issue | Priority | Notes |
|---|---|---|
| OTP in mock mode | Medium | `OTP_MODE` defaults to `mock`; Twilio not wired |
| Rate limiting absent | High | No middleware on speaking room or profile routes — flag for user before adding |
| React Error Boundaries | Medium | Not implemented on frontend; crashes may expose raw errors |
| No Docker/CI manifests | Low | No Dockerfile or GitHub Actions — needed for production |
| ZEGO secret length | Medium | Must be exactly 32 chars or `/zego/token` returns 500 |
| `.env` not in repo | Info | Developer must supply `MONGO_URL`, `STRIPE_API_KEY`, `ZEGO_*` etc. |

---

## User Flow Summary

1. **Splash / Onboarding** → `onboarding.tsx`
2. **Login** → Google OAuth (Emergent) or Phone OTP → `login.tsx`
3. **Home Dashboard** → streak, XP, word-of-day, continue lesson → `(tabs)/index.tsx`
4. **Practice** → select category → `(tabs)/practice.tsx` → `lessons/[categoryId].tsx`
5. **Lesson Detail** → view script conversation or static content → `lesson/[id].tsx`
   - If `script.length > 0`: renders `ScriptRolePlayer` (interactive)
   - Else: renders static content cards
6. **Complete Lesson** → POST `/lessons/complete` → XP awarded
7. **Speaking Practice** → `Match` → mocked partner → `call.tsx` → call logged
8. **Speaking Test** → scored evaluation → certificate if score ≥ 80 → `speaking-test.tsx`
9. **Progress** → achievements, leaderboard, profile → `achievements.tsx`, `leaderboard.tsx`

---

## Notes for Future Agents

- **Always read this file first** before making any changes.
- **Add a dated entry** to the Change Log below after every successful change.
- **Do NOT create a separate memory file** — append here only.
- When adding/removing API endpoints, update the **API Endpoints Reference** table.
- When adding lesson scripts, follow the **Interactive Lesson Pattern** above (10 lines, named speakers, realistic dialogue).
- Lesson scripts must be defined as module-level variables BEFORE `LESSONS = [...]` or `LESSONS += [...]` in `server.py`.
- The `LESSONS` list is currently split into two parts: initial `LESSONS = [...]` (daily + business + interview) and `LESSONS += [...]` (travel) — both must remain in order.
- Per `rules.md` Rule 5: any change to **database schema** or **security middleware** requires explicit user confirmation before execution.

---

## Change Log

- **2026-07-26**: Created `memory.md` — initial comprehensive project memory covering architecture, features, env, setup, known issues and run instructions.

- **2026-07-26**: Major content & feature updates:
  - Backend subscription mapping: weekly & quarterly SKUs added.
  - Removed coins system from backend and frontend.
  - Added daily minutes left display (Home + Profile).
  - Image updates for Interview English across 3 frontend files.
  - Expanded lessons: Daily (11–20), Business (4–20), Interview (3–20), Travel (3–20).
  - Vocabulary expanded to 50 words (w1–w50).
  - Quiz expanded to 20 questions (idioms & phrases added).

- **2026-07-27**: Added weekly leaderboard UI support in `leaderboard.tsx` and `api/client.ts`.

- **2026-08-02**: Added interactive lesson pilot scripts for `daily-1`, `business-1`, `interview-1`, `travel-1`. Added `ScriptRolePlayer` to `lesson/[id].tsx`. Local-only recording (no upload).

- **2026-08-08**: Major lesson content restructure:
  - **Daily English Others lessons** synchronized to match Daily English Introduction format.
  - **Removed lessons 11–20** from Daily English (now 10 lessons per category).
  - **Removed IELTS & Exams** category entirely — all lessons, seed rooms, and frontend references (`host-room.tsx`, `onboarding.tsx`, `[categoryId].tsx`, `practice.tsx`, `index.tsx`).
  - **Removed lessons 11–20** from Business, Interview, and Travel English (all now 10 lessons).
  - **Added full interactive scripts** for all 40 lessons across 4 categories:
    - Business English: 10 scripts (`BUSINESS_MEETING_SCRIPT` → `LEADERSHIP_SCRIPT`)
    - Interview English: 10 scripts (`INTERVIEW_INTRO_SCRIPT` → `INTERVIEW_CLOSING_SCRIPT`)
    - Travel English: 10 scripts (`TRAVEL_AIRPORT_SCRIPT` → `TRAVEL_PROBLEMS_SCRIPT`)
  - **Rules compliance audit performed** against `rules.md`:
    - Fixed `any` types in `frontend/app/lesson/[id].tsx` — replaced with `Lesson`, `ContentItem`, `ScriptLine` interfaces (Rule 5: Strict Typing).
    - Rate limiting flagged as pending (requires user confirmation per Rule 5 before adding security middleware).
  - **This memory.md updated** with full current project state, all lesson scripts, rules compliance table, and expanded API reference.

- **2026-08-13**: Repo analysis performed — updated Tech Stack to match `frontend/package.json` (Expo 54, React 19, React Native 0.81.5). No other memory changes required.

- **2026-08-19**: Updated audio mapping for `BUSINESS_MEETING_SCRIPT` (`business-1`) in `ScriptRolePlayer.tsx` to reference all 10 audio files (`Manager_L1.mp3` through `Ravi_L3.mp3`) in `frontend/assets/audio/business_english/business_meeting`. Verified TypeScript & Python checks with 0 errors.

- **2026-08-19**: Updated audio mapping for `PROFESSIONAL_EMAIL_SCRIPT` (`business-2`) in `ScriptRolePlayer.tsx` to reference all 12 audio files (`Anita_L1.mp3` through `Vikram_L6.mp3`) in `frontend/assets/audio/business_english/Email_writing`. Verified TypeScript & Python checks with 0 errors.

- **2026-08-20**: Completed Business English audio mapping & backend script architecture standardization:
  - **Full Audio Asset Mapping (`ScriptRolePlayer.tsx`)**: Configured static require mappings in `DAILY_AUDIO_ASSETS` for all 10 Business English lessons (`business-1` through `business-10`), covering `business_meeting`, `Email_writing`, `negotiation_deals`, `presentation`, `networking`, `conflict_conversation`, `corporate_culture`, `Remote_work`, `Sales`, and `Leadership`.
  - **Backend Script Clean-Up (`backend/server.py`)**: Removed inline `audio_url` fields across all 8 Business English script definitions (`NEGOTIATION_SCRIPT`, `PRESENTATION_SCRIPT`, `NETWORKING_SCRIPT`, `DIFFICULT_CONVERSATION_SCRIPT`, `CORPORATE_ETIQUETTE_SCRIPT`, `REMOTE_WORK_SCRIPT`, `SALES_SCRIPT`, and `LEADERSHIP_SCRIPT`) to enforce clean separation of backend script text and frontend Expo local audio asset loading.
  - **Audio Asset Synchronization**: Created speaker audio file aliases in `frontend/assets/audio/business_english/corporate_culture` (`Nisha_L1.mp3` .. `Nisha_L5.mp3`) and `frontend/assets/audio/business_english/Remote_work` (`Divya_L1.mp3` .. `Divya_L3.mp3`) to align disk filenames with script speaker names.
  - **Verification**: Verified clean Python compilation (`py_compile`) and TypeScript type-checking (`tsc --noEmit`) with 0 errors.

- **2026-08-20**: Comprehensive Codebase Documentation & Comments:
  - **Backend (`backend/server.py`)**: Added clear, beginner-friendly docstrings and explanatory comments to every function (auth dependencies, phone OTP handlers, referral management, XP/streak progression, lesson/vocab/challenge routes, speaking tests, live room & call handlers, ZEGO Token04 generation, and Stripe subscription/webhook handlers).
  - **Frontend (`frontend/src/components/ScriptRolePlayer.tsx`)**: Added comprehensive JSDoc and beginner-friendly comments for all player functions (audio source resolution, player lifecycle cleanup, turn countdown timers, audio mode initialization, script auto-advancement, and mode event handlers).
  - **Verification**: Re-verified clean Python compilation (`py_compile`) and TypeScript type check (`tsc --noEmit`) with 0 errors.

- **2026-08-24**: Updated Audio Mapping for `INTERVIEW_WEAKNESSES_SCRIPT` (`interview-5`):
  - Added static require mappings for `interview-5` (`i5-l1` through `i5-l10`) in `DAILY_AUDIO_ASSETS` within `frontend/src/components/ScriptRolePlayer.tsx`.
  - Mapped lines to audio files in `frontend/assets/audio/interview_english/Weakness` (`Interviewer_L1.mp3` through `Interviewer_L5.mp3` and `Candidate_L1.mp3` through `Candidate_L5.mp3`).
  - Verified TypeScript compilation (`npx tsc --noEmit`) and Python compilation (`py_compile`) with 0 errors.

- **2026-08-24**: Updated Audio Mapping for `INTERVIEW_TECHNICAL_SCRIPT` (`interview-6`):
  - Added static require mappings for `interview-6` (`i6-l1` through `i6-l10`) in `DAILY_AUDIO_ASSETS` within `frontend/src/components/ScriptRolePlayer.tsx`.
  - Mapped lines to audio files in `frontend/assets/audio/interview_english/Technical` (`Interviewer_L1.mp3` through `Interviewer_L5.mp3` and `Candidate_L1.mp3` through `Candidate_L5.mp3`).
  - Verified TypeScript compilation (`npx tsc --noEmit`) and Python compilation (`py_compile`) with 0 errors.

- **2026-08-24**: Updated Audio Mapping for `INTERVIEW_SALARY_SCRIPT` (`interview-7`):
  - Added static require mappings for `interview-7` (`i7-l1` through `i7-l10`) in `DAILY_AUDIO_ASSETS` within `frontend/src/components/ScriptRolePlayer.tsx`.
  - Mapped lines to audio files in `frontend/assets/audio/interview_english/Salary` (`Interviewer_L1.mp3` through `Interviewer_L5.mp3` and `Candidate_L1.mp3` through `Candidate_L5.mp3`).
  - Verified TypeScript compilation (`npx tsc --noEmit`) and Python compilation (`py_compile`) with 0 errors.

- **2026-08-24**: Updated Audio Mapping for `INTERVIEW_QUESTIONS_SCRIPT` (`interview-8`):
  - Added static require mappings for `interview-8` (`i8-l1` through `i8-l10`) in `DAILY_AUDIO_ASSETS` within `frontend/src/components/ScriptRolePlayer.tsx`.
  - Mapped lines to audio files in `frontend/assets/audio/interview_english/Question` (`Interviewer_L1.mp3` through `Interviewer_L5.mp3` and `Candidate_L1.mp3` through `Candidate_L5.mp3`).
  - Verified TypeScript compilation (`npx tsc --noEmit`) and Python compilation (`py_compile`) with 0 errors.

- **2026-08-24**: Updated Audio Mapping for `INTERVIEW_DIFFICULT_SCRIPT` (`interview-9`):
  - Created Candidate audio file aliases (`Candidate_L1.mp3` .. `Candidate_L5.mp3`) in `frontend/assets/audio/interview_english/Difficulties`.
  - Added static require mappings for `interview-9` (`i9-l1` through `i9-l10`) in `DAILY_AUDIO_ASSETS` within `frontend/src/components/ScriptRolePlayer.tsx`.
  - Verified TypeScript compilation (`npx tsc --noEmit`) and Python compilation (`py_compile`) with 0 errors.

- **2026-08-24**: Updated Audio Mapping for `INTERVIEW_CLOSING_SCRIPT` (`interview-10`):
  - Added static require mappings for `interview-10` (`i10-l1` through `i10-l10`) in `DAILY_AUDIO_ASSETS` within `frontend/src/components/ScriptRolePlayer.tsx`.
  - Mapped lines to audio files in `frontend/assets/audio/interview_english/Closing` (`Interviewer_L1.mp3` through `Interviewer_L5.mp3` and `Candidate_L1.mp3` through `Candidate_L5.mp3`).
  - Verified TypeScript compilation (`npx tsc --noEmit`) and Python compilation (`py_compile`) with 0 errors.

- **2026-09-01**: Added Premium Visual Identity (Orange Accents):
  - **Design Tokens (`frontend/src/theme.ts`)**: Added `premiumOrange` (`#FF7A00`), `premiumOrangeLight`, `premiumOrangeDark`, `gradients.premiumOrange`, and `gradients.premiumOrangeSoft` alongside existing blue design system tokens.
  - **Reusable Components (`frontend/src/components/ui/`)**: Built `Avatar` component with `isPremium` prop (rendering solid 2.5px orange ring and bottom-right crown/star badge for premium users) and `ProTag` pill component. Re-exported both from `frontend/src/components/ui.tsx`.
  - **Avatar & Tag Integrations**: Replaced inline profile picture renders with shared `Avatar` component across `index.tsx`, `profile.tsx`, `leaderboard.tsx`, `friends.tsx`, `call-history.tsx`, `room/[id].tsx`, `live.tsx`, and `match.tsx`. Rendered `ProTag` next to premium user names.
  - **Premium Touchpoints**: Updated `premium.tsx` (CTA button, selected plan card border, ribbon, active plan card badge) and `premium/success.tsx` (confirmation screen icon & continue CTA) with warm orange accents.
  - **TypeScript Verification**: Confirmed `npx tsc --noEmit` on frontend passed with 0 errors.
  - **Compliance**: Confirmed zero database schema and security middleware changes were made.

- **2026-09-01**: Immediate Subscription Cancellation & State Revocation:
  - **Confirmation Dialog Copy**: Updated `membership.tsx` alert text to `"Are you sure you want to cancel? You'll lose premium features immediately — this cannot be undone for the current billing period."` with `"Cancel Membership"` (destructive) and `"Keep My Membership"` (cancel) buttons.
  - **Immediate Backend Revocation (`backend/server.py`)**: Enhanced `POST /api/subscription/cancel` route to revoke `is_premium`, `premium_plan`, and `premium_until` immediately in MongoDB, handling Stripe logs safely server-side without exposing internal traces to client. Returns updated user profile.
  - **Immediate Client-Side State Refresh**: Invokes `refresh()` from `AuthContext` immediately upon cancellation confirmation, instantly updating `user` state across all app components (`Avatar` orange rings, PRO tags, profile header, leaderboard, membership status card) without requiring a re-login.
  - **Verification**: Python compilation (`py_compile`) and TypeScript typecheck (`npx tsc --noEmit`) verified with 0 errors.










