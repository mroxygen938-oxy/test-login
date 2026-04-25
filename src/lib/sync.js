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

   Conflict resolution: simple last-write-wins, with the server's
   `updated_at` used to skip pulls older than what we just pushed. */

import { useEffect, useMemo, useRef, useState } from 'react'

const LOAD_URL = '/api/load.php'
const SAVE_URL = '/api/save.php'

const SAVE_DEBOUNCE_MS = 600
const POLL_INTERVAL_MS = 15000

/* Apply a server library to the local setters. Bails out gracefully
   if any field is missing so a stale or malformed payload can't blank
   out a user's library. */
function applyLibrary(lib, setters) {
  if (!lib || typeof lib !== 'object') return false
  if (Array.isArray(lib.animes)) setters.setAnimes(lib.animes)
  if (Array.isArray(lib.mangas)) setters.setMangas(lib.mangas)
  if (typeof lib.activeListAnime === 'string')
    setters.setActiveListAnime(lib.activeListAnime)
  if (typeof lib.activeListManga === 'string')
    setters.setActiveListManga(lib.activeListManga)
  if (lib.mediaMode === 'anime' || lib.mediaMode === 'manga')
    setters.setMediaMode(lib.mediaMode)
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
    throw new Error(detail)
  }
  return data
}

/* Hook signature:
     useLibrarySync({ user, state, setters })
   - user.raw : the raw Telegram payload (hash + auth_date + id + …)
   - state    : { animes, mangas, activeListAnime, activeListManga, mediaMode }
   - setters  : { setAnimes, setMangas, setActiveListAnime,
                  setActiveListManga, setMediaMode }

   Returns { status, lastSavedAt, lastError } where status is one of
   'idle' | 'loading' | 'saving' | 'synced' | 'offline' | 'error'. */
export function useLibrarySync({ user, state, setters }) {
  const [status, setStatus] = useState('idle')
  const [lastSavedAt, setLastSavedAt] = useState(0)
  const [lastError, setLastError] = useState('')

  /* Keep a stable ref to setters that we read inside async callbacks.
     Updated via effect so we never write a ref during render. */
  const settersRef = useRef(setters)
  useEffect(() => {
    settersRef.current = setters
  }, [setters])

  /* Tracks the most recent server-known timestamp so we don't clobber
     newer local edits on poll. */
  const serverUpdatedAtRef = useRef(0)
  /* True until the very first server load completes — until then we
     skip saving so we don't push the seed library over a real one. */
  const firstLoadDoneRef = useRef(false)

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
     re-renders don't trigger spurious saves. */
  const lib = useMemo(
    () => ({
      v: 1,
      animes: state.animes,
      mangas: state.mangas,
      activeListAnime: state.activeListAnime,
      activeListManga: state.activeListManga,
      mediaMode: state.mediaMode,
    }),
    [
      state.animes,
      state.mangas,
      state.activeListAnime,
      state.activeListManga,
      state.mediaMode,
    ]
  )
  const libFingerprint = useMemo(() => JSON.stringify(lib), [lib])

  /* ───── 1. INITIAL LOAD ────────────────────────────────────────── */
  useEffect(() => {
    firstLoadDoneRef.current = false
    if (!canSync) {
      firstLoadDoneRef.current = true
      return undefined
    }
    const ctl = new AbortController()
    ;(async () => {
      setStatus('loading')
      setLastError('')
      try {
        const auth = JSON.parse(authJson)
        const data = await postJson(LOAD_URL, { auth }, ctl.signal)
        if (data?.library) {
          applyLibrary(data.library, settersRef.current)
          serverUpdatedAtRef.current = data.updated_at || 0
          setLastSavedAt(data.updated_at || 0)
        }
        setStatus('synced')
      } catch (e) {
        if (e.name === 'AbortError') return
        setLastError(String(e.message || e))
        setStatus('offline')
      } finally {
        firstLoadDoneRef.current = true
      }
    })()
    return () => ctl.abort()
  }, [canSync, authJson])

  /* ───── 2. DEBOUNCED SAVE ON STATE CHANGE ──────────────────────── */
  useEffect(() => {
    if (!canSync) return undefined
    if (!firstLoadDoneRef.current) return undefined
    const ctl = new AbortController()
    const t = window.setTimeout(async () => {
      setStatus('saving')
      setLastError('')
      try {
        const auth = JSON.parse(authJson)
        const data = await postJson(
          SAVE_URL,
          { auth, library: lib },
          ctl.signal
        )
        serverUpdatedAtRef.current =
          data?.updated_at || Math.floor(Date.now() / 1000)
        setLastSavedAt(serverUpdatedAtRef.current)
        setStatus('synced')
      } catch (e) {
        if (e.name === 'AbortError') return
        setLastError(String(e.message || e))
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
        if (
          alive &&
          data?.library &&
          data.updated_at &&
          data.updated_at > serverUpdatedAtRef.current
        ) {
          applyLibrary(data.library, settersRef.current)
          serverUpdatedAtRef.current = data.updated_at
          setLastSavedAt(data.updated_at)
        }
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
    return () => {
      alive = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [canSync, authJson])

  return { status, lastSavedAt, lastError }
}
