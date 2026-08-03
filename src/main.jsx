import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Calendar from './pages/Calendar'
import Orders from './pages/Orders'
import SalesEntry from './pages/SalesEntry'
import Duplicates from './pages/Duplicates'
import Approvals from './pages/Approvals'
import Elearning from './pages/Elearning'
import Rollover from './pages/Rollover'
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
        <Route path="/orders" element={<Orders />} />
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
