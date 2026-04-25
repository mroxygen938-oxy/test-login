import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'

/* Compact profile chip in the topbar (avatar + first name) that opens
   a small popover with full identity + a logout button. */
export default function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  const initials = (user.givenName || user.name || '?')
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="user-menu" ref={wrapRef}>
      <button
        type="button"
        className="user-chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Signed in as ${user.name}`}
      >
        <span className="user-avatar" aria-hidden="true">
          {user.picture ? (
            <img src={user.picture} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="user-avatar-fallback">{initials || '?'}</span>
          )}
        </span>
        <span className="user-chip-name">{user.givenName || user.name}</span>
        <svg
          className="user-chip-caret"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="user-popover glass-strong" role="menu">
          <div className="user-popover-header">
            <span className="user-avatar large" aria-hidden="true">
              {user.picture ? (
                <img src={user.picture} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-avatar-fallback">{initials || '?'}</span>
              )}
            </span>
            <div className="user-popover-id">
              <div className="user-popover-name">{user.name}</div>
              {user.email && (
                <div className="user-popover-email">{user.email}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost user-popover-logout"
            onClick={() => {
              setOpen(false)
              logout()
            }}
            role="menuitem"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
