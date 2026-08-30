import { QueryClient } from '@tanstack/react-query';
import { useUIStore } from '../stores/uiStore';

function mutationErrorHandler(error: unknown) {
  const message = error instanceof Error ? error.message : 'فشلت العملية';
  useUIStore.getState().addNotification('WARNINGS', 'خطأ في العملية', message);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error instanceof Error && (error.message.includes('403') || error.message.includes('401') || error.message.includes('HTTP 403') || error.message.includes('HTTP 401'))) {
          return false;
        }
        return failureCount < 1;
      },
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      onError: mutationErrorHandler,
    },
  },
});
