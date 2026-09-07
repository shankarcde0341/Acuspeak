# Acuspeak — Product Requirements

## Overview
Premium mobile English speaking practice app (React Native / Expo). Blue & white gradient theme, glassmorphism, rounded UI, smooth motion. Bottom navigation: Home, Practice, Live, Profile.

## Auth
- Emergent-managed Google OAuth. Session token stored via `expo-secure-store`.
- `POST /api/auth/session`, `GET /api/auth/me`, `POST /api/auth/logout`.

## Core Features
1. **Splash + Onboarding** — animated logo, 3 slides, Privacy/Terms links.
2. **Home Dashboard** — welcome, motivational quote, streak/XP/coins strip, daily-goal ring, word-of-the-day, quick-actions, lesson categories, challenges preview, premium banner.
3. **Speak with Real People (MOCKED voice)** — filters (Any/Male/Female), radar "finding match" animation, dummy call UI with waveform, mute/speaker/end/report/block/add-friend, call log persisted.
4. **Speaking Test** — Beginner/Intermediate/Advanced, mic prompt, 30s timer, simulated evaluation report (fluency/pronunciation/grammar/vocab), 80+ score issues an in-app certificate.
5. **Live Group Discussions** — trending rooms, host public/private room, join, raise hand, mute/leave UI, listener grid.
6. **English Lessons** — 9 categories, 20+ lessons, step-by-step content, "Complete" grants XP.
7. **Daily Challenges** — 4 daily challenges, complete for XP, quiz path.
8. **Vocabulary Builder** — flashcards (flip), save/unsave, revision mode, word of the day.
9. **Profile** — avatar, XP progress ring, streak, coins, achievements horizontal list, menu.
10. **Achievements** — 8 badges (unlock via streaks/XP/tests/premium/etc.).
11. **Certificates** — earned via speaking-test 80+.
12. **Leaderboard** — top-20 global by XP with podium.
13. **Premium** — Stripe Checkout via `emergentintegrations`. Weekly / Monthly / Quarterly. Success + Cancel screens. Webhook + poll updates `is_premium`.
14. **Privacy Policy, Terms & Conditions** — full text screens.
15. **Settings** — display name, level, daily goal.

## Backend (FastAPI + MongoDB)
- Collections: `users`, `user_sessions`, `lesson_progress`, `daily_challenges`, `speaking_tests`, `calls`, `friend_requests`, `reports`, `rooms`, `payments`.
- All routes prefixed `/api`.
- MongoDB `_id` excluded from responses. Custom `user_id`.
- TTL index on `user_sessions.expires_at`.

## Not built (per user choice)
- AI Speaking Practice (excluded).
- Real voice calls (Agora/ZEGO not integrated) — call UI is mocked.
