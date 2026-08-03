import { useState, type FormEvent } from 'react'
import { addCampaignTasks } from '../api'
import type { Campaign } from '../types'
import { useUI } from '../ui'

interface AddCampaignTasksModalProps {
  campaign: Campaign
  onClose: () => void
  onAdded: (campaign: Campaign) => void
}

export function AddCampaignTasksModal({
  campaign,
  onClose,
  onAdded,
}: AddCampaignTasksModalProps) {
  const { showError, showSuccess } = useUI()
  const [count, setCount] = useState(1)
  const [executorId, setExecutorId] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (count < 1 || count > 500) {
      showError('Task count must be between 1 and 500')
      return
    }
    if (campaign.executors.length === 0) {
      showError('Assign at least one executor before adding tasks')
      return
    }
    setBusy(true)
    try {
      const updated = await addCampaignTasks(campaign.id, {
        count,
        executor_user_id: executorId || undefined,
      })
      showSuccess(`Added ${count} task${count === 1 ? '' : 's'}`)
      onAdded(updated)
      onClose()
    } catch {
      /* global error dialog */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add tasks</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="modal-body stack" onSubmit={(e) => void onSubmit(e)}>
          <p className="muted">
            Create new tasks inside the {campaign.radius_km} km geofence around this campaign center.
            Use this when a photo was rejected or you need more capture points.
          </p>
          <label className="form-field">
            Number of tasks to add
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              required
            />
          </label>
          <label className="form-field">
            Assign to executor (optional)
            <select value={executorId} onChange={(e) => setExecutorId(e.target.value)}>
              <option value="">Distribute among executors</option>
              {campaign.executors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add tasks'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
