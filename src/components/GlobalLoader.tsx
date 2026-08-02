import { useSyncExternalStore } from 'react'
import { feedbackIsLoading, subscribeGlobalLoading } from '../feedback'

function LoaderCard({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="global-loader-card">
      <div className="global-loader-orbit" aria-hidden>
        <span className="global-loader-dot dot-a" />
        <span className="global-loader-dot dot-b" />
        <span className="global-loader-dot dot-c" />
        <div className="global-loader-core">E</div>
      </div>
      <p>{label}</p>
    </div>
  )
}

/** Full-screen overlay — used by axios interceptors and auth bootstrap only. */
export function GlobalLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="global-loader" role="status" aria-live="polite" aria-label={label}>
      <LoaderCard label={label} />
    </div>
  )
}

/**
 * In-page placeholder while waiting for data.
 * Hidden whenever the global overlay is already visible so only one loader dialog shows.
 */
export function GlobalLoaderInline({ label = 'Loading…' }: { label?: string }) {
  const globalLoading = useSyncExternalStore(subscribeGlobalLoading, feedbackIsLoading, () => false)
  if (globalLoading) return null

  return (
    <div
      className="page global-loader-inline-wrap"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <LoaderCard label={label} />
    </div>
  )
}
