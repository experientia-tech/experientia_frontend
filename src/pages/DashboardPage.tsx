import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listCampaigns } from '../api'
import { useAuth } from '../auth'
import { useCampaignSearch } from '../campaignSearch'
import { GlobalLoaderInline } from '../components/GlobalLoader'
import type { CampaignListItem } from '../types'
import { STATUS_LABELS, formatDate } from '../types'

export function DashboardPage() {
  const { user } = useAuth()
  const { query } = useCampaignSearch()
  const isManager = user?.role === 'manager'
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [serviceFilter, setServiceFilter] = useState('All Services')

  useEffect(() => {
    listCampaigns({ silent: true })
      .then(setCampaigns)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const services = useMemo(() => {
    const set = new Set(campaigns.map((c) => c.service_type).filter(Boolean) as string[])
    return ['All Services', ...Array.from(set).sort()]
  }, [campaigns])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return campaigns.filter((c) => {
      if (statusFilter !== 'All' && c.status.toUpperCase() !== statusFilter.toUpperCase()) return false
      if (serviceFilter !== 'All Services' && c.service_type !== serviceFilter) return false
      if (q) {
        const hay = [
          c.name,
          c.service_type,
          c.brand?.name,
          c.address,
          c.status,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [campaigns, statusFilter, serviceFilter, query])

  const totalTasks = campaigns.reduce((s, c) => s + (c.task_count || c.total_tasks || 0), 0)
  const done = campaigns.reduce((s, c) => s + c.completed_task_count, 0)
  const pending = campaigns.reduce(
    (s, c) => s + (c.pending_task_count ?? Math.max((c.task_count || 0) - c.completed_task_count, 0)),
    0
  )

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            {user?.role === 'supervisor'
              ? 'View-only overview of your brand campaigns.'
              : 'Overview of your campaigns and tasks.'}
          </p>
        </div>
      </div>

      <div className="metric-row">
        <MetricCard label="Total Campaigns" value={campaigns.length} tone="purple" icon="◈" />
        <MetricCard label="Total Tasks" value={totalTasks} tone="green" icon="✓" />
        <MetricCard label="Completed Tasks" value={done} tone="green" icon="✓" />
        <MetricCard label="Pending Tasks" value={pending} tone="amber" icon="◷" />
      </div>

      <section className="panel filters-panel">
        <h3>Filters</h3>
        <div className="filter-grid">
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option>All</option>
              <option>ACTIVE</option>
              <option>PENDING</option>
              <option>DRAFT</option>
            </select>
          </label>
          <label>
            Service
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
              {services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {loading && filtered.length === 0 ? (
        <GlobalLoaderInline label="Loading campaigns…" />
      ) : filtered.length === 0 ? (
        <div className="empty">
          <h2>{query.trim() ? 'No campaigns match your search' : 'No campaigns yet'}</h2>
          {query.trim() ? (
            <p className="muted">Try a different name, brand, or service type.</p>
          ) : isManager ? (
            <Link className="btn primary" to="/campaigns/new">
              Create Campaign
            </Link>
          ) : (
            <p className="muted">Campaigns for your brand will appear here.</p>
          )}
        </div>
      ) : (
        <div className="campaign-card-list">
          {filtered.map((c) => {
            const total = c.task_count || c.total_tasks || 0
            const completed = c.completed_task_count || 0
            const left = c.pending_task_count ?? Math.max(total - completed, 0)
            const pct = total ? Math.round((completed / total) * 100) : 0
            return (
              <Link key={c.id} to={`/campaigns/${c.id}`} className="campaign-card">
                <div className="campaign-card-top">
                  <div className="campaign-card-title">
                    {c.logo || c.brand?.image ? (
                      <img
                        className="brand-logo-sm"
                        src={c.logo || c.brand?.image || ''}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className="brand-logo-sm placeholder">
                        {(c.brand?.name || c.name).charAt(0)}
                      </span>
                    )}
                    <div>
                      <h3>{c.name}</h3>
                      <p className="muted">{c.service_type || 'Campaign'}</p>
                    </div>
                  </div>
                  <span className="chevron" aria-hidden>
                    ›
                  </span>
                </div>

                <div className="meta-grid">
                  <div>
                    <span className="meta-label">Status</span>
                    <strong className="status-text">
                      {STATUS_LABELS[c.status] || c.status}
                    </strong>
                  </div>
                  <div>
                    <span className="meta-label">Start Date</span>
                    <strong>{formatDate(c.start_date || c.created_at)}</strong>
                  </div>
                  <div>
                    <span className="meta-label">End Date</span>
                    <strong>{formatDate(c.end_date)}</strong>
                  </div>
                </div>

                <div className="progress-block">
                  <div className="progress-head">
                    <span>Task Progress</span>
                    <span>
                      {completed} of {total} completed
                    </span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="campaign-card-footer">
                  <span className="chip ok">
                    <i>✓</i> {completed} Completed
                  </span>
                  <span className="chip warn">
                    <i>◷</i> {left} Pending
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'purple' | 'green' | 'amber'
  icon: string
}) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}
