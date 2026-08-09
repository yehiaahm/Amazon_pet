import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/endpoints';
import { useUIStore } from '../stores/uiStore';
import { usePermissionStore } from '../permissions/permissionStore';
import type { SalesQueryParams } from '../../types/erp';
import type { CatalogQueryParams } from '../api/endpoints';
import { formatMoney } from '../utils/money';

const DEFAULT_CATALOG_PARAMS: CatalogQueryParams = { page: 0, size: 5000, sort: 'name,asc' };

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
  dashboard: ['dashboard'] as const,
  aiInsights: ['aiInsights'] as const,
  auditLogs: ['auditLogs'] as const,
  boardingReservations: ['boardingReservations'] as const,
  purchaseInvoices: ['purchaseInvoices'] as const,
  accountsPayable: ['accountsPayable'] as const,
};

// HOOKS
export function useCatalog(params: CatalogQueryParams = DEFAULT_CATALOG_PARAMS) {
  return useQuery({
    queryKey: ['catalog', params],
    queryFn: () => api.getCatalog(params),
  });
}

export function useProducts(params?: CatalogQueryParams) {
  const merged = { ...DEFAULT_CATALOG_PARAMS, ...params };
  return useQuery({
    queryKey: [...keys.products, merged],
    queryFn: () => api.getProducts(merged),
  });
}

export function useVariants(params?: CatalogQueryParams) {
  const merged = { ...DEFAULT_CATALOG_PARAMS, ...params };
  return useQuery({
    queryKey: [...keys.variants, merged],
    queryFn: () => api.getVariants(merged),
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

export function useLowStockAlerts() {
  return useQuery({
    queryKey: ['lowStock'] as const,
    queryFn: () => api.getLowStockAlerts(),
  });
}

export function useSales(params: SalesQueryParams = { page: 0, size: 50, sort: 'date,desc' }) {
  return useQuery({
    queryKey: [...keys.sales, params],
    queryFn: () => api.getSales(params),
  });
}

/** Convenience accessor for modules that only need the current page of sales. */
export function useSalesContent(params?: SalesQueryParams) {
  const query = useSales(params);
  return {
    ...query,
    data: query.data?.content,
    page: query.data,
  };
}

export function useSale(saleId: string | null) {
  return useQuery({
    queryKey: [...keys.sales, saleId],
    queryFn: () => api.getSale(saleId!),
    enabled: Boolean(saleId),
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

export function useDashboardMetrics() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.getDashboardMetrics(),
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
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      
      addNotification('FINANCE', 'New POS Sale Logged', `Invoice ${newSale.saleNumber} processed successfully (${formatMoney(newSale.totalAmount)}).`);
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
      addNotification('INVENTORY', 'تم إضافة منتج', `تمت إضافة ${newProd.name} إلى الكتالوج.`);
    }
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: {
      variantId: string;
      payload: Parameters<typeof api.updateProduct>[1];
    }) => api.updateProduct(args.variantId, args.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      addNotification('INVENTORY', 'تم تحديث المنتج', 'تم حفظ بيانات المنتج بنجاح.');
    }
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: {
      variantId: string;
      diff: number;
      type: 'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'TRANSFER';
      employeeId: string;
      warehouseId: string;
    }) => api.updateStock(args.variantId, args.diff, args.type, args.employeeId, args.warehouseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.batches });
      queryClient.invalidateQueries({ queryKey: keys.stockMovements });
      queryClient.invalidateQueries({ queryKey: ['fifoValuation'] });
      queryClient.invalidateQueries({ queryKey: ['lowStock'] });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      addNotification('INVENTORY', 'تم تعديل المخزون', 'تم تحديث رصيد الصنف بنجاح.');
    }
  });
}

export function useTransferStock() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: {
      sourceWhId: string;
      targetWhId: string;
      variantId: string;
      quantity: number;
      employeeId: string;
    }) =>
      api.transferStock(
        args.sourceWhId,
        args.targetWhId,
        args.variantId,
        args.quantity,
        args.employeeId
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.batches });
      queryClient.invalidateQueries({ queryKey: keys.stockMovements });
      queryClient.invalidateQueries({ queryKey: ['fifoValuation'] });
      addNotification('INVENTORY', 'تم تحويل المخزون', 'تم نقل الكمية بين المستودعات بنجاح.');
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل التحويل', err?.message || 'تعذر تحويل المخزون.');
    },
  });
}

export function useUpdateVariantPricing() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { variantId: string; price?: number; cost?: number; wholesalePrice?: number }) =>
      api.updateVariantPricing(args.variantId, { price: args.price, cost: args.cost, wholesalePrice: args.wholesalePrice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      addNotification('INVENTORY', 'تم تحديث السعر', 'تم حفظ سعر المنتج في النظام بنجاح.');
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
      addNotification('TASKS', 'تم حجز الموعد', 'تم تسجيل موعد الخدمة بنجاح.');
    }
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (data: { name: string; price: number; durationMinutes: number }) =>
      api.createService(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: keys.services });
      addNotification('TASKS', 'تمت إضافة خدمة', `تم تسجيل الخدمة: ${created.name}`);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل إضافة الخدمة', err?.message || 'تعذر حفظ الخدمة');
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (data: { id: string; name: string; price: number; durationMinutes: number }) =>
      api.updateService(data.id, { name: data.name, price: data.price, durationMinutes: data.durationMinutes }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: keys.services });
      addNotification('TASKS', 'تم تحديث الخدمة', `تم تعديل الخدمة: ${updated.name}`);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل تعديل الخدمة', err?.message || 'تعذر تعديل الخدمة');
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (id: string) => api.deleteService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.services });
      addNotification('TASKS', 'تم حذف الخدمة', 'تم حذف الخدمة من الكتالوج بنجاح.');
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل حذف الخدمة', err?.message || 'تعذر حذف الخدمة');
    },
  });
}

export function useSeedDefaultServices() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: () => api.seedDefaultServices(),
    onSuccess: (services) => {
      queryClient.invalidateQueries({ queryKey: keys.services });
      addNotification('TASKS', 'تم تصفير وإعادة ضبط الخدمات', `تمت إضافة ${services.length} خدمة قياسية للحيوانات الأليفة.`);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل تصفير الخدمات', err?.message || 'تعذر إضافة الخدمات القياسية');
    },
  });
}

export function useFactoryReset() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: () => api.factoryReset(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      queryClient.clear();
      addNotification('TASKS', 'تم تصفير النظام بالكامل', 'تم تصفير كافة البيانات والجداول بنجاح كأول استخدام.');
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل تصفير النظام', err?.message || 'تعذر تصفير النظام');
    },
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
      addNotification('FINANCE', 'Expense Recorded', `Logged ${formatMoney(newExp.amount)} under ${newExp.category}.`);
    }
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (id: string) => api.deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.expenses });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      addNotification('FINANCE', 'Expense Deleted', 'Operational expense has been deleted.');
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

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; customer: Parameters<typeof api.updateCustomer>[1] }) =>
      api.updateCustomer(args.id, args.customer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.customers });
    }
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteCustomer(id),
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
    mutationFn: (args: {
      saleId: string;
      employeeId: string;
      managerPassword?: string;
      managerUsername?: string;
      lines?: Array<{ saleItemId: string; quantity: number }>;
    }) =>
      api.refundSale(args.saleId, args.employeeId, {
        managerPassword: args.managerPassword,
        managerUsername: args.managerUsername,
        lines: args.lines,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.sales });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.stockMovements });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      queryClient.invalidateQueries({ queryKey: keys.aiInsights });
      queryClient.invalidateQueries({ queryKey: keys.auditLogs });
      addNotification('FINANCE', 'تم استرداد وإرجاع فاتورة', 'تم إرجاع البضائع للمخازن وتسجيل المعاملة بنجاح.');
    },
    onError: (err: Error) => {
      addNotification('WARNINGS', 'فشل إرجاع الفاتورة', err.message || 'تعذر إتمام عملية الإرجاع.');
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ['suppliers'],
    queryFn: () => api.getSuppliers(),
  });
}

export function useBoardingReservations() {
  return useQuery({
    queryKey: keys.boardingReservations,
    queryFn: () => api.getBoardingReservations(),
  });
}

export function useCreateBoardingReservation() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (resData: Parameters<typeof api.addBoardingReservation>[0]) => api.addBoardingReservation(resData),
    onSuccess: (newRes) => {
      queryClient.invalidateQueries({ queryKey: keys.boardingReservations });
      addNotification('TASKS', 'حجز إقامة جديد', `تم تسجيل حجز إقامة للأليف ${newRes.petName} بنجاح.`);
    }
  });
}

export function useUpdateBoardingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; status: string }) => api.updateBoardingStatus(args.id, args.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.boardingReservations });
    }
  });
}

export function useDeleteBoardingReservation() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (id: string) => api.deleteBoardingReservation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.boardingReservations });
      addNotification('WARNINGS', 'إلغاء حجز إقامة', 'تم حذف وإلغاء حجز الإقامة بنجاح.');
    }
  });
}

export function useCreatePurchaseInvoice() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore((s) => s.addNotification);

  return useMutation({
    mutationFn: (args: { invoice: Record<string, unknown>; employeeId: string }) =>
      api.createPurchaseInvoice(args.invoice, args.employeeId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseInvoices'] });
      queryClient.invalidateQueries({ queryKey: keys.batches });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.kpis });
      if (!result.warnings?.length) {
        addNotification('INVENTORY', 'فاتورة شراء', 'تم اعتماد فاتورة الشراء.');
      }
    },
  });
}

export function usePurchaseInvoices() {
  return useQuery({
    queryKey: ['purchaseInvoices'],
    queryFn: () => api.getPurchaseInvoices(),
  });
}

export function usePayPurchaseInvoice() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { id: string; amount: number }) => api.payPurchaseInvoice(args.id, args.amount),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['purchaseInvoices'] });
      queryClient.invalidateQueries({ queryKey: keys.accountsPayable });
      addNotification('FINANCE', 'تم تسجيل دفعة للفاتورة', `تم تسجيل سداد بقيمة ${updated.paidAmount} من أصل ${updated.grandTotal} للمورد ${updated.supplierName}.`);
    }
  });
}

export function useAccountsPayableDashboard() {
  return useQuery({
    queryKey: keys.accountsPayable,
    queryFn: () => api.getAccountsPayableDashboard(),
    refetchInterval: 60_000,
  });
}

export function usePayInstallment() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { installmentId: string; amount: number; notes?: string }) =>
      api.payInstallment(args.installmentId, args.amount, args.notes),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: keys.accountsPayable });
      queryClient.invalidateQueries({ queryKey: ['purchaseInvoices'] });
      addNotification('FINANCE', 'تم سداد دفعة', `تم تسجيل سداد للمورد ${result.supplierName}.`);
    },
  });
}

export function useSetInvoiceInstallments() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: {
      invoiceId: string;
      paymentType: 'LUMP_SUM' | 'INSTALLMENTS';
      installments: Array<{ installmentNumber: number; dueDate: string; amount: number; notes?: string }>;
    }) => api.setInvoiceInstallments(args.invoiceId, args.paymentType, args.installments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.accountsPayable });
      queryClient.invalidateQueries({ queryKey: ['purchaseInvoices'] });
      addNotification('FINANCE', 'جدول الدفعات', 'تم تحديث جدول الدفعات بنجاح.');
    },
  });
}

export function useUpdateAccountsPayableSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reminderDaysBeforeDue: number) => api.updateAccountsPayableSettings(reminderDaysBeforeDue),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.accountsPayable });
    },
  });
}

export function useDeleteVariant() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);
  return useMutation({
    mutationFn: (variantId: string) => api.deleteVariant(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
      addNotification('INVENTORY', 'تم حذف المنتج', 'تم حذف الصنف من الكتالوج.');
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل الحذف', err?.message || 'تعذر حذف المنتج.');
    },
  });
}

export function useDeleteBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => api.deleteBatch(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.batches });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
    },
  });
}

export function useEmployeesList() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => api.getEmployees(),
  });
}

export function useAddEmployee() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);
  return useMutation({
    mutationFn: (employee: any) => api.addEmployee(employee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      addNotification('TASKS', 'تم إضافة موظف', 'تم تسجيل حساب الموظف الجديد بنجاح.');
    }
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);
  return useMutation({
    mutationFn: (args: { id: string; fullName?: string; email?: string; role?: string; active?: boolean }) =>
      api.updateEmployee(args.id, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
      addNotification('TASKS', 'تم تحديث الموظف', 'تم تحديث بيانات وصلاحيات الموظف بنجاح.');
    },
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);
  return useMutation({
    mutationFn: (id: string) => api.deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      addNotification('WARNINGS', 'تم حذف الموظف', 'تم إزالة حساب الموظف من النظام.');
    }
  });
}

export function useChangePassword() {
  const addNotification = useUIStore(s => s.addNotification);
  return useMutation({
    mutationFn: (args: { id: string; newPassword: string }) => api.changePassword(args.id, args.newPassword),
    onSuccess: () => {
      addNotification('TASKS', 'تم تغيير كلمة المرور', 'تم تحديث كلمة مرور الموظف بنجاح.');
    }
  });
}

export function useMyPermissions() {
  const setPermissions = usePermissionStore(s => s.setPermissions);
  return useQuery({
    queryKey: ['my-permissions'],
    queryFn: async () => {
      const perms = await api.getMyPermissions();
      if (Array.isArray(perms)) {
        setPermissions(perms);
      }
      return perms;
    },
    enabled: !!localStorage.getItem('token'),
    staleTime: 1000 * 30,
  });
}

// ── ROLES & PERMISSIONS ─────────────────────────────────────────────────────

export function useRolesList() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api.getRoles(),
  });
}

export function usePermissionsCatalog() {
  return useQuery({
    queryKey: ['permissions-catalog'],
    queryFn: () => api.getPermissionsCatalog(),
  });
}

export function useRoleDetail(roleId: string | null) {
  return useQuery({
    queryKey: ['roles', roleId],
    queryFn: () => api.getRole(roleId!),
    enabled: !!roleId,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: { code: string; name: string; description?: string }) => api.createRole(role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissionCodes }: { roleId: string; permissionCodes: string[] }) =>
      api.updateRolePermissions(roleId, permissionCodes),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', vars.roleId] });
      queryClient.invalidateQueries({ queryKey: ['my-permissions'] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRole(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useBarcodeSettings() {
  return useQuery({
    queryKey: ['barcodeSettings'],
    queryFn: () => api.getBarcodeSettings(),
  });
}

export function useUpdateBarcodeSettings() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (settings: any) => api.updateBarcodeSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['barcodeSettings'] });
      addNotification('TASKS', 'تم حفظ الإعدادات', 'تم تحديث إعدادات الباركود والملصقات بنجاح.');
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل حفظ الإعدادات', err?.message || 'تعذر تحديث إعدادات الباركود.');
    }
  });
}

export function useGenerateBarcode() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { variantId: string; format: string; force?: boolean }) => 
      api.generateBarcode(args.variantId, args.format, args.force ?? false),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
      addNotification('TASKS', 'تم توليد الباركود', `تم إنشاء الباركود بنجاح: ${res.barcode}`);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل توليد الباركود', err?.message || 'تعذر إنشاء الباركود.');
    }
  });
}

export function useUpdateCustomBarcode() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { variantId: string; customBarcode: string; format?: string }) => 
      api.updateCustomBarcode(args.variantId, args.customBarcode, args.format),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
      addNotification('TASKS', 'تم تحديث الباركود المخصص', `تم حفظ الباركود الجديد بنجاح: ${res.barcode}`);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل تحديث الباركود', err?.message || 'تعذر حفظ الباركود المخصص.');
    }
  });
}

export function useClearBarcode() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (variantId: string) => api.clearBarcode(variantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.variants });
      queryClient.invalidateQueries({ queryKey: keys.products });
      addNotification('TASKS', 'تم حذف الباركود', 'تم مسح باركود المنتج بنجاح.');
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل حذف الباركود', err?.message || 'تعذر حذف باركود المنتج.');
    }
  });
}

// ── SMART EXCEL IMPORT ────────────────────────────────────────────────────

export function useUploadImportSession() {
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (file: File) => api.uploadImportSession(file),
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل رفع الملف', err?.message || 'تعذر قراءة الملف.');
    }
  });
}

export function useConfirmImportMapping() {
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { sessionId: string; mapping: Record<string, string>; autoCreateSupplier: boolean; priceBelowCostIsWarningOnly: boolean }) =>
      api.confirmImportMapping(args.sessionId, args.mapping, {
        autoCreateSupplier: args.autoCreateSupplier,
        priceBelowCostIsWarningOnly: args.priceBelowCostIsWarningOnly,
      }),
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل ربط الأعمدة', err?.message || 'تعذر التحقق من صحة الملف.');
    }
  });
}

export function useImportPreview(sessionId: string | null, params: { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['importPreview', sessionId, params],
    queryFn: () => api.getImportPreview(sessionId as string, params),
    enabled: !!sessionId,
  });
}

export function useResolveImportDuplicates() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (args: { sessionId: string; itemIds: string[]; resolution: string }) =>
      api.resolveImportDuplicates(args.sessionId, args.itemIds, args.resolution),
    onSuccess: (_, args) => {
      queryClient.invalidateQueries({ queryKey: ['importPreview', args.sessionId] });
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل تحديث إجراء التكرارات', err?.message || 'تعذر حفظ الاختيار.');
    }
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  const addNotification = useUIStore(s => s.addNotification);

  return useMutation({
    mutationFn: (sessionId: string) => api.commitImport(sessionId),
    onSuccess: (summary) => {
      queryClient.invalidateQueries({ queryKey: keys.products });
      queryClient.invalidateQueries({ queryKey: keys.variants });
      addNotification('INVENTORY', 'اكتمل الاستيراد',
        `تم استيراد ${summary.imported}، تحديث ${summary.updated}، تخطي ${summary.skipped}، فشل ${summary.failed}.`);
    },
    onError: (err: any) => {
      addNotification('WARNINGS', 'فشل تنفيذ الاستيراد', err?.message || 'تعذر إتمام عملية الاستيراد.');
    }
  });
}



