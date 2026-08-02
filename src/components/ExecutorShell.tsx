import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export function ExecutorShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const initials =
    `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() ||
    user?.full_name?.slice(0, 2).toUpperCase() ||
    'EX'

  const onLogout = () => {
    logout()
    navigate('/welcome')
  }

  return (
    <div className="executor-app">
      <header className="executor-header">
        <div className="executor-header-text">
          <h1>Hello, {user?.first_name || user?.full_name?.split(' ')[0] || 'Executor'}</h1>
          <ExecutorSubtitle />
        </div>
        <div className="executor-header-actions">
          <button
            type="button"
            className="executor-avatar-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Account menu"
          >
            <span className="executor-avatar">{initials}</span>
            <span className="executor-avatar-dot" aria-hidden />
            <span className="executor-chevron" aria-hidden>
              ▾
            </span>
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="executor-menu-backdrop"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="executor-menu">
                <p className="executor-menu-name">{user?.full_name}</p>
                <p className="muted small">{user?.phone}</p>
                <button type="button" className="executor-menu-item" onClick={onLogout}>
                  Log out
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      <main className="executor-main">{children}</main>
    </div>
  )
}

function ExecutorSubtitle() {
  const [locationText, setLocationText] = useState('Locating…')

  useEffect(() => {
    const now = new Date()
    const day = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    if (!navigator.geolocation) {
      setLocationText(`${day} • Location unavailable`)
      return
    }
    navigator.geolocation.getCurrentPosition(
      () => setLocationText(`${day} • Location available`),
      () => setLocationText(`${day} • Location unavailable`),
      { timeout: 4000, maximumAge: 60000 }
    )
  }, [])

  return <p className="executor-subtitle">{locationText}</p>
}
