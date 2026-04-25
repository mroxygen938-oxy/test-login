/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/* The OAuth Web Client ID is public and safe to ship in the JS bundle.
   Set the same value in `Authorized JavaScript origins` for every URL
   the app runs on (localhost dev, vite preview, deploy URL). */
export const GOOGLE_CLIENT_ID =
  '940172318295-lbu2t88h0holi5l04h8qqmb336ap2qn2.apps.googleusercontent.com'

const AUTH_KEY = 'otaku-vault/auth/user'

const AuthCtx = createContext(null)

/* Decode a JWT credential without verifying its signature.
   Full RSA verification of Google's signature requires fetching
   their public keys and is normally done on a server — for a
   client-only app this is the standard approach.
   See: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token */
export function decodeJwt(token) {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const decoded = decodeURIComponent(
      json
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

const VALID_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
])

/* Basic client-side validation of the decoded ID token. */
function validateClaims(claims) {
  if (!claims || typeof claims !== 'object') return false
  if (!VALID_ISSUERS.has(claims.iss)) return false
  if (claims.aud !== GOOGLE_CLIENT_ID) return false
  if (typeof claims.exp !== 'number') return false
  if (claims.exp * 1000 <= Date.now()) return false
  if (!claims.sub) return false
  return true
}

function loadStoredUser() {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const u = JSON.parse(raw)
    if (!u?.sub) return null
    /* Drop expired sessions. */
    if (typeof u.exp === 'number' && u.exp * 1000 <= Date.now()) {
      window.localStorage.removeItem(AUTH_KEY)
      return null
    }
    return u
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)

  const login = useCallback((credential) => {
    const claims = decodeJwt(credential)
    if (!validateClaims(claims)) {
      console.warn('Rejected Google credential — failed basic validation.')
      return false
    }
    const u = {
      sub: String(claims.sub),
      name: claims.name || claims.email || 'Anonymous',
      givenName: claims.given_name || claims.name || '',
      email: claims.email || '',
      picture: claims.picture || '',
      exp: claims.exp,
    }
    try {
      window.localStorage.setItem(AUTH_KEY, JSON.stringify(u))
    } catch {
      /* storage full — still accept the in-memory session */
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
    /* Stop Google's One Tap from auto-signing in next time. */
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect()
      } catch {
        /* ignore */
      }
    }
    setUser(null)
  }, [])

  /* When the session expires while the app is open, drop it.
     loadStoredUser() already filters out tokens that were expired at boot. */
  useEffect(() => {
    if (!user?.exp) return undefined
    const ms = user.exp * 1000 - Date.now()
    if (ms <= 0) return undefined
    const t = setTimeout(logout, Math.min(ms, 2_147_483_000))
    return () => clearTimeout(t)
  }, [user, logout])

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/* Per-user storage key — every key the Vault uses is suffixed with the
   Google `sub` so two users on the same browser keep separate libraries. */
export const userKey = (base, user) => `${base}/${user.sub}`
