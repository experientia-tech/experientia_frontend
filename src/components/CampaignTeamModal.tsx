import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  assignCampaignExecutors,
  assignCampaignSupervisors,
  listBrands,
  listExecutors,
  listSupervisors,
  updateCampaign,
} from '../api'
import type { Brand, Campaign, User } from '../types'
import { TeamPicker } from './TeamPicker'
import { useUI } from '../ui'

export type TeamPanelKind = 'brand' | 'executors' | 'supervisors' | 'agencies'

interface CampaignTeamModalProps {
  kind: TeamPanelKind
  campaign: Campaign
  onClose: () => void
  onSaved: () => void | Promise<void>
}

export function CampaignTeamModal({ kind, campaign, onClose, onSaved }: CampaignTeamModalProps) {
  const { showSuccess, showError } = useUI()
  const [busy, setBusy] = useState(false)
  const [brands, setBrands] = useState<Brand[]>([])
  const [executors, setExecutors] = useState<User[]>([])
  const [supervisors, setSupervisors] = useState<User[]>([])
  const [selectedBrand, setSelectedBrand] = useState(campaign.brand_id || '')
  const [selectedExecutors, setSelectedExecutors] = useState<string[]>(
    campaign.executors.map((e) => e.id)
  )
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>(
    campaign.members.filter((m) => m.role === 'SUPERVISOR' && m.active).map((m) => m.user_id)
  )

  useEffect(() => {
    if (kind === 'brand') listBrands().then(setBrands).catch(() => undefined)
    if (kind === 'executors') listExecutors().then(setExecutors).catch(() => undefined)
    if (kind === 'supervisors' && campaign.brand_id) {
      listSupervisors(campaign.brand_id).then(setSupervisors).catch(() => undefined)
    }
  }, [kind, campaign.brand_id])

  const titles: Record<TeamPanelKind, string> = {
    brand: 'Assign brand',
    executors: 'Assign executors',
    supervisors: 'Assign supervisors',
    agencies: 'Agencies & partners',
  }

  const saveBrand = async () => {
    if (!selectedBrand) {
      showError('Select a brand')
      return
    }
    setBusy(true)
    try {
      await updateCampaign(campaign.id, { brand_id: selectedBrand })
      showSuccess('Brand assigned — brand supervisors were added automatically')
      await onSaved()
      onClose()
    } catch {
      // global error dialog
    } finally {
      setBusy(false)
    }
  }

  const saveExecutors = async () => {
    if (!selectedExecutors.length) {
      showError('Select at least one executor')
      return
    }
    setBusy(true)
    try {
      await assignCampaignExecutors(campaign.id, selectedExecutors)
      showSuccess('Executors saved — tasks generated or redistributed')
      await onSaved()
      onClose()
    } catch {
      // global error dialog
    } finally {
      setBusy(false)
    }
  }

  const saveSupervisors = async () => {
    setBusy(true)
    try {
      await assignCampaignSupervisors(campaign.id, selectedSupervisors)
      showSuccess('Supervisors updated')
      await onSaved()
      onClose()
    } catch {
      // global error dialog
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel team-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-modal-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="modal-head">
          <h2 id="team-modal-title">{titles[kind]}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {kind === 'brand' && (
          <div className="modal-body stack">
            <p className="muted">
              Link this campaign to a brand. Supervisors for that brand are added automatically.
            </p>
            <label className="form-field">
              Brand
              <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)}>
                <option value="">Select brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            {brands.length === 0 && (
              <p className="muted">
                No brands yet. <Link to="/team">Create a brand on Team</Link>
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !selectedBrand}
                onClick={() => void saveBrand()}
              >
                {busy ? 'Saving…' : 'Save brand'}
              </button>
            </div>
          </div>
        )}

        {kind === 'executors' && (
          <div className="modal-body stack">
            <p className="muted">
              Select field executors. Tasks are generated or redistributed across the team.
            </p>
            {executors.length === 0 ? (
              <p className="muted">
                No executors yet. <Link to="/team">Add executors on Team</Link>
              </p>
            ) : (
              <TeamPicker
                people={executors}
                selected={selectedExecutors}
                onChange={setSelectedExecutors}
                roleLabel="Executor"
              />
            )}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || executors.length === 0}
                onClick={() => void saveExecutors()}
              >
                {busy ? 'Saving…' : 'Save executors'}
              </button>
            </div>
          </div>
        )}

        {kind === 'supervisors' && (
          <div className="modal-body stack">
            {!campaign.brand_id ? (
              <>
                <p className="muted">
                  Assign a brand to this campaign first, then you can pick brand supervisors.
                </p>
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={onClose}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Supervisors get view-only access to this campaign plus PDF export. Only
                  supervisors registered for <strong>{campaign.brand?.name}</strong> are listed.
                </p>
                {supervisors.length === 0 ? (
                  <p className="muted">
                    No supervisors for this brand.{' '}
                    <Link to="/team">Add a supervisor on Team</Link>
                  </p>
                ) : (
                  <TeamPicker
                    people={supervisors}
                    selected={selectedSupervisors}
                    onChange={setSelectedSupervisors}
                    roleLabel="Supervisor"
                  />
                )}
                <div className="modal-actions">
                  <button type="button" className="btn ghost" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void saveSupervisors()}
                  >
                    {busy ? 'Saving…' : 'Save supervisors'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {kind === 'agencies' && (
          <div className="modal-body stack">
            <p className="muted">
              Agency partners are not tracked separately yet. Use the Team page to manage brands,
              executors, and supervisors for this campaign.
            </p>
            <div className="modal-actions">
              <Link className="btn primary" to="/team" onClick={onClose}>
                Open Team management
              </Link>
              <button type="button" className="btn ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
