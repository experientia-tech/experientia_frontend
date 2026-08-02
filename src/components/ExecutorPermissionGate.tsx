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

  const refresh = useCallback(async () => {
    setChecking(true)
    const next = await ensureExecutorPermissions()
    setPerms(next)
    setChecking(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const ready = perms.camera === 'granted' && perms.location === 'granted'

  const enableCamera = async () => {
    const ok = await requestCameraAccess()
    const next = { ...perms, camera: ok ? 'granted' as const : 'denied' as const }
    setPerms(next)
    savePermissionSnapshot(next)
  }

  const enableLocation = async () => {
    const ok = await requestLocationAccess()
    const next = { ...perms, location: ok ? 'granted' as const : 'denied' as const }
    setPerms(next)
    savePermissionSnapshot(next)
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
                <button type="button" className="btn primary" onClick={() => void enableCamera()}>
                  Enable camera
                </button>
              )}
            </li>
            <li className={perms.location === 'granted' ? 'ok' : ''}>
              <span>Location</span>
              <strong>{perms.location === 'granted' ? 'Allowed' : 'Required'}</strong>
              {perms.location !== 'granted' && (
                <button type="button" className="btn primary" onClick={() => void enableLocation()}>
                  Enable location
                </button>
              )}
            </li>
          </ul>
          <button type="button" className="btn ghost" onClick={() => void refresh()}>
            Check again
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
