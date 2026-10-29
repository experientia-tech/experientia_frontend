import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  deleteTaskProof,
  getCampaign,
  getTask,
  manualVerifyCreative,
  setCreativeCode,
  submitTaskDetails,
} from '../api'
import { useAuth } from '../auth'
import { acquireCameraStream, CameraCapture } from '../components/CameraCapture'
import { GlobalLoaderInline } from '../components/GlobalLoader'
import { LocationMap } from '../components/LocationMap'
import { ProofThumbGrid } from '../components/ProofThumbGrid'
import type { Campaign, ProofImage, Task } from '../types'
import {
  CAPTURE_SLOTS,
  CREATIVE_STATUS_LABELS,
  DETAIL_FORM,
  STATUS_LABELS,
  canExecutorOpenTask,
  creativeDetectionLabel,
  creativeStatusPill,
  formatCoords,
  formatDate,
  formatDateTime,
  slotLabel,
  taskLabel,
} from '../types'
import type { ServiceType } from '../types'
import { enqueueProofUpload, flushProofUploads, hasPendingProofUpload } from '../utils/proofUploadQueue'
import { mediaUrl } from '../utils/mediaUrl'
import { isValidName, isValidPhone, sanitizeNameInput, sanitizePhoneInput } from '../utils/validation'
import { useUI } from '../ui'

/** Upload rejections meaning the creative status moved on the server. */
const CREATIVE_LOCKED_ERRORS = ['Proof is awaiting verification', 'Proof already verified']

function mergeTaskProofs(server: Task, pending: Map<string, ProofImage>): Task {
  if (pending.size === 0) return server
  const proofs = [...server.proof_images]
  for (const [slot, img] of pending) {
    if (!proofs.some((p) => p.slot === slot)) proofs.push(img)
  }
  return {
    ...server,
    proof_images: proofs,
    proof_image_count: Math.max(server.proof_image_count ?? 0, proofs.length),
  }
}

export function TaskDetailPage() {
  const { id } = useParams()
  const taskId = id!
  const { user } = useAuth()
  const { showError, showSuccess } = useUI()
  const [task, setTask] = useState<Task | null>(null)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const geoRef = useRef<{ lat: number; lng: number } | null>(null)
  const [geoReady, setGeoReady] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [gymName, setGymName] = useState('')
  const [gymLocation, setGymLocation] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [openingCamera, setOpeningCamera] = useState(false)
  const [previewSlot, setPreviewSlot] = useState<string | null>(null)
  const [previewMapOpen, setPreviewMapOpen] = useState(false)
  const [pendingSlot, setPendingSlot] = useState<string | null>(null)
  const activeCaptureSlotRef = useRef<string | null>(null)
  const pendingProofsRef = useRef<Map<string, ProofImage>>(new Map())
  const localUrls = useRef<string[]>([])
  // Creative: an upload is in flight, and whether this visit submitted the proof
  // (keeps the "submitted" message up instead of redirecting straight away).
  const [creativeUploading, setCreativeUploading] = useState(false)
  const [creativeSubmitted, setCreativeSubmitted] = useState(false)
  // Creative: photo taken but not sent yet, so the executor can review it and submit.
  const [creativeDraft, setCreativeDraft] = useState<{ file: File; url: string; slot: string } | null>(null)
  const [verdictBusy, setVerdictBusy] = useState(false)
  const isSupervisor = user?.role === 'supervisor'
  const isManager = user?.role === 'manager'
  const isExecutor = user?.role === 'executor'
  const canCapture = isExecutor
  const canManageProofs = isExecutor || isManager

  const applyServerTask = useCallback((server: Task) => {
    setTask(mergeTaskProofs(server, pendingProofsRef.current))
  }, [])

  const syncTaskQuiet = useCallback(async () => {
    await flushProofUploads()
    const t = await getTask(taskId, { silent: true })
    applyServerTask(t)
  }, [taskId, applyServerTask])

  const reload = useCallback(async () => {
    await flushProofUploads()
    const t = await getTask(taskId, { silent: true })
    applyServerTask(t)
    setDriverName(t.driver_name || '')
    setDriverPhone(t.driver_phone || '')
    setVehicleNumber(t.vehicle_number || '')
    setGymName(t.gym_name || '')
    setGymLocation(t.gym_location || '')
    setCampaign(await getCampaign(t.campaign_id, undefined, { silent: true }))
  }, [taskId, applyServerTask])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (!isExecutor) return
    if (!navigator.geolocation) {
      setGeoError('Location unavailable on this device')
      return
    }
    setGeoError(null)
    const applyPos = (pos: GeolocationPosition) => {
      geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setGeoReady(true)
      setGeoError(null)
    }
    navigator.geolocation.getCurrentPosition(applyPos, () => {
      setGeoError('Waiting for GPS — move outdoors or check location settings')
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 })
    const watch = navigator.geolocation.watchPosition(
      applyPos,
      () => {
        if (!geoRef.current) setGeoError('Location permission needed')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [isExecutor, taskId])

  useEffect(
    () => () => {
      localUrls.current.forEach((u) => URL.revokeObjectURL(u))
      cameraStream?.getTracks().forEach((t) => t.stop())
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const serviceType = (task?.service_type || campaign?.service_type || 'Other') as ServiceType
  const slots = useMemo(
    () => (task?.capture_slots?.length ? task.capture_slots : CAPTURE_SLOTS[serviceType] || ['photo_1']),
    [task?.capture_slots, serviceType]
  )
  const detailForm = task?.detail_form ?? DETAIL_FORM[serviceType]
  const uploadedSlots = useMemo(
    () => new Set(task?.proof_images.map((p) => p.slot) || []),
    [task?.proof_images]
  )
  const creative = task?.creative ?? null
  // A Failed creative still has its photo_1, so retake into it; the backend replaces it.
  const creativeRetake = creative?.verification_status === 'FAILED' && !creativeUploading
  const nextSlot = creativeRetake ? slots[0] : slots.find((s) => !uploadedSlots.has(s))
  const photosDone =
    !creativeRetake && (!nextSlot || (task?.proof_images.length || 0) >= (task?.required_photos || 1))
  const detailsDone = task?.details_complete ?? false
  const captureSlot = nextSlot

  useEffect(() => {
    setPreviewMapOpen(false)
  }, [previewSlot])

  const releaseCameraStream = useCallback(() => {
    setCameraStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  // Close camera once every required slot is filled (no auto-sync wipe).
  useEffect(() => {
    if (cameraOpen && canCapture && task && !captureSlot && !pendingSlot) {
      setCameraOpen(false)
      releaseCameraStream()
    }
  }, [cameraOpen, canCapture, task, captureSlot, pendingSlot, releaseCameraStream])

  const openCamera = useCallback(async (slot?: string | null) => {
    const target = slot || null
    if (target) {
      activeCaptureSlotRef.current = target
      setPendingSlot(target)
    }
    setOpeningCamera(true)
    try {
      const stream = await acquireCameraStream('environment')
      setCameraStream(stream)
      setCameraOpen(true)
    } catch {
      setCameraStream(null)
      setCameraOpen(true)
    } finally {
      setOpeningCamera(false)
    }
  }, [])

  const coords = useCallback(() => {
    const geo = geoRef.current
    return {
      lat: geo?.lat ?? task?.latitude ?? campaign?.center_latitude ?? 0,
      lng: geo?.lng ?? task?.longitude ?? campaign?.center_longitude ?? 0,
    }
  }, [task?.latitude, task?.longitude, campaign?.center_latitude, campaign?.center_longitude])

  const uploadFileToSlot = useCallback(
    async (file: File, slot: string) => {
      if (!task) return

      // Reserve the slot immediately so a concurrent reload cannot drop this capture.
      const localUrl = URL.createObjectURL(file)
      localUrls.current.push(localUrl)
      const placeholder: ProofImage = {
        url: localUrl,
        slot,
        latitude: coords().lat,
        longitude: coords().lng,
        captured_at: new Date().toISOString(),
      }
      pendingProofsRef.current.set(slot, placeholder)
      setTask((prev) =>
        prev
          ? {
              ...prev,
              proof_images: [
                ...prev.proof_images.filter((p) => p.slot !== slot),
                placeholder,
              ],
              proof_image_count: Math.max(
                prev.proof_image_count ?? 0,
                prev.proof_images.filter((p) => p.slot !== slot).length + 1
              ),
            }
          : prev
      )

      // Creative proofs go straight up: no GPS wait or block, the code check runs later.
      const isCreativeTask = !!task.creative

      if (isExecutor && !isCreativeTask && !geoRef.current && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 3000,
            })
          )
          geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setGeoReady(true)
          setGeoError(null)
        } catch {
          /* fall through */
        }
      }

      const { lat, lng } = coords()
      if (
        isExecutor &&
        !isCreativeTask &&
        (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0))
      ) {
        pendingProofsRef.current.delete(slot)
        setTask((prev) =>
          prev
            ? { ...prev, proof_images: prev.proof_images.filter((p) => p.slot !== slot) }
            : prev
        )
        showError('Waiting for GPS — move outdoors or try again')
        return
      }

      const optimistic: ProofImage = {
        ...placeholder,
        latitude: lat,
        longitude: lng,
      }
      pendingProofsRef.current.set(slot, optimistic)
      setTask((prev) =>
        prev
          ? {
              ...prev,
              proof_images: [
                ...prev.proof_images.filter((p) => p.slot !== slot),
                optimistic,
              ],
            }
          : prev
      )

      if (isCreativeTask) setCreativeUploading(true)

      enqueueProofUpload({
        taskId,
        file,
        lat,
        lng,
        slot,
        capturedAt: new Date(),
        onSuccess: (proof) => {
          pendingProofsRef.current.delete(slot)
          setTask((prev) =>
            prev
              ? {
                  ...prev,
                  proof_images: [
                    ...prev.proof_images.filter((p) => p.slot !== slot),
                    proof,
                  ],
                  proof_image_count: Math.max(
                    prev.proof_image_count ?? 0,
                    prev.proof_images.filter((p) => p.slot !== slot).length + 1
                  ),
                  creative: prev.creative
                    ? {
                        ...prev.creative,
                        verification_status: 'PENDING_VERIFICATION',
                        proof_uploaded_at: new Date().toISOString(),
                        verification_notes: null,
                      }
                    : prev.creative,
                }
              : prev
          )
          if (isCreativeTask) {
            setCreativeUploading(false)
            setCreativeSubmitted(true)
          }
        },
        onError: (message) => {
          pendingProofsRef.current.delete(slot)
          setTask((prev) =>
            prev
              ? {
                  ...prev,
                  proof_images: prev.proof_images.filter((p) => p.slot !== slot),
                }
              : prev
          )
          if (isCreativeTask) setCreativeUploading(false)
          showError(message || 'Photo upload failed — try again')
          // Status changed on the server: refresh, which redirects executors back.
          if (isCreativeTask && CREATIVE_LOCKED_ERRORS.some((m) => message?.includes(m))) {
            void syncTaskQuiet()
          }
        },
      })
    },
    [task, coords, isExecutor, showError, taskId, syncTaskQuiet]
  )

  const onCaptureFile = useCallback(
    (file: File) => {
      const slot =
        activeCaptureSlotRef.current ||
        pendingSlot ||
        (previewSlot && canManageProofs ? previewSlot : null) ||
        slots.find((s) => !task?.proof_images.some((p) => p.slot === s))
      if (!slot) return
      activeCaptureSlotRef.current = null
      setPreviewSlot(null)
      setPendingSlot(null)
      setCameraOpen(false)
      releaseCameraStream()
      if (isExecutor && task?.creative) {
        const url = URL.createObjectURL(file)
        localUrls.current.push(url)
        setCreativeDraft({ file, url, slot })
        return
      }
      void uploadFileToSlot(file, slot)
    },
    [pendingSlot, previewSlot, canManageProofs, slots, task, uploadFileToSlot, releaseCameraStream, isExecutor]
  )

  const onSubmitCreative = () => {
    if (!creativeDraft) return
    setCreativeDraft(null)
    void uploadFileToSlot(creativeDraft.file, creativeDraft.slot)
  }

  const onRetakeCreative = () => {
    const slot = creativeDraft?.slot
    setCreativeDraft(null)
    if (slot) void openCamera(slot)
  }

  const handleCameraClose = useCallback(() => {
    setCameraOpen(false)
    setPendingSlot(null)
    activeCaptureSlotRef.current = null
    releaseCameraStream()
    // Don't refetch while an upload is in flight — that was wiping proofs.
    if (!hasPendingProofUpload()) void syncTaskQuiet()
  }, [syncTaskQuiet, releaseCameraStream])

  const onDeleteProof = useCallback(
    (slot: string) => {
      setPreviewSlot(null)
      pendingProofsRef.current.delete(slot)
      startTransition(() => {
        setTask((prev) =>
          prev ? { ...prev, proof_images: prev.proof_images.filter((p) => p.slot !== slot) } : prev
        )
      })
      void deleteTaskProof(taskId, slot)
        // Deleting a Creative proof resets its verification status on the server.
        .then(() => (task?.creative ? syncTaskQuiet() : undefined))
        .catch(() => syncTaskQuiet())
    },
    [taskId, syncTaskQuiet, task?.creative]
  )

  const onRetakeProof = useCallback(
    (slot: string) => {
      setPreviewSlot(null)
      setPendingSlot(slot)
      pendingProofsRef.current.delete(slot)
      startTransition(() => {
        setTask((prev) =>
          prev ? { ...prev, proof_images: prev.proof_images.filter((p) => p.slot !== slot) } : prev
        )
      })
      void deleteTaskProof(taskId, slot)
        .then(() => {
          if (isExecutor) void openCamera(slot)
        })
        .catch(() => syncTaskQuiet())
    },
    [taskId, syncTaskQuiet, isExecutor, openCamera]
  )

  const onCreativeVerdict = async (verdict: 'VERIFIED' | 'FAILED') => {
    let note: string | undefined
    if (verdict === 'FAILED') {
      const input = window.prompt('Reject this proof? Optional note for the executor:', '')
      if (input === null) return
      note = input.trim() || undefined
    }
    setVerdictBusy(true)
    try {
      await manualVerifyCreative(taskId, verdict, note)
      showSuccess(verdict === 'VERIFIED' ? 'Proof approved' : 'Proof rejected')
      await syncTaskQuiet()
    } catch {
      // API errors shown globally
    } finally {
      setVerdictBusy(false)
    }
  }

  const onSetCreativeCode = async (current: string | null) => {
    // Codes start with the campaign name's first two letters (the server checks the same).
    const letters = (task?.campaign_name || campaign?.name || '').normalize('NFKD').toUpperCase().replace(/[^A-Z]/g, '')
    const format = `${(letters + 'XX').slice(0, 2)}-NNNN-NNNN`
    const input = window.prompt(
      current
        ? `Enter a new code (${format}, or just the 8 digits), or leave blank to generate one. The creative image will be re-made.`
        : `Enter the code (${format}, or just the 8 digits), or leave blank to generate one:`,
      ''
    )
    if (input === null) return
    setVerdictBusy(true)
    try {
      await setCreativeCode(taskId, input.trim() || undefined)
      showSuccess('Code saved, creative image is being re-made')
      await syncTaskQuiet()
    } catch {
      // API errors shown globally
    } finally {
      setVerdictBusy(false)
    }
  }

  const onSubmitDetails = async (e: FormEvent) => {
    e.preventDefault()
    if (detailForm === 'driver') {
      if (!isValidName(driverName)) {
        showError('Driver name must use letters only (no numbers)')
        return
      }
      if (!isValidPhone(driverPhone)) {
        showError('Enter a valid 10-digit phone number')
        return
      }
    } else if (detailForm === 'gym') {
      if (!isValidName(gymName)) {
        showError('Gym name must use letters only (no numbers)')
        return
      }
    }
    setSavingDetails(true)
    try {
      await flushProofUploads()
      if (detailForm === 'driver') {
        await submitTaskDetails(taskId, {
          driver_name: driverName.trim(),
          driver_phone: sanitizePhoneInput(driverPhone),
          vehicle_number: vehicleNumber.trim(),
        })
      } else if (detailForm === 'gym') {
        await submitTaskDetails(taskId, {
          gym_name: gymName.trim(),
          gym_location: gymLocation.trim(),
        })
      }
      await syncTaskQuiet()
    } finally {
      setSavingDetails(false)
    }
  }

  if (!task) return <GlobalLoaderInline label="Loading task…" />

  if (canCapture && !canExecutorOpenTask(task) && !creativeSubmitted && !creativeUploading) {
    return <Navigate to={`/my/campaigns/${task.campaign_id}`} replace />
  }

  // Executors can't change a Creative proof that's uploading or awaiting its check.
  const executorProofsLocked = canCapture && !!creative && !creativeRetake && photosDone

  const mapCenter =
    campaign?.center_latitude != null
      ? { lat: campaign.center_latitude, lng: campaign.center_longitude! }
      : { lat: task.latitude || 17.385, lng: task.longitude || 78.486 }

  const previewImage = previewSlot
    ? task.proof_images.find((p) => p.slot === previewSlot)
    : null
  const previewLat = previewImage?.latitude ?? task.latitude
  const previewLng = previewImage?.longitude ?? task.longitude
  const previewHasCoords =
    previewLat != null &&
    previewLng != null &&
    Number.isFinite(previewLat) &&
    Number.isFinite(previewLng)

  return (
    <div className={`page${canCapture ? ' executor-task-page' : ''}`}>
      {canCapture && (
        <header className="executor-mobile-topbar">
          <Link to={`/my/campaigns/${task.campaign_id}`} className="executor-back-btn" aria-label="Back">
            ←
          </Link>
          <h1>{taskLabel(task)}</h1>
          <span className="executor-topbar-spacer" />
        </header>
      )}

      {!canCapture && (
        <div className="page-head">
          <div>
            <p className="eyebrow">
              <Link to={`/campaigns/${task.campaign_id}`}>← Campaign</Link>
              {campaign && <> · {campaign.service_type}</>}
            </p>
            <h1>{taskLabel(task)}</h1>
            <p className="muted">
              <span className={`pill ${task.status.toLowerCase()}`}>
                {STATUS_LABELS[task.status] || task.status}
              </span>
            </p>
          </div>
        </div>
      )}

      {isSupervisor && (
        <p className="muted">Supervisor view — you can review proofs but cannot edit or capture.</p>
      )}

      {!canCapture && (
        <section className="panel stack task-info-panel">
          <h3>Task details</h3>
          <div className="meta-grid">
            <div>
              <span className="meta-label">Executor</span>
              <strong>{task.executor_name || '—'}</strong>
            </div>
            <div>
              <span className="meta-label">Service type</span>
              <strong>{serviceType}</strong>
            </div>
            <div>
              <span className="meta-label">Campaign</span>
              <strong>{task.campaign_name || campaign?.name || '—'}</strong>
            </div>
            <div>
              <span className="meta-label">Address</span>
              <strong>{campaign?.address || '—'}</strong>
            </div>
            <div>
              <span className="meta-label">Latitude</span>
              <strong className="coords-inline">
                {task.latitude != null ? task.latitude.toFixed(6) : '—'}
              </strong>
            </div>
            <div>
              <span className="meta-label">Longitude</span>
              <strong className="coords-inline">
                {task.longitude != null ? task.longitude.toFixed(6) : '—'}
              </strong>
            </div>
            {task.within_geofence != null && (
              <div>
                <span className="meta-label">Geofence</span>
                <strong className={task.within_geofence ? 'geofence-ok' : 'geofence-bad'}>
                  {task.within_geofence ? 'Inside' : 'Outside'}
                </strong>
              </div>
            )}
            <div>
              <span className="meta-label">Created</span>
              <strong>{formatDateTime(task.created_at)}</strong>
            </div>
            <div>
              <span className="meta-label">Completed</span>
              <strong>{formatDateTime(task.completed_at)}</strong>
            </div>
            {(campaign?.start_date || campaign?.end_date) && (
              <div>
                <span className="meta-label">Campaign period</span>
                <strong>
                  {formatDate(campaign?.start_date)} – {formatDate(campaign?.end_date)}
                </strong>
              </div>
            )}
            <div>
              <span className="meta-label">Photos captured</span>
              <strong>
                {task.proof_images.length} of {task.required_photos || 1}
              </strong>
            </div>
            {task.flagged && (
              <div>
                <span className="meta-label">Flagged</span>
                <strong className="geofence-bad">Yes</strong>
              </div>
            )}
          </div>

          {task.notes && (
            <div className="task-notes">
              <span className="meta-label">Notes</span>
              <p>{task.notes}</p>
            </div>
          )}

          {detailsDone && detailForm === 'driver' && (
            <div className="submitted-details">
              <h4>Submitted driver details</h4>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Driver name</span>
                  <strong>{task.driver_name || '—'}</strong>
                </div>
                <div>
                  <span className="meta-label">Phone</span>
                  <strong>{task.driver_phone || '—'}</strong>
                </div>
                <div>
                  <span className="meta-label">Vehicle number</span>
                  <strong>{task.vehicle_number || '—'}</strong>
                </div>
              </div>
            </div>
          )}

          {detailsDone && detailForm === 'gym' && (
            <div className="submitted-details">
              <h4>Submitted gym details</h4>
              <div className="meta-grid">
                <div>
                  <span className="meta-label">Gym name</span>
                  <strong>{task.gym_name || '—'}</strong>
                </div>
                <div>
                  <span className="meta-label">Gym location</span>
                  <strong>{task.gym_location || '—'}</strong>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {!canCapture && creative && (
        <section className="panel creative-panel">
          <div className="creative-panel-image">
            {creative.generated_image_url ? (
              <a href={mediaUrl(creative.generated_image_url)} target="_blank" rel="noreferrer">
                <img src={mediaUrl(creative.generated_image_url)} alt={`Creative ${creative.verification_code ?? ''}`} />
              </a>
            ) : (
              <div className="creative-placeholder">
                {creative.verification_code ? 'Generating…' : 'Waiting for a code'}
              </div>
            )}
          </div>
          <div className="stack">
            <h3>Creative verification</h3>
            <div className="meta-grid">
              <div>
                <span className="meta-label">Code</span>
                <strong className="creative-code">{creative.verification_code || 'Not set'}</strong>
              </div>
              <div>
                <span className="meta-label">Status</span>
                <span className={creativeStatusPill(creative.verification_status)}>
                  {CREATIVE_STATUS_LABELS[creative.verification_status]}
                </span>
              </div>
              <div>
                <span className="meta-label">Detected code</span>
                <strong className="creative-code">{creative.detected_code || '—'}</strong>
              </div>
              <div>
                <span className="meta-label">Method</span>
                <strong>{creativeDetectionLabel(creative) || '—'}</strong>
              </div>
              <div>
                <span className="meta-label">Proof uploaded</span>
                <strong>{formatDateTime(creative.proof_uploaded_at)}</strong>
              </div>
              <div>
                <span className="meta-label">Verified</span>
                <strong>{formatDateTime(creative.verified_at)}</strong>
              </div>
            </div>
            {creative.code_missing && (
              <p className="creative-code-missing" role="alert">
                ⚠ Code is missing in this image: no verification code could be read from the proof photo.
              </p>
            )}
            {creative.verification_notes && (
              <div className="task-notes">
                <span className="meta-label">Verification notes</span>
                <p>{creative.verification_notes}</p>
              </div>
            )}
            {isManager && (
              <div className="actions">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={verdictBusy || creative.verification_status === 'VERIFIED'}
                  onClick={() => void onSetCreativeCode(creative.verification_code)}
                >
                  {creative.verification_code ? 'Change code' : 'Set code'}
                </button>
              </div>
            )}
            {isManager && task.proof_images.length > 0 && (
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={verdictBusy || creative.verification_status === 'VERIFIED'}
                  onClick={() => void onCreativeVerdict('VERIFIED')}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={verdictBusy || creative.verification_status === 'FAILED'}
                  onClick={() => void onCreativeVerdict('FAILED')}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="grid-2">
        {!canCapture && (
          <section className="panel stack">
            <LocationMap
              value={mapCenter}
              radiusKm={campaign?.radius_km ?? 3}
              interactive={false}
              height={260}
              markers={[
                ...(task.latitude != null
                  ? [{ lat: task.latitude, lng: task.longitude!, label: taskLabel(task) }]
                  : []),
              ]}
            />
          </section>
        )}

        <section className="panel stack">
          {canCapture && (
            <div className="capture-box stack">
              {creative && !photosDone && (
                <p className="muted small">
                  Put up one of the campaign's creatives, then take a photo of it with the code at the
                  bottom clearly visible.
                </p>
              )}
              {creativeRetake && (
                <p className="error">
                  Photo rejected
                  {creative?.verification_notes ? `: ${creative.verification_notes}` : ''}. Retake the photo.
                </p>
              )}
              <h3>Capture sequence</h3>
              {!creative && (
                <p className={`geo-status ${geoReady ? 'ok' : 'warn'}`}>
                  {geoReady
                    ? 'GPS ready'
                    : geoError || 'Getting GPS fix…'}
                </p>
              )}
              <ol className="slot-steps">
                {slots.map((s) => (
                  <li
                    key={s}
                    className={
                      creativeRetake && s === captureSlot
                        ? 'current'
                        : uploadedSlots.has(s)
                          ? 'done'
                          : s === captureSlot
                            ? 'current'
                            : ''
                    }
                  >
                    <strong>{slotLabel(s)}</strong>
                    <span>
                      {creativeRetake && s === captureSlot
                        ? 'Retake'
                        : uploadedSlots.has(s)
                          ? 'Done'
                          : s === captureSlot
                            ? 'Next'
                            : 'Waiting'}
                    </span>
                  </li>
                ))}
              </ol>

              {creativeDraft && (
                <div className="creative-draft stack">
                  <img src={creativeDraft.url} alt="Your photo" />
                  <div className="actions">
                    <button type="button" className="btn ghost" onClick={onRetakeCreative}>
                      Retake
                    </button>
                    <button type="button" className="btn primary" onClick={onSubmitCreative}>
                      Submit task
                    </button>
                  </div>
                </div>
              )}

              {!photosDone && captureSlot && !cameraOpen && !creativeDraft && (
                <button
                  type="button"
                  className="btn primary capture-btn"
                  disabled={openingCamera}
                  onClick={() => void openCamera(captureSlot)}
                >
                  {openingCamera
                    ? 'Opening camera…'
                    : creativeRetake
                      ? 'Retake photo'
                      : `Capture ${slotLabel(captureSlot)}`}
                </button>
              )}

              {photosDone && detailForm && !detailsDone && (
                <form className="stack" onSubmit={onSubmitDetails}>
                  {detailForm === 'driver' ? (
                    <>
                      <label>
                        Driver name
                        <input
                          value={driverName}
                          onChange={(e) => setDriverName(sanitizeNameInput(e.target.value))}
                          required
                        />
                      </label>
                      <label>
                        Phone
                        <input
                          value={driverPhone}
                          onChange={(e) => setDriverPhone(sanitizePhoneInput(e.target.value))}
                          inputMode="numeric"
                          maxLength={10}
                          required
                        />
                      </label>
                      <label>
                        Vehicle number
                        <input
                          value={vehicleNumber}
                          onChange={(e) => setVehicleNumber(e.target.value)}
                          required
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Gym name
                        <input
                          value={gymName}
                          onChange={(e) => setGymName(sanitizeNameInput(e.target.value))}
                          required
                        />
                      </label>
                      <label>
                        Gym location
                        <input
                          value={gymLocation}
                          onChange={(e) => setGymLocation(e.target.value)}
                          required
                        />
                      </label>
                    </>
                  )}
                  <button className="btn primary" type="submit" disabled={savingDetails}>
                    Submit details
                  </button>
                </form>
              )}

              {creative && creativeUploading && <p className="muted">Submitting…</p>}

              {photosDone && !creative && (!detailForm || detailsDone) && (
                <p className="success">Task complete.</p>
              )}

              {photosDone && creative && !creativeUploading && (
                <>
                  <p className="success">Task submitted.</p>
                  <Link to={`/my/campaigns/${task.campaign_id}`} className="btn ghost">
                    Back to tasks
                  </Link>
                </>
              )}
            </div>
          )}

          <h3>Proof photos</h3>
          {isManager && (
            <div className="manager-proof-tools stack">
              <p className="muted">
                Add or replace photos for any required slot. Geofence checks are skipped for managers.
              </p>
              <div className="manager-slot-list">
                {slots.map((slot) => {
                  const has = uploadedSlots.has(slot)
                  return (
                    <div key={slot} className="manager-slot-row">
                      <div>
                        <strong>{slotLabel(slot)}</strong>
                        <span className={`chip ${has ? 'ok' : 'warn'}`}>
                          {has ? 'Uploaded' : 'Missing'}
                        </span>
                      </div>
                      <div className="actions">
                        <label className="btn ghost file-btn">
                          {has ? 'Replace file' : 'Upload file'}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              if (file) uploadFileToSlot(file, slot)
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="btn primary"
                          disabled={openingCamera}
                          onClick={() => {
                            setPendingSlot(slot)
                            void openCamera(slot)
                          }}
                        >
                          Camera
                        </button>
                        {has && (
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => onDeleteProof(slot)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {canCapture && uploadedSlots.size > 0 && !executorProofsLocked && (
            <p className="muted small">Tap a photo to retake or delete.</p>
          )}
          <ProofThumbGrid
            images={task.proof_images}
            interactive={(canManageProofs && !executorProofsLocked) || isSupervisor}
            onSelect={setPreviewSlot}
            fallbackLatitude={task.latitude}
            fallbackLongitude={task.longitude}
          />
        </section>
      </div>

      {cameraOpen &&
        (pendingSlot || captureSlot) &&
        createPortal(
          <CameraCapture
            label={slotLabel(pendingSlot || captureSlot!)}
            initialStream={cameraStream}
            onClose={handleCameraClose}
            onCapture={onCaptureFile}
          />,
          document.body
        )}

      {previewImage && previewSlot && (
        <div className="proof-preview-backdrop" onClick={() => setPreviewSlot(null)}>
          <div className="proof-preview-panel" onClick={(e) => e.stopPropagation()}>
            <img src={mediaUrl(previewImage.url)} alt={slotLabel(previewSlot)} />
            <div className="proof-preview-meta">
              <span className="muted">{slotLabel(previewSlot)}</span>
              {previewImage.captured_at && (
                <span className="muted">Captured {formatDateTime(previewImage.captured_at)}</span>
              )}
              {previewHasCoords && (
                <span className="coords-inline">{formatCoords(previewLat, previewLng)}</span>
              )}
              <button
                type="button"
                className={`btn ghost small proof-thumb-map-toggle${previewMapOpen ? ' active' : ''}`}
                onClick={() => setPreviewMapOpen((v) => !v)}
                disabled={!previewHasCoords}
              >
                {previewMapOpen ? 'Hide map view' : 'Enable map view'}
              </button>
            </div>
            {previewMapOpen && previewHasCoords && (
              <div className="proof-thumb-map">
                <LocationMap
                  center={{ lat: previewLat!, lng: previewLng! }}
                  value={{ lat: previewLat!, lng: previewLng! }}
                  markers={[
                    {
                      lat: previewLat!,
                      lng: previewLng!,
                      label: slotLabel(previewSlot),
                    },
                  ]}
                  interactive={false}
                  height={200}
                  zoom={16}
                />
              </div>
            )}
            <div className="proof-preview-actions">
              {canManageProofs && (
                <>
                  {isManager && (
                    <label className="btn primary file-btn">
                      Replace file
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ''
                          if (file && previewSlot) {
                            setPreviewSlot(null)
                            uploadFileToSlot(file, previewSlot)
                          }
                        }}
                      />
                    </label>
                  )}
                  {isExecutor && (
                    <button type="button" className="btn primary" onClick={() => onRetakeProof(previewSlot)}>
                      Retake
                    </button>
                  )}
                  <button type="button" className="btn danger" onClick={() => onDeleteProof(previewSlot)}>
                    Delete
                  </button>
                </>
              )}
              <button type="button" className="btn ghost" onClick={() => setPreviewSlot(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
