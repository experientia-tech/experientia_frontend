import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { GlobalLoader } from '../components/GlobalLoader'

export function LandingPage() {
  const { user, loading } = useAuth()

  if (loading) return <GlobalLoader label="Starting Experientia…" />
  if (user) return <Navigate to="/" replace />

  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-brand">Experientia</span>
        <Link className="btn landing-nav-btn" to="/login">
          Sign in
        </Link>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-veil" aria-hidden />
        <div className="landing-hero-copy">
          <p className="landing-brand-hero">Experientia</p>
          <h1>Field campaigns, proven on the map</h1>
          <p className="landing-lede">
            Geofence the work, capture GPS-backed proof, and track every completed task in one place.
          </p>
          <div className="landing-cta">
            <Link className="btn primary landing-cta-btn" to="/login">
              Sign in to continue
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <p className="landing-eyebrow">Built for outdoor teams</p>
          <h2>From brief to proof, without the chase</h2>
        </div>
        <div className="landing-features">
          <article className="landing-feature" style={{ ['--delay' as string]: '0ms' }}>
            <span className="landing-feature-index">01</span>
            <h3>Campaigns & geofencing</h3>
            <p>Set a center, radius, and dates — then assign the field team in minutes.</p>
          </article>
          <article className="landing-feature" style={{ ['--delay' as string]: '80ms' }}>
            <span className="landing-feature-index">02</span>
            <h3>Proof capture</h3>
            <p>Executors upload sequenced photos with live GPS so location is never a guess.</p>
          </article>
          <article className="landing-feature" style={{ ['--delay' as string]: '160ms' }}>
            <span className="landing-feature-index">03</span>
            <h3>Live location view</h3>
            <p>Watch completed tasks cluster on the map and open any pin for full detail.</p>
          </article>
          <article className="landing-feature" style={{ ['--delay' as string]: '240ms' }}>
            <span className="landing-feature-index">04</span>
            <h3>Team & exports</h3>
            <p>Run brands, supervisors, and executors — then export campaign PDFs when ready.</p>
          </article>
        </div>
      </section>
    </div>
  )
}
