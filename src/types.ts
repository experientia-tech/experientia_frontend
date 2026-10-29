export type Role = 'manager' | 'executor' | 'supervisor'

export type ServiceType =
  | 'Auto Hood'
  | 'Gym'
  | 'No Parking Boards'
  | 'Pole Boards'
  | 'Shop Branding'
  | 'Creative'
  | 'Other'

export interface User {
  id: string
  first_name: string
  last_name: string
  full_name: string
  phone: string
  organization_id: string
  role: Role
}

export interface Brand {
  id: string
  name: string
  description?: string | null
  image?: string | null
}

export interface ProofImage {
  url: string
  slot: string
  latitude?: number | null
  longitude?: number | null
  captured_at?: string | null
}

export interface ExecutorTasksPage {
  items: Task[]
  page: number
  page_size: number
  total: number
  next_open_task_id?: string | null
}

export interface ExecutorCampaign {
  id: string
  name: string
  service_type?: string | null
  status: string
  address?: string | null
  location_label?: string | null
  start_date?: string | null
  end_date?: string | null
  task_count: number
  pending_count: number
}

export type CreativeGenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export type CreativeVerificationStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'FAILED'
  | 'NEEDS_REVIEW'

export type CreativeDetectionMethod = 'QR' | 'OCR' | 'MANUAL'

export interface CreativeTask {
  /** Null if generation failed; a manager can set it from the task page */
  verification_code: string | null
  /** Null until the background job has rendered it */
  generated_image_url?: string | null
  verification_status: CreativeVerificationStatus
  detected_code?: string | null
  detection_method?: CreativeDetectionMethod | null
  /** Reason shown to executor / manager */
  verification_notes?: string | null
  /** The automatic check found no task's code in the proof photo */
  code_missing?: boolean
  proof_uploaded_at?: string | null
  verified_at?: string | null
}

export interface CreativeCampaign {
  source_image_url: string
  generation_status: CreativeGenerationStatus
  generated_count: number
  generation_error?: string | null
  /** One page per task, rebuilt after each generation run */
  print_pdf_ready?: boolean
  print_pdf_pages?: number | null
  print_pdf_generated_at?: string | null
}

export interface CreativeReportTotals {
  total_tasks: number
  not_submitted: number
  pending_verification: number
  verified: number
  failed: number
  needs_review: number
  /** verified ÷ submitted, percent, 1 decimal */
  success_rate: number
}

export interface CreativeReportItem {
  task_id: string
  sequence_number: number
  executor_user_id: string
  executor_name?: string | null
  verification_code: string | null
  verification_status: CreativeVerificationStatus
  detected_code?: string | null
  detection_method?: CreativeDetectionMethod | null
  ocr_confidence?: number | null
  generated_image_url?: string | null
  proof_image_url?: string | null
  proof_uploaded_at?: string | null
  verified_at?: string | null
  verification_attempts: number
  verification_notes?: string | null
  code_missing?: boolean
}

export interface CreativeReport {
  campaign_id: string
  campaign_name: string
  generation: CreativeCampaign
  totals: CreativeReportTotals
  items: CreativeReportItem[]
  page: number
  page_size: number
  items_total: number
  /** e.g. "every hour"; null when only "Verify now" checks proofs */
  verify_schedule?: string | null
}

export interface Task {
  id: string
  campaign_id: string
  campaign_name?: string | null
  sequence_number: number
  executor_user_id: string
  executor_name?: string | null
  status: string
  latitude?: number | null
  longitude?: number | null
  within_geofence?: boolean | null
  required_photos: number
  service_type?: ServiceType | string | null
  detail_form?: 'driver' | 'gym' | null
  capture_slots: string[]
  details_complete: boolean
  proof_images: ProofImage[]
  proof_image_count?: number
  driver_name?: string | null
  driver_phone?: string | null
  vehicle_number?: string | null
  gym_name?: string | null
  gym_location?: string | null
  notes?: string | null
  flagged: boolean
  created_at: string
  completed_at?: string | null
  creative?: CreativeTask | null
}

export interface Member {
  id: string
  user_id: string
  full_name: string
  phone: string
  role: string
  location?: string | null
  assigned_by?: string | null
  active: boolean
}

export interface CampaignListItem {
  id: string
  name: string
  brand_id?: string | null
  brand?: Brand | null
  service_type?: string | null
  status: string
  center_latitude?: number | null
  center_longitude?: number | null
  radius_km: number
  address?: string | null
  total_tasks: number
  created_at: string
  start_date?: string | null
  end_date?: string | null
  logo?: string | null
  task_count: number
  completed_task_count: number
  pending_task_count: number
  proof_image_count: number
}

export interface Campaign extends CampaignListItem {
  description: string
  photos_per_task: number
  organization_id: string
  tasks: Task[]
  executors: User[]
  task_assignees?: User[]
  members: Member[]
  tasks_page: number
  tasks_page_size: number
  tasks_total: number
  creative?: CreativeCampaign | null
}

export const SERVICE_TYPES: ServiceType[] = [
  'Auto Hood',
  'Gym',
  'No Parking Boards',
  'Pole Boards',
  'Shop Branding',
  'Creative',
  'Other',
]

export const PHOTOS_REQUIRED: Record<ServiceType, number> = {
  'Auto Hood': 3,
  Gym: 2,
  'No Parking Boards': 1,
  'Pole Boards': 1,
  'Shop Branding': 1,
  Creative: 1,
  Other: 3,
}

export const CAPTURE_SLOTS: Record<ServiceType, string[]> = {
  'Auto Hood': ['front', 'side', 'back'],
  Gym: ['photo_1', 'photo_2'],
  'No Parking Boards': ['photo_1'],
  'Pole Boards': ['photo_1'],
  'Shop Branding': ['photo_1'],
  Creative: ['photo_1'],
  Other: ['photo_1', 'photo_2', 'photo_3'],
}

export const SLOT_LABELS: Record<string, string> = {
  front: 'Front view',
  side: 'Side view',
  back: 'Back view',
  photo_1: 'Photo 1',
  photo_2: 'Photo 2',
  photo_3: 'Photo 3',
}

export const DETAIL_FORM: Record<ServiceType, 'driver' | 'gym' | null> = {
  'Auto Hood': 'driver',
  Gym: 'gym',
  'No Parking Boards': null,
  'Pole Boards': null,
  'Shop Branding': null,
  Creative: null,
  Other: null,
}

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  ACCEPTED: 'COMPLETED',
  REJECTED: 'REJECTED',
  DRAFT: 'DRAFT',
}

export const CREATIVE_STATUS_LABELS: Record<CreativeVerificationStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING_VERIFICATION: 'Awaiting check',
  VERIFIED: 'Verified',
  FAILED: 'Failed',
  NEEDS_REVIEW: 'Needs review',
}

/** "QR", "OCR · 82%" or "MANUAL"; null when nothing was detected yet. */
export function creativeDetectionLabel(item: {
  detection_method?: CreativeDetectionMethod | null
  ocr_confidence?: number | null
}) {
  if (!item.detection_method) return null
  if (item.detection_method === 'OCR' && item.ocr_confidence != null) {
    return `OCR · ${Math.round(item.ocr_confidence)}%`
  }
  return item.detection_method
}

/** `pill` modifier class for a creative verification status. */
export function creativeStatusPill(status: CreativeVerificationStatus) {
  return `pill creative-${status.toLowerCase().replace(/_/g, '-')}`
}

export function taskLabel(task: Pick<Task, 'sequence_number' | 'id'>) {
  const n = Number(task.sequence_number)
  if (Number.isFinite(n) && n > 0) return `Task #${n}`
  return 'Task'
}

export function taskProofCount(task: Pick<Task, 'proof_image_count' | 'proof_images'>) {
  return task.proof_image_count ?? task.proof_images.length
}

/** Executors may open tasks that still need photos or pending detail forms. */
export function canExecutorOpenTask(
  task: Pick<
    Task,
    'proof_image_count' | 'proof_images' | 'required_photos' | 'detail_form' | 'details_complete' | 'creative'
  >
) {
  // Creative: must match the backend's EXECUTOR_OPEN set — photo count doesn't decide it.
  if (task.creative) {
    const s = task.creative.verification_status
    return s === 'NOT_SUBMITTED' || s === 'FAILED'
  }
  const needed = task.required_photos || 1
  if (taskProofCount(task) < needed) return true
  if (task.detail_form && !task.details_complete) return true
  return false
}

export function slotLabel(slot: string) {
  return SLOT_LABELS[slot] || slot.replace(/_/g, ' ')
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`
}

export function formatCoords(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return '—'
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}
