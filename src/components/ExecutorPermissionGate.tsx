import { useCallback, useEffect, useState } from 'react'
import {
  ensureExecutorPermissions,
  loadPermissionSnapshot,
  requestCameraAccess,
  requestLocationAccess,
  savePermissionSnapshot,
  type ExecutorPermissions,
} from '../utils/executorPermissions'

export function ExecutorPermissionGate({ children }: { children: React.ReactNode }) {
  const [perms, setPerms] = useState<ExecutorPermissions>(loadPermissionSnapshot())
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState<'camera' | 'location' | 'all' | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const refresh = useCallback(async (forceRequest = false) => {
    setHint(null)
    setBusy('all')
    const snapshot = loadPermissionSnapshot()
    const alreadyReady = snapshot.camera === 'granted' && snapshot.location === 'granted'
    if (!alreadyReady) setChecking(true)
    try {
      const next = forceRequest
        ? {
            camera: (await requestCameraAccess()) ? ('granted' as const) : ('denied' as const),
            location: (await requestLocationAccess()) ? ('granted' as const) : ('denied' as const),
          }
        : await ensureExecutorPermissions()
      savePermissionSnapshot(next)
      setPerms(next)
      if (next.camera !== 'granted' || next.location !== 'granted') {
        setHint(
          'If you already allowed access in Settings, tap Enable again or reload this page.'
        )
      }
    } finally {
      setBusy(null)
      setChecking(false)
    }
  }, [])

  const ready = perms.camera === 'granted' && perms.location === 'granted'

  useEffect(() => {
    void refresh(false)
  }, [refresh])

  // Re-check only while blocked — never steal the camera mid-capture.
  useEffect(() => {
    if (ready) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ready, refresh])

  const enableCamera = async () => {
    setBusy('camera')
    setHint(null)
    const ok = await requestCameraAccess()
    const next = { ...perms, camera: ok ? ('granted' as const) : ('denied' as const) }
    setPerms(next)
    savePermissionSnapshot(next)
    if (!ok) {
      setHint('Camera blocked. Open browser site settings and allow Camera, then try again.')
    }
    setBusy(null)
  }

  const enableLocation = async () => {
    setBusy('location')
    setHint(null)
    const ok = await requestLocationAccess()
    const next = { ...perms, location: ok ? ('granted' as const) : ('denied' as const) }
    setPerms(next)
    savePermissionSnapshot(next)
    if (!ok) {
      setHint('Location blocked. Open browser site settings and allow Location, then try again.')
    }
    setBusy(null)
  }

  if (checking && !ready) {
    return (
      <div className="executor-perm-gate">
        <p className="muted">Preparing camera and location…</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="executor-perm-gate">
        <div className="executor-perm-card">
          <h2>Permissions required</h2>
          <p className="muted">
            Executors need camera and location access to capture proof photos at task sites.
          </p>
          <ul className="executor-perm-list">
            <li className={perms.camera === 'granted' ? 'ok' : ''}>
              <span>Camera</span>
              <strong>{perms.camera === 'granted' ? 'Allowed' : 'Required'}</strong>
              {perms.camera !== 'granted' && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null}
                  onClick={() => void enableCamera()}
                >
                  {busy === 'camera' ? 'Opening…' : 'Enable camera'}
                </button>
              )}
            </li>
            <li className={perms.location === 'granted' ? 'ok' : ''}>
              <span>Location</span>
              <strong>{perms.location === 'granted' ? 'Allowed' : 'Required'}</strong>
              {perms.location !== 'granted' && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy !== null}
                  onClick={() => void enableLocation()}
                >
                  {busy === 'location' ? 'Locating…' : 'Enable location'}
                </button>
              )}
            </li>
          </ul>
          {hint && <p className="executor-perm-hint">{hint}</p>}
          <button
            type="button"
            className="btn ghost"
            disabled={busy !== null}
            onClick={() => void refresh(true)}
          >
            {busy === 'all' ? 'Checking…' : 'Request again'}
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
