/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

/* The OAuth Web Client ID is public and safe to ship in the JS bundle.
   Set the same value in `Authorized JavaScript origins` for every URL
   the app runs on (localhost dev, vite preview, deploy URL). */
export const GOOGLE_CLIENT_ID =
  '940172318295-lbu2t88h0holi5l04h8qqmb336ap2qn2.apps.googleusercontent.com'

const AUTH_KEY = 'otaku-vault/auth/user'

const AuthCtx = createContext(null)

function isValidProfile(p) {
  return Boolean(
    p &&
      typeof p === 'object' &&
      typeof p.sub === 'string' &&
      p.sub.length > 0
  )
}

function loadStoredUser() {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const u = JSON.parse(raw)
    if (!isValidProfile(u)) return null
    return u
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStoredUser)

  /* `profile` comes from Google's userinfo endpoint
     (https://www.googleapis.com/oauth2/v3/userinfo) and contains
     `sub`, `name`, `given_name`, `email`, `picture`, etc. */
  const login = useCallback((profile) => {
    if (!isValidProfile(profile)) {
      console.warn('Rejected Google profile — missing sub.')
      return false
    }
    const u = {
      sub: String(profile.sub),
      name: profile.name || profile.email || 'Anonymous',
      givenName: profile.given_name || profile.name || '',
      email: profile.email || '',
      picture: profile.picture || '',
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
    setUser(null)
  }, [])

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
