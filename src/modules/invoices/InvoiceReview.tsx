import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  useSales, useSale, useCustomers, useRefundSale, useVariants, useProducts, useServices, useEmployeesList
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import {
  saleRevenue,
  isCompletedSale,
  isFullyRefundedSale,
  saleStatusLabel,
  saleStatusBadgeVariant,
  saleLineReturnableQuantity,
} from '../../core/utils/saleFinance';
import type { SalesQueryParams } from '../../types/erp';
import { api } from '../../core/api/endpoints';
import SaleBatchAllocationsPanel from '../../components/sales/SaleBatchAllocationsPanel';
import { formatMoney } from '../../core/utils/money';
import { 
  Search, User, UserCheck, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Printer, FileText, Share2, Trash2, ArrowLeftRight,
  Sparkles, AlertTriangle, Clock,
  Download, Send
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import {
  buildAmazonPetInvoiceHtml,
  printAmazonPetInvoice,
  saleToInvoiceData,
} from '../../core/pos/amazonPetInvoice';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';
import {
  hasRestrictedSalesScope,
  needsManagerApprovalForRefund,
} from '../../core/permissions/salesAuth';

export const InvoiceReview: React.FC = () => {
  const currentEmployee = useUIStore(s => s.currentEmployee)!;
  const { hasPermission } = usePermissions();
  const restrictedSalesScope = hasRestrictedSalesScope(hasPermission);
  const canRefundSales = hasPermission(PERMISSIONS.SALES_REFUND);
  const canPrintThermal = hasPermission(PERMISSIONS.SALES_THERMAL);
  const canPrintA4 = hasPermission(PERMISSIONS.SALES_A4);
  const { data: customers } = useCustomers();
  const { data: variants } = useVariants();
  const { data: products } = useProducts();
  const { data: services } = useServices();
  const { mutate: triggerRefund, isPending: isRefunding } = useRefundSale();
  const addNotification = useUIStore(s => s.addNotification);

  // States
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  
  // Search Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCashier, setFilterCashier] = useState('ALL');
  const [filterPayMethod, setFilterPayMethod] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Pagination & Sorting
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const sortField = 'date';
  const sortOrder = 'desc';

  // Share & Modal states
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareType, setShareType] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP');
  const [shareInput, setShareInput] = useState('');
  const [managerCode, setManagerCode] = useState('');
  const [showManagerAuthModal, setShowManagerAuthModal] = useState(false);
  const [showRefundConfirmModal, setShowRefundConfirmModal] = useState(false);
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});

  const localDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const toIsoStart = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const toIsoEnd = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  const salesQueryParams = useMemo((): SalesQueryParams => {
    const params: SalesQueryParams = {
      page: currentPage - 1,
      size: pageSize,
      sort: `${sortField},${sortOrder}`,
    };
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (!restrictedSalesScope && filterCashier !== 'ALL') params.employee = filterCashier;
    if (filterPayMethod !== 'ALL') params.paymentMethod = filterPayMethod;
    if (filterStatus !== 'ALL') params.status = filterStatus;

    const now = new Date();
    const effectiveQuickFilter = restrictedSalesScope ? 'TODAY' : quickFilter;

    if (!restrictedSalesScope && dateFrom) {
      params.dateFrom = toIsoStart(dateFrom);
    } else if (effectiveQuickFilter === 'TODAY') {
      params.dateFrom = toIsoStart(localDateStr(now));
      params.dateTo = toIsoEnd(localDateStr(now));
    } else if (effectiveQuickFilter === 'YESTERDAY') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      params.dateFrom = toIsoStart(localDateStr(y));
      params.dateTo = toIsoEnd(localDateStr(y));
    } else if (effectiveQuickFilter === 'WEEK') {
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      params.dateFrom = toIsoStart(localDateStr(startOfWeek));
    } else if (effectiveQuickFilter === 'MONTH') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      params.dateFrom = toIsoStart(localDateStr(startOfMonth));
    }

    if (!restrictedSalesScope && dateTo) {
      params.dateTo = toIsoEnd(dateTo);
    }

    return params;
  }, [
    currentPage,
    pageSize,
    sortField,
    sortOrder,
    searchQuery,
    filterCashier,
    filterPayMethod,
    filterStatus,
    quickFilter,
    dateFrom,
    dateTo,
    restrictedSalesScope,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCashier, filterPayMethod, filterStatus, quickFilter, dateFrom, dateTo, pageSize]);

  const { data: salesPage, isLoading: salesLoading } = useSales(salesQueryParams);
  const { data: employeesList } = useEmployeesList();
  const { data: selectedSaleDetail } = useSale(selectedSaleId);

  const uniqueEmployees = useMemo(() => {
    return (employeesList || []).map(e => ({
      id: e.id,
      fullName: e.fullName || e.username || 'موظف',
    }));
  }, [employeesList]);

  const filteredSales = useMemo(() => {
    let result = salesPage?.content ?? [];
    if (minAmount) {
      result = result.filter(s => s.totalAmount >= parseFloat(minAmount));
    }
    if (maxAmount) {
      result = result.filter(s => s.totalAmount <= parseFloat(maxAmount));
    }
    return result;
  }, [salesPage, minAmount, maxAmount]);

  // 2. DASHBOARD METRICS (current page snapshot)
  const stats = useMemo(() => {
    const totalCount = salesPage?.totalElements ?? filteredSales.length;
    const completedSales = filteredSales.filter(isCompletedSale);
    const refundedSales = filteredSales.filter(s => s.status === 'REFUNDED');
    const partialRefunds = filteredSales.filter(s => s.status === 'PARTIALLY_REFUNDED');

    const totalSalesVal = completedSales.reduce((acc, s) => acc + saleRevenue(s), 0);
    const refundsVal = refundedSales.reduce(
      (acc, s) => acc + (Number(s.totalAmount) || 0) - (Number(s.tax) || 0),
      0
    );
    const avgInvoiceVal = completedSales.length > 0 ? (totalSalesVal / completedSales.length) : 0;
    const refundsCount = refundedSales.length;
    const partialRefundsCount = partialRefunds.length;

    // Top Customer
    const customerSpent: Record<string, number> = {};
    completedSales.forEach(s => {
      if (s.customerId) {
        customerSpent[s.customerId] = (customerSpent[s.customerId] || 0) + saleRevenue(s);
      }
    });
    let topCustName = 'لا يوجد';
    let topCustId = '';
    let maxSpent = 0;
    Object.entries(customerSpent).forEach(([id, spent]) => {
      if (spent > maxSpent) {
        maxSpent = spent;
        topCustId = id;
      }
    });
    if (topCustId) {
      topCustName = customers?.find(c => c.id === topCustId)?.name || 'عميل معروف';
    }

    // Top Cashier
    const cashierSales: Record<string, number> = {};
    completedSales.forEach(s => {
      cashierSales[s.employeeId] = (cashierSales[s.employeeId] || 0) + saleRevenue(s);
    });
    let topCashierName = 'لا يوجد';
    let topCashierId = '';
    let maxCashierSales = 0;
    Object.entries(cashierSales).forEach(([id, salesVal]) => {
      if (salesVal > maxCashierSales) {
        maxCashierSales = salesVal;
        topCashierId = id;
      }
    });
    if (topCashierId) {
      topCashierName = completedSales.find(s => s.employeeId === topCashierId)?.employeeFullName || 'موظف';
    }

    return {
      totalCount,
      totalSalesVal,
      refundsCount,
      partialRefundsCount,
      refundsVal,
      avgInvoiceVal,
      topCustName,
      topCashierName,
      maxSpent
    };
  }, [filteredSales, customers, salesPage?.totalElements]);

  const paginatedSales = filteredSales;
  const totalPages = salesPage?.totalPages ?? 1;

  const selectedSale = useMemo(() => {
    if (selectedSaleDetail) return selectedSaleDetail;
    if (!selectedSaleId && filteredSales.length > 0) {
      return filteredSales[0];
    }
    return filteredSales.find(s => s.id === selectedSaleId) || filteredSales[0] || null;
  }, [selectedSaleId, filteredSales, selectedSaleDetail]);

  // Sync selected sale ID when it changes
  useEffect(() => {
    if (selectedSale && selectedSale.id !== selectedSaleId) {
      setSelectedSaleId(selectedSale.id);
    }
  }, [selectedSale, selectedSaleId]);

  const { data: selectedBatchAllocations, isLoading: loadingBatchAlloc } = useQuery({
    queryKey: ['saleBatchAllocations', selectedSale?.id],
    queryFn: () => api.getSaleBatchAllocations(selectedSale!.id),
    enabled: !!selectedSale?.id,
  });

  useEffect(() => {
    if (!showRefundConfirmModal || !selectedSale?.items) return;
    const initial: Record<string, number> = {};
    selectedSale.items
      .filter((i) => i.type === 'PRODUCT')
      .forEach((i) => {
        initial[i.id] = saleLineReturnableQuantity(i);
      });
    setRefundQuantities(initial);
  }, [showRefundConfirmModal, selectedSale]);

  // KEYBOARD NAVIGATION:
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedSale || filteredSales.length === 0) return;
      const currentIndex = filteredSales.findIndex(s => s.id === selectedSale.id);

      if (e.key === 'ArrowRight') {
        // Next invoice (since list is RTL/reversed chronologically, Previous date is Next index)
        if (currentIndex < filteredSales.length - 1) {
          e.preventDefault();
          const nextSale = filteredSales[currentIndex + 1];
          setSelectedSaleId(nextSale.id);
        }
      } else if (e.key === 'ArrowLeft') {
        // Previous invoice
        if (currentIndex > 0) {
          e.preventDefault();
          const prevSale = filteredSales[currentIndex - 1];
          setSelectedSaleId(prevSale.id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSale, filteredSales, pageSize]);

  // Detail Navigation Actions
  const handleGoToFirst = () => {
    if (filteredSales.length > 0) {
      setSelectedSaleId(filteredSales[0].id);
      setCurrentPage(1);
    }
  };

  const handleGoToLast = () => {
    if (filteredSales.length > 0) {
      setSelectedSaleId(filteredSales[filteredSales.length - 1].id);
      setCurrentPage(totalPages);
    }
  };

  const handleGoToPrev = () => {
    if (!selectedSale) return;
    const idx = filteredSales.findIndex(s => s.id === selectedSale.id);
    if (idx > 0) {
      setSelectedSaleId(filteredSales[idx - 1].id);
      // adjust page if needed
      const targetPage = Math.floor((idx - 1) / pageSize) + 1;
      if (targetPage !== currentPage) setCurrentPage(targetPage);
    }
  };

  const handleGoToNext = () => {
    if (!selectedSale) return;
    const idx = filteredSales.findIndex(s => s.id === selectedSale.id);
    if (idx < filteredSales.length - 1) {
      setSelectedSaleId(filteredSales[idx + 1].id);
      // adjust page if needed
      const targetPage = Math.floor((idx + 1) / pageSize) + 1;
      if (targetPage !== currentPage) setCurrentPage(targetPage);
    }
  };

  // Operations — resolve full product name from catalog (old sales may store variant-only names)
  const resolveInvoiceItemName = (item: { name?: string; itemId?: string; type?: string }) => {
    if (item.type === 'SERVICE' || services?.some((s) => s.id === item.itemId)) {
      return services?.find((s) => s.id === item.itemId)?.name;
    }
    const variant = variants?.find((v) => v.id === item.itemId);
    if (!variant) return undefined;
    const prod = products?.find((p) => p.id === variant.productId);
    if (prod?.name && variant.name && prod.name !== variant.name) {
      return `${prod.name} (${variant.name})`;
    }
    return prod?.name || variant.name;
  };

  const handleReprint = (_type: 'A4' | 'THERMAL') => {
    if (!selectedSale) return;
    const cust = customers?.find((c) => c.id === selectedSale.customerId);
    const cashier =
      selectedSale.employeeFullName ||
      currentEmployee.fullName ||
      'Cashier';
    printAmazonPetInvoice(
      saleToInvoiceData({
        sale: selectedSale,
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone,
        cashierName: cashier,
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
    addNotification(
      'FINANCE',
      'إعادة طباعة الفاتورة',
      `تم إرسال أمر الطباعة للفاتورة ${selectedSale.saleNumber}.`
    );
  };

  const selectedInvoiceHtml = useMemo(() => {
    if (!selectedSale) return '';
    const cust = customers?.find((c) => c.id === selectedSale.customerId);
    const cashier =
      selectedSale.employeeFullName ||
      currentEmployee.fullName ||
      'Cashier';
    return buildAmazonPetInvoiceHtml(
      saleToInvoiceData({
        sale: selectedSale,
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone,
        cashierName: cashier,
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
  }, [selectedSale, customers, currentEmployee, variants, products, services]);

  const handleDownloadPDF = () => {
    addNotification('WARNINGS', 'غير متاح بعد', 'تصدير PDF غير متاح بعد.');
  };

  const handleShare = (type: 'WHATSAPP' | 'EMAIL') => {
    if (!selectedSale) return;
    setShareType(type);
    const defaultVal = type === 'WHATSAPP' 
      ? (customers?.find(c => c.id === selectedSale.customerId)?.phone || '')
      : (customers?.find(c => c.id === selectedSale.customerId)?.email || '');
    setShareInput(defaultVal);
    setShowShareModal(true);
  };

  const handleConfirmShare = () => {
    addNotification('WARNINGS', 'غير متاح بعد', shareType === 'WHATSAPP'
      ? 'إرسال واتساب غير متاح بعد.'
      : 'إرسال البريد الإلكتروني غير متاح بعد.');
    setShowShareModal(false);
  };

  const handleRefundClick = () => {
    if (!selectedSale || isFullyRefundedSale(selectedSale) || isRefunding) return;

    if (needsManagerApprovalForRefund(hasPermission)) {
      setManagerCode('');
      setShowManagerAuthModal(true);
      return;
    }

    setShowRefundConfirmModal(true);
  };

  const executeRefund = () => {
    if (!selectedSale) return;
    if (isFullyRefundedSale(selectedSale)) {
      setShowRefundConfirmModal(false);
      addNotification('FINANCE', 'فاتورة مرتجعة', `الفاتورة ${selectedSale.saleNumber} مرتجعة بالكامل.`);
      return;
    }

    const lines = Object.entries(refundQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));

    if (lines.length === 0) {
      addNotification('WARNINGS', 'إرجاع', 'حدد كمية واحدة على الأقل للإرجاع.');
      return;
    }

    triggerRefund(
      {
        saleId: selectedSale.id,
        employeeId: currentEmployee.id,
        lines,
        ...(needsManagerApprovalForRefund(hasPermission)
          ? {
              managerPassword: managerCode,
            }
          : {}),
      },
      {
        onSuccess: (result) => {
          setShowRefundConfirmModal(false);
          setShowManagerAuthModal(false);
          setManagerCode('');
          if (result?.sale?.id) {
            setSelectedSaleId(result.sale.id);
          }
          if (filterStatus === 'COMPLETED') {
            setFilterStatus('ALL');
          }
        },
        onError: (err: Error) => {
          const msg = err.message || '';
          if (msg.includes('مرتجعة') || msg.includes('REFUNDED')) {
            setShowRefundConfirmModal(false);
            setFilterStatus('ALL');
          }
        },
      }
    );
  };

  const handleManagerAuthSubmit = () => {
    if (!managerCode.trim()) {
      addNotification('WARNINGS', 'رمز مطلوب', 'يرجى إدخال رمز المدير للموافقة على الإرجاع.');
      return;
    }
    // Do not accept weak pins client-side — backend validates managerPassword
    setShowManagerAuthModal(false);
    setShowRefundConfirmModal(true);
  };

  const handleDuplicate = () => {
    addNotification('WARNINGS', 'غير متاح بعد', 'نسخ الفاتورة غير متاح بعد.');
  };

  const handleExchange = () => {
    addNotification('WARNINGS', 'غير متاح بعد', 'استبدال السلع غير متاح بعد.');
  };

  return (
    <div className="workspace" style={{ direction: 'rtl', padding: 'var(--spacing-4)', gap: 'var(--spacing-4)' }}>
      {/* 1. TOP HEADER & METRICS SUMMARY (Requirement 11) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'bold' }}>
            {restrictedSalesScope ? 'فواتيري اليوم' : 'مراجعة وتدقيق الفواتير والعمليات'}
          </h1>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {restrictedSalesScope
              ? 'تعرض فقط الفواتير التي بعتها اليوم. لا يمكن عرض فواتير أيام سابقة أو فواتير كاشير آخر.'
              : 'شاشة مركزية متقدمة للبحث، الفلترة، ومراجعة الفواتير المصدرة من نقطة البيع لجميع الورديات.'}
          </p>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--spacing-3)' }}>
        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--color-primary-light)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--color-primary)' }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>إجمالي الفواتير</div>
            <strong style={{ fontSize: 'var(--font-size-base)' }}>{stats.totalCount} فاتورة</strong>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--color-success-light)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--color-success)' }}>
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>إجمالي المبيعات النشطة</div>
            <strong style={{ fontSize: 'var(--font-size-base)' }}>{formatMoney(stats.totalSalesVal)}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--color-danger-light)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)' }}>
            <ArrowLeftRight size={20} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>عدد المرتجعات</div>
            <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-danger)' }}>
              {stats.refundsCount} فواتير ({formatMoney(stats.refundsVal)})
            </strong>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--color-info-light)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--color-info)' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>متوسط قيمة الفاتورة</div>
            <strong style={{ fontSize: 'var(--font-size-base)' }}>{formatMoney(stats.avgInvoiceVal)}</strong>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'var(--color-warning-light)', padding: '8px', borderRadius: 'var(--radius-md)', color: 'var(--color-warning)' }}>
            <User size={20} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>أعلى عميل شراءً</div>
            <strong style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }}>
              {stats.topCustName}
            </strong>
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
          <div style={{ backgroundColor: 'purple', padding: '8px', borderRadius: 'var(--radius-md)', color: '#fff' }}>
            <UserCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>أعلى كاشير مبيعاً</div>
            <strong style={{ fontSize: '11px', fontWeight: 'bold', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100px' }}>
              {stats.topCashierName}
            </strong>
          </div>
        </div>
      </div>

      {/* 2. ADVANCED FILTERS PANEL (Requirement 1) */}
      <div className="card" style={{ padding: 'var(--spacing-4)', gap: 'var(--spacing-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: restrictedSalesScope ? '2fr 1fr 1fr' : '2fr 1fr 1fr 1fr 1.5fr', gap: 'var(--spacing-3)' }}>
          {/* Main search input */}
          <div style={{ position: 'relative' }}>
            <Search 
              size={16} 
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} 
            />
            <input
              placeholder="ابحث برقم الفاتورة، اسم العميل، هاتفه، صنف، باركود..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', paddingRight: '32px' }}
            />
          </div>

          {/* Cashier Filter — owner/manager only */}
          {!restrictedSalesScope && (
            <select value={filterCashier} onChange={(e) => { setFilterCashier(e.target.value); setCurrentPage(1); }}>
              <option value="ALL">جميع الكاشيرات</option>
              {uniqueEmployees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          )}

          {/* Payment Method Filter */}
          <select value={filterPayMethod} onChange={(e) => { setFilterPayMethod(e.target.value); setCurrentPage(1); }}>
            <option value="ALL">جميع طرق الدفع</option>
            <option value="CASH">نقدي</option>
            <option value="CARD">بطاقة بنكية</option>
            <option value="MOBILE">دفع إلكتروني</option>
          </select>

          {/* Status Filter */}
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
            <option value="ALL">جميع الحالات</option>
            <option value="COMPLETED">مكتملة</option>
            <option value="PARTIALLY_REFUNDED">مرتجع جزئي</option>
            <option value="REFUNDED">مرتجعة / ملغية</option>
          </select>

          {/* Date range quick filters — owner/manager only */}
          {!restrictedSalesScope && (
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['ALL', 'TODAY', 'YESTERDAY', 'WEEK', 'MONTH'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => { setQuickFilter(tab); setCurrentPage(1); }}
                  className="btn-ghost"
                  style={{
                    fontSize: '9px',
                    padding: '4px 6px',
                    backgroundColor: quickFilter === tab ? 'var(--color-primary-light)' : 'transparent',
                    color: quickFilter === tab ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    border: quickFilter === tab ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    flex: 1
                  }}
                >
                  {tab === 'ALL' ? 'الكل' : tab === 'TODAY' ? 'اليوم' : tab === 'YESTERDAY' ? 'أمس' : tab === 'WEEK' ? 'أسبوع' : 'شهر'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detailed range filters (Date & Amount) */}
        <div style={{ display: 'flex', gap: 'var(--spacing-4)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--spacing-3)', flexWrap: 'wrap', alignItems: 'center' }}>
          {!restrictedSalesScope && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>تاريخ من:</span>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} style={{ padding: '3px 8px', fontSize: 'var(--font-size-xs)' }} />
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>إلى:</span>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} style={{ padding: '3px 8px', fontSize: 'var(--font-size-xs)' }} />
            </div>
          )}
          {restrictedSalesScope && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
              النطاق: <strong style={{ color: 'var(--color-primary)' }}>فواتيري اليوم فقط</strong>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>القيمة من (ج.م):</span>
            <input type="number" placeholder="0.00" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setCurrentPage(1); }} style={{ width: '80px', padding: '3px 8px' }} />
            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>إلى (ج.م):</span>
            <input type="number" placeholder="9999" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setCurrentPage(1); }} style={{ width: '80px', padding: '3px 8px' }} />
          </div>

          {/* Reset button */}
          <Button
            onClick={() => {
              setSearchQuery('');
              setFilterCashier('ALL');
              setFilterPayMethod('ALL');
              setFilterStatus('ALL');
              setQuickFilter('ALL');
              setDateFrom('');
              setDateTo('');
              setMinAmount('');
              setMaxAmount('');
              setCurrentPage(1);
            }}
            variant="secondary"
            size="sm"
            style={{ marginRight: 'auto', padding: '4px 12px' }}
          >
            إعادة تعيين الفلاتر
          </Button>
        </div>
      </div>

      {/* 3. SPLIT WORKSPACE: TABLE vs DETAILED PREVIEW */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--spacing-4)', height: '550px', alignItems: 'stretch' }}>
        
        {/* LEFT COLUMN: PROFESSIONAL TABLE (Requirement 2 & 8) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table className="erp-table" style={{ width: '100%', direction: 'rtl', borderCollapse: 'collapse', textAlign: 'right' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 10 }}>
                  <th style={{ textAlign: 'right', padding: '12px var(--spacing-4)' }}>رقم الفاتورة</th>
                  <th style={{ textAlign: 'right' }}>التاريخ والوقت</th>
                  <th style={{ textAlign: 'right' }}>العميل</th>
                  <th style={{ textAlign: 'right' }}>الكاشير</th>
                  <th style={{ textAlign: 'right' }}>طريقة الدفع</th>
                  <th style={{ textAlign: 'right' }}>الحالة</th>
                  <th style={{ textAlign: 'left', paddingLeft: '24px' }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {salesLoading ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--spacing-6)' }}>
                      <div className="skeleton" style={{ height: '30px', margin: '8px 0' }} />
                      <div className="skeleton" style={{ height: '30px', margin: '8px 0' }} />
                      <div className="skeleton" style={{ height: '30px', margin: '8px 0' }} />
                    </td>
                  </tr>
                ) : paginatedSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-secondary)' }}>
                      لا توجد فواتير مطابقة لمعايير البحث والفلترة المحددة.
                    </td>
                  </tr>
                ) : (
                  paginatedSales.map((s) => {
                    const isSelected = selectedSale?.id === s.id;
                    const customer = customers?.find(c => c.id === s.customerId);
                    const cashierName = s.employeeFullName;
                    const statusVariant = saleStatusBadgeVariant(s.status);

                    return (
                      <tr 
                        key={s.id} 
                        onClick={() => setSelectedSaleId(s.id)}
                        className={isSelected ? 'selected' : ''}
                        style={{ 
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--color-primary-light)' : 'transparent',
                          transition: 'background-color var(--transition-fast)'
                        }}
                      >
                        <td style={{ fontWeight: 'bold', padding: '10px var(--spacing-4)', color: isSelected ? 'var(--color-primary)' : 'inherit' }}>
                          {s.saleNumber}
                        </td>
                        <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          {new Date(s.date).toLocaleString('ar-EG')}
                        </td>
                        <td>
                          {customer ? (
                            <div>
                              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>{customer.name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{customer.phone}</div>
                            </div>
                          ) : 'عميل نقدي سريع'}
                        </td>
                        <td style={{ fontSize: 'var(--font-size-xs)' }}>
                          {cashierName || 'موظف'}
                        </td>
                        <td>
                          <Badge variant="gray" style={{ fontSize: '10px', padding: '2px 6px' }}>
                            {s.paymentMethod === 'CASH' ? 'نقدي' : s.paymentMethod === 'CARD' ? 'بطاقة' : 'دفع إلكتروني'}
                          </Badge>
                        </td>
                        <td>
                          <Badge variant={statusVariant}>
                            {saleStatusLabel(s.status)}
                          </Badge>
                        </td>
                        <td style={{ textAlign: 'left', paddingLeft: '24px', fontWeight: 'bold' }}>
                          {formatMoney(saleRevenue(s) || s.totalAmount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION TOOLBAR */}
          <div style={{ 
            padding: 'var(--spacing-3) var(--spacing-4)', 
            borderTop: '1px solid var(--color-border)', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backgroundColor: 'var(--color-surface)',
            fontSize: 'var(--font-size-xs)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>إظهار</span>
              <select 
                value={pageSize} 
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                style={{ padding: '2px 4px' }}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span>سجلات من إجمالي <strong>{salesPage?.totalElements ?? filteredSales.length}</strong></span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
              <button 
                onClick={() => setCurrentPage(1)} 
                disabled={currentPage === 1}
                className="btn-secondary" 
                style={{ padding: '4px 8px' }}
              >
                <ChevronsRight size={14} />
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                disabled={currentPage === 1}
                className="btn-secondary" 
                style={{ padding: '4px 8px' }}
              >
                <ChevronRight size={14} />
              </button>
              <span>صفحة <strong>{currentPage}</strong> من <strong>{totalPages}</strong></span>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                disabled={currentPage === totalPages}
                className="btn-secondary" 
                style={{ padding: '4px 8px' }}
              >
                <ChevronLeft size={14} />
              </button>
              <button 
                onClick={() => setCurrentPage(totalPages)} 
                disabled={currentPage === totalPages}
                className="btn-secondary" 
                style={{ padding: '4px 8px' }}
              >
                <ChevronsLeft size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILED INVOICE REPORT PANEL (Requirement 3, 4, 5, 6) */}
        <div className="card" style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedSale ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              
              {/* Toolbar & Actions */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(5, 1fr)', 
                gap: '4px', 
                borderBottom: '1px solid var(--color-border)', 
                paddingBottom: 'var(--spacing-2)',
                marginBottom: 'var(--spacing-2)'
              }}>
                {canPrintThermal && (
                  <button onClick={() => handleReprint('THERMAL')} className="btn-secondary" style={{ padding: '4px', fontSize: '10px' }} title="إعادة طباعة حراري">
                    <Printer size={12} /> حراري
                  </button>
                )}
                {canPrintA4 && (
                  <button onClick={() => handleReprint('A4')} className="btn-secondary" style={{ padding: '4px', fontSize: '10px' }} title="إعادة طباعة A4">
                    <FileText size={12} /> A4
                  </button>
                )}
                <button onClick={handleDownloadPDF} className="btn-secondary" style={{ padding: '4px', fontSize: '10px' }} title="تنزيل PDF">
                  <Download size={12} /> PDF
                </button>
                <button onClick={() => handleShare('WHATSAPP')} className="btn-secondary" style={{ padding: '4px', fontSize: '10px' }} title="واتساب">
                  <Share2 size={12} /> واتساب
                </button>
                {canRefundSales && (
                  <button 
                    onClick={handleRefundClick} 
                    disabled={isFullyRefundedSale(selectedSale) || isRefunding} 
                    className={selectedSale.status === 'REFUNDED' ? 'btn-secondary' : 'btn-danger'} 
                    style={{ padding: '4px', fontSize: '10px', opacity: isRefunding ? 0.6 : 1 }} 
                    title="استرجاع الفاتورة"
                  >
                    <Trash2 size={12} /> {isRefunding ? 'جارٍ الإرجاع...' : 'إرجاع'}
                  </button>
                )}
              </div>

              {/* Extra operations in dropdown-like bar */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', justifyContent: 'center' }}>
                <button onClick={handleExchange} className="btn-ghost" style={{ padding: '2px 8px', fontSize: '9px', border: '1px solid var(--color-border)' }}>
                  <ArrowLeftRight size={10} /> استبدال سلع
                </button>
                <button onClick={handleDuplicate} className="btn-ghost" style={{ padding: '2px 8px', fontSize: '9px', border: '1px solid var(--color-border)' }}>
                  <Sparkles size={10} /> نسخ الفاتورة
                </button>
              </div>

              <SaleBatchAllocationsPanel
                rows={selectedBatchAllocations || []}
                loading={loadingBatchAlloc}
              />

              {/* Branded invoice preview */}
              <div style={{ 
                flex: 1, 
                overflow: 'hidden', 
                border: '1px solid var(--color-border)', 
                borderRadius: 'var(--radius-sm)', 
                backgroundColor: '#fff',
                minHeight: '420px',
              }}>
                {selectedSale ? (
                  <iframe
                    title="Amazon Pet Invoice"
                    srcDoc={selectedInvoiceHtml}
                    style={{ width: '100%', height: '100%', minHeight: '420px', border: 'none' }}
                  />
                ) : null}
              </div>

              {/* PAGING NAVIGATION BUTTONS inside report panel (Requirement 3) */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginTop: 'var(--spacing-2)',
                borderTop: '1px solid var(--color-border)',
                paddingTop: 'var(--spacing-2)'
              }}>
                <Button 
                  onClick={handleGoToFirst} 
                  disabled={filteredSales.length === 0 || selectedSale.id === filteredSales[0].id}
                  variant="secondary" 
                  size="sm"
                  style={{ padding: '4px 8px', fontSize: '10px' }}
                >
                  أول فاتورة
                </Button>
                <Button 
                  onClick={handleGoToPrev} 
                  disabled={filteredSales.length === 0 || selectedSale.id === filteredSales[0].id}
                  variant="secondary" 
                  size="sm"
                  style={{ padding: '4px 8px', fontSize: '10px' }}
                >
                  <ChevronRight size={12} /> السابقة (→)
                </Button>
                <Button 
                  onClick={handleGoToNext} 
                  disabled={filteredSales.length === 0 || selectedSale.id === filteredSales[filteredSales.length - 1].id}
                  variant="secondary" 
                  size="sm"
                  style={{ padding: '4px 8px', fontSize: '10px' }}
                >
                  التالية (←) <ChevronLeft size={12} />
                </Button>
                <Button 
                  onClick={handleGoToLast} 
                  disabled={filteredSales.length === 0 || selectedSale.id === filteredSales[filteredSales.length - 1].id}
                  variant="secondary" 
                  size="sm"
                  style={{ padding: '4px 8px', fontSize: '10px' }}
                >
                  آخر فاتورة
                </Button>
              </div>

            </div>
          ) : (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              <FileText size={48} style={{ opacity: 0.3, marginBottom: 'var(--spacing-2)' }} />
              <span>لا توجد فاتورة محددة لعرضها.</span>
            </div>
          )}
        </div>
      </div>

      {/* SHARE MODAL */}
      <Modal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={shareType === 'WHATSAPP' ? 'مشاركة الفاتورة عبر الواتساب' : 'إرسال الفاتورة بالبريد الإلكتروني'}
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowShareModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleConfirmShare} variant="primary">
              <Send size={14} /> إرسال الآن
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {shareType === 'WHATSAPP' 
              ? 'أدخل رقم هاتف العميل متضمناً رمز الدولة لإرسال الفاتورة عبر الواتساب تلقائياً.' 
              : 'أدخل البريد الإلكتروني للعميل لإرسال نسخة PDF من الفاتورة.'}
          </p>
          <Input
            label={shareType === 'WHATSAPP' ? 'رقم الهاتف (الواتساب)' : 'البريد الإلكتروني للعميل'}
            value={shareInput}
            onChange={(e) => setShareInput(e.target.value)}
            placeholder={shareType === 'WHATSAPP' ? '+201012345678' : 'customer@example.com'}
          />
        </div>
      </Modal>

      {/* REFUND CONFIRMATION MODAL (replaces window.confirm — unreliable in Electron) */}
      <Modal
        isOpen={showRefundConfirmModal}
        onClose={() => !isRefunding && setShowRefundConfirmModal(false)}
        title="تأكيد إرجاع الفاتورة"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowRefundConfirmModal(false)} variant="secondary" disabled={isRefunding}>
              إلغاء
            </Button>
            <Button onClick={executeRefund} variant="danger" disabled={isRefunding}>
              {isRefunding ? 'جارٍ الإرجاع...' : 'تأكيد الإرجاع'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', fontSize: 'var(--font-size-sm)', direction: 'rtl' }}>
          <p>
            اختر الكميات المراد إرجاعها للفاتورة <strong>{selectedSale?.saleNumber}</strong>
          </p>
          {selectedSale?.items?.filter((i) => i.type === 'PRODUCT').map((item) => {
            const maxQ = saleLineReturnableQuantity(item);
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--spacing-2)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                    متاح للإرجاع: {maxQ}
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  max={maxQ}
                  value={String(refundQuantities[item.id] ?? 0)}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(maxQ, parseInt(e.target.value, 10) || 0));
                    setRefundQuantities((prev) => ({ ...prev, [item.id]: v }));
                  }}
                  style={{ width: '72px' }}
                />
              </div>
            );
          })}
          {selectedSale && (
            <div style={{
              padding: 'var(--spacing-2)',
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'bold'
            }}>
              تقدير المرتجع:{' '}
              {formatMoney(
                (selectedSale.items || [])
                  .filter((i) => i.type === 'PRODUCT')
                  .reduce((acc, i) => acc + (refundQuantities[i.id] ?? 0) * (Number(i.price) || 0), 0)
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* MANAGER AUTH MODAL FOR REFUNDS */}
      <Modal
        isOpen={showManagerAuthModal}
        onClose={() => setShowManagerAuthModal(false)}
        title="تطلب موافقة المدير - صلاحية إرجاع الفاتورة"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowManagerAuthModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleManagerAuthSubmit} variant="danger">تأكيد الرمز والمتابعة</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            backgroundColor: 'var(--color-warning-light)', 
            color: 'var(--color-warning)', 
            padding: 'var(--spacing-2)', 
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)'
          }}>
            <AlertTriangle size={16} />
            <span>يتطلب هذا الإجراء إدخال الرمز السري للمدير أو المالك. سيتم التحقق من الرمز على الخادم.</span>
          </div>

          <Input
            label="أدخل الرمز السري للمدير"
            type="password"
            value={managerCode}
            onChange={(e) => setManagerCode(e.target.value)}
            placeholder="••••"
            style={{ textAlign: 'center', letterSpacing: '4px', fontSize: 'var(--font-size-base)' }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default InvoiceReview;
