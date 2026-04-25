import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, useAuth } from '../lib/auth.jsx'

/* Render the official Google Identity Services button.
   Polls until the GSI script (loaded async from index.html) is ready. */
export default function LoginScreen() {
  const { login } = useAuth()
  const buttonRef = useRef(null)
  const [gsiReady, setGsiReady] = useState(
    typeof window !== 'undefined' && Boolean(window.google?.accounts?.id)
  )

  useEffect(() => {
    if (gsiReady) return undefined
    let cancelled = false
    const t = setInterval(() => {
      if (cancelled) return
      if (window.google?.accounts?.id) {
        setGsiReady(true)
        clearInterval(t)
      }
    }, 100)
    /* Give up after 8s — likely network/script-block. */
    const timeout = setTimeout(() => clearInterval(t), 8000)
    return () => {
      cancelled = true
      clearInterval(t)
      clearTimeout(timeout)
    }
  }, [gsiReady])

  useEffect(() => {
    if (!gsiReady) return undefined
    if (!buttonRef.current) return undefined
    const id = window.google.accounts.id
    id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: ({ credential }) => credential && login(credential),
      auto_select: true,
      cancel_on_tap_outside: false,
      ux_mode: 'popup',
    })
    /* Render the official "Sign in with Google" button. */
    buttonRef.current.innerHTML = ''
    id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: 280,
    })
    /* Show One Tap if available — instant return for repeat users. */
    try {
      id.prompt()
    } catch {
      /* ignore */
    }
    return undefined
  }, [gsiReady, login])

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
          {!gsiReady && (
            <div className="login-loading">
              <span className="login-spinner" aria-hidden="true" />
              <span>Loading Google sign-in…</span>
            </div>
          )}
          <div ref={buttonRef} className={gsiReady ? 'login-google-btn' : 'login-google-btn hidden'} />
        </div>

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
