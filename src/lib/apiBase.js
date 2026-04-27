/* All endpoints used to live next to the static site, so client code
   could just hit `/api/load.php` etc. with relative URLs. Once the
   Android build was switched to bundled assets it loads from
   `https://localhost/` — relative URLs go to the wrong place.

   `API_BASE` is empty for the regular web build (so requests stay
   same-origin) and the absolute origin for the native app build. */

import { isNative } from './native.js'

const NATIVE_API_ORIGIN = 'https://oxygenvault.online'

export const API_BASE = isNative() ? NATIVE_API_ORIGIN : ''

/* Resolve an `image` field stored in an anime/manga object into a
   value usable in <img src="…">. Server-uploaded images are stored
   as `/api/image.php?id=…`; in native builds they need the origin
   prefixed so the WebView knows which host to hit. Inline data URLs
   and external URLs pass through unchanged. */
export function resolveImageUrl(image) {
  if (!image) return ''
  if (typeof image !== 'string') return ''
  if (image.startsWith('data:')) return image
  if (/^https?:\/\//i.test(image)) return image
  if (image.startsWith('/')) return API_BASE + image
  return image
}
