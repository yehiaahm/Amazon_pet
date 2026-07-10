import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { useUIStore } from '../stores/uiStore';

// QUERY KEYS
export const keys = {
  products: ['products'] as const,
  variants: ['variants'] as const,
  batches: ['batches'] as const,
  warehouses: ['warehouses'] as const,
  stockMovements: ['stockMovements'] as const,
  sales: ['sales'] as const,
  customers: ['customers'] as const,
  pets: ['pets'] as const,
  services: ['services'] as const,
  appointments: ['appointments'] as const,
  expenses: ['expenses'] as const,
  dailyClosings: ['dailyClosings'] as const,
  kpis: ['kpis'] as const,
  aiInsights: ['aiInsights'] as const,
  auditLogs: ['auditLogs'] as const,
};

// HOOKS
export function useProducts() {
  return useQuery({
    queryKey: keys.products,
    queryFn: () => api.getProducts(),
  });
}

export function useVariants() {
  return useQuery({
    queryKey: keys.variants,
    queryFn: () => api.getVariants(),
  });
}

export function useBatches() {
  return useQuery({
    queryKey: keys.batches,
    queryFn: () => api.getBatches(),
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: keys.warehouses,
    queryFn: () => api.getWarehouses(),
  });
}

export function useStockMovements() {
  return useQuery({
    queryKey: keys.stockMovements,
    queryFn: () => api.getStockMovements(),
  });
}

export function useSales() {
  return useQuery({
    queryKey: keys.sales,
    queryFn: () => api.getSales(),
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: keys.customers,
    queryFn: () => api.getCustomers(),
  });
}

export function usePets() {
  return useQuery({
    queryKey: keys.pets,
    queryFn: () => api.getPets(),
  });
}

export function useServices() {
  return useQuery({
    queryKey: keys.services,
    queryFn: () => api.getServices(),
  });
}

export function useAppointments() {
  return useQuery({
    queryKey: keys.appointments,
    queryFn: () => api.getAppointments(),
  });
}

export function useExpenses() {
  return useQuery({
    queryKey: keys.expenses,
    queryFn: () => api.getExpenses(),
  });
}

export function useDailyClosings() {
  return useQuery({
    queryKey: keys.dailyClosings,
    queryFn: () => api.getDailyClosings(),
  });
}

export function useKPIMetrics() {
  return useQuery({
    queryKey: keys.kpis,
    queryFn: () => api.getKPIMetrics(),
  });
}

export function useAIInsights() {
  return useQuery({
    queryKey: keys.aiInsights,
    queryFn: () => api.getAIInsights(),
  });
}

// MUTATIONS
export function useCreateSale() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (saleData: Parameters<typeof api.createSale>[0]) => api.createSale(saleData),
    onSuccess: (newSale) => {
      // Invalidate queries to refresh UI data
      queryClient.invalidateQueries({ queryKey: keys.sales });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      
      addNotification('FINANCE', 'New POS Sale Logged', `Invoice ${newSale.saleNumber} processed successfully ($${newSale.totalAmount}).`);
      
      // Stock warning alerts checked in background via BRE logic simulation
      newSale.items.forEach(async item => {
        if (item.type === 'PRODUCT') {
          const variants = await api.getVariants();
          const variant = variants.find(v => v.id === item.itemId);
          const products = await api.getProducts();
          const product = products.find(p => p.id === variant?.productId);
          if (variant && product && variant.stockQuantity < product.minStockLimit) {
            addNotification('INVENTORY', 'Low Stock Alert', `${product.name} (${variant.name}) has fallen below minimum stock limits.`);
          }
        }
      });
    }
  });
}

export function useAddProduct() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { product: Parameters<typeof api.addProduct>[0]; variant: Parameters<typeof api.addProduct>[1] }) => 
      api.addProduct(args.product, args.variant),
    onSuccess: (newProd) => {
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      addNotification('INVENTORY', 'Product Created', `New product ${newProd.name} added to catalog.`);
    }
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { variantId: string; diff: number; type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER'; employeeId: string }) => 
      api.updateStock(args.variantId, args.diff, args.type, args.employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      addNotification('INVENTORY', 'Stock Adjustment Executed', `Variant stock level updated.`);
    }
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (aptData: Parameters<typeof api.createAppointment>[0]) => api.createAppointment(aptData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.appointments });
      addNotification('TASKS', 'Grooming Appointment Scheduled', `New grooming session booked.`);
    }
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' }) => 
      api.updateAppointmentStatus(args.id, args.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.appointments });
    }
  });
}

export function useAddExpense() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (expData: Parameters<typeof api.addExpense>[0]) => api.addExpense(expData),
    onSuccess: (newExp) => {
      queryClient.invalidateQueries({ queryKey: keys.expenses });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      addNotification('FINANCE', 'Expense Recorded', `Logged $${newExp.amount} under ${newExp.category}.`);
    }
  });
}

export function useAddCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { customer: Parameters<typeof api.addCustomer>[0]; pet?: Parameters<typeof api.addCustomer>[1] }) => 
      api.addCustomer(args.customer, args.pet),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.customers });
      queryClient.invalidateQueries({ queryKey: keys.pets });
    }
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: keys.auditLogs,
    queryFn: () => api.getAuditLogs(),
  });
}

export function useRefundSale() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);
  return useMutation({
    mutationFn: (args: { saleId: string; employeeId: string }) => api.refundSale(args.saleId, args.employeeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sales });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.stockMovements });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      queryClient.invalidateQueries({ queryKey: keys.auditLogs });
      addNotification('FINANCE', 'تم استرداد وإرجاع فاتورة', 'تم إرجاع البضائع للمخازن وتسجيل المعاملة بنجاح في سجل تدقيق العمليات.');
    }
  });
}
