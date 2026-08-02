/** Resolve media URLs so CloudFront builds load images from the API origin. */
const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''

export function mediaUrl(url?: string | null): string {
  if (!url) return ''
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) {
    return url
  }
  if (url.startsWith('/api/')) {
    return API_ORIGIN ? `${API_ORIGIN}${url}` : url
  }
  if (url.startsWith('/')) {
    return API_ORIGIN ? `${API_ORIGIN}${url}` : url
  }
  return url
}
