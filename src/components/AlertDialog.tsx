import type { AlertKind, AlertState } from '../feedback'

const ICONS: Record<AlertKind, string> = {
  success: '✓',
  error: '!',
  info: 'i',
}

const TITLES: Record<AlertKind, string> = {
  success: 'Success',
  error: 'Something went wrong',
  info: 'Notice',
}

export function AlertDialog({
  alert,
  onClose,
}: {
  alert: AlertState | null
  onClose: () => void
}) {
  if (!alert) return null

  return (
    <div className="alert-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`alert-dialog alert-${alert.kind}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        aria-describedby="alert-message"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className={`alert-icon alert-icon-${alert.kind}`} aria-hidden>
          {ICONS[alert.kind]}
        </div>
        <h2 id="alert-title">{alert.title || TITLES[alert.kind]}</h2>
        <p id="alert-message">{alert.message}</p>
        <button type="button" className="btn primary alert-ok" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </div>
  )
}
