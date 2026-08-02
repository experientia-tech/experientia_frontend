import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createBrand,
  createTeamMember,
  listBrands,
  listTeam,
  updateBrand,
  uploadBrandLogo,
  type TeamMember,
} from '../api'
import type { Brand } from '../types'
import { useUI } from '../ui'
import {
  isValidName,
  isValidPhone,
  sanitizeNameInput,
  sanitizePhoneInput,
} from '../utils/validation'

type TeamTab = 'brands' | 'supervisors' | 'executors'

export function TeamPage() {
  const { showSuccess, showError } = useUI()
  const [tab, setTab] = useState<TeamTab>('brands')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [busy, setBusy] = useState(false)

  const [brandName, setBrandName] = useState('')
  const [brandDesc, setBrandDesc] = useState('')
  const [brandLogo, setBrandLogo] = useState<File | null>(null)
  const [brandLogoPreview, setBrandLogoPreview] = useState('')

  const [exFirst, setExFirst] = useState('')
  const [exLast, setExLast] = useState('')
  const [exPhone, setExPhone] = useState('')

  const [supFirst, setSupFirst] = useState('')
  const [supLast, setSupLast] = useState('')
  const [supPhone, setSupPhone] = useState('')
  const [supBrand, setSupBrand] = useState('')

  const reload = async () => {
    const [t, b] = await Promise.all([listTeam(), listBrands()])
    setMembers(t)
    setBrands(b)
    if (!supBrand && b[0]) setSupBrand(b[0].id)
  }

  useEffect(() => {
    void reload().catch(() => undefined)
  }, [])

  const supervisors = useMemo(
    () => members.filter((m) => m.role.toLowerCase() === 'supervisor'),
    [members]
  )
  const executors = useMemo(
    () => members.filter((m) => m.role.toLowerCase() === 'executor'),
    [members]
  )

  const onLogoPick = (file: File | null) => {
    setBrandLogo(file)
    if (brandLogoPreview) URL.revokeObjectURL(brandLogoPreview)
    setBrandLogoPreview(file ? URL.createObjectURL(file) : '')
  }

  const onAddBrand = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValidName(brandName)) {
      showError('Brand name must use letters only (no numbers)')
      return
    }
    setBusy(true)
    try {
      let storageKey: string | undefined
      if (brandLogo) {
        storageKey = await uploadBrandLogo(brandLogo)
      }
      await createBrand(brandName.trim(), brandDesc.trim() || undefined, {
        storage_key: storageKey,
      })
      setBrandName('')
      setBrandDesc('')
      onLogoPick(null)
      showSuccess('Brand added')
      await reload()
    } catch {
      // API errors shown globally
    } finally {
      setBusy(false)
    }
  }

  const onReplaceLogo = async (brand: Brand, file: File | null) => {
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadBrandLogo(file, brand.id)
      await updateBrand(brand.id, { storage_key: key })
      showSuccess(`Logo updated for ${brand.name}`)
      await reload()
    } catch {
      // API errors shown globally
    } finally {
      setBusy(false)
    }
  }

  const onAddExecutor = async (e: FormEvent) => {
    e.preventDefault()
    if (!isValidName(exFirst)) {
      showError('First name must use letters only (no numbers)')
      return
    }
    if (exLast.trim() && !isValidName(exLast)) {
      showError('Last name must use letters only (no numbers)')
      return
    }
    if (!isValidPhone(exPhone)) {
      showError('Enter a valid 10-digit phone number (e.g. 9876543210)')
      return
    }
    setBusy(true)
    try {
      await createTeamMember({
        first_name: exFirst.trim(),
        last_name: exLast.trim() || '',
        phone: sanitizePhoneInput(exPhone),
        role: 'executor',
        brand_id: null,
      })
      setExFirst('')
      setExLast('')
      setExPhone('')
      showSuccess('Executor added')
      await reload()
    } catch {
      // API errors shown globally
    } finally {
      setBusy(false)
    }
  }

  const onAddSupervisor = async (e: FormEvent) => {
    e.preventDefault()
    if (!supBrand) {
      showError('Select a brand for the supervisor')
      return
    }
    if (!isValidName(supFirst)) {
      showError('First name must use letters only (no numbers)')
      return
    }
    if (supLast.trim() && !isValidName(supLast)) {
      showError('Last name must use letters only (no numbers)')
      return
    }
    if (!isValidPhone(supPhone)) {
      showError('Enter a valid 10-digit phone number (e.g. 9876543210)')
      return
    }
    setBusy(true)
    try {
      await createTeamMember({
        first_name: supFirst.trim(),
        last_name: supLast.trim() || '',
        phone: sanitizePhoneInput(supPhone),
        role: 'supervisor',
        brand_id: supBrand,
      })
      setSupFirst('')
      setSupLast('')
      setSupPhone('')
      showSuccess('Supervisor added (view-only for that brand)')
      await reload()
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
          <h1>Team Management</h1>
          <p className="muted">
            Manage brands, supervisors, and executors in separate tabs. Supervisors get view-only
            access plus PDF export.
          </p>
        </div>
      </div>

      <div className="view-toggle team-tabs" role="tablist" aria-label="Team sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'brands'}
          className={tab === 'brands' ? 'active' : ''}
          onClick={() => setTab('brands')}
        >
          Brands ({brands.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'supervisors'}
          className={tab === 'supervisors' ? 'active' : ''}
          onClick={() => setTab('supervisors')}
        >
          Supervisors ({supervisors.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'executors'}
          className={tab === 'executors' ? 'active' : ''}
          onClick={() => setTab('executors')}
        >
          Executors ({executors.length})
        </button>
      </div>

      {tab === 'brands' && (
        <div className="team-tab-panel" role="tabpanel">
          <section className="panel">
            <h3>Add brand</h3>
            <form className="stack team-tab-form" onSubmit={(e) => void onAddBrand(e)}>
              <label>
                Brand name
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(sanitizeNameInput(e.target.value))}
                  required
                />
              </label>
              <label>
                Description
                <input value={brandDesc} onChange={(e) => setBrandDesc(e.target.value)} />
              </label>
              <label>
                Logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => onLogoPick(e.target.files?.[0] || null)}
                />
              </label>
              {brandLogoPreview && (
                <img className="brand-logo-preview" src={brandLogoPreview} alt="Logo preview" />
              )}
              <button className="btn primary" type="submit" disabled={busy || !brandName.trim()}>
                Add brand
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>All brands</h2>
            <div className="brand-grid">
              {brands.length === 0 ? (
                <p className="muted">No brands yet</p>
              ) : (
                brands.map((b) => (
                  <article key={b.id} className="brand-card">
                    {b.image ? (
                      <img className="brand-logo" src={b.image} alt={b.name} loading="lazy" />
                    ) : (
                      <div className="brand-logo placeholder">{b.name.charAt(0)}</div>
                    )}
                    <div>
                      <strong>{b.name}</strong>
                      {b.description && <p className="muted">{b.description}</p>}
                      <label className="btn ghost file-btn" style={{ marginTop: '0.5rem' }}>
                        {busy ? 'Uploading…' : 'Update logo'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={busy}
                          onChange={(e) => void onReplaceLogo(b, e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      {tab === 'supervisors' && (
        <div className="team-tab-panel" role="tabpanel">
          <section className="panel">
            <h3>Add supervisor</h3>
            <p className="muted">Brand member with view-only access + PDF export.</p>
            <form className="stack team-tab-form" onSubmit={(e) => void onAddSupervisor(e)}>
              <label>
                Brand
                <select value={supBrand} onChange={(e) => setSupBrand(e.target.value)} required>
                  <option value="">Select brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                First name
                <input
                  value={supFirst}
                  onChange={(e) => setSupFirst(sanitizeNameInput(e.target.value))}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={supLast}
                  onChange={(e) => setSupLast(sanitizeNameInput(e.target.value))}
                />
              </label>
              <label>
                Phone (10 digits)
                <input
                  value={supPhone}
                  onChange={(e) => setSupPhone(sanitizePhoneInput(e.target.value))}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={10}
                  required
                />
              </label>
              <button className="btn primary" type="submit" disabled={busy || !supBrand}>
                Add supervisor
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>All supervisors</h2>
            <PeopleTable
              members={supervisors}
              brands={brands}
              emptyLabel="No supervisors yet"
              showBrand
            />
          </section>
        </div>
      )}

      {tab === 'executors' && (
        <div className="team-tab-panel" role="tabpanel">
          <section className="panel">
            <h3>Add executor</h3>
            <p className="muted">Field staff who capture proof photos.</p>
            <form className="stack team-tab-form" onSubmit={(e) => void onAddExecutor(e)}>
              <label>
                First name
                <input
                  value={exFirst}
                  onChange={(e) => setExFirst(sanitizeNameInput(e.target.value))}
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={exLast}
                  onChange={(e) => setExLast(sanitizeNameInput(e.target.value))}
                />
              </label>
              <label>
                Phone (10 digits)
                <input
                  value={exPhone}
                  onChange={(e) => setExPhone(sanitizePhoneInput(e.target.value))}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={10}
                  required
                />
              </label>
              <button className="btn primary" type="submit" disabled={busy}>
                Add executor
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>All executors</h2>
            <PeopleTable
              members={executors}
              brands={brands}
              emptyLabel="No executors yet"
              showBrand={false}
            />
          </section>
        </div>
      )}
    </div>
  )
}

function PeopleTable({
  members,
  brands,
  emptyLabel,
  showBrand,
}: {
  members: TeamMember[]
  brands: Brand[]
  emptyLabel: string
  showBrand: boolean
}) {
  const cols = showBrand ? 3 : 2
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            {showBrand && <th>Brand</th>}
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr>
              <td colSpan={cols} className="muted">
                {emptyLabel}
              </td>
            </tr>
          ) : (
            members.map((m) => {
              const brand = brands.find((b) => b.id === m.brand_id)
              return (
                <tr key={m.id}>
                  <td>{m.full_name}</td>
                  <td>{m.phone}</td>
                  {showBrand && (
                    <td>
                      <span className="brand-inline">
                        {brand?.image && (
                          <img src={brand.image} alt="" className="brand-logo-sm" />
                        )}
                        {m.brand_name || brand?.name || '—'}
                      </span>
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
