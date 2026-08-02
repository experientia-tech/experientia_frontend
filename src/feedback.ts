export type AlertKind = 'success' | 'error' | 'info'

export interface AlertState {
  kind: AlertKind
  title: string
  message: string
}

type FeedbackBridge = {
  startLoading: () => void
  stopLoading: () => void
  showAlert: (alert: AlertState) => void
  hideAlert: () => void
}

let bridge: FeedbackBridge | null = null
let loadingDepth = 0
const loadingListeners = new Set<() => void>()

function emitLoading() {
  loadingListeners.forEach((l) => l())
}

export function subscribeGlobalLoading(cb: () => void) {
  loadingListeners.add(cb)
  return () => loadingListeners.delete(cb)
}

export function registerFeedback(next: FeedbackBridge | null) {
  bridge = next
}

export function feedbackStartLoading() {
  loadingDepth += 1
  bridge?.startLoading()
  emitLoading()
}

export function feedbackStopLoading() {
  loadingDepth = Math.max(0, loadingDepth - 1)
  bridge?.stopLoading()
  emitLoading()
}

/** True while any non-silent API request is in flight (global overlay). */
export function feedbackIsLoading() {
  return loadingDepth > 0
}

export function feedbackShowAlert(alert: AlertState) {
  bridge?.showAlert(alert)
}

export function feedbackHideAlert() {
  bridge?.hideAlert()
}
