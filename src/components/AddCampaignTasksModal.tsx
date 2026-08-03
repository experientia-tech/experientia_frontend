import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { addCampaignTasks, submitTaskDetails, uploadProofFast } from '../api'
import { acquireCameraStream, CameraCapture } from './CameraCapture'
import type { Campaign, ServiceType } from '../types'
import {
  CAPTURE_SLOTS,
  DETAIL_FORM,
  PHOTOS_REQUIRED,
  slotLabel,
} from '../types'
import { mediaUrl } from '../utils/mediaUrl'
import {
  isValidName,
  isValidPhone,
  sanitizeNameInput,
  sanitizePhoneInput,
} from '../utils/validation'
import { useUI } from '../ui'

interface AddCampaignTasksModalProps {
  campaign: Campaign
  onClose: () => void
  onAdded: (campaign: Campaign) => void
}

type Mode = 'complete' | 'empty'

export function AddCampaignTasksModal({
  campaign,
  onClose,
  onAdded,
}: AddCampaignTasksModalProps) {
  const { showError, showSuccess } = useUI()
  const [mode, setMode] = useState<Mode>('complete')
  const [executorId, setExecutorId] = useState(
    campaign.executors[0]?.id || ''
  )
  const [emptyCount, setEmptyCount] = useState(1)
  const [slotFiles, setSlotFiles] = useState<Record<string, File>>({})
  const [slotPreviews, setSlotPreviews] = useState<Record<string, string>>({})
  const previewUrls = useRef<string[]>([])

  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [gymName, setGymName] = useState('')
  const [gymLocation, setGymLocation] = useState('')

  const [cameraSlot, setCameraSlot] = useState<string | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [openingCamera, setOpeningCamera] = useState(false)
  const [busy, setBusy] = useState(false)

  const serviceType = (campaign.service_type || 'Other') as ServiceType
  const slots = useMemo(
    () => CAPTURE_SLOTS[serviceType] || ['photo_1'],
    [serviceType]
  )
  const detailForm = DETAIL_FORM[serviceType]
  const photosNeeded = PHOTOS_REQUIRED[serviceType] || slots.length

  const lat = campaign.center_latitude ?? 0
  const lng = campaign.center_longitude ?? 0
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)

  const photosReady = slots.every((s) => slotFiles[s])

  useEffect(
    () => () => {
      previewUrls.current.forEach((u) => URL.revokeObjectURL(u))
      cameraStream?.getTracks().forEach((t) => t.stop())
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const setSlotFile = useCallback((slot: string, file: File) => {
    const url = URL.createObjectURL(file)
    previewUrls.current.push(url)
    setSlotFiles((prev) => ({ ...prev, [slot]: file }))
    setSlotPreviews((prev) => ({ ...prev, [slot]: url }))
  }, [])

  const clearSlot = (slot: string) => {
    setSlotFiles((prev) => {
      const next = { ...prev }
      delete next[slot]
      return next
    })
    setSlotPreviews((prev) => {
      const next = { ...prev }
      delete next[slot]
      return next
    })
  }

  const releaseCamera = useCallback(() => {
    setCameraStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop())
      return null
    })
    setCameraSlot(null)
  }, [])

  const openCamera = async (slot: string) => {
    setOpeningCamera(true)
    try {
      const stream = await acquireCameraStream('environment')
      setCameraStream(stream)
      setCameraSlot(slot)
    } catch {
      setCameraStream(null)
      setCameraSlot(slot)
    } finally {
      setOpeningCamera(false)
    }
  }

  const onCameraCapture = (file: File) => {
    if (!cameraSlot) return
    setSlotFile(cameraSlot, file)
    releaseCamera()
  }

  const submitEmptyTasks = async () => {
    if (emptyCount < 1 || emptyCount > 500) {
      showError('Task count must be between 1 and 500')
      return
    }
    if (campaign.executors.length === 0) {
      showError('Assign at least one executor before adding tasks')
      return
    }
    setBusy(true)
    try {
      const { campaign: updated } = await addCampaignTasks(campaign.id, {
        count: emptyCount,
        executor_user_id: executorId || undefined,
      })
      showSuccess(`Added ${emptyCount} empty task${emptyCount === 1 ? '' : 's'}`)
      onAdded(updated)
      onClose()
    } catch {
      /* global */
    } finally {
      setBusy(false)
    }
  }

  const onSubmitComplete = async (e: FormEvent) => {
    e.preventDefault()
    if (!executorId) {
      showError('Select an executor for this task')
      return
    }
    if (!hasCoords) {
      showError('Campaign needs a map center before adding tasks')
      return
    }
    if (!photosReady) {
      showError(`Upload all ${photosNeeded} required photo${photosNeeded === 1 ? '' : 's'}`)
      return
    }
    if (detailForm === 'driver') {
      if (!isValidName(driverName)) {
        showError('Driver name must use letters only')
        return
      }
      if (!isValidPhone(driverPhone)) {
        showError('Enter a valid 10-digit phone number')
        return
      }
      if (!vehicleNumber.trim()) {
        showError('Vehicle number is required')
        return
      }
    } else if (detailForm === 'gym') {
      if (!isValidName(gymName)) {
        showError('Gym name must use letters only')
        return
      }
      if (!gymLocation.trim()) {
        showError('Gym location is required')
        return
      }
    }

    setBusy(true)
    try {
      const { campaign: updated, task_ids } = await addCampaignTasks(campaign.id, {
        count: 1,
        executor_user_id: executorId,
      })
      const taskId = task_ids[0]
      if (!taskId) throw new Error('Task was not created')

      for (const slot of slots) {
        const file = slotFiles[slot]
        if (!file) continue
        await uploadProofFast(taskId, file, lat, lng, slot, new Date(), { quiet: true })
      }

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

      showSuccess('Task added with photos and details')
      onAdded(updated)
      onClose()
    } catch {
      /* global */
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div
          className="modal-panel add-task-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-head">
            <h2>Add tasks</h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="modal-body stack">
            <div className="add-task-mode-toggle">
              <button
                type="button"
                className={mode === 'complete' ? 'active' : ''}
                onClick={() => setMode('complete')}
              >
                Add task with photos
              </button>
              <button
                type="button"
                className={mode === 'empty' ? 'active' : ''}
                onClick={() => setMode('empty')}
              >
                Add empty tasks
              </button>
            </div>

            <label className="form-field">
              Assign to executor
              <select
                value={executorId}
                onChange={(e) => setExecutorId(e.target.value)}
                required
              >
                <option value="">Select executor</option>
                {campaign.executors.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.full_name}
                  </option>
                ))}
              </select>
            </label>

            {mode === 'complete' ? (
              <form className="stack" onSubmit={(e) => void onSubmitComplete(e)}>
                <p className="muted">
                  Upload proof photos and details as the campaign manager. Geofence checks are
                  skipped — use camera, gallery, or file upload for each slot.
                </p>

                <div className="manager-slot-list add-task-slots">
                  {slots.map((slot) => {
                    const has = slotFiles[slot]
                    const preview = slotPreviews[slot]
                    return (
                      <div key={slot} className="manager-slot-row add-task-slot-row">
                        <div className="add-task-slot-head">
                          <strong>{slotLabel(slot)}</strong>
                          <span className={`chip ${has ? 'ok' : 'warn'}`}>
                            {has ? 'Ready' : 'Required'}
                          </span>
                        </div>
                        {preview && (
                          <img
                            className="add-task-slot-preview"
                            src={mediaUrl(preview)}
                            alt={slotLabel(slot)}
                          />
                        )}
                        <div className="actions">
                          <button
                            type="button"
                            className="btn primary"
                            disabled={openingCamera}
                            onClick={() => void openCamera(slot)}
                          >
                            {openingCamera && cameraSlot === slot ? 'Opening…' : 'Camera'}
                          </button>
                          <label className="btn ghost file-btn">
                            Gallery / file
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                e.target.value = ''
                                if (file) setSlotFile(slot, file)
                              }}
                            />
                          </label>
                          {has && (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => clearSlot(slot)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {photosReady && detailForm === 'driver' && (
                  <div className="stack add-task-details">
                    <h4>Driver details</h4>
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
                  </div>
                )}

                {photosReady && detailForm === 'gym' && (
                  <div className="stack add-task-details">
                    <h4>Gym details</h4>
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
                  </div>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
                    Cancel
                  </button>
                  <button type="submit" className="btn primary" disabled={busy || !photosReady}>
                    {busy ? 'Saving…' : 'Save task'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="stack">
                <p className="muted">
                  Create placeholder tasks inside the {campaign.radius_km} km zone without photos.
                  Executors can complete them later.
                </p>
                <label className="form-field">
                  Number of empty tasks
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={emptyCount}
                    onChange={(e) => setEmptyCount(Number(e.target.value))}
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void submitEmptyTasks()}
                  >
                    {busy ? 'Adding…' : 'Add empty tasks'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {cameraSlot &&
        createPortal(
          <CameraCapture
            label={slotLabel(cameraSlot)}
            initialStream={cameraStream}
            onClose={releaseCamera}
            onCapture={onCameraCapture}
          />,
          document.body
        )}
    </>
  )
}
