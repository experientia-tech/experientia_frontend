export type PermissionState = 'unknown' | 'granted' | 'denied'

export interface ExecutorPermissions {
  camera: PermissionState
  location: PermissionState
}

const STORAGE_KEY = 'experientia.executor.permissions'

export function loadPermissionSnapshot(): ExecutorPermissions {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { camera: 'unknown', location: 'unknown' }
    return JSON.parse(raw) as ExecutorPermissions
  } catch {
    return { camera: 'unknown', location: 'unknown' }
  }
}

export function savePermissionSnapshot(next: ExecutorPermissions) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearPermissionSnapshot() {
  sessionStorage.removeItem(STORAGE_KEY)
}

export async function probeCameraPermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName })
    if (status.state === 'granted') return 'granted'
    if (status.state === 'denied') return 'denied'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function probeLocationPermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (status.state === 'granted') return 'granted'
    if (status.state === 'denied') return 'denied'
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function requestCameraAccess(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      stream.getTracks().forEach((t) => t.stop())
      return true
    } catch {
      return false
    }
  }
}

export async function requestLocationAccess(): Promise<boolean> {
  if (!navigator.geolocation) return false
  try {
    await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })
    )
    return true
  } catch {
    return false
  }
}

/** Probe first; only prompt when status is unknown (avoids useless prompts when blocked). */
export async function ensureExecutorPermissions(): Promise<ExecutorPermissions> {
  let camera = await probeCameraPermission()
  let location = await probeLocationPermission()

  // Many mobile browsers don't support Permissions API for camera — treat unknown as needs request.
  if (camera !== 'granted') {
    camera = (await requestCameraAccess()) ? 'granted' : camera === 'denied' ? 'denied' : 'denied'
  }
  if (location !== 'granted') {
    location = (await requestLocationAccess()) ? 'granted' : 'denied'
  }

  const snapshot = { camera, location }
  savePermissionSnapshot(snapshot)
  return snapshot
}
