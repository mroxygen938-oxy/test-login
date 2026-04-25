import { useCallback, useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, useAuth } from '../lib/auth.jsx'

/* Multi-color official Google "G" (used on a dark surface so we keep
   Google's brand colors instead of their default white-circle wrapper). */
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

/* Renders our fully styled "Continue with Google" button. The
   official GSI button is rendered hidden in the same wrapper and
   we forward the click event to it on press, so we get GSI's full
   credential flow without any white branding chrome. */
export default function LoginScreen() {
  const { login } = useAuth()
  const hiddenBtnRef = useRef(null)
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
    if (!hiddenBtnRef.current) return undefined
    const id = window.google.accounts.id
    /* One Tap disabled deliberately: it renders a non-themable white
       card in the corner. Auto-login is handled via our own
       persisted session in localStorage instead. */
    id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: ({ credential }) => credential && login(credential),
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup',
      use_fedcm_for_prompt: false,
    })
    hiddenBtnRef.current.innerHTML = ''
    id.renderButton(hiddenBtnRef.current, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      width: 280,
    })
    return undefined
  }, [gsiReady, login])

  /* Forward a real user click to the hidden GSI button so the
     credential popup is treated as user-initiated. */
  const triggerGoogle = useCallback(() => {
    if (!gsiReady || !hiddenBtnRef.current) return
    const target =
      hiddenBtnRef.current.querySelector('[role="button"]') ||
      hiddenBtnRef.current.querySelector('div[tabindex]') ||
      hiddenBtnRef.current.firstElementChild
    if (target instanceof HTMLElement) target.click()
  }, [gsiReady])

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
            onClick={triggerGoogle}
            disabled={!gsiReady}
            aria-label="Continue with Google"
          >
            <span className="login-google-icon">
              <GoogleGIcon />
            </span>
            <span className="login-google-label">
              {gsiReady ? 'Continue with Google' : 'Loading Google…'}
            </span>
          </button>
          <div ref={hiddenBtnRef} className="login-google-hidden" aria-hidden="true" />
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
