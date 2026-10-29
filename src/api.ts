import axios from 'axios'
import {
  feedbackShowAlert,
  feedbackStartLoading,
  feedbackStopLoading,
} from './feedback'
import type {
  Brand,
  Campaign,
  CampaignListItem,
  CreativeCampaign,
  CreativeReport,
  CreativeReportItem,
  CreativeVerificationStatus,
  ExecutorCampaign,
  ExecutorTasksPage,
  ServiceType,
  Task,
  User,
  ProofImage,
} from './types'
import { parseApiError } from './utils/apiError'

/** Empty in local dev (Vite proxies /api). Set VITE_API_URL in production builds. */
const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''
const API_PREFIX = `${API_ORIGIN}/api`

const api = axios.create({ baseURL: API_PREFIX })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (!config.meta?.silent) feedbackStartLoading()
  return config
})

api.interceptors.response.use(
  (response) => {
    if (!response.config.meta?.silent) feedbackStopLoading()
    return response
  },
  (error) => {
    if (!error.config?.meta?.silent) feedbackStopLoading()
    if (!error.config?.meta?.skipErrorDialog && error.response?.status !== 401) {
      feedbackShowAlert({
        kind: 'error',
        title: '',
        message: parseApiError(error),
      })
    }
    return Promise.reject(error)
  }
)

const silent = { meta: { silent: true, skipErrorDialog: true } } as const

async function uploadFileToStorage(
  presign: { upload_url: string; storage_key: string; use_direct_put: boolean },
  file: File
) {
  const contentType = file.type || 'image/jpeg'
  if (presign.use_direct_put) {
    try {
      const put = await fetch(presign.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      })
      if (!put.ok) throw new Error(`S3 upload failed (${put.status})`)
      return
    } catch {
      // CORS or network failure — fall back to server-side upload
    }
  }
  const form = new FormData()
  form.append('file', file)
  form.append('storage_key', presign.storage_key)
  await api.post('/uploads/local', form, silent)
}

export async function login(phone: string, otp: string) {
  const { data } = await api.post<{ access_token: string }>(
    '/auth/login/json',
    { phone, otp },
    { meta: { skipErrorDialog: true } }
  )
  localStorage.setItem('token', data.access_token)
  return data
}

export function logout() {
  localStorage.removeItem('token')
}

export async function getMe() {
  const { data } = await api.get<User>('/auth/me', silent)
  return data
}

export async function listCampaigns(opts?: { silent?: boolean }) {
  const { data } = await api.get<CampaignListItem[]>(
    '/campaigns',
    opts?.silent ? silent : undefined
  )
  return data
}

export async function getCampaign(
  id: string,
  params?: {
    page?: number
    limit?: number
    status?: string
    q?: string
    executor_id?: string
  },
  opts?: { silent?: boolean }
) {
  const { data } = await api.get<Campaign>(`/campaigns/${id}`, {
    params,
    ...(opts?.silent ? { meta: { silent: true, skipErrorDialog: true } } : {}),
  })
  return data
}

export async function createCampaign(payload: {
  name: string
  brand_id?: string | null
  service_type: ServiceType | string
  description?: string
  address?: string
  center_latitude: number
  center_longitude: number
  radius_km?: number
  total_tasks: number
  executor_ids?: string[]
  start_date?: string | null
  end_date?: string | null
  source_image_key?: string | null
}) {
  const { data } = await api.post<Campaign>('/campaigns', payload)
  return data
}

export async function updateCampaign(
  id: string,
  payload: Partial<{
    name: string
    description: string
    status: string
    address: string
    brand_id: string | null
    center_latitude: number
    center_longitude: number
    radius_km: number
    start_date: string | null
    end_date: string | null
  }>
) {
  const { data } = await api.patch<Campaign>(`/campaigns/${id}`, payload)
  return data
}

export async function addCampaignTasks(
  id: string,
  payload: { count?: number; executor_user_id?: string; manager_owned?: boolean }
) {
  const { data } = await api.post<{ campaign: Campaign; task_ids: string[] }>(
    `/campaigns/${id}/tasks`,
    payload
  )
  return data
}

export async function deleteCampaign(id: string) {
  await api.delete(`/campaigns/${id}`)
}

export async function assignCampaignSupervisors(id: string, supervisor_ids: string[]) {
  const { data } = await api.post<Campaign>(`/campaigns/${id}/supervisors`, { supervisor_ids })
  return data
}

export async function assignCampaignExecutors(id: string, executor_ids: string[]) {
  const { data } = await api.post<Campaign>(`/campaigns/${id}/executors`, { executor_ids })
  return data
}

export async function listBrands() {
  const { data } = await api.get<Brand[]>('/brands')
  return data
}

export async function createBrand(
  name: string,
  description?: string,
  opts?: { storage_key?: string; image?: string }
) {
  const { data } = await api.post<Brand>('/brands', {
    name,
    description,
    storage_key: opts?.storage_key,
    image: opts?.image,
  })
  return data
}

export async function updateBrand(
  id: string,
  payload: { name?: string; description?: string; storage_key?: string; image?: string }
) {
  const { data } = await api.patch<Brand>(`/brands/${id}`, payload)
  return data
}

export async function uploadBrandLogo(file: File, brandId?: string): Promise<string> {
  feedbackStartLoading()
  try {
    const { data: presign } = await api.post<{
      upload_url: string
      storage_key: string
      public_url: string
      use_direct_put: boolean
    }>(
      '/uploads/presign-brand',
      {
        filename: file.name,
        content_type: file.type || 'image/jpeg',
        brand_id: brandId || null,
      },
      silent
    )

    await uploadFileToStorage(presign, file)
    return presign.storage_key
  } catch (error) {
    feedbackShowAlert({
      kind: 'error',
      title: '',
      message: parseApiError(error, 'Upload failed'),
    })
    throw error
  } finally {
    feedbackStopLoading()
  }
}

/** Upload the source image for a Creative campaign; returns its storage key. */
export async function uploadCreativeSource(file: File): Promise<string> {
  feedbackStartLoading()
  try {
    const { data: presign } = await api.post<{
      upload_url: string
      storage_key: string
      public_url: string
      use_direct_put: boolean
    }>(
      '/uploads/presign-creative',
      { filename: file.name, content_type: file.type || 'image/jpeg' },
      silent
    )

    await uploadFileToStorage(presign, file)
    return presign.storage_key
  } catch (error) {
    feedbackShowAlert({
      kind: 'error',
      title: '',
      message: parseApiError(error, 'Upload failed'),
    })
    throw error
  } finally {
    feedbackStopLoading()
  }
}

export async function getCreativeReport(
  campaignId: string,
  params?: { status?: CreativeVerificationStatus; page?: number; limit?: number },
  opts?: { silent?: boolean }
) {
  const { data } = await api.get<CreativeReport>(`/campaigns/${campaignId}/creative-report`, {
    params,
    ...(opts?.silent ? silent : {}),
  })
  return data
}

/** Set a task's verification code; omit `code` to have the server generate one. */
export async function setCreativeCode(taskId: string, code?: string) {
  const { data } = await api.put<CreativeReportItem>(`/tasks/${taskId}/creative-code`, { code })
  return data
}

export async function manualVerifyCreative(
  taskId: string,
  status: 'VERIFIED' | 'FAILED',
  note?: string
) {
  const { data } = await api.post<CreativeReportItem>(`/tasks/${taskId}/creative-verify`, {
    status,
    note,
  })
  return data
}

export async function creativeVerifyNow(campaignId: string) {
  const { data } = await api.post<{ ok: boolean; queued: number }>(
    `/campaigns/${campaignId}/creative-verify-now`
  )
  return data
}

export async function retryCreativeGeneration(campaignId: string) {
  const { data } = await api.post<CreativeCampaign>(`/campaigns/${campaignId}/creative-generate`)
  return data
}

export async function listExecutors() {
  const { data } = await api.get<User[]>('/users/executors')
  return data
}

export async function listSupervisors(brandId?: string) {
  const { data } = await api.get<User[]>('/users/supervisors', {
    params: brandId ? { brand_id: brandId } : undefined,
  })
  return data
}

export interface TeamMember {
  id: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  role: string
  brand_id?: string | null
  brand_name?: string | null
  active: boolean
}

export async function listTeam() {
  const { data } = await api.get<TeamMember[]>('/team')
  return data
}

export async function createTeamMember(payload: {
  first_name: string
  last_name?: string
  phone: string
  role: 'executor' | 'supervisor'
  brand_id?: string | null
}) {
  const { data } = await api.post<TeamMember>('/team', payload)
  return data
}


export async function getTask(id: string, opts?: { silent?: boolean }) {
  const { data } = await api.get<Task>(`/tasks/${id}`, opts?.silent ? silent : undefined)
  return data
}

export async function deleteTaskProof(taskId: string, slot: string) {
  await api.delete(`/tasks/${taskId}/proofs/${encodeURIComponent(slot)}`, {
    meta: { silent: true, skipErrorDialog: true },
  })
}

export async function myCampaigns(opts?: { silent?: boolean }) {
  const { data } = await api.get<ExecutorCampaign[]>(
    '/my/campaigns',
    opts?.silent ? silent : undefined
  )
  return data
}

export async function myTasks(
  campaignId?: string,
  params?: { page?: number; limit?: number },
  opts?: { silent?: boolean }
) {
  const { data } = await api.get<ExecutorTasksPage>('/my/tasks', {
    params: {
      ...(campaignId ? { campaign_id: campaignId } : {}),
      page: params?.page ?? 1,
      limit: params?.limit ?? 15,
    },
    ...(opts?.silent ? silent : {}),
  })
  return data
}

export async function submitTaskDetails(
  taskId: string,
  payload: {
    driver_name?: string
    driver_phone?: string
    vehicle_number?: string
    gym_name?: string
    gym_location?: string
  }
) {
  const { data } = await api.post<Task>(`/tasks/${taskId}/details`, payload)
  return data
}

export interface ExportJob {
  id: string
  campaign_id: string
  campaign_name?: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  total: number
  done: number
  percent: number
  error?: string | null
  filename?: string | null
  download_ready: boolean
  queue_position?: number | null
  created_at: string
  finished_at?: string | null
  message?: string
}

export async function startCampaignExport(campaignId: string) {
  const { data } = await api.post<ExportJob>(`/campaigns/${campaignId}/export`)
  return data
}

export async function listMyExports() {
  const { data } = await api.get<ExportJob[]>('/exports', silent)
  return data
}

export async function listCampaignExports(campaignId: string) {
  const { data } = await api.get<ExportJob[]>(`/campaigns/${campaignId}/export/jobs`)
  return data
}

export async function getCampaignExportJob(campaignId: string, jobId: string) {
  const { data } = await api.get<ExportJob>(`/campaigns/${campaignId}/export/jobs/${jobId}`)
  return data
}

/** All generated creatives in one print-ready PDF (one page per task). */
export async function downloadCreativePrintPdf(campaignId: string, filename: string) {
  feedbackStartLoading()
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_PREFIX}/campaigns/${campaignId}/creative-print.pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Download failed')
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    feedbackShowAlert({
      kind: 'error',
      title: '',
      message: parseApiError(error, 'Download failed'),
    })
    throw error
  } finally {
    feedbackStopLoading()
  }
}

export async function downloadCampaignExport(campaignId: string, jobId: string, filename?: string) {
  feedbackStartLoading()
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`${API_PREFIX}/campaigns/${campaignId}/export/jobs/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `experientia-campaign-${campaignId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    feedbackShowAlert({
      kind: 'error',
      title: '',
      message: parseApiError(error, 'Download failed'),
    })
    throw error
  } finally {
    feedbackStopLoading()
  }
}

/** @deprecated Prefer startCampaignExport for large campaigns */
export async function exportCampaignPdf(campaignId: string) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_PREFIX}/campaigns/${campaignId}/export.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('PDF export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `experientia-campaign-${campaignId}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

export async function uploadProofFast(
  taskId: string,
  file: File,
  latitude: number,
  longitude: number,
  slot: string,
  capturedAt?: Date,
  opts?: { quiet?: boolean }
): Promise<ProofImage> {
  const quiet = opts?.quiet === true
  if (!quiet) feedbackStartLoading()
  try {
    const { data: presign } = await api.post<{
      upload_url: string
      storage_key: string
      public_url: string
      use_direct_put: boolean
    }>(
      '/uploads/presign',
      {
        filename: file.name,
        content_type: file.type || 'image/jpeg',
        task_id: taskId,
      },
      silent
    )

    await uploadFileToStorage(presign, file)

    const { data: proof } = await api.post<ProofImage>(
      `/tasks/${taskId}/proofs`,
      {
        storage_key: presign.storage_key,
        url: presign.public_url,
        latitude,
        longitude,
        slot,
        captured_at: (capturedAt || new Date()).toISOString(),
      },
      silent
    )
    return proof
  } catch (error) {
    if (!quiet) {
      feedbackShowAlert({
        kind: 'error',
        title: '',
        message: parseApiError(error, 'Upload failed'),
      })
    }
    throw error
  } finally {
    if (!quiet) feedbackStopLoading()
  }
}

export default api
