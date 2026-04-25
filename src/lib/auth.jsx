/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/* ────────────────────────────────────────────────────────────────────
   Telegram bot config — fill in once you've registered the bot with
   @BotFather and run /setdomain. Both the username (without @) and
   the numeric bot ID are required for the custom dark button flow.

   Get the numeric ID by messaging @username_to_id_bot, or use the
   number before the colon in your bot token from BotFather.
   ──────────────────────────────────────────────────────────────────── */
export const TELEGRAM_BOT_USERNAME = 'OxygenVaultbot'
export const TELEGRAM_BOT_ID = 8770550259

/* Max age of a Telegram auth payload we'll trust (24 h, as Telegram
   recommends). Older payloads are rejected on the assumption they were
   leaked or replayed. */
const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24

const AUTH_KEY = 'otaku-vault/auth/user'

const AuthCtx = createContext(null)

/* Basic shape check on a Telegram-widget login payload.
   Full HMAC verification of the `hash` field requires the bot token,
   which can't live in a client-side bundle — that level of validation
   needs a small server. For a localStorage-only app this is the
   standard client-side check. */
function isValidTelegramPayload(p) {
  if (!p || typeof p !== 'object') {
    console.warn('TG payload rejected: not an object', p)
    return false
  }
  const idOk =
    (typeof p.id === 'number' && p.id !== 0) ||
    (typeof p.id === 'string' && p.id.length > 0)
  if (!idOk) {
    console.warn('TG payload rejected: bad id', p.id)
    return false
  }
  const authDateNum =
    typeof p.auth_date === 'number'
      ? p.auth_date
      : parseInt(p.auth_date, 10)
  if (!Number.isFinite(authDateNum) || authDateNum <= 0) {
    console.warn('TG payload rejected: bad auth_date', p.auth_date)
    return false
  }
  /* Allow up to 5 min of clock skew on the negative side (client clock
     ahead of Telegram). Reject anything older than 24 h. */
  const ageSec = Math.floor(Date.now() / 1000) - authDateNum
  if (ageSec < -300 || ageSec > MAX_AUTH_AGE_SECONDS) {
    console.warn('TG payload rejected: stale auth_date', { ageSec })
    return false
  }
  return true
}

function isValidStoredUser(u) {
  return Boolean(u && typeof u === 'object' && (u.id || u.id === 0))
}

function loadStoredUser() {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const u = JSON.parse(raw)
    return isValidStoredUser(u) ? u : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)

  /* `payload` is the object Telegram's widget hands back after the
     user authorises:
       { id, first_name, last_name?, username?, photo_url?, auth_date, hash } */
  const login = useCallback((payload) => {
    if (!isValidTelegramPayload(payload)) {
      console.warn('Rejected Telegram payload — failed basic validation.')
      return false
    }
    const u = {
      id: String(payload.id),
      firstName: payload.first_name || payload.username || 'You',
      lastName: payload.last_name || '',
      username: payload.username || '',
      photoUrl: payload.photo_url || '',
      authDate: payload.auth_date,
    }
    try {
      window.localStorage.setItem(AUTH_KEY, JSON.stringify(u))
    } catch {
      /* storage full — still accept the in-memory session */
    }
    setUser(u)
    return true
  }, [])

  /* Local-only guest sign-in for development on localhost — never
     shown on the deployed URL. Useful for testing without a real
     Telegram account. */
  const loginGuest = useCallback(() => {
    const u = {
      id: 'guest',
      firstName: 'Guest',
      lastName: '',
      username: 'guest',
      photoUrl: '',
      authDate: Math.floor(Date.now() / 1000),
    }
    try {
      window.localStorage.setItem(AUTH_KEY, JSON.stringify(u))
    } catch {
      /* ignore */
    }
    setUser(u)
    return true
  }, [])

  const logout = useCallback(() => {
    try {
      window.localStorage.removeItem(AUTH_KEY)
    } catch {
      /* ignore */
    }
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, login, loginGuest, logout }),
    [user, login, loginGuest, logout]
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/* Per-user storage key — every key the Vault uses is suffixed with
   the Telegram user id so two users on the same browser keep
   separate libraries. */
export const userKey = (base, user) => `${base}/${user.id}`
