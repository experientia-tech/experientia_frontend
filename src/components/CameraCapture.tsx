import { useCallback, useEffect, useRef, useState } from 'react'

interface CameraCaptureProps {
  label: string
  onCapture: (file: File) => void
  onClose: () => void
}

export function CameraCapture({ label, onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onCaptureRef = useRef(onCapture)
  const onCloseRef = useRef(onClose)
  const [ready, setReady] = useState(false)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [bursting, setBursting] = useState(false)

  onCaptureRef.current = onCapture
  onCloseRef.current = onClose

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  useEffect(() => {
    let cancelled = false
    setReady(false)

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) return
      try {
        stopStream()
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          video.setAttribute('playsinline', 'true')
          video.setAttribute('webkit-playsinline', 'true')
          await video.play()
          setReady(true)
        }
      } catch {
        onCloseRef.current()
      }
    }

    void startCamera()
    return () => {
      cancelled = true
      stopStream()
    }
  }, [facing, stopStream])

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
        onCaptureRef.current(new File([blob], `proof-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.82
    )
  }

  return (
    <div className="camera-backdrop camera-backdrop-instant">
      <div className="camera-shell" aria-label={label}>
        <div className="camera-topbar camera-topbar-minimal">
          <button type="button" className="camera-close-light" onClick={() => onCloseRef.current()} aria-label="Close">
            ×
          </button>
          <strong>{label}</strong>
          <button
            type="button"
            className="camera-close-light"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            aria-label="Flip camera"
          >
            ↻
          </button>
        </div>

        <div className="camera-viewport">
          <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
        </div>

        <div className="camera-controls">
          <button
            type="button"
            className="camera-shutter"
            disabled={!ready || bursting}
            onClick={takePhoto}
            aria-label="Take photo"
          />
        </div>
      </div>
    </div>
  )
}
