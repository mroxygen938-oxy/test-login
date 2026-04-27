/* Client helper for the /api/image.php endpoint.

   `uploadDataUrl` POSTs a base64 data URL plus the user's Telegram
   auth payload, returns a same-origin URL that can be used directly
   in <img src="…">. Errors bubble so callers can show feedback. */

const ENDPOINT = '/api/image.php'

export async function uploadDataUrl(dataUrl, authRaw, signal) {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    throw new Error('not_a_data_url')
  }
  if (!authRaw || typeof authRaw !== 'object') {
    throw new Error('missing_auth')
  }
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth: authRaw, data_url: dataUrl }),
    signal,
    credentials: 'omit',
  })
  let data = null
  try {
    data = await r.json()
  } catch {
    /* swallow */
  }
  if (!r.ok || !data?.url) {
    const detail = data?.error || `HTTP ${r.status}`
    const err = new Error(detail)
    err.status = r.status
    throw err
  }
  return { id: data.id, url: data.url }
}

/* True for legacy entries whose `image` field still holds a base64
   data URL inline. The migration step uploads these to the server. */
export function isLegacyDataUrl(s) {
  return typeof s === 'string' && s.startsWith('data:')
}
