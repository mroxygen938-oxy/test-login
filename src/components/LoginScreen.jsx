import { useEffect, useRef, useState } from 'react'
import {
  TELEGRAM_BOT_ID,
  TELEGRAM_BOT_USERNAME,
  useAuth,
} from '../lib/auth.jsx'
import { isNative, openExternal } from '../lib/native.js'

const NATIVE_AUTH_URL =
  'https://oxygenvault.online/auth.html?return_to=oxygenvault%3A%2F%2Fauth'

const TELEGRAM_WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22'

/* Pull the Telegram widget script in once on first render. */
function loadTelegramWidget() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`script[src="${TELEGRAM_WIDGET_SRC}"]`)) return
  const s = document.createElement('script')
  s.src = TELEGRAM_WIDGET_SRC
  s.async = true
  document.head.appendChild(s)
}

/* Stylised Telegram paper-plane mark. */
function TelegramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="tg-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#37BBFE" />
          <stop offset="100%" stopColor="#007DBB" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="url(#tg-grad)" />
      <path
        d="M17.5 7.6 15.5 17c-.15.7-.55.86-1.12.54l-3.1-2.29-1.5 1.45c-.16.16-.3.3-.62.3l.22-3.13 5.7-5.15c.25-.22-.05-.34-.39-.13L7.6 12.06l-3.04-.95c-.66-.21-.68-.66.14-.97l11.9-4.59c.55-.2 1.03.13.86.99z"
        fill="#fff"
      />
    </svg>
  )
}

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')

const botConfigured =
  TELEGRAM_BOT_USERNAME &&
  TELEGRAM_BOT_USERNAME !== 'YOUR_BOT_USERNAME_HERE' &&
  TELEGRAM_BOT_ID > 0

export default function LoginScreen() {
  const { login, loginGuest } = useAuth()
  const widgetSlotRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showWidget, setShowWidget] = useState(false)

  /* Pull the widget script in for both flows (custom button uses
     `Telegram.Login.auth`, fallback uses the rendered widget). */
  useEffect(() => {
    loadTelegramWidget()
  }, [])

  /* Expose the auth callback used by the rendered widget fallback. */
  useEffect(() => {
    window.onTelegramAuth = (payload) => {
      const ok = login(payload)
      if (!ok) setError('Telegram returned a payload we could not validate.')
    }
    return () => {
      try {
        delete window.onTelegramAuth
      } catch {
        window.onTelegramAuth = undefined
      }
    }
  }, [login])

  /* Mount the official Telegram widget into our card when the
     fallback path is active. */
  useEffect(() => {
    if (!showWidget || !widgetSlotRef.current || !botConfigured) return
    const slot = widgetSlotRef.current
    slot.innerHTML = ''
    const s = document.createElement('script')
    s.async = true
    s.src = TELEGRAM_WIDGET_SRC
    s.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME)
    s.setAttribute('data-size', 'large')
    s.setAttribute('data-radius', '20')
    s.setAttribute('data-userpic', 'true')
    s.setAttribute('data-request-access', 'write')
    s.setAttribute('data-onauth', 'onTelegramAuth(user)')
    slot.appendChild(s)
  }, [showWidget])

  const handleClick = () => {
    if (busy) return
    setError('')
    if (!botConfigured) {
      setError(
        'The bot is not configured yet. Add the bot username and ID in src/lib/auth.jsx.'
      )
      return
    }
    /* On Android (Capacitor) the popup-based widget is unreliable inside
       a WebView. Route the user out to the system browser, then bounce
       back into the app via a custom URL scheme. App.jsx parses the
       returned payload and calls login() through the deep link
       handler. */
    if (isNative()) {
      setBusy(true)
      openExternal(NATIVE_AUTH_URL).finally(() => {
        /* Browser stays open until user authorises. Reset busy so the
           button isn't permanently stuck if they back out. */
        setTimeout(() => setBusy(false), 800)
      })
      return
    }
    if (!window.Telegram?.Login?.auth) {
      /* Widget script still loading — fall back to the rendered button. */
      setShowWidget(true)
      return
    }
    setBusy(true)
    window.Telegram.Login.auth(
      { bot_id: TELEGRAM_BOT_ID, request_access: 'write' },
      (data) => {
        setBusy(false)
        if (!data) {
          setError('Sign-in was cancelled.')
          return
        }
        const ok = login(data)
        if (!ok) setError('Telegram returned a payload we could not validate.')
      }
    )
  }

  return (
    <div className="login-root">
      <div className="ambient" aria-hidden="true" />

      <div className="login-card glass-strong">
        <div className="login-brand">
          <div className="brand-logo brand-logo-lg" aria-hidden="true">
            <img src="/logo.png" alt="" width="56" height="56" />
          </div>
          <div className="login-brand-text">
            <div className="login-brand-title">Oxygen Vault</div>
            <div className="login-brand-sub">Your private anime &amp; manga library</div>
          </div>
        </div>

        <h1 className="login-title">Sign in to continue</h1>
        <p className="login-text">
          Your library is saved per Telegram account on this device, so
          two people on the same browser keep separate vaults.
        </p>

        <div className="login-button-wrap">
          {!showWidget && (
            <button
              type="button"
              className="login-tg-btn"
              onClick={handleClick}
              disabled={busy}
              aria-label="Continue with Telegram"
            >
              <span className="login-tg-icon">
                <TelegramIcon />
              </span>
              <span className="login-tg-label">
                {busy ? 'Opening Telegram…' : 'Continue with Telegram'}
              </span>
            </button>
          )}
          {showWidget && (
            <div ref={widgetSlotRef} className="login-tg-widget-slot" />
          )}
        </div>

        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}

        {isLocalhost && (
          <button
            type="button"
            className="login-guest-btn"
            onClick={loginGuest}
          >
            Continue as guest (localhost only)
          </button>
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
