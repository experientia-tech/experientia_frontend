import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  deleteTaskProof,
  getCampaign,
  getTask,
  submitTaskDetails,
} from '../api'
import { useAuth } from '../auth'
import { acquireCameraStream, CameraCapture } from '../components/CameraCapture'
import { GlobalLoaderInline } from '../components/GlobalLoader'
import { LocationMap } from '../components/LocationMap'
import { ProofThumbGrid } from '../components/ProofThumbGrid'
import type { Campaign, ProofImage, Task } from '../types'
import { CAPTURE_SLOTS, DETAIL_FORM, STATUS_LABELS, canExecutorOpenTask, formatCoords, formatDate, formatDateTime, slotLabel, taskLabel } from '../types'
import type { ServiceType } from '../types'
import { enqueueProofUpload, flushProofUploads } from '../utils/proofUploadQueue'
import { mediaUrl } from '../utils/mediaUrl'
import { isValidName, isValidPhone, sanitizeNameInput, sanitizePhoneInput } from '../utils/validation'
import { useUI } from '../ui'

export function TaskDetailPage() {
  const { id } = useParams()
  const taskId = id!
  const { user } = useAuth()
  const { showError } = useUI()
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
  const localUrls = useRef<string[]>([])
  const isSupervisor = user?.role === 'supervisor'
  const isManager = user?.role === 'manager'
  const isExecutor = user?.role === 'executor'
  const canCapture = isExecutor
  const canManageProofs = isExecutor || isManager


  const syncTaskQuiet = useCallback(async () => {
    await flushProofUploads()
    const t = await getTask(taskId, { silent: true })
    setTask(t)
  }, [taskId])

  const reload = useCallback(async () => {
    await flushProofUploads()
    const t = await getTask(taskId, { silent: true })
    setTask(t)
    setDriverName(t.driver_name || '')
    setDriverPhone(t.driver_phone || '')
    setVehicleNumber(t.vehicle_number || '')
    setGymName(t.gym_name || '')
    setGymLocation(t.gym_location || '')
    setCampaign(await getCampaign(t.campaign_id, undefined, { silent: true }))
  }, [taskId])

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
  const nextSlot = slots.find((s) => !uploadedSlots.has(s))
  const photosDone = !nextSlot || (task?.proof_images.length || 0) >= (task?.required_photos || 1)
  const detailsDone = task?.details_complete ?? false
  const captureSlot = nextSlot

  useEffect(() => {
    setPreviewMapOpen(false)
  }, [previewSlot])

  useEffect(() => {
    if (cameraOpen && canCapture && task && !captureSlot && !pendingSlot) {
      setCameraOpen(false)
      cameraStream?.getTracks().forEach((t) => t.stop())
      setCameraStream(null)
      void syncTaskQuiet()
    }
  }, [cameraOpen, canCapture, task, captureSlot, pendingSlot, cameraStream, syncTaskQuiet])

  const releaseCameraStream = useCallback(() => {
    setCameraStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop())
      return null
    })
  }, [])

  const openCamera = useCallback(async (slot?: string | null) => {
    if (slot) setPendingSlot(slot)
    setOpeningCamera(true)
    try {
      // Acquire during the tap gesture so iOS Safari allows the camera.
      const stream = await acquireCameraStream('environment')
      setCameraStream(stream)
      setCameraOpen(true)
    } catch {
      setCameraStream(null)
      setCameraOpen(true) // UI still opens with retry / gallery fallback
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

  const hasUsableCoords = useCallback(() => {
    const c = coords()
    return Number.isFinite(c.lat) && Number.isFinite(c.lng) && !(c.lat === 0 && c.lng === 0)
  }, [coords])

  const uploadFileToSlot = useCallback(
    async (file: File, slot: string) => {
      if (!task) return
      if (isExecutor && !geoRef.current && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 3000,
            })
          )
          geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setGeoReady(true)
          setGeoError(null)
        } catch {
          /* fall through to hasUsableCoords check */
        }
      }
      if (!hasUsableCoords() && isExecutor) {
        showError('Waiting for GPS — move outdoors or try again')
        return
      }
      const { lat, lng } = coords()
      const localUrl = URL.createObjectURL(file)
      localUrls.current.push(localUrl)
      const optimistic: ProofImage = {
        url: localUrl,
        slot,
        latitude: lat,
        longitude: lng,
        captured_at: new Date().toISOString(),
      }

      startTransition(() => {
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
      })

      enqueueProofUpload({
        taskId,
        file,
        lat,
        lng,
        slot,
        capturedAt: new Date(),
        onError: () => {
          startTransition(() => {
            setTask((prev) =>
              prev
                ? { ...prev, proof_images: prev.proof_images.filter((p) => p.slot !== slot) }
                : prev
            )
          })
        },
      })
    },
    [task, coords, hasUsableCoords, isExecutor, showError, taskId]
  )

  const onCaptureFile = useCallback(
    (file: File) => {
      const slot =
        pendingSlot ||
        (previewSlot && canManageProofs ? previewSlot : null) ||
        slots.find((s) => !task?.proof_images.some((p) => p.slot === s))
      if (!slot) return
      setPreviewSlot(null)
      setPendingSlot(null)
      setCameraOpen(false)
      releaseCameraStream()
      void uploadFileToSlot(file, slot)
    },
    [pendingSlot, previewSlot, canManageProofs, slots, task, uploadFileToSlot, releaseCameraStream]
  )

  const handleCameraClose = useCallback(() => {
    setCameraOpen(false)
    setPendingSlot(null)
    releaseCameraStream()
    void syncTaskQuiet()
  }, [syncTaskQuiet, releaseCameraStream])

  const onDeleteProof = useCallback(
    (slot: string) => {
      setPreviewSlot(null)
      startTransition(() => {
        setTask((prev) =>
          prev ? { ...prev, proof_images: prev.proof_images.filter((p) => p.slot !== slot) } : prev
        )
      })
      void deleteTaskProof(taskId, slot).catch(() => syncTaskQuiet())
    },
    [taskId, syncTaskQuiet]
  )

  const onRetakeProof = useCallback(
    (slot: string) => {
      setPreviewSlot(null)
      setPendingSlot(slot)
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

  if (canCapture && !canExecutorOpenTask(task)) {
    return <Navigate to={`/my/campaigns/${task.campaign_id}`} replace />
  }

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
              <h3>Capture sequence</h3>
              <p className={`geo-status ${geoReady ? 'ok' : 'warn'}`}>
                {geoReady
                  ? 'GPS ready'
                  : geoError || 'Getting GPS fix…'}
              </p>
              <ol className="slot-steps">
                {slots.map((s) => (
                  <li
                    key={s}
                    className={uploadedSlots.has(s) ? 'done' : s === captureSlot ? 'current' : ''}
                  >
                    <strong>{slotLabel(s)}</strong>
                    <span>{uploadedSlots.has(s) ? 'Done' : s === captureSlot ? 'Next' : 'Waiting'}</span>
                  </li>
                ))}
              </ol>

              {!photosDone && captureSlot && !cameraOpen && (
                <button
                  type="button"
                  className="btn primary capture-btn"
                  disabled={openingCamera}
                  onClick={() => void openCamera(captureSlot)}
                >
                  {openingCamera ? 'Opening camera…' : `Capture ${slotLabel(captureSlot)}`}
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

              {photosDone && (!detailForm || detailsDone) && (
                <p className="success">Task complete.</p>
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
          {canCapture && uploadedSlots.size > 0 && (
            <p className="muted small">Tap a photo to retake or delete.</p>
          )}
          <ProofThumbGrid
            images={task.proof_images}
            interactive={canManageProofs || isSupervisor}
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
