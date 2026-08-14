'use client'
import { ReactNode, useState } from 'react'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ToastProvider } from '@/components/Toast'
import { ConfirmProvider } from '@/components/Confirm'
import Observability from '@/components/Observability'
import { reportError } from '@/lib/telemetry'

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () => new QueryClient({
      queryCache: new QueryCache({
        onError: (error, query) => reportError(error, `query:${String(query.queryKey[0] || 'unknown')}`),
      }),
      mutationCache: new MutationCache({
        onError: (error) => reportError(error, 'mutation'),
      }),
      defaultOptions: {
        queries: {
          staleTime: 2 * 60 * 1000,
          retry: 1,
          // Switching back to the portal should not refetch every dashboard and
          // report query. Mutations already invalidate the affected query keys.
          refetchOnWindowFocus: false,
        },
      },
    })
  )
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <Observability />
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
