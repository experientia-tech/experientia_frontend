import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  downloadCampaignExport,
  listMyExports,
  startCampaignExport,
  type ExportJob,
} from './api'
import { useAuth } from './auth'

interface ExportQueueValue {
  jobs: ExportJob[]
  activeCount: number
  readyCount: number
  startExport: (campaignId: string) => Promise<ExportJob>
  downloadJob: (job: ExportJob) => Promise<void>
  jobForCampaign: (campaignId: string) => ExportJob | null
  refresh: () => Promise<void>
}

const ExportQueueContext = createContext<ExportQueueValue | null>(null)

export function ExportQueueProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [jobs, setJobs] = useState<ExportJob[]>([])

  const canExport = user?.role === 'manager' || user?.role === 'supervisor'

  const refresh = useCallback(async () => {
    if (!user || !canExport) {
      setJobs([])
      return
    }
    try {
      const list = await listMyExports()
      setJobs(list)
    } catch {
      // keep existing snapshot
    }
  }, [user, canExport])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeCount = jobs.filter((j) => j.status === 'queued' || j.status === 'processing').length
  const readyCount = jobs.filter((j) => j.download_ready).length

  // Poll only while work is in the queue — never cancels/pauses the server job
  useEffect(() => {
    if (!user || !canExport || activeCount === 0) return
    const timer = window.setInterval(() => {
      void refresh()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [user, canExport, activeCount, refresh])

  const startExport = useCallback(async (campaignId: string) => {
    const job = await startCampaignExport(campaignId)
    setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
    return job
  }, [])

  const downloadJob = useCallback(async (job: ExportJob) => {
    await downloadCampaignExport(job.campaign_id, job.id, job.filename || undefined)
  }, [])

  const jobForCampaign = useCallback(
    (campaignId: string) => {
      const forCampaign = jobs.filter((j) => j.campaign_id === campaignId)
      if (!forCampaign.length) return null
      const active = forCampaign.find((j) => j.status === 'queued' || j.status === 'processing')
      if (active) return active
      const ready = forCampaign.find((j) => j.status === 'ready')
      if (ready) return ready
      return forCampaign[0]
    },
    [jobs]
  )

  const value = useMemo<ExportQueueValue>(
    () => ({
      jobs,
      activeCount,
      readyCount,
      startExport,
      downloadJob,
      jobForCampaign,
      refresh,
    }),
    [jobs, activeCount, readyCount, startExport, downloadJob, jobForCampaign, refresh]
  )

  return <ExportQueueContext.Provider value={value}>{children}</ExportQueueContext.Provider>
}

export function useExportQueue() {
  const ctx = useContext(ExportQueueContext)
  if (!ctx) throw new Error('useExportQueue must be used within ExportQueueProvider')
  return ctx
}

export function useExportQueueOptional() {
  return useContext(ExportQueueContext)
}
