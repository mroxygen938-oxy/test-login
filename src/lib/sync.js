/* Cross-device sync layer.

   Talks to two endpoints sitting next to the static site at
   /api/load.php and /api/save.php (PHP+MySQL on cPanel).

   The "library" is everything that should follow the user across
   devices — animes, mangas, active list selections, mode. Theme is
   intentionally kept device-local.

   The frontend keeps using its existing per-key localStorage state
   for instant UI; this layer just mirrors the combined library
   to the server with a debounced save and pulls fresh server state
   on mount + every POLL_INTERVAL_MS.

   Conflict resolution: optimistic concurrency. Every save tells the
   server the `updated_at` we last observed. If the server has moved
   on since, it refuses with HTTP 409 and we re-pull, then re-save
   with the fresh version. This stops a stale snapshot on one device
   from trampling fresh edits made on another device. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from './apiBase.js'

const LOAD_URL = `${API_BASE}/api/load.php`
const SAVE_URL = `${API_BASE}/api/save.php`

const SAVE_DEBOUNCE_MS = 600
const POLL_INTERVAL_MS = 15000
const RETRY_PULL_MS = 5000

/* Apply a server library to the local setters. Bails out gracefully
   if any field is missing so a stale or malformed payload can't blank
   out a user's library.

   IMPORTANT: we deliberately do NOT pull mediaMode / activeListAnime /
   activeListManga from the server. Those are per-device UI
   preferences — which tab and list you're looking at right now is
   your business on this device, not something to be ping-pongged
   across devices on every poll. Syncing them caused the user's
   selection to get "auto-reset" mid-session whenever a poll landed. */
function applyLibrary(lib, setters) {
  if (!lib || typeof lib !== 'object') return false
  if (Array.isArray(lib.animes)) setters.setAnimes(lib.animes)
  if (Array.isArray(lib.mangas)) setters.setMangas(lib.mangas)
  return true
}

async function postJson(url, body, signal) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    credentials: 'omit',
  })
  let data = null
  try {
    data = await r.json()
  } catch {
    /* server returned non-JSON */
  }
  if (!r.ok) {
    const detail = data?.error || `HTTP ${r.status}`
    const err = new Error(detail)
    err.status = r.status
    err.code = data?.error || ''
    err.payload = data
    throw err
  }
  return data
}

/* Hook signature:
     useLibrarySync({ user, state, setters })
   - user.raw : the raw Telegram payload (hash + auth_date + id + …)
   - state    : { animes, mangas } — only the actual library is synced
   - setters  : { setAnimes, setMangas }
   (mediaMode + activeList* are intentionally device-local; see comment
   on applyLibrary above.)

   Returns { status, lastSavedAt, lastError } where status is one of
   'idle' | 'loading' | 'saving' | 'synced' | 'offline' |
   'error' | 'expired' | 'conflict'. */
export function useLibrarySync({ user, state, setters, onAuthInvalid }) {
  const [status, setStatus] = useState('idle')
  const [lastSavedAt, setLastSavedAt] = useState(0)
  const [lastError, setLastError] = useState('')

  /* Keep a stable ref to setters that we read inside async callbacks.
     Updated via effect so we never write a ref during render. */
  const settersRef = useRef(setters)
  useEffect(() => {
    settersRef.current = setters
  }, [setters])

  const onAuthInvalidRef = useRef(onAuthInvalid)
  useEffect(() => {
    onAuthInvalidRef.current = onAuthInvalid
  }, [onAuthInvalid])

  const handleAuthError = (e) => {
    if (e?.status === 401) {
      try {
        onAuthInvalidRef.current?.()
      } catch {
        /* swallow */
      }
      return true
    }
    return false
  }

  /* Tracks the most recent server-known timestamp so we don't clobber
     newer local edits on poll, and so save can send it as the
     optimistic-concurrency token. */
  const serverUpdatedAtRef = useRef(0)
  /* Flips to true ONLY after a successful initial pull from the
     server. Until then, saves are blocked — otherwise a stale
     localStorage snapshot would happily overwrite the DB. */
  const firstPullSucceededRef = useRef(false)
  /* Fingerprint of the last library we either successfully pushed or
     pulled. Lets us skip no-op saves and avoid ping-ponging after
     conflict resolution. */
  const lastSyncedFingerprintRef = useRef('')
  /* When a 409 conflict is being resolved, we set this to true to
     trigger an immediate re-pull from the poll loop. */
  const pendingPullRef = useRef(false)

  const userId = user ? user.id : null
  const userRaw = user ? user.raw : null
  /* Has sync? Guests don't have a real Telegram payload to verify. */
  const canSync = Boolean(userRaw && userId && userId !== 'guest')

  /* Stable string for the auth payload — used as a dep without
     re-firing every render. */
  const authJson = useMemo(
    () => (canSync && userRaw ? JSON.stringify(userRaw) : ''),
    [canSync, userRaw]
  )

  /* Build the combined library object + its fingerprint. We only push
     to the server when this fingerprint changes, so unrelated parent
     re-renders don't trigger spurious saves. mediaMode + activeList*
     are intentionally NOT included — device-local preferences. */
  const lib = useMemo(
    () => ({
      v: 1,
      animes: state.animes,
      mangas: state.mangas,
    }),
    [state.animes, state.mangas]
  )
  const libFingerprint = useMemo(() => JSON.stringify(lib), [lib])

  /* ───── 1. INITIAL LOAD ────────────────────────────────────────── */
  useEffect(() => {
    firstPullSucceededRef.current = false
    lastSyncedFingerprintRef.current = ''
    serverUpdatedAtRef.current = 0
    if (!canSync) return undefined

    const ctl = new AbortController()
    let cancelled = false
    let retryTimer = 0

    const attempt = async () => {
      if (cancelled) return
      setStatus('loading')
      setLastError('')
      try {
        const auth = JSON.parse(authJson)
        const data = await postJson(LOAD_URL, { auth }, ctl.signal)
        if (cancelled) return
        if (data?.library) {
          applyLibrary(data.library, settersRef.current)
          /* Snapshot the fingerprint of what we just applied so the
             save effect doesn't immediately echo it back. */
          const applied = {
            v: 1,
            animes: Array.isArray(data.library.animes)
              ? data.library.animes
              : [],
            mangas: Array.isArray(data.library.mangas)
              ? data.library.mangas
              : [],
          }
          lastSyncedFingerprintRef.current = JSON.stringify(applied)
        }
        serverUpdatedAtRef.current = data?.updated_at || 0
        setLastSavedAt(serverUpdatedAtRef.current)
        firstPullSucceededRef.current = true
        setStatus('synced')
      } catch (e) {
        if (e.name === 'AbortError' || cancelled) return
        setLastError(String(e.message || e))
        if (handleAuthError(e)) {
          setStatus('expired')
          /* No point retrying with a bad auth payload. */
          return
        }
        setStatus('offline')
        /* Retry the pull soon. Saves stay blocked until we succeed,
           so a flaky cold-start can't lead to a stale-overwrite. */
        retryTimer = window.setTimeout(attempt, RETRY_PULL_MS)
      }
    }

    attempt()

    /* Re-attempt as soon as the OS reports the network is back. */
    const onOnline = () => {
      if (!firstPullSucceededRef.current) attempt()
    }
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      ctl.abort()
      if (retryTimer) window.clearTimeout(retryTimer)
      window.removeEventListener('online', onOnline)
    }
  }, [canSync, authJson])

  /* ───── 2. DEBOUNCED SAVE ON STATE CHANGE ──────────────────────── */
  useEffect(() => {
    if (!canSync) return undefined
    if (!firstPullSucceededRef.current) return undefined
    /* Skip if the local lib matches what the server already has —
       avoids ping-ponging with the pull effect. */
    if (libFingerprint === lastSyncedFingerprintRef.current)
      return undefined

    const ctl = new AbortController()
    const t = window.setTimeout(async () => {
      setStatus('saving')
      setLastError('')
      try {
        const auth = JSON.parse(authJson)
        const data = await postJson(
          SAVE_URL,
          {
            auth,
            library: lib,
            expected_updated_at: serverUpdatedAtRef.current,
          },
          ctl.signal
        )
        serverUpdatedAtRef.current =
          data?.updated_at || Math.floor(Date.now() / 1000)
        lastSyncedFingerprintRef.current = libFingerprint
        setLastSavedAt(serverUpdatedAtRef.current)
        setStatus('synced')
      } catch (e) {
        if (e.name === 'AbortError') return
        setLastError(String(e.message || e))
        if (handleAuthError(e)) {
          setStatus('expired')
          return
        }
        if (e?.status === 409) {
          /* Another device wrote in between. Pull the fresh version
             and let the user decide what to do — DON'T blindly
             re-save the stale local copy. The pull will update the
             local state via setters; if the user has unsaved local
             edits the next state change will trigger another save
             which will then succeed. */
          setStatus('conflict')
          if (e.payload?.updated_at) {
            serverUpdatedAtRef.current = e.payload.updated_at
          }
          pendingPullRef.current = true
          return
        }
        setStatus('error')
      }
    }, SAVE_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(t)
      ctl.abort()
    }
  }, [libFingerprint, lib, canSync, authJson])

  /* ───── 3. PERIODIC PULL ───────────────────────────────────────── */
  useEffect(() => {
    if (!canSync) return undefined
    let alive = true
    const tick = async () => {
      if (!alive) return
      const ctl = new AbortController()
      try {
        const auth = JSON.parse(authJson)
        const data = await postJson(LOAD_URL, { auth }, ctl.signal)
        if (!alive) return
        if (
          data?.library &&
          data.updated_at &&
          data.updated_at > serverUpdatedAtRef.current
        ) {
          applyLibrary(data.library, settersRef.current)
          serverUpdatedAtRef.current = data.updated_at
          const applied = {
            v: 1,
            animes: Array.isArray(data.library.animes)
              ? data.library.animes
              : [],
            mangas: Array.isArray(data.library.mangas)
              ? data.library.mangas
              : [],
          }
          lastSyncedFingerprintRef.current = JSON.stringify(applied)
          setLastSavedAt(data.updated_at)
          setStatus('synced')
        } else if (pendingPullRef.current) {
          /* Conflict resolution finished — server's latest already
             matches what we have. Clear the conflict status. */
          setStatus('synced')
        }
        pendingPullRef.current = false
      } catch {
        /* keep the previous status; no need to flip the badge to
           red just because one poll failed. */
      }
    }
    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    /* Also pull when the tab regains focus, so flipping back from the
       phone shows fresh data immediately. */
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    /* And on network reconnect — covers the offline → online flow on
       Android where saves were blocked while we couldn't reach the
       server. */
    const onOnline = () => tick()
    window.addEventListener('online', onOnline)
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [canSync, authJson])

  /* ───── 4. CONFLICT FAST-PATH ──────────────────────────────────── */
  /* When a save returns 409 we want to pull right away rather than
     waiting up to POLL_INTERVAL_MS. The save handler sets
     pendingPullRef; this effect kicks the pull when status flips to
     'conflict'. */
  useEffect(() => {
    if (status !== 'conflict') return undefined
    if (!canSync) return undefined
    const ctl = new AbortController()
    let cancelled = false
    ;(async () => {
      try {
        const auth = JSON.parse(authJson)
        const data = await postJson(LOAD_URL, { auth }, ctl.signal)
        if (cancelled) return
        if (data?.library) {
          applyLibrary(data.library, settersRef.current)
          serverUpdatedAtRef.current = data.updated_at || 0
          const applied = {
            v: 1,
            animes: Array.isArray(data.library.animes)
              ? data.library.animes
              : [],
            mangas: Array.isArray(data.library.mangas)
              ? data.library.mangas
              : [],
          }
          lastSyncedFingerprintRef.current = JSON.stringify(applied)
          setLastSavedAt(serverUpdatedAtRef.current)
        }
        pendingPullRef.current = false
        setStatus('synced')
      } catch (e) {
        if (e.name === 'AbortError' || cancelled) return
        setLastError(String(e.message || e))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      ctl.abort()
    }
  }, [status, canSync, authJson])

  return { status, lastSavedAt, lastError }
}
