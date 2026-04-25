import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, useAuth } from '../lib/auth.jsx'

/* Multi-color official Google "G" rendered directly on the dark
   surface so we keep the brand colors without Google's white plate. */
function GoogleGIcon() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export default function LoginScreen() {
  const { login } = useAuth()
  const tokenClientRef = useRef(null)
  const [gsiReady, setGsiReady] = useState(
    typeof window !== 'undefined' && Boolean(window.google?.accounts?.oauth2)
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  /* Wait for the GSI script to finish loading. */
  useEffect(() => {
    if (gsiReady) return undefined
    let cancelled = false
    const t = setInterval(() => {
      if (cancelled) return
      if (window.google?.accounts?.oauth2) {
        setGsiReady(true)
        clearInterval(t)
      }
    }, 100)
    const timeout = setTimeout(() => clearInterval(t), 8000)
    return () => {
      cancelled = true
      clearInterval(t)
      clearTimeout(timeout)
    }
  }, [gsiReady])

  /* Build the OAuth2 token client once GSI is loaded. */
  useEffect(() => {
    if (!gsiReady) return
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'openid email profile',
      callback: async (response) => {
        if (response.error) {
          setBusy(false)
          setError('Sign-in was cancelled.')
          return
        }
        if (!response.access_token) {
          setBusy(false)
          setError('Could not get an access token from Google.')
          return
        }
        try {
          const res = await fetch(USERINFO_URL, {
            headers: { Authorization: `Bearer ${response.access_token}` },
          })
          if (!res.ok) {
            throw new Error(`userinfo ${res.status}`)
          }
          const profile = await res.json()
          const ok = login(profile)
          if (!ok) {
            setError('Google response was missing required fields.')
          }
        } catch {
          setError('Could not load your Google profile. Please try again.')
        } finally {
          setBusy(false)
        }
      },
      error_callback: () => {
        setBusy(false)
        setError('Sign-in was cancelled.')
      },
    })
  }, [gsiReady, login])

  const handleClick = () => {
    if (!gsiReady || !tokenClientRef.current || busy) return
    setError('')
    setBusy(true)
    try {
      tokenClientRef.current.requestAccessToken({ prompt: 'consent' })
    } catch {
      setBusy(false)
      setError('Could not open the Google sign-in popup.')
    }
  }

  const disabled = !gsiReady || busy

  return (
    <div className="login-root">
      <div className="ambient" aria-hidden="true" />

      <div className="login-card glass-strong">
        <div className="login-brand">
          <div className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M5 18L12 4l7 14H5z"
                fill="white"
                stroke="white"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="15" r="1.8" fill="#0b0b14" />
            </svg>
          </div>
          <div className="login-brand-text">
            <div className="login-brand-title">Otaku Vault</div>
            <div className="login-brand-sub">Your private anime &amp; manga library</div>
          </div>
        </div>

        <h1 className="login-title">Sign in to continue</h1>
        <p className="login-text">
          Your library is saved per Google account, so you can switch
          between accounts on the same device and each gets a separate
          vault.
        </p>

        <div className="login-button-wrap">
          <button
            type="button"
            className="login-google-btn-custom"
            onClick={handleClick}
            disabled={disabled}
            aria-label="Continue with Google"
          >
            <span className="login-google-icon">
              <GoogleGIcon />
            </span>
            <span className="login-google-label">
              {busy
                ? 'Signing you in…'
                : gsiReady
                  ? 'Continue with Google'
                  : 'Loading Google…'}
            </span>
          </button>
        </div>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        <ul className="login-features" aria-label="What you get">
          <li>
            <span className="login-dot" aria-hidden="true" />
            Track watching, completed, on-hold, plan-to-watch &amp; dropped
          </li>
          <li>
            <span className="login-dot" aria-hidden="true" />
            Separate manga library with chapter tracking
          </li>
          <li>
            <span className="login-dot" aria-hidden="true" />
            Cover photos, ratings, episodes, notes — saved per account
          </li>
        </ul>
      </div>
    </div>
  )
}
