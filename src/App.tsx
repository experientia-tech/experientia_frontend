import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { CampaignSearchProvider } from './campaignSearch'
import { ExportQueueProvider } from './exportQueue'
import { GlobalLoader } from './components/GlobalLoader'
import { Shell } from './components/Shell'
import { UIProvider } from './ui'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { NewCampaignPage } from './pages/NewCampaignPage'
import { CampaignDetailPage } from './pages/CampaignDetailPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { ExecutorHomePage } from './pages/ExecutorHomePage'
import { ExecutorCampaignPage } from './pages/ExecutorCampaignPage'
import { TeamPage } from './pages/TeamPage'
import { DownloadsPage } from './pages/DownloadsPage'

function AppLayout() {
  const { user, loading } = useAuth()
  if (loading) return <GlobalLoader label="Starting Experientia…" />
  if (!user) return <Navigate to="/welcome" replace />
  return (
    <ExportQueueProvider>
      <CampaignSearchProvider>
        <Shell>
          <Outlet />
        </Shell>
      </CampaignSearchProvider>
    </ExportQueueProvider>
  )
}

function ManagerOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'manager') return <Navigate to="/" replace />
  return <>{children}</>
}

function ExportAccess({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'manager' && user?.role !== 'supervisor') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

function Home() {
  const { user } = useAuth()
  if (user?.role === 'executor') return <ExecutorHomePage />
  return <DashboardPage />
}

export default function App() {
  return (
    <UIProvider>
      <AuthProvider>
        <Routes>
          <Route path="/welcome" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/my/campaigns/:id" element={<ExecutorCampaignPage />} />
            <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            <Route path="/tasks/:id" element={<TaskDetailPage />} />
            <Route
              path="/campaigns/new"
              element={
                <ManagerOnly>
                  <NewCampaignPage />
                </ManagerOnly>
              }
            />
            <Route
              path="/team"
              element={
                <ManagerOnly>
                  <TeamPage />
                </ManagerOnly>
              }
            />
            <Route
              path="/downloads"
              element={
                <ExportAccess>
                  <DownloadsPage />
                </ExportAccess>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </AuthProvider>
    </UIProvider>
  )
}
