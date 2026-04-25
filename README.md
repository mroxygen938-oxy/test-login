# Otaku Vault — Google Sign-In edition

A glassmorphism anime + manga tracker with Google Sign-In and per-user
local storage. Same UI as the public Otaku Vault, with a login gate
in front so each Google account on the device gets its own private
library.

**Live preview:** https://dist-xdjcsrbc.devinapps.com

## Features

- **Sign in with Google** (Google Identity Services)
- **Per-user data** — every storage key is suffixed with the Google `sub`
  (`otaku-vault/animes/v1/<sub>`, `…/mangas/v1/<sub>`, etc.). Switching
  accounts shows a different library on the same browser.
- **Auto-login** — session persists in `localStorage` across refreshes
  until the JWT `exp` is reached (then user is signed out automatically).
- **Logout** — clears the session and disables Google's auto-select so
  you don't get re-signed-in instantly.
- Everything from the base app (5 lists × 2 modes, photo uploads,
  episode/chapter tracking, search, themes, mobile-first UI).

## Setup

```bash
npm install
npm run dev
```

The Web Client ID is in `src/lib/auth.jsx`. To run with your own:

1. Create an OAuth 2.0 Web Client ID at
   <https://console.cloud.google.com/apis/credentials>.
2. Add the URLs you'll run on as **Authorized JavaScript origins**:
   - `http://localhost:5173` (Vite dev)
   - `http://localhost:4173` (Vite preview)
   - your deployed URL
3. Replace `GOOGLE_CLIENT_ID` in `src/lib/auth.jsx`.

The Client ID is public and safe to commit — the Client *secret* is
not used in this client-only app.

## Validation note

The decoded ID token is checked client-side for: `iss` (Google),
`aud` (matches our Client ID), `exp` (not expired), and `sub`
(present). Full RSA signature verification of the token requires
the bot/server-side flow; for a client-only app this level of
validation is the standard approach.

## Tech

React 19 · Vite · Google Identity Services
