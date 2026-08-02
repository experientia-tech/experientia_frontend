import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { myCampaigns } from '../api'
import { GlobalLoaderInline } from '../components/GlobalLoader'
import type { ExecutorCampaign } from '../types'

function formatShortDate(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB')
}

export function ExecutorHomePage() {
  const [campaigns, setCampaigns] = useState<ExecutorCampaign[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    myCampaigns({ silent: true })
      .then(setCampaigns)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <GlobalLoaderInline label="Loading your campaigns…" />

  return (
    <div className="executor-page">
      <h2 className="executor-section-title">Your Campaigns</h2>

      {campaigns.length === 0 ? (
        <div className="executor-empty">
          <h3>No campaigns assigned yet</h3>
          <p className="muted">Your manager will assign you to campaigns soon.</p>
        </div>
      ) : (
        <div className="executor-campaign-list">
          {campaigns.map((c) => (
            <article key={c.id} className="executor-campaign-card">
              <div className="executor-campaign-card-top">
                <div className="executor-campaign-card-main">
                  <span className="executor-campaign-icon" aria-hidden>
                    <MegaphoneIcon />
                  </span>
                  <div>
                    <h3>{c.name}</h3>
                    <p className="executor-campaign-loc">
                      <PinIcon />
                      {c.location_label || c.address || 'Campaign zone'}
                    </p>
                  </div>
                </div>
                <span className="executor-status">{c.status}</span>
              </div>
              <div className="executor-campaign-card-foot">
                <span>
                  {formatShortDate(c.start_date)
                    ? `Starts ${formatShortDate(c.start_date)}`
                    : 'No start date'}
                </span>
                <span>
                  {formatShortDate(c.end_date)
                    ? `Ends ${formatShortDate(c.end_date)}`
                    : 'No end date'}
                </span>
                <Link className="executor-details-btn" to={`/my/campaigns/${c.id}`}>
                  Details <span aria-hidden>›</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

function MegaphoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10v4h4l5 4V6L8 10H4zm11.5 1.5a3.5 3.5 0 000-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="11" r="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
