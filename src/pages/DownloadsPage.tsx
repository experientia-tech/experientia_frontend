import { Link } from 'react-router-dom'
import { useExportQueue } from '../exportQueue'
import type { ExportJob } from '../api'

export function DownloadsPage() {
  const { jobs, downloadJob, refresh, activeCount, readyCount } = useExportQueue()

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Downloads</h1>
          <p className="muted">
            Campaign PDF exports run in a background queue. Navigate freely — jobs never pause.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      <div className="metric-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="metric-card tone-amber">
          <div className="metric-icon">◌</div>
          <div>
            <span>In queue / processing</span>
            <strong>{activeCount}</strong>
          </div>
        </div>
        <div className="metric-card tone-green">
          <div className="metric-icon">↓</div>
          <div>
            <span>Ready to download</span>
            <strong>{readyCount}</strong>
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="empty">
          <h2>No exports yet</h2>
          <p className="muted">Open a campaign and click Export to PDF to queue one.</p>
          <Link className="btn primary" to="/">
            My Campaigns
          </Link>
        </div>
      ) : (
        <div className="download-list">
          {jobs.map((job) => (
            <ExportRow key={job.id} job={job} onDownload={() => void downloadJob(job)} />
          ))}
        </div>
      )}
    </div>
  )
}

function ExportRow({ job, onDownload }: { job: ExportJob; onDownload: () => void }) {
  const statusLabel =
    job.status === 'queued'
      ? job.queue_position
        ? `Queued (#${job.queue_position})`
        : 'Queued'
      : job.status === 'processing'
        ? `Processing ${job.percent}%`
        : job.status === 'ready'
          ? 'Ready'
          : 'Failed'

  return (
    <article className="panel download-row">
      <div className="download-row-main">
        <div>
          <h3>
            <Link to={`/campaigns/${job.campaign_id}`}>{job.campaign_name || 'Campaign'}</Link>
          </h3>
          <p className="muted">
            {statusLabel}
            {job.total > 0 ? ` · ${job.done}/${job.total} tasks` : ''}
            {job.filename ? ` · ${job.filename}` : ''}
          </p>
          {job.error && <p className="error">{job.error}</p>}
        </div>
        <div className="download-row-actions">
          {(job.status === 'queued' || job.status === 'processing') && (
            <div className="mini-progress">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${job.percent}%` }} />
              </div>
            </div>
          )}
          {job.download_ready && (
            <button type="button" className="btn primary" onClick={onDownload}>
              Download {job.filename?.endsWith('.zip') ? 'ZIP' : 'PDF'}
            </button>
          )}
          {job.status === 'failed' && <span className="pill pending">Failed</span>}
          {job.status === 'ready' && <span className="pill active">Ready</span>}
        </div>
      </div>
    </article>
  )
}
