import { useCallback, useEffect, useRef, useState } from 'react'

interface CameraCaptureProps {
  label: string
  onCapture: (file: File) => void
  onClose: () => void
  /** Stream acquired during a user gesture (required for reliable iOS Safari). */
  initialStream?: MediaStream | null
}

async function openCameraStream(facing: 'environment' | 'user'): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not supported in this browser')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    })
  } catch {
    // Fallback: some Android/iOS builds reject facingMode constraints.
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  }
}

export async function acquireCameraStream(
  facing: 'environment' | 'user' = 'environment'
): Promise<MediaStream> {
  return openCameraStream(facing)
}

export function CameraCapture({
  label,
  onCapture,
  onClose,
  initialStream = null,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onCaptureRef = useRef(onCapture)
  const onCloseRef = useRef(onClose)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [bursting, setBursting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(true)

  onCaptureRef.current = onCapture
  onCloseRef.current = onClose

  const ownsStreamRef = useRef(false)

  const detachVideo = useCallback(() => {
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stopOwnedStream = useCallback(() => {
    if (ownsStreamRef.current) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    streamRef.current = null
    ownsStreamRef.current = false
    detachVideo()
  }, [detachVideo])

  const attachStream = useCallback(
    async (stream: MediaStream, owned: boolean) => {
      if (!stream.active) {
        setStarting(false)
        setReady(false)
        setError('Camera stream ended — tap Retry')
        return
      }
      // Replace previously owned stream only.
      if (ownsStreamRef.current && streamRef.current && streamRef.current !== stream) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      streamRef.current = stream
      ownsStreamRef.current = owned
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      video.setAttribute('webkit-playsinline', 'true')
      video.muted = true
      try {
        await video.play()
      } catch {
        // Autoplay can fail; shutter still works after first tap.
      }
      setReady(true)
      setStarting(false)
      setError(null)
    },
    []
  )

  const startCamera = useCallback(
    async (nextFacing: 'environment' | 'user') => {
      setStarting(true)
      setReady(false)
      setError(null)
      stopOwnedStream()
      try {
        const stream = await openCameraStream(nextFacing)
        await attachStream(stream, true)
      } catch (err) {
        setStarting(false)
        setReady(false)
        setError(err instanceof Error ? err.message : 'Could not open the camera')
      }
    },
    [attachStream, stopOwnedStream]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (initialStream?.active) {
        if (cancelled) return
        await attachStream(initialStream, false)
        return
      }
      if (!cancelled) await startCamera(facing)
    })()
    return () => {
      cancelled = true
      // Detach only — parent owns initialStream; Strict Mode remount must not kill it.
      detachVideo()
      if (ownsStreamRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        ownsStreamRef.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStream])

  const flipCamera = async () => {
    const next = facing === 'environment' ? 'user' : 'environment'
    setFacing(next)
    await startCamera(next)
  }

  const takePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || bursting) return

    setBursting(true)
    const canvas = document.createElement('canvas')
    const maxEdge = 1600
    let w = video.videoWidth
    let h = video.videoHeight
    if (Math.max(w, h) > maxEdge) {
      const scale = maxEdge / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setBursting(false)
      return
    }
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        setBursting(false)
        if (!blob) return
        stopOwnedStream()
        onCaptureRef.current(new File([blob], `proof-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.82
    )
  }

  const onFilePicked = (file: File | undefined) => {
    if (!file) return
    stopOwnedStream()
    onCaptureRef.current(file)
  }

  return (
    <div className="camera-backdrop camera-backdrop-instant" role="dialog" aria-modal="true">
      <div className="camera-shell" aria-label={label}>
        <div className="camera-topbar camera-topbar-minimal">
          <button
            type="button"
            className="camera-close-light"
            onClick={() => {
              stopOwnedStream()
              onCloseRef.current()
            }}
            aria-label="Close"
          >
            ×
          </button>
          <strong>{label}</strong>
          <button
            type="button"
            className="camera-close-light"
            onClick={() => void flipCamera()}
            aria-label="Flip camera"
            disabled={!!error}
          >
            ↻
          </button>
        </div>

        <div className="camera-viewport">
          {error ? (
            <div className="camera-error">
              <p>{error}</p>
              <button type="button" className="btn primary" onClick={() => void startCamera(facing)}>
                Retry camera
              </button>
              <button
                type="button"
                className="btn ghost camera-fallback-link"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose photo from gallery
              </button>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
              {(starting || !ready) && <p className="camera-loading">Starting camera…</p>}
            </>
          )}
        </div>

        <div className="camera-controls">
          <button
            type="button"
            className="camera-shutter"
            disabled={(!ready && !error) || bursting}
            onClick={error ? () => fileInputRef.current?.click() : takePhoto}
            aria-label={error ? 'Choose photo' : 'Take photo'}
          />
          <button
            type="button"
            className="camera-fallback-link"
            onClick={() => fileInputRef.current?.click()}
          >
            Use gallery instead
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              onFilePicked(file)
            }}
          />
        </div>
      </div>
    </div>
  )
}
