export type Role = 'manager' | 'executor' | 'supervisor'

export type ServiceType =
  | 'Auto Hood'
  | 'Gym'
  | 'No Parking Boards'
  | 'Pole Boards'
  | 'Shop Branding'
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
}

export const SERVICE_TYPES: ServiceType[] = [
  'Auto Hood',
  'Gym',
  'No Parking Boards',
  'Pole Boards',
  'Shop Branding',
  'Other',
]

export const PHOTOS_REQUIRED: Record<ServiceType, number> = {
  'Auto Hood': 3,
  Gym: 2,
  'No Parking Boards': 1,
  'Pole Boards': 1,
  'Shop Branding': 1,
  Other: 3,
}

export const CAPTURE_SLOTS: Record<ServiceType, string[]> = {
  'Auto Hood': ['front', 'side', 'back'],
  Gym: ['photo_1', 'photo_2'],
  'No Parking Boards': ['photo_1'],
  'Pole Boards': ['photo_1'],
  'Shop Branding': ['photo_1'],
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
  Other: null,
}

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  ACCEPTED: 'COMPLETED',
  REJECTED: 'REJECTED',
  DRAFT: 'DRAFT',
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
  task: Pick<Task, 'proof_image_count' | 'proof_images' | 'required_photos' | 'detail_form' | 'details_complete'>
) {
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
