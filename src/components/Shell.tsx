import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useCampaignSearchOptional } from '../campaignSearch'
import { ExecutorPermissionGate } from './ExecutorPermissionGate'
import { ExecutorShell } from './ExecutorShell'
import { useExportQueueOptional } from '../exportQueue'

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const role = user?.role
  const isManager = role === 'manager'
  const isSupervisor = role === 'supervisor'
  const isExecutor = role === 'executor'
  const exports = useExportQueueOptional()
  const campaignSearch = useCampaignSearchOptional()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [navOpen])

  if (isExecutor) {
    return (
      <ExecutorShell>
        <ExecutorPermissionGate>{children}</ExecutorPermissionGate>
      </ExecutorShell>
    )
  }

  const onLogout = () => {
    logout()
    navigate('/welcome')
  }

  const badge = (exports?.activeCount || 0) + (exports?.readyCount || 0)

  return (
    <div className={`layout${navOpen ? ' nav-open' : ''}`}>
      <button
        type="button"
        className="nav-backdrop"
        aria-label="Close menu"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside className="sidebar" id="app-sidebar">
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">Experientia</div>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            ✕
          </button>
        </div>
        <div className="sidebar-section">
          <p className="sidebar-label">Navigation</p>
          {isManager && (
            <>
              <NavLink to="/" end>
                <IconCampaigns /> My Campaigns
              </NavLink>
              <NavLink to="/team">
                <IconTeam /> Team Management
              </NavLink>
              <NavLink to="/downloads">
                <IconDownload /> Downloads
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </NavLink>
            </>
          )}
          {isSupervisor && (
            <>
              <NavLink to="/" end>
                <IconCampaigns /> Brand Campaigns
              </NavLink>
              <NavLink to="/downloads">
                <IconDownload /> Downloads
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </NavLink>
            </>
          )}
          {isExecutor && (
            <NavLink to="/" end>
              <IconCampaigns /> Assigned Campaigns
            </NavLink>
          )}
        </div>
        {isExecutor && (
          <div className="sidebar-section">
            <p className="sidebar-label">Executor</p>
            <NavLink to="/" end>
              <IconGear /> Executor
            </NavLink>
          </div>
        )}
        {isSupervisor && (
          <div className="sidebar-section">
            <p className="sidebar-label">Access</p>
            <div className="sidebar-note">View only + PDF export</div>
          </div>
        )}
        <button type="button" className="sidebar-logout" onClick={onLogout}>
          Log out
        </button>
      </aside>

      <div className="layout-main">
        <header className="topbar">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Open menu"
            aria-expanded={navOpen}
            aria-controls="app-sidebar"
            onClick={() => setNavOpen(true)}
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-search">
            <span className="search-icon" aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              placeholder="Search for campaigns..."
              aria-label="Search campaigns"
              value={campaignSearch?.query ?? ''}
              onChange={(e) => campaignSearch?.setQuery(e.target.value)}
              disabled={!campaignSearch}
            />
          </div>
          <div className="topbar-actions">
            {isManager && (
              <Link className="btn primary topbar-create" to="/campaigns/new">
                <span className="topbar-create-full">+ Create Campaign</span>
                <span className="topbar-create-short">+ New</span>
              </Link>
            )}
            <div className="avatar" title={user?.full_name}>
              {(user?.first_name || user?.full_name || 'U').charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  )
}

function IconCampaigns() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconTeam() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3v2.2M12 18.8V21M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3 12h2.2M18.8 12H21M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5M5 18h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
