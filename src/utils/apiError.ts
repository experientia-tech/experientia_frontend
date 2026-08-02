import type { AxiosError } from 'axios'

export function parseApiError(error: unknown, fallback = 'Something went wrong'): string {
  if (typeof error === 'string') return error
  if (error instanceof Error && error.message && !('response' in error)) {
    return error.message
  }
  const ax = error as AxiosError<{ detail?: string | { msg?: string }[] }>
  const detail = ax.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && 'msg' in first) return String(first.msg)
  }
  if (ax.response?.status === 401) return 'Session expired — please sign in again'
  if (ax.response?.status === 403) return 'You do not have permission for this action'
  if (ax.response?.status === 404) return 'Resource not found'
  if (ax.response?.status === 409) return 'Action could not be completed — try again'
  if (ax.response?.status && ax.response.status >= 500) return 'Server error — please try again'
  if (ax.message) return ax.message
  return fallback
}
