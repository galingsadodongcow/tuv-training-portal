'use client'
import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30000, retry: 1 } } })
  )
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
