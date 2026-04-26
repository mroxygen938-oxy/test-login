/* Capacitor / native helpers. Safe to import in pure-web builds; the
   Capacitor packages no-op when the global isn't present. */

export function isNative() {
  if (typeof window === 'undefined') return false
  const cap = window.Capacitor
  if (!cap) return false
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform()
  return Boolean(cap.platform && cap.platform !== 'web')
}

export async function openExternal(url) {
  if (!isNative()) {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url, presentationStyle: 'popover', windowName: '_self' })
  } catch (e) {
    /* Last-ditch fallback: just navigate the WebView. */
    window.location.href = url
  }
}

export async function closeExternal() {
  if (!isNative()) return
  try {
    const { Browser } = await import('@capacitor/browser')
    await Browser.close()
  } catch {
    /* ignore */
  }
}

/* Decode the base64url payload smuggled back via the deep-link return
   URL. Returns the parsed Telegram auth object or null. */
export function parseDeepLinkAuthPayload(rawUrl) {
  try {
    const u = new URL(rawUrl)
    const enc = u.searchParams.get('payload')
    if (!enc) return null
    const json = decodeURIComponent(escape(atob(enc)))
    const obj = JSON.parse(json)
    return obj && typeof obj === 'object' ? obj : null
  } catch {
    return null
  }
}
