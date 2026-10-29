import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { myCampaigns, myTasks } from '../api'
import { GlobalLoaderInline } from '../components/GlobalLoader'
import type { CreativeVerificationStatus, ExecutorCampaign, ExecutorTasksPage, Task } from '../types'
import { CREATIVE_STATUS_LABELS, canExecutorOpenTask, creativeStatusPill, taskLabel, taskProofCount } from '../types'

// Executors only need to know the task is done; the code check is for managers.
const EXECUTOR_CREATIVE_LABELS: Partial<Record<CreativeVerificationStatus, string>> = {
  PENDING_VERIFICATION: 'Submitted',
  NEEDS_REVIEW: 'Submitted',
  FAILED: 'Failed – retake',
}

const PAGE_SIZE = 15

function formatShortDate(value?: string | null) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-GB')
}

function taskAddress(task: Task, campaign?: ExecutorCampaign | null) {
  const metaAddr = (task as Task & { address?: string }).address
  if (metaAddr) return metaAddr
  if (campaign?.address) return campaign.address
  if (task.latitude != null && task.longitude != null) {
    return `${task.latitude.toFixed(7)}, ${task.longitude.toFixed(7)}`
  }
  return 'Assigned location'
}

function ExecutorTaskCard({
  task,
  campaign,
}: {
  task: Task
  campaign: ExecutorCampaign
}) {
  const openable = canExecutorOpenTask(task)
  const photos = taskProofCount(task)
  const needed = task.required_photos || 1
  const body = (
    <>
      <span className="executor-task-icon" aria-hidden>
        <MapIcon />
      </span>
      <div className="executor-task-body">
        <strong>{taskAddress(task, campaign)}</strong>
        <p className="executor-task-coords">
          Location:{' '}
          {task.latitude != null && task.longitude != null
            ? `${task.latitude} • ${task.longitude}`
            : '—'}
        </p>
        <p className="executor-task-meta muted small">
          {taskLabel(task)} · {photos}/{needed} photos
          {!openable && !task.creative && <span className="executor-task-done"> · Completed</span>}
        </p>
        {task.creative && (
          <p className="executor-task-creative">
            <span className={creativeStatusPill(task.creative.verification_status)}>
              {EXECUTOR_CREATIVE_LABELS[task.creative.verification_status] ||
                CREATIVE_STATUS_LABELS[task.creative.verification_status]}
            </span>
          </p>
        )}
      </div>
    </>
  )

  if (!openable) {
    return (
      <div className="executor-task-card is-complete" aria-disabled="true">
        {body}
      </div>
    )
  }

  return (
    <Link to={`/tasks/${task.id}`} className="executor-task-card">
      {body}
    </Link>
  )
}

export function ExecutorCampaignPage() {
  const { id } = useParams()
  const campaignId = id!
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState<ExecutorCampaign | null>(null)
  const [tasksPage, setTasksPage] = useState<ExecutorTasksPage | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const loadTasks = useCallback(
    async (nextPage: number) => {
      setLoading(true)
      try {
        const data = await myTasks(campaignId, { page: nextPage, limit: PAGE_SIZE }, { silent: true })
        setTasksPage(data)
      } catch {
        setTasksPage(null)
      } finally {
        setLoading(false)
      }
    },
    [campaignId]
  )

  useEffect(() => {
    setPage(1)
    myCampaigns({ silent: true })
      .then((campaigns) => setCampaign(campaigns.find((c) => c.id === campaignId) || null))
      .catch(() => setCampaign(null))
  }, [campaignId])

  useEffect(() => {
    void loadTasks(page)
  }, [loadTasks, page])

  const tasks = tasksPage?.items ?? []
  const total = tasksPage?.total ?? campaign?.task_count ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const nextOpenTaskId = tasksPage?.next_open_task_id

  const onCompleteTask = () => {
    if (nextOpenTaskId) navigate(`/tasks/${nextOpenTaskId}`)
  }

  if (loading && !tasksPage && !campaign) {
    return <GlobalLoaderInline label="Loading campaign…" />
  }

  if (!campaign) {
    return (
      <div className="executor-page">
        <p className="error">Campaign not found</p>
        <Link to="/" className="btn ghost">
          Back
        </Link>
      </div>
    )
  }

  return (
    <div className="executor-page executor-campaign-detail">
      <header className="executor-mobile-topbar">
        <Link to="/" className="executor-back-btn" aria-label="Back">
          ←
        </Link>
        <h1>Campaign Details</h1>
        <span className="executor-topbar-spacer" />
      </header>

      <section className="executor-campaign-hero-card">
        <span className="executor-hero-icon" aria-hidden>
          <MegaphoneIcon />
        </span>
        <div>
          <p className="executor-service-type">{(campaign.service_type || 'Campaign').toUpperCase()}</p>
          <h2>{campaign.name}</h2>
          {campaign.end_date && (
            <p className="executor-ends">
              <ClockIcon /> Ends {formatShortDate(campaign.end_date)}
            </p>
          )}
        </div>
      </section>

      <section className="executor-cta-card">
        <div>
          <h3>Complete a task</h3>
          <p>Start working on your assigned tasks to earn rewards</p>
        </div>
        <button
          type="button"
          className="executor-cta-plus"
          onClick={onCompleteTask}
          disabled={!nextOpenTaskId}
          aria-label="Start next task"
        >
          +
        </button>
      </section>

      <section className="executor-task-section">
        <h3>Your Tasks ({total})</h3>
        <div className="executor-task-list">
          {loading && tasks.length === 0 ? null : tasks.length === 0 ? (
            <p className="muted">No tasks assigned in this campaign yet.</p>
          ) : (
            tasks.map((task) => <ExecutorTaskCard key={task.id} task={task} campaign={campaign} />)
          )}
        </div>

        {pageCount > 1 && (
          <div className="pager executor-pager">
            <button
              type="button"
              className="btn ghost"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="muted small">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="btn ghost"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function MegaphoneIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
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

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v4l2.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 3v15M15 6v15" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
