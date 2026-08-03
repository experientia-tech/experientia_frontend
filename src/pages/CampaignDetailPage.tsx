import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteCampaign, getCampaign } from '../api'
import { useAuth } from '../auth'
import { useExportQueueOptional } from '../exportQueue'
import { CampaignEditModal } from '../components/CampaignEditModal'
import { AddCampaignTasksModal } from '../components/AddCampaignTasksModal'
import { CampaignTeamModal, type TeamPanelKind } from '../components/CampaignTeamModal'
import { GlobalLoaderInline } from '../components/GlobalLoader'
import type { Campaign, Task } from '../types'
import { STATUS_LABELS, formatDate, taskLabel, taskProofCount } from '../types'
import { mediaUrl } from '../utils/mediaUrl'
import { useUI } from '../ui'

const TaskClusterMap = lazy(() =>
  import('../components/TaskClusterMap').then((m) => ({ default: m.TaskClusterMap }))
)

type ViewMode = 'card' | 'location'

export function CampaignDetailPage() {
  const { id } = useParams()
  const campaignId = id!
  const navigate = useNavigate()
  const { user } = useAuth()
  const isManager = user?.role === 'manager'
  const isSupervisor = user?.role === 'supervisor'
  const canExport = isManager || isSupervisor
  const { startExport, downloadJob, jobForCampaign, refresh: refreshExports } = useExportQueueOptional() || {
    startExport: async () => {
      throw new Error('Exports unavailable')
    },
    downloadJob: async () => undefined,
    jobForCampaign: () => null,
    refresh: async () => undefined,
  }

  const { showSuccess, showError } = useUI()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [teamPanel, setTeamPanel] = useState<TeamPanelKind | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [addTasksOpen, setAddTasksOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [taskQuery, setTaskQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [executorFilter, setExecutorFilter] = useState('')
  const [showMaps, setShowMaps] = useState(false)
  const [page, setPage] = useState(1)
  const [memberQuery, setMemberQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [mapTasks, setMapTasks] = useState<Task[]>([])
  const [mapTotal, setMapTotal] = useState(0)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(taskQuery.trim()), 300)
    return () => window.clearTimeout(t)
  }, [taskQuery])

  const load = useCallback(async () => {
    const c = await getCampaign(
      campaignId,
      {
        page,
        limit: 24,
        status: statusFilter || undefined,
        q: debouncedQuery || undefined,
        executor_id: executorFilter || undefined,
      },
      { silent: true }
    )
    setCampaign(c)
  }, [campaignId, page, statusFilter, debouncedQuery, executorFilter])

  useEffect(() => {
    setLoading(true)
    void load()
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, debouncedQuery, executorFilter])

  useEffect(() => {
    if (viewMode !== 'location') return

    let cancelled = false
    // Location map only plots completed tasks — seed from the current page.
    const completedSeed = (campaign?.tasks || []).filter((t) => t.status === 'ACCEPTED')
    setMapTasks((prev) => {
      if (prev.length) return prev
      return completedSeed.length ? completedSeed : prev
    })
    setMapTotal((prev) => prev || completedSeed.length || campaign?.completed_task_count || 0)

    const total = campaign?.completed_task_count || campaign?.tasks_total || campaign?.task_count || 100
    void getCampaign(
      campaignId,
      {
        page: 1,
        limit: Math.min(Math.max(total, 1), 10000),
        // Location view always shows completed task capture/target points only.
        status: 'ACCEPTED',
        q: debouncedQuery || undefined,
        executor_id: executorFilter || undefined,
      },
      { silent: true }
    )
      .then((c) => {
        if (cancelled) return
        const completed = (c.tasks || []).filter((t) => t.status === 'ACCEPTED')
        setMapTasks(completed)
        setMapTotal(c.tasks_total || completed.length)
      })
      .catch(() => {
        if (cancelled) return
        setMapTotal((prev) => prev || campaign?.completed_task_count || 0)
      })

    return () => {
      cancelled = true
    }
  }, [
    viewMode,
    campaignId,
    debouncedQuery,
    executorFilter,
    campaign?.completed_task_count,
    campaign?.tasks_total,
    campaign?.task_count,
  ])

  // When leaving location view, clear so the next open re-seeds fresh.
  useEffect(() => {
    if (viewMode === 'location') return
    setMapTasks([])
    setMapTotal(0)
  }, [viewMode])

  const mapPoints = useMemo(
    () =>
      mapTasks
        .filter((t) => t.status === 'ACCEPTED')
        .filter(
          (t) =>
            t.latitude != null &&
            t.longitude != null &&
            Number.isFinite(t.latitude) &&
            Number.isFinite(t.longitude)
        )
        .map((t) => ({
          id: t.id,
          lat: Number(t.latitude),
          lng: Number(t.longitude),
          label: taskLabel(t),
        })),
    [mapTasks]
  )

  const exportJob = jobForCampaign(campaignId)

  useEffect(() => {
    if (canExport) void refreshExports()
  }, [canExport, campaignId, refreshExports])

  const onExportPdf = async () => {
    setExportBusy(true)
    try {
      await startExport(campaignId)
      showSuccess('Export queued — track progress under Downloads. You can leave this page.')
    } catch {
      // API errors shown globally
    } finally {
      setExportBusy(false)
    }
  }

  const onDownloadExport = async () => {
    if (!exportJob?.download_ready) return
    try {
      await downloadJob(exportJob)
      showSuccess('Download started')
    } catch {
      // API errors shown globally
    }
  }

  const onDeleteCampaign = async () => {
    if (!campaign) return
    const ok = window.confirm(
      `Delete campaign “${campaign.name}”? This permanently removes the campaign and all of its tasks/proofs.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      await deleteCampaign(campaign.id)
      showSuccess('Campaign deleted')
      navigate('/')
    } catch {
      showError('Could not delete campaign')
    } finally {
      setDeleting(false)
    }
  }

  const openTeamPanel = (kind: TeamPanelKind) => {
    if (!isManager) return
    setTeamPanel(kind)
  }

  const filteredMembers = useMemo(() => {
    if (!campaign) return []
    return campaign.members.filter((m) => {
      if (roleFilter !== 'All' && m.role !== roleFilter) return false
      if (!memberQuery.trim()) return true
      const q = memberQuery.toLowerCase()
      return (
        m.full_name.toLowerCase().includes(q) ||
        m.phone.includes(q) ||
        m.role.toLowerCase().includes(q)
      )
    })
  }, [campaign, memberQuery, roleFilter])

  const taskAssigneeOptions = useMemo(() => {
    if (!campaign) return []
    const seen = new Set<string>()
    const out: typeof campaign.executors = []
    for (const u of campaign.task_assignees || []) {
      if (!seen.has(u.id)) {
        seen.add(u.id)
        out.push(u)
      }
    }
    for (const u of campaign.executors) {
      if (!seen.has(u.id)) {
        seen.add(u.id)
        out.push(u)
      }
    }
    return out
  }, [campaign])

  const center = useMemo(() => {
    if (campaign?.center_latitude != null && campaign?.center_longitude != null) {
      return { lat: campaign.center_latitude, lng: campaign.center_longitude }
    }
    if (mapPoints.length > 0) {
      const lat = mapPoints.reduce((s, p) => s + p.lat, 0) / mapPoints.length
      const lng = mapPoints.reduce((s, p) => s + p.lng, 0) / mapPoints.length
      return { lat, lng }
    }
    return { lat: 17.385, lng: 78.4867 }
  }, [campaign?.center_latitude, campaign?.center_longitude, mapPoints])

  if (loading && !campaign) {
    return <GlobalLoaderInline label="Loading campaign…" />
  }
  if (!campaign) {
    return <p className="error page">Campaign not found</p>
  }

  const total = campaign.task_count || campaign.total_tasks || 0
  const completed = campaign.completed_task_count || 0
  const remaining = campaign.pending_task_count ?? Math.max(total - completed, 0)
  const pct = total ? Math.round((completed / total) * 100) : 0
  const pageCount = Math.max(1, Math.ceil((campaign.tasks_total || 0) / (campaign.tasks_page_size || 24)))

  const partnerCounts = {
    brand: campaign.brand ? 1 : 0,
    agencies: 0,
    supervisors: campaign.members.filter((m) => m.role === 'SUPERVISOR').length,
    executors: campaign.executors.length,
  }

  return (
    <div className="page detail-page">
      <Link to="/" className="back-link">
        ← Back to Campaigns
      </Link>

      <section className="panel campaign-hero">
        <div className="campaign-hero-left">
          {campaign.logo || campaign.brand?.image ? (
            <img
              className="campaign-thumb"
              src={mediaUrl(campaign.logo || campaign.brand?.image || '')}
              alt=""
            />
          ) : (
            <div className="campaign-thumb placeholder">
              {(campaign.brand?.name || campaign.name || 'C').charAt(0)}
            </div>
          )}
          <div>
            <h1>{campaign.name}</h1>
            {campaign.service_type && <span className="service-pill">{campaign.service_type}</span>}
            {campaign.brand?.name && (
              <p className="muted" style={{ marginTop: '0.35rem' }}>
                Brand: {campaign.brand.name}
              </p>
            )}
            {isSupervisor && (
              <p className="muted" style={{ marginTop: '0.35rem' }}>
                Supervisor view — read only (+ PDF export)
              </p>
            )}
          </div>
        </div>
        {(canExport || isManager) && (
          <div className="actions export-actions">
            {isManager && (
              <>
                <button className="btn ghost" type="button" onClick={() => setEditOpen(true)}>
                  Edit campaign
                </button>
                <button
                  className="btn danger"
                  type="button"
                  disabled={deleting}
                  onClick={() => void onDeleteCampaign()}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </>
            )}
            {canExport && (
              <>
                <button
                  className="btn primary"
                  type="button"
                  disabled={exportBusy || total === 0}
                  onClick={() => void onExportPdf()}
                >
                  {exportBusy ? 'Queueing…' : 'Export to PDF'}
                </button>
                {exportJob?.download_ready && (
                  <button className="btn primary" type="button" onClick={() => void onDownloadExport()}>
                    Download {exportJob.filename?.endsWith('.zip') ? 'ZIP' : 'PDF'}
                  </button>
                )}
                <Link className="btn ghost" to="/downloads">
                  Open Downloads
                </Link>
              </>
            )}
          </div>
        )}
      </section>

      {exportJob && (exportJob.status === 'queued' || exportJob.status === 'processing') && (
        <section className="panel export-progress">
          <div className="section-head">
            <div>
              <h3>Export in progress</h3>
              <p className="muted">
                Running in the background queue — leaving this page will not stop it.{' '}
                <Link to="/downloads">View in Downloads</Link>
              </p>
            </div>
            <strong>
              {exportJob.status === 'queued' && exportJob.queue_position
                ? `Queued #${exportJob.queue_position}`
                : `${exportJob.done}/${exportJob.total || '…'} · ${exportJob.percent}%`}
            </strong>
          </div>
          <div className="progress-track lg">
            <div className="progress-fill" style={{ width: `${exportJob.percent}%` }} />
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-head">
          <div>
            <h2>Task Overview</h2>
            <p className="muted">Campaign execution progress.</p>
          </div>
          <div className="pct-badge">{pct}% COMPLETE</div>
        </div>
        <div className="progress-track lg">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-meta">
          <span>
            {completed} of {total} tasks done
          </span>
          <span>{remaining} remaining</span>
        </div>
        <div className="overview-stats">
          <div className="overview-stat tone-gray">
            <span>Total Tasks</span>
            <strong>{total}</strong>
          </div>
          <div className="overview-stat tone-green">
            <span>Completed</span>
            <strong>{completed}</strong>
          </div>
          <div className="overview-stat tone-amber">
            <span>Remaining</span>
            <strong>{remaining}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3 className="section-kicker">Campaign Information</h3>
        <div className="meta-grid three">
          <div>
            <span className="meta-label">Created</span>
            <strong>{formatDate(campaign.created_at)}</strong>
          </div>
          <div>
            <span className="meta-label">Started</span>
            <strong>{formatDate(campaign.start_date)}</strong>
          </div>
          <div>
            <span className="meta-label">End Date</span>
            <strong>{formatDate(campaign.end_date)}</strong>
          </div>
        </div>
        {(campaign.address || campaign.center_latitude != null) && (
          <p className="muted" style={{ marginTop: '0.85rem' }}>
            {campaign.address || 'Campaign zone'}
            {campaign.center_latitude != null && (
              <>
                {' · '}
                <span className="coords-inline">
                  {campaign.center_latitude.toFixed(5)}, {campaign.center_longitude?.toFixed(5)}
                </span>
                {` · ${campaign.radius_km} km radius`}
              </>
            )}
          </p>
        )}
      </section>

      <section className="panel">
        <h3 className="section-kicker">Team &amp; Partners</h3>
        <div className="partner-row">
          <PartnerTile
            label={campaign.brand?.name || 'Brand'}
            count={partnerCounts.brand}
            canAdd={isManager}
            image={campaign.brand?.image || campaign.logo}
            onAdd={() => openTeamPanel('brand')}
          />
          <PartnerTile
            label="Agencies"
            count={partnerCounts.agencies}
            canAdd={isManager}
            onAdd={() => openTeamPanel('agencies')}
          />
          <PartnerTile
            label="Supervisors"
            count={partnerCounts.supervisors}
            canAdd={isManager}
            onAdd={() => openTeamPanel('supervisors')}
          />
          <PartnerTile
            label="Executors"
            count={partnerCounts.executors}
            canAdd={isManager}
            onAdd={() => openTeamPanel('executors')}
          />
        </div>
        {isManager && (
          <div className="assign-inline">
            <p className="muted">
              Use the + buttons above to assign brand, executors, and supervisors.{' '}
              <Link to="/team">Manage people on Team</Link>
            </p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="page-head tight">
          <h2>Team Members</h2>
          <div className="toolbar">
            {isManager && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => openTeamPanel('executors')}
              >
                + Add members
              </button>
            )}
            <input
              className="filter-input"
              placeholder="Search team members..."
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
            />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="All">Filter by Role</option>
              <option value="CAMPAIGN_MANAGER">CAMPAIGN_MANAGER</option>
              <option value="EXECUTOR">EXECUTOR</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Number</th>
                <th>Role</th>
                <th>Location</th>
                <th>Assigned By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    No team members
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.full_name}</td>
                    <td>{m.phone || '—'}</td>
                    <td>
                      <span className={`pill role-${m.role.toLowerCase()}`}>{m.role}</span>
                    </td>
                    <td>{m.location || campaign.name}</td>
                    <td>{m.assigned_by || '—'}</td>
                    <td>
                      <span className={`pill ${m.active ? 'active' : 'pending'}`}>
                        {m.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="task-toolbar">
          {isManager && (
            <button type="button" className="btn primary" onClick={() => setAddTasksOpen(true)}>
              + Add tasks
            </button>
          )}
          <div className="view-toggle">
            <button
              type="button"
              className={viewMode === 'card' ? 'active' : ''}
              onClick={() => setViewMode('card')}
            >
              Card
            </button>
            <button
              type="button"
              className={viewMode === 'location' ? 'active' : ''}
              onClick={() => setViewMode('location')}
            >
              Location
            </button>
          </div>
          <input
            className="filter-input"
            placeholder="Search by Task ID"
            value={taskQuery}
            onChange={(e) => setTaskQuery(e.target.value)}
          />
          <select value={executorFilter} onChange={(e) => setExecutorFilter(e.target.value)}>
            <option value="">All assignees</option>
            {taskAssigneeOptions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.role === 'manager' ? ' (manager)' : ''}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="ACCEPTED">ACCEPTED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showMaps}
              onChange={(e) => setShowMaps(e.target.checked)}
            />
            Show All Maps
          </label>
        </div>

        {viewMode === 'location' ? (
          <Suspense fallback={<GlobalLoaderInline label="Loading map…" />}>
            <TaskClusterMap
              center={center}
              radiusKm={campaign.radius_km}
              tasks={mapPoints}
              totalCount={mapTotal}
              height={520}
            />
          </Suspense>
        ) : (
          <div className="task-card-grid">
            {campaign.tasks.length === 0 ? (
              <p className="muted">No tasks match these filters.</p>
            ) : (
              campaign.tasks.map((task) => {
                const photosDone = taskProofCount(task)
                const needed = task.required_photos || 1
                const done = task.status === 'ACCEPTED'
                const photoPct = Math.min(100, Math.round((photosDone / needed) * 100))
                const lat = task.latitude
                const lng = task.longitude
                return (
                  <Link key={task.id} to={`/tasks/${task.id}`} className="task-detail-card">
                    <div className="task-detail-head">
                      <div>
                        <h3>{taskLabel(task)}</h3>
                        <p className="muted">{campaign.service_type || 'Task'}</p>
                      </div>
                      <span className="chevron" aria-hidden>
                        ›
                      </span>
                    </div>

                    <div className="meta-grid">
                      <div>
                        <span className="meta-label">Status</span>
                        <strong className="status-text">
                          {STATUS_LABELS[task.status] || task.status}
                        </strong>
                      </div>
                      <div>
                        <span className="meta-label">Latitude</span>
                        <strong className="coords-inline">
                          {lat != null ? lat.toFixed(6) : '—'}
                        </strong>
                      </div>
                      <div>
                        <span className="meta-label">Longitude</span>
                        <strong className="coords-inline">
                          {lng != null ? lng.toFixed(6) : '—'}
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
                    </div>

                    <div className="progress-block">
                      <div className="progress-head">
                        <span>Photo Progress</span>
                        <span>
                          {photosDone} of {needed} captured
                        </span>
                      </div>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${photoPct}%` }} />
                      </div>
                    </div>

                    {task.proof_images[0] && (
                      <div className="task-thumb-wrap">
                        <img
                          src={mediaUrl(task.proof_images[0].url)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}

                    {showMaps && lat != null && lng != null && (
                      <div className="mini-map">
                        <img
                          src={`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=560x160&markers=${lat},${lng},lightblue1`}
                          alt={`Map at ${lat.toFixed(5)}, ${lng.toFixed(5)}`}
                          loading="lazy"
                          decoding="async"
                        />
                        <div className="mini-map-coords">
                          {lat.toFixed(6)}, {lng.toFixed(6)}
                        </div>
                      </div>
                    )}

                    <div className="campaign-card-footer">
                      {task.within_geofence != null && (
                        <span className={`chip ${task.within_geofence ? 'ok' : 'bad'}`}>
                          {task.within_geofence ? '✓ Inside geofence' : '✕ Outside geofence'}
                        </span>
                      )}
                      <span className={`chip ${done ? 'ok' : 'warn'}`}>
                        {done ? '✓ Completed' : '◷ Pending'}
                      </span>
                      {task.executor_name && (
                        <span className="muted small">{task.executor_name}</span>
                      )}
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        )}

        {pageCount > 1 && (
          <div className="pager">
            <button
              type="button"
              className="btn ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="muted">
              Page {campaign.tasks_page} of {pageCount} · {campaign.tasks_total} tasks
            </span>
            <button
              type="button"
              className="btn ghost"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {teamPanel && (
        <CampaignTeamModal
          kind={teamPanel}
          campaign={campaign}
          onClose={() => setTeamPanel(null)}
          onSaved={load}
        />
      )}
      {editOpen && (
        <CampaignEditModal
          campaign={campaign}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setCampaign((prev) => (prev ? { ...prev, ...updated, tasks: prev.tasks } : updated))
            void load()
          }}
        />
      )}
      {addTasksOpen && (
        <AddCampaignTasksModal
          campaign={campaign}
          onClose={() => setAddTasksOpen(false)}
          onAdded={(updated) => {
            setCampaign((prev) => (prev ? { ...prev, ...updated, tasks: prev.tasks } : updated))
            void load()
          }}
        />
      )}
    </div>
  )
}

function PartnerTile({
  label,
  count,
  canAdd = false,
  image,
  onAdd,
}: {
  label: string
  count: number
  canAdd?: boolean
  image?: string | null
  onAdd?: () => void
}) {
  return (
    <div className="partner-tile">
      <div className="partner-tile-main">
        {image ? (
          <img className="brand-logo-sm" src={mediaUrl(image)} alt="" />
        ) : (
          <span className="brand-logo-sm placeholder">{label.charAt(0)}</span>
        )}
        <div>
          <strong>{count}</strong>
          <span>{label}</span>
        </div>
      </div>
      {canAdd && (
        <button
          type="button"
          className="plus"
          aria-label={`Add ${label}`}
          onClick={onAdd}
        >
          +
        </button>
      )}
    </div>
  )
}
