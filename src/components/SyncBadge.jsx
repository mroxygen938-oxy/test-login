/* Tiny pill that surfaces the current sync state next to the user
   menu. Shows a colored dot + a short status word. Hides itself when
   the sync layer is idle (e.g. guest mode). */

const LABELS = {
  loading: 'Loading',
  saving: 'Saving',
  synced: 'Synced',
  offline: 'Offline',
  error: 'Retry',
  expired: 'Re-login',
  idle: '',
}

export default function SyncBadge({ status, lastError }) {
  const label = LABELS[status] || ''
  if (!label) return null
  const title = lastError
    ? `${label} — ${lastError}`
    : status === 'synced'
      ? 'Library synced across your devices'
      : label
  return (
    <span
      className={`sync-badge sync-badge-${status}`}
      title={title}
      aria-live="polite"
      role="status"
    >
      <span className="sync-dot" aria-hidden="true" />
      <span className="sync-label">{label}</span>
    </span>
  )
}
