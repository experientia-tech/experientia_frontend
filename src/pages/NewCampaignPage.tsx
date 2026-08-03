import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createCampaign, createBrand, listBrands, listExecutors, uploadBrandLogo } from '../api'
import { LocationMap, type LatLng } from '../components/LocationMap'
import type { Brand, ServiceType, User } from '../types'
import { DETAIL_FORM, PHOTOS_REQUIRED, SERVICE_TYPES } from '../types'
import { mediaUrl } from '../utils/mediaUrl'
import { useUI } from '../ui'

const DEFAULT_RADIUS_KM = 3

function parseCoord(value: string, min: number, max: number): number | null {
  const n = Number(value.trim())
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}

export function NewCampaignPage() {
  const navigate = useNavigate()
  const { showError } = useUI()
  const [brands, setBrands] = useState<Brand[]>([])
  const [executors, setExecutors] = useState<User[]>([])
  const [name, setName] = useState('')
  const [brandId, setBrandId] = useState<string>('')
  const [newBrand, setNewBrand] = useState('')
  const [newBrandLogo, setNewBrandLogo] = useState<File | null>(null)
  const [serviceType, setServiceType] = useState<ServiceType>('Pole Boards')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [center, setCenter] = useState<LatLng | null>(null)
  const [latInput, setLatInput] = useState('')
  const [lngInput, setLngInput] = useState('')
  const [radiusKm, setRadiusKm] = useState(String(DEFAULT_RADIUS_KM))
  const [totalTasks, setTotalTasks] = useState(100)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedExecs, setSelectedExecs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const photosNeeded = PHOTOS_REQUIRED[serviceType]
  const formHint =
    DETAIL_FORM[serviceType] === 'driver'
      ? 'Then driver details'
      : DETAIL_FORM[serviceType] === 'gym'
        ? 'Then gym details'
        : 'No extra form'

  const radiusValue = Number(radiusKm)
  const radiusForMap =
    Number.isFinite(radiusValue) && radiusValue > 0 ? radiusValue : DEFAULT_RADIUS_KM

  useEffect(() => {
    listBrands().then((b) => {
      setBrands(b)
      if (b[0]) setBrandId(b[0].id)
    })
    listExecutors().then(setExecutors)
  }, [])

  const applyCenter = (pos: LatLng) => {
    setCenter(pos)
    setLatInput(pos.lat.toFixed(6))
    setLngInput(pos.lng.toFixed(6))
  }

  const applyCoordinates = () => {
    const lat = parseCoord(latInput, -90, 90)
    const lng = parseCoord(lngInput, -180, 180)
    if (lat === null || lng === null) {
      showError('Enter valid latitude and longitude')
      return
    }
    applyCenter({ lat, lng })
  }

  const addBrand = async () => {
    if (!newBrand.trim()) return
    if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(newBrand.trim())) {
      showError('Brand name must use letters only (no numbers)')
      return
    }
    try {
      let storageKey: string | undefined
      if (newBrandLogo) {
        storageKey = await uploadBrandLogo(newBrandLogo)
      }
      const b = await createBrand(newBrand.trim(), undefined, { storage_key: storageKey })
      setBrands((prev) => [...prev, b])
      setBrandId(b.id)
      setNewBrand('')
      setNewBrandLogo(null)
    } catch {
      // API errors shown globally
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const resolved =
      center ??
      (() => {
        const lat = parseCoord(latInput, -90, 90)
        const lng = parseCoord(lngInput, -180, 180)
        return lat !== null && lng !== null ? { lat, lng } : null
      })()
    if (!name.trim()) {
      showError('Campaign name is required')
      return
    }
    if (!/[A-Za-z]/.test(name)) {
      showError('Campaign name must include letters')
      return
    }
    if (!resolved) {
      showError('Set latitude and longitude, or click the map to place the center pin')
      return
    }
    const radius = Number(radiusKm)
    if (!Number.isFinite(radius) || radius <= 0 || radius > 500) {
      showError('Geofence radius must be between 0.1 and 500 km')
      return
    }
    if (startDate && endDate && endDate < startDate) {
      showError('End date must be on or after start date')
      return
    }
    setBusy(true)
    try {
      const campaign = await createCampaign({
        name: name.trim(),
        brand_id: brandId || null,
        service_type: serviceType,
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        center_latitude: resolved.lat,
        center_longitude: resolved.lng,
        radius_km: radius,
        total_tasks: totalTasks,
        executor_ids: selectedExecs,
        start_date: startDate || null,
        end_date: endDate || null,
      })
      navigate(`/campaigns/${campaign.id}`)
    } catch {
      // API errors shown globally
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>New campaign</h1>
          <p className="muted">
            Set the campaign center with latitude/longitude or a map pin. Executors must capture
            photos within your chosen geofence radius.
          </p>
        </div>
      </div>

      <form className="grid-2" onSubmit={onSubmit}>
        <section className="panel stack">
          <label>
            Campaign name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
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
          {brandId && brands.find((b) => b.id === brandId)?.image && (
            <img
              className="brand-logo-preview"
              src={mediaUrl(brands.find((b) => b.id === brandId)!.image!)}
              alt=""
            />
          )}
          <div className="inline-add">
            <input
              placeholder="Add new brand"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value.replace(/[^A-Za-z\s'.-]/g, '').slice(0, 80))}
            />
            <label className="btn ghost file-btn">
              Logo
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => setNewBrandLogo(e.target.files?.[0] || null)}
              />
            </label>
            <button type="button" className="btn ghost" onClick={() => void addBrand()}>
              Add
            </button>
          </div>
          {newBrandLogo && <p className="muted">Logo selected: {newBrandLogo.name}</p>}
          <label>
            Service type
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
            >
              {SERVICE_TYPES.map((k) => (
                <option key={k} value={k}>
                  {k} ({PHOTOS_REQUIRED[k]} photo{PHOTOS_REQUIRED[k] === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </label>
          <div className="zone-summary">
            <strong>Executor capture</strong>
            <p>
              {photosNeeded} photo{photosNeeded === 1 ? '' : 's'}
              {serviceType === 'Auto Hood' ? ' — front → side → back' : ''}. {formHint}. Must be
              within {radiusForMap} km of the campaign center.
            </p>
          </div>
          <label>
            Geofence radius (km)
            <input
              type="number"
              min={0.1}
              max={500}
              step={0.1}
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              required
            />
          </label>
          <label>
            Number of tasks
            <input
              type="number"
              min={1}
              max={10000}
              value={totalTasks}
              onChange={(e) => setTotalTasks(Number(e.target.value))}
              required
            />
          </label>
          <div className="coord-row">
            <label>
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              End date
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>
          <label>
            Address / area
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street, locality, city"
            />
          </label>
          <label>
            Description
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>

          <div>
            <strong>Assign executors (optional now)</strong>
            <p className="muted">If selected, tasks are generated and distributed immediately.</p>
            <div className="check-list">
              {executors.map((e) => (
                <label key={e.id} className="check">
                  <input
                    type="checkbox"
                    checked={selectedExecs.includes(e.id)}
                    onChange={(ev) => {
                      setSelectedExecs((prev) =>
                        ev.target.checked ? [...prev, e.id] : prev.filter((id) => id !== e.id)
                      )
                    }}
                  />
                  {e.full_name} <span className="muted">({e.phone})</span>
                </label>
              ))}
            </div>
          </div>

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create campaign'}
          </button>
        </section>

        <section className="panel stack">
          <h3>Campaign location</h3>
          <p className="muted small">
            Enter latitude and longitude or click the map. The green circle shows the{' '}
            {radiusForMap} km capture zone.
          </p>
          <div className="coord-row">
            <label>
              Latitude
              <input value={latInput} onChange={(e) => setLatInput(e.target.value)} required />
            </label>
            <label>
              Longitude
              <input value={lngInput} onChange={(e) => setLngInput(e.target.value)} required />
            </label>
            <button type="button" className="btn secondary coord-go" onClick={applyCoordinates}>
              Set on map
            </button>
          </div>
          {center && (
            <p className="geo-status ok">
              Pin set · {center.lat.toFixed(5)}, {center.lng.toFixed(5)} · {radiusForMap} km radius
            </p>
          )}
          {!center && (
            <p className="geo-status warn">No pin yet — enter coordinates or tap the map</p>
          )}
          <LocationMap
            value={center}
            onChange={applyCenter}
            radiusKm={radiusForMap}
            height={420}
            zoom={5}
            center={{ lat: 20.5937, lng: 78.9629 }}
          />
        </section>
      </form>
    </div>
  )
}
