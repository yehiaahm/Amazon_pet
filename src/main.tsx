import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { installGlobalErrorHandlers } from './core/utils/errorReporting'
import { useUIStore } from './core/stores/uiStore'
import './styles/index.css'

installGlobalErrorHandlers()

function mutationErrorHandler(error: unknown) {
  const message = error instanceof Error ? error.message : 'فشلت العملية';
  useUIStore.getState().addNotification('WARNINGS', 'خطأ في العملية', message);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      onError: mutationErrorHandler,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset}>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  </React.StrictMode>,
)
