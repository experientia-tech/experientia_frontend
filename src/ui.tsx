import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertDialog } from './components/AlertDialog'
import { GlobalLoader } from './components/GlobalLoader'
import {
  registerFeedback,
  type AlertKind,
  type AlertState,
} from './feedback'

interface UIContextValue {
  loading: boolean
  showSuccess: (message: string, title?: string) => void
  showError: (message: string, title?: string) => void
  showInfo: (message: string, title?: string) => void
  showAlert: (kind: AlertKind, message: string, title?: string) => void
  hideAlert: () => void
}

const UIContext = createContext<UIContextValue | null>(null)

const AUTO_CLOSE_MS: Record<AlertKind, number> = {
  success: 2800,
  error: 0,
  info: 3200,
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [loadingCount, setLoadingCount] = useState(0)
  const [alert, setAlert] = useState<AlertState | null>(null)
  const timerRef = useRef<number | null>(null)

  const startLoading = useCallback(() => {
    setLoadingCount((n) => n + 1)
  }, [])

  const stopLoading = useCallback(() => {
    setLoadingCount((n) => Math.max(0, n - 1))
  }, [])

  const hideAlert = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setAlert(null)
  }, [])

  const showAlert = useCallback(
    (kind: AlertKind, message: string, title?: string) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setAlert({ kind, title: title || '', message })
      const ms = AUTO_CLOSE_MS[kind]
      if (ms > 0) {
        timerRef.current = window.setTimeout(() => {
          setAlert(null)
          timerRef.current = null
        }, ms)
      }
    },
    []
  )

  const showSuccess = useCallback(
    (message: string, title?: string) => showAlert('success', message, title),
    [showAlert]
  )
  const showError = useCallback(
    (message: string, title?: string) => showAlert('error', message, title),
    [showAlert]
  )
  const showInfo = useCallback(
    (message: string, title?: string) => showAlert('info', message, title),
    [showAlert]
  )

  useEffect(() => {
    registerFeedback({
      startLoading,
      stopLoading,
      showAlert: (a) => showAlert(a.kind, a.message, a.title),
      hideAlert,
    })
    return () => registerFeedback(null)
  }, [startLoading, stopLoading, showAlert, hideAlert])

  const value = useMemo<UIContextValue>(
    () => ({
      loading: loadingCount > 0,
      showSuccess,
      showError,
      showInfo,
      showAlert,
      hideAlert,
    }),
    [loadingCount, showSuccess, showError, showInfo, showAlert, hideAlert]
  )

  return (
    <UIContext.Provider value={value}>
      {children}
      {loadingCount > 0 && <GlobalLoader />}
      <AlertDialog alert={alert} onClose={hideAlert} />
    </UIContext.Provider>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used within UIProvider')
  return ctx
}

export function useUIOptional() {
  return useContext(UIContext)
}
