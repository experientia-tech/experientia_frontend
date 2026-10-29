import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { creativeVerifyNow, getCreativeReport, manualVerifyCreative } from '../api'
import type { CreativeReport, CreativeReportItem, CreativeVerificationStatus } from '../types'
import {
  CREATIVE_STATUS_LABELS,
  creativeDetectionLabel,
  creativeStatusPill,
  formatDateTime,
} from '../types'
import { mediaUrl } from '../utils/mediaUrl'
import { useUI } from '../ui'

const PAGE_SIZE = 50
const VERIFY_REFETCH_MS = 10_000

const FILTERS: CreativeVerificationStatus[] = [
  'NEEDS_REVIEW',
  'PENDING_VERIFICATION',
  'FAILED',
  'VERIFIED',
  'NOT_SUBMITTED',
]

interface CreativeReportPanelProps {
  campaignId: string
  /** Called after a manual verdict so campaign completion counts refresh. */
  onChanged?: () => void
}

export function CreativeReportPanel({ campaignId, onChanged }: CreativeReportPanelProps) {
  const { showSuccess } = useUI()
  const [report, setReport] = useState<CreativeReport | null>(null)
  const [status, setStatus] = useState<CreativeVerificationStatus | ''>('')
  const [page, setPage] = useState(1)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [compare, setCompare] = useState<CreativeReportItem | null>(null)
  // Default to Needs review once, unless the manager already picked a filter.
  const filterTouched = useRef(false)
  const refetchTimer = useRef<number | null>(null)

  const load = useCallback(async () => {
    const r = await getCreativeReport(
      campaignId,
      { status: status || undefined, page, limit: PAGE_SIZE },
      { silent: true }
    )
    if (!filterTouched.current) {
      filterTouched.current = true
      if (!status && r.totals.needs_review > 0) {
        setStatus('NEEDS_REVIEW')
        return
      }
    }
    setReport(r)
  }, [campaignId, status, page])

  useEffect(() => {
    void load().catch(() => undefined)
  }, [load])

  useEffect(
    () => () => {
      if (refetchTimer.current) window.clearTimeout(refetchTimer.current)
    },
    []
  )

  const refreshTotals = async () => {
    try {
      const r = await getCreativeReport(campaignId, { page: 1, limit: 1 }, { silent: true })
      setReport((prev) => (prev ? { ...prev, totals: r.totals, generation: r.generation } : prev))
    } catch {
      // keep the current totals
    }
  }

  const onVerdict = async (item: CreativeReportItem, verdict: 'VERIFIED' | 'FAILED') => {
    let note: string | undefined
    if (verdict === 'FAILED') {
      const input = window.prompt(`Reject Task #${item.sequence_number}? Optional note for the executor:`, '')
      if (input === null) return
      note = input.trim() || undefined
    }
    setBusyTaskId(item.task_id)
    try {
      const updated = await manualVerifyCreative(item.task_id, verdict, note)
      setReport((prev) =>
        prev
          ? { ...prev, items: prev.items.map((i) => (i.task_id === updated.task_id ? updated : i)) }
          : prev
      )
      setCompare((prev) => (prev?.task_id === updated.task_id ? updated : prev))
      showSuccess(verdict === 'VERIFIED' ? 'Proof approved' : 'Proof rejected')
      void refreshTotals()
      onChanged?.()
    } catch {
      // API errors shown globally
    } finally {
      setBusyTaskId(null)
    }
  }

  const onVerifyNow = async () => {
    setVerifyBusy(true)
    try {
      const res = await creativeVerifyNow(campaignId)
      showSuccess(`Queued ${res.queued} proof${res.queued === 1 ? '' : 's'} for verification`)
      if (refetchTimer.current) window.clearTimeout(refetchTimer.current)
      refetchTimer.current = window.setTimeout(() => {
        refetchTimer.current = null
        void load().catch(() => undefined)
        onChanged?.()
      }, VERIFY_REFETCH_MS)
    } catch {
      // API errors shown globally
    } finally {
      setVerifyBusy(false)
    }
  }

  const totals = report?.totals
  const pageCount = report ? Math.max(1, Math.ceil(report.items_total / (report.page_size || PAGE_SIZE))) : 1

  return (
    <section className="panel creative-report">
      <div className="page-head tight">
        <div>
          <h2>Creative report</h2>
          <p className="muted">
            {report?.verify_schedule
              ? `New proofs are checked automatically ${report.verify_schedule}.`
              : report
                ? 'Automatic checks are off; use Verify now to check new proofs.'
                : ''}{' '}
            Compare the generated creative with the proof photo to approve or reject by hand.
          </p>
        </div>
        <div className="toolbar">
          <button type="button" className="btn ghost" onClick={() => void load().catch(() => undefined)}>
            Refresh
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={verifyBusy || !totals || totals.pending_verification === 0}
            onClick={() => void onVerifyNow()}
          >
            {verifyBusy ? 'Queueing…' : 'Verify now'}
          </button>
        </div>
      </div>

      {totals && (
        <div className="creative-totals">
          <div className="overview-stat tone-gray">
            <span>Total</span>
            <strong>{totals.total_tasks}</strong>
          </div>
          <div className="overview-stat tone-gray">
            <span>Not submitted</span>
            <strong>{totals.not_submitted}</strong>
          </div>
          <div className="overview-stat tone-amber">
            <span>Awaiting check</span>
            <strong>{totals.pending_verification}</strong>
          </div>
          <div className="overview-stat tone-green">
            <span>Verified</span>
            <strong>{totals.verified}</strong>
          </div>
          <div className="overview-stat tone-red">
            <span>Failed</span>
            <strong>{totals.failed}</strong>
          </div>
          <div className="overview-stat tone-purple">
            <span>Needs review</span>
            <strong>{totals.needs_review}</strong>
          </div>
          <div className="overview-stat tone-blue">
            <span>Success rate</span>
            <strong>{totals.success_rate}%</strong>
          </div>
        </div>
      )}

      <div className="toolbar creative-filter">
        <select
          value={status}
          onChange={(e) => {
            filterTouched.current = true
            setStatus(e.target.value as CreativeVerificationStatus | '')
            setPage(1)
          }}
        >
          <option value="">All statuses</option>
          {FILTERS.map((s) => (
            <option key={s} value={s}>
              {CREATIVE_STATUS_LABELS[s]}
              {totals ? ` (${countFor(totals, s)})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="table-wrap">
        <table className="creative-table">
          <thead>
            <tr>
              <th>Task #</th>
              <th>Executor</th>
              <th>Code</th>
              <th>Generated</th>
              <th>Proof</th>
              <th>Status</th>
              <th>Detected</th>
              <th>Notes</th>
              <th>Uploaded</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!report ? (
              <tr>
                <td colSpan={10} className="muted">
                  Loading report…
                </td>
              </tr>
            ) : report.items.length === 0 ? (
              <tr>
                <td colSpan={10} className="muted">
                  No tasks match this filter
                </td>
              </tr>
            ) : (
              report.items.map((item) => {
                const busy = busyTaskId === item.task_id
                const noProof = !item.proof_image_url
                return (
                  <tr key={item.task_id}>
                    <td>
                      <Link to={`/tasks/${item.task_id}`}>#{item.sequence_number}</Link>
                    </td>
                    <td>{item.executor_name || '—'}</td>
                    <td>
                      <code className="creative-code">{item.verification_code || '—'}</code>
                    </td>
                    <td>
                      <CompareThumb url={item.generated_image_url} onOpen={() => setCompare(item)} />
                    </td>
                    <td>
                      <CompareThumb url={item.proof_image_url} onOpen={() => setCompare(item)} />
                      {item.code_missing && (
                        <div className="creative-code-missing compact">⚠ Code missing</div>
                      )}
                    </td>
                    <td>
                      <span className={creativeStatusPill(item.verification_status)}>
                        {CREATIVE_STATUS_LABELS[item.verification_status]}
                      </span>
                    </td>
                    <td>
                      {item.detected_code ? <code className="creative-code">{item.detected_code}</code> : '—'}
                      {creativeDetectionLabel(item) && (
                        <div className="muted small">{creativeDetectionLabel(item)}</div>
                      )}
                    </td>
                    <td className="creative-notes">{item.verification_notes || '—'}</td>
                    <td>{formatDateTime(item.proof_uploaded_at)}</td>
                    <td>
                      <div className="creative-actions">
                        <button
                          type="button"
                          className="btn primary small"
                          disabled={busy || noProof || item.verification_status === 'VERIFIED'}
                          onClick={() => void onVerdict(item, 'VERIFIED')}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn danger small"
                          disabled={busy || noProof || item.verification_status === 'FAILED'}
                          onClick={() => void onVerdict(item, 'FAILED')}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && report && (
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
            Page {report.page} of {pageCount} · {report.items_total} tasks
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

      {compare && (
        <div className="proof-preview-backdrop" onClick={() => setCompare(null)}>
          <div className="proof-preview-panel creative-compare-panel" onClick={(e) => e.stopPropagation()}>
            <div className="creative-compare">
              <figure>
                {compare.generated_image_url ? (
                  <img src={mediaUrl(compare.generated_image_url)} alt="Generated creative" />
                ) : (
                  <div className="creative-placeholder">Generating…</div>
                )}
                <figcaption>Generated · {compare.verification_code || '—'}</figcaption>
              </figure>
              <figure>
                {compare.proof_image_url ? (
                  <img src={mediaUrl(compare.proof_image_url)} alt="Proof photo" />
                ) : (
                  <div className="creative-placeholder">No proof yet</div>
                )}
                <figcaption>
                  Proof
                  {compare.detected_code ? ` · read ${compare.detected_code}` : ''}
                </figcaption>
              </figure>
            </div>
            {compare.code_missing && (
              <p className="creative-code-missing">⚠ Code is missing in this image.</p>
            )}
            {compare.verification_notes && (
              <p className="creative-compare-notes">{compare.verification_notes}</p>
            )}
            <div className="proof-preview-actions">
              <button
                type="button"
                className="btn primary"
                disabled={!compare.proof_image_url || busyTaskId === compare.task_id || compare.verification_status === 'VERIFIED'}
                onClick={() => void onVerdict(compare, 'VERIFIED')}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={!compare.proof_image_url || busyTaskId === compare.task_id || compare.verification_status === 'FAILED'}
                onClick={() => void onVerdict(compare, 'FAILED')}
              >
                Reject
              </button>
              <button type="button" className="btn ghost" onClick={() => setCompare(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function countFor(totals: CreativeReport['totals'], s: CreativeVerificationStatus) {
  switch (s) {
    case 'NOT_SUBMITTED':
      return totals.not_submitted
    case 'PENDING_VERIFICATION':
      return totals.pending_verification
    case 'VERIFIED':
      return totals.verified
    case 'FAILED':
      return totals.failed
    case 'NEEDS_REVIEW':
      return totals.needs_review
  }
}

function CompareThumb({ url, onOpen }: { url?: string | null; onOpen: () => void }) {
  if (!url) return <span className="muted small">—</span>
  return (
    <button type="button" className="creative-thumb-btn" onClick={onOpen}>
      <img src={mediaUrl(url)} alt="" loading="lazy" decoding="async" />
    </button>
  )
}
