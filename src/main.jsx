import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Shell from './components/Shell'
import Login from './pages/Login'
const Dashboard = lazy(() => import('./pages/Dashboard'))
import Calendar from './pages/Calendar'
import Orders from './pages/Orders'
import SalesEntry from './pages/SalesEntry'
import Duplicates from './pages/Duplicates'
import Approvals from './pages/Approvals'
import Elearning from './pages/Elearning'
const Rollover = lazy(() => import('./pages/Rollover'))
import SessionForm from './pages/SessionForm'
import CourseForm from './pages/CourseForm'
const Resources = lazy(() => import('./pages/Resources'))
const SapImport = lazy(() => import('./pages/SapImport'))
import Worklist from './pages/Worklist'
const Clients = lazy(() => import('./pages/Clients'))
import { Spinner } from './components/ui'
import './styles.css'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1 } } })

// Route guard: needs a session; optionally restricts to roles.
function Guard({ roles, children }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner label="Loading" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Spinner label="Loading profile" />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/dashboard" replace />
  return children
}

function Routed() {
  const { session, loading } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session && !loading ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route
        element={
          <Guard>
            <Shell />
          </Guard>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/session/new" element={<Guard roles={['super_admin', 'operations']}><SessionForm /></Guard>} />
        <Route path="/session/:id/edit" element={<Guard roles={['super_admin', 'operations']}><SessionForm /></Guard>} />
        <Route path="/course/new" element={<Guard roles={['super_admin', 'operations']}><CourseForm /></Guard>} />
        <Route path="/course/:id/edit" element={<Guard roles={['super_admin', 'operations']}><CourseForm /></Guard>} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/worklist" element={<Guard roles={['super_admin', 'business_owner', 'sales']}><Worklist /></Guard>} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/resources" element={<Guard roles={['super_admin', 'operations', 'business_owner']}><Resources /></Guard>} />
        <Route path="/sap-import" element={<Guard roles={['super_admin', 'operations']}><SapImport /></Guard>} />
        <Route path="/sales-entry" element={<Guard roles={['super_admin', 'sales']}><SalesEntry /></Guard>} />
        <Route path="/duplicates" element={<Guard roles={['super_admin', 'sales']}><Duplicates /></Guard>} />
        <Route path="/approvals" element={<Guard roles={['super_admin', 'operations', 'business_owner']}><Approvals /></Guard>} />
        <Route path="/elearning" element={<Guard roles={['super_admin', 'operations']}><Elearning /></Guard>} />
        <Route path="/rollover" element={<Guard roles={['super_admin', 'operations']}><Rollover /></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
