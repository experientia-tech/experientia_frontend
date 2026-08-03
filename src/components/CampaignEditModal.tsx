import { useEffect, useState, type FormEvent } from 'react'
import { listBrands, updateCampaign } from '../api'
import { LocationMap, type LatLng } from './LocationMap'
import type { Brand, Campaign } from '../types'
import { lookupIndianPincode } from '../utils/geocode'
import { parseApiError } from '../utils/apiError'
import { useUI } from '../ui'

const DEFAULT_RADIUS_KM = 3

function toDateInput(value?: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

function extractPincode(address?: string | null) {
  const match = address?.match(/\b(\d{6})\b/)
  return match?.[1] || ''
}

function withPincode(address: string, pincode: string) {
  const pin = pincode.trim()
  const base = address.trim()
  if (!pin) return base || undefined
  if (base.includes(pin)) return base
  return base ? `${base}, ${pin}` : pin
}

interface CampaignEditModalProps {
  campaign: Campaign
  onClose: () => void
  onSaved: (campaign: Campaign) => void
}

export function CampaignEditModal({ campaign, onClose, onSaved }: CampaignEditModalProps) {
  const { showError, showSuccess } = useUI()
  const [brands, setBrands] = useState<Brand[]>([])
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description || '')
  const [address, setAddress] = useState(campaign.address || '')
  const [pincode, setPincode] = useState(extractPincode(campaign.address))
  const [status, setStatus] = useState(campaign.status || 'ACTIVE')
  const [brandId, setBrandId] = useState(campaign.brand_id || '')
  const [startDate, setStartDate] = useState(toDateInput(campaign.start_date))
  const [endDate, setEndDate] = useState(toDateInput(campaign.end_date))
  const [center, setCenter] = useState<LatLng | null>(
    campaign.center_latitude != null && campaign.center_longitude != null
      ? { lat: campaign.center_latitude, lng: campaign.center_longitude }
      : null
  )
  const [latInput, setLatInput] = useState(
    campaign.center_latitude != null ? String(campaign.center_latitude) : ''
  )
  const [lngInput, setLngInput] = useState(
    campaign.center_longitude != null ? String(campaign.center_longitude) : ''
  )
  const [busy, setBusy] = useState(false)
  const [lookingUpPin, setLookingUpPin] = useState(false)

  useEffect(() => {
    void listBrands().then(setBrands)
  }, [])

  const applyCenter = (pos: LatLng) => {
    setCenter(pos)
    setLatInput(pos.lat.toFixed(6))
    setLngInput(pos.lng.toFixed(6))
  }

  const applyPincode = async () => {
    setLookingUpPin(true)
    try {
      const result = await lookupIndianPincode(pincode)
      applyCenter({ lat: result.lat, lng: result.lng })
      setPincode(result.pincode || pincode.trim())
      if (!address.trim()) setAddress(result.label)
      showSuccess(`Mapped pincode ${result.pincode || pincode}`)
    } catch (error) {
      showError(parseApiError(error, 'Could not find that pincode'))
    } finally {
      setLookingUpPin(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      showError('Campaign name is required')
      return
    }
    const lat = Number(latInput)
    const lng = Number(lngInput)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showError('Set a location via pincode or map pin')
      return
    }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      showError('Pincode must be a 6-digit Indian PIN')
      return
    }
    if (startDate && endDate && endDate < startDate) {
      showError('End date must be on or after start date')
      return
    }
    setBusy(true)
    try {
      const updated = await updateCampaign(campaign.id, {
        name: name.trim(),
        description: description.trim(),
        address: withPincode(address, pincode),
        status,
        brand_id: brandId || null,
        center_latitude: lat,
        center_longitude: lng,
        start_date: startDate ? `${startDate}T00:00:00` : null,
        end_date: endDate ? `${endDate}T23:59:59` : null,
      })
      showSuccess('Campaign updated')
      onSaved(updated)
      onClose()
    } catch {
      /* api interceptor shows error */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel campaign-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Edit campaign</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form className="modal-body stack" onSubmit={onSubmit}>
          <label className="form-field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </label>
          <label className="form-field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="DRAFT">DRAFT</option>
            </select>
          </label>
          <label className="form-field">
            Brand
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Address
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>
          <div className="form-row two pincode-row">
            <label className="form-field">
              Pincode
              <input
                value={pincode}
                inputMode="numeric"
                maxLength={6}
                placeholder="e.g. 560001"
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
            <button
              type="button"
              className="btn secondary coord-go"
              disabled={lookingUpPin || pincode.trim().length !== 6}
              onClick={() => void applyPincode()}
            >
              {lookingUpPin ? 'Finding…' : 'Find on map'}
            </button>
          </div>
          <label className="form-field">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <div className="form-row two">
            <label className="form-field">
              Start date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="form-field">
              End date
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <div className="form-row two">
            <label className="form-field">
              Latitude
              <input
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                onBlur={() => {
                  const lat = Number(latInput)
                  const lng = Number(lngInput)
                  if (Number.isFinite(lat) && Number.isFinite(lng)) applyCenter({ lat, lng })
                }}
              />
            </label>
            <label className="form-field">
              Longitude
              <input
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                onBlur={() => {
                  const lat = Number(latInput)
                  const lng = Number(lngInput)
                  if (Number.isFinite(lat) && Number.isFinite(lng)) applyCenter({ lat, lng })
                }}
              />
            </label>
          </div>
          <p className="muted small">
            Click the map to move the pin. Executors must capture within {DEFAULT_RADIUS_KM} km.
          </p>
          <LocationMap
            center={center || { lat: 20.5937, lng: 78.9629 }}
            value={center}
            onChange={applyCenter}
            radiusKm={DEFAULT_RADIUS_KM}
            height={240}
            zoom={center ? 13 : 5}
          />
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
