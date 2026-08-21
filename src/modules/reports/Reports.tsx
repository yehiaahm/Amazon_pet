import React, { useState, useMemo, useEffect } from 'react';
import {
  useSales, useExpenses, usePurchaseInvoices, useCustomers
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { 
  Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  DollarSign, ShoppingCart, Printer, Download, 
  TrendingUp, TrendingDown, RefreshCw, AlertCircle, 
  FileText, Tag, Layers
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Select from '../../components/ui/Select';
import Input from '../../components/ui/Input';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import * as XLSX from 'xlsx';
import {
  isCompletedSale,
  saleCogs,
  saleDateKey,
  saleRevenue,
} from '../../core/utils/saleFinance';
import { formatMoney } from '../../core/utils/money';
import {
  calcTrendPct,
  formatLocalDate,
  getInitialMonthDateRange,
  parseLocalDate,
} from '../../core/utils/periodFinance';
import Can from '../../components/ui/Can';
import { PERMISSIONS } from '../../core/permissions/permissions';

// Constants for Chart Colors
const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#ec4899'];

function isCompletedPurchase(p: { status?: string }): boolean {
  return !p.status || p.status === 'COMPLETED';
}

function TrendBadge({
  trend,
  invert = false,
}: {
  trend: number | null;
  invert?: boolean;
}) {
  if (trend === null) {
    return <Badge variant="gray">جديد</Badge>;
  }
  const positive = invert ? trend <= 0 : trend >= 0;
  return (
    <Badge variant={positive ? 'success' : 'danger'}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {Math.abs(trend).toFixed(1)}%
    </Badge>
  );
}
export const Reports: React.FC = () => {
  // Queries
  const { data: salesPage, isLoading: loadingSales, isError: errorSales, refetch: refetchSales } = useSales({ page: 0, size: 5000, sort: 'date,desc' });
  const sales = salesPage?.content;
  const { data: expenses, isLoading: loadingExpenses, isError: errorExpenses, refetch: refetchExpenses } = useExpenses();
  const { data: purchaseInvoices, isLoading: loadingPurchases, isError: errorPurchases, refetch: refetchPurchases } = usePurchaseInvoices();
  const { data: customers } = useCustomers();

  // Local state for date filter preset
  const [datePreset, setDatePreset] = useState<string>('THIS_MONTH');
  
  // Custom date picker states
  const initialDates = getInitialMonthDateRange();
  const [customStart, setCustomStart] = useState<string>(initialDates.start);
  const [customEnd, setCustomEnd] = useState<string>(initialDates.end);
  
  // Tabs state
  const [activeTab, setActiveTab] = useState<'SALES' | 'PURCHASES' | 'EXPENSES' | 'PL'>('SALES');

  // Dashboard KPI drill-down: a KPI card navigated here with a specific tab + date
  // preset so this page explains the same number the dashboard showed. Consume once,
  // then clear so a later manual visit to Reports doesn't re-apply a stale filter.
  const pendingReportsFilter = useUIStore(s => s.pendingReportsFilter);
  const setPendingReportsFilter = useUIStore(s => s.setPendingReportsFilter);
  useEffect(() => {
    if (pendingReportsFilter) {
      setActiveTab(pendingReportsFilter.tab);
      setDatePreset(pendingReportsFilter.preset);
      setPendingReportsFilter(null);
    }
  }, [pendingReportsFilter, setPendingReportsFilter]);

  // Customer map for faster lookup
  const customerMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (customers) {
      customers.forEach(c => {
        map[c.id] = c.name;
      });
    }
    return map;
  }, [customers]);

  // Date Presets Handler
  const dateRange = useMemo(() => {
    const today = new Date();

    switch (datePreset) {
      case 'TODAY':
        return { start: formatLocalDate(today), end: formatLocalDate(today) };
      case 'YESTERDAY': {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        return { start: formatLocalDate(yesterday), end: formatLocalDate(yesterday) };
      }
      case 'LAST_7_DAYS': {
        const start = new Date(today);
        start.setDate(today.getDate() - 6);
        return { start: formatLocalDate(start), end: formatLocalDate(today) };
      }
      case 'LAST_30_DAYS': {
        const start = new Date(today);
        start.setDate(today.getDate() - 29);
        return { start: formatLocalDate(start), end: formatLocalDate(today) };
      }
      case 'THIS_MONTH': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: formatLocalDate(start), end: formatLocalDate(today) };
      }
      case 'LAST_MONTH': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: formatLocalDate(start), end: formatLocalDate(end) };
      }
      case 'THIS_YEAR': {
        const start = new Date(today.getFullYear(), 0, 1);
        return { start: formatLocalDate(start), end: formatLocalDate(today) };
      }
      case 'CUSTOM':
      default:
        return { start: customStart, end: customEnd };
    }
  }, [datePreset, customStart, customEnd]);

  // Previous Period Calculator for Trend
  const previousPeriodRange = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return { start: '', end: '' };

    const start = parseLocalDate(dateRange.start);
    const end = parseLocalDate(dateRange.end);
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const prevEnd = new Date(start);
    prevEnd.setDate(start.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - (diffDays - 1));

    return { start: formatLocalDate(prevStart), end: formatLocalDate(prevEnd) };
  }, [dateRange]);

  // Filter Sales
  const filteredSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter(s => {
      const saleDate = saleDateKey(s.date);
      return saleDate >= dateRange.start && saleDate <= dateRange.end;
    });
  }, [sales, dateRange]);

  const prevSales = useMemo(() => {
    if (!sales || !previousPeriodRange.start || !previousPeriodRange.end) return [];
    return sales.filter(s => {
      const saleDate = saleDateKey(s.date);
      return saleDate >= previousPeriodRange.start && saleDate <= previousPeriodRange.end;
    });
  }, [sales, previousPeriodRange]);

  // Filter Expenses
  const filteredExpenses = useMemo(() => {
    if (!expenses) return [];
    return expenses.filter(e => {
      const expDate = saleDateKey(e.date);
      return expDate >= dateRange.start && expDate <= dateRange.end;
    });
  }, [expenses, dateRange]);

  const prevExpenses = useMemo(() => {
    if (!expenses || !previousPeriodRange.start || !previousPeriodRange.end) return [];
    return expenses.filter(e => {
      const expDate = saleDateKey(e.date);
      return expDate >= previousPeriodRange.start && expDate <= previousPeriodRange.end;
    });
  }, [expenses, previousPeriodRange]);

  // Filter Purchase Invoices (completed only — drafts are not booked)
  const filteredPurchases = useMemo(() => {
    if (!purchaseInvoices) return [];
    return purchaseInvoices.filter(p => {
      if (!isCompletedPurchase(p)) return false;
      const pDate = saleDateKey(p.invoiceDate);
      return pDate >= dateRange.start && pDate <= dateRange.end;
    });
  }, [purchaseInvoices, dateRange]);

  // Core Financial Metric Calculations
  const metrics = useMemo(() => {
    const calculateStats = (salesList: typeof filteredSales, expList: typeof filteredExpenses) => {
      const completed = salesList.filter(isCompletedSale);
      const revenue = completed.reduce((sum, s) => sum + saleRevenue(s), 0);
      const cogs = completed.reduce((sum, s) => sum + saleCogs(s), 0);

      const opExpenses = expList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const grossProfit = revenue - cogs;
      const netProfit = revenue - cogs - opExpenses;
      const salesCount = completed.length;
      const avgInvoice = salesCount > 0 ? revenue / salesCount : 0;
      // Net margin (after COGS + operating expenses)
      const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      return {
        revenue,
        cogs,
        opExpenses,
        grossProfit,
        netProfit,
        avgInvoice,
        salesCount,
        margin,
        grossMargin,
      };
    };

    const currentStats = calculateStats(filteredSales, filteredExpenses);
    const previousStats = calculateStats(prevSales, prevExpenses);

    return {
      current: currentStats,
      trends: {
        revenue: calcTrendPct(currentStats.revenue, previousStats.revenue),
        cogs: calcTrendPct(currentStats.cogs, previousStats.cogs),
        opExpenses: calcTrendPct(currentStats.opExpenses, previousStats.opExpenses),
        grossProfit: calcTrendPct(currentStats.grossProfit, previousStats.grossProfit),
        netProfit: calcTrendPct(currentStats.netProfit, previousStats.netProfit),
        avgInvoice: calcTrendPct(currentStats.avgInvoice, previousStats.avgInvoice),
        salesCount: calcTrendPct(currentStats.salesCount, previousStats.salesCount),
        margin: currentStats.margin - previousStats.margin
      }
    };
  }, [filteredSales, filteredExpenses, prevSales, prevExpenses]);

  // Aggregate Chart Data over Time (Daily or Monthly depending on Range duration)
  const chartTimelineData = useMemo(() => {
    const map: Record<string, { Sales: number; Expenses: number; Purchases: number; Profit: number }> = {};

    const start = parseLocalDate(dateRange.start);
    const end = parseLocalDate(dateRange.end);
    const isSingleDay = dateRange.start === dateRange.end;

    if (isSingleDay) {
      map[dateRange.start] = { Sales: 0, Expenses: 0, Purchases: 0, Profit: 0 };
    } else {
      let current = new Date(start);
      let cap = 0;
      while (current <= end && cap < 366) {
        map[formatLocalDate(current)] = { Sales: 0, Expenses: 0, Purchases: 0, Profit: 0 };
        current.setDate(current.getDate() + 1);
        cap++;
      }
    }

    filteredSales.forEach(s => {
      if (!isCompletedSale(s)) return;
      const dateStr = saleDateKey(s.date);
      const revenue = saleRevenue(s);
      if (map[dateStr]) {
        map[dateStr].Sales += revenue;
      } else {
        map[dateStr] = { Sales: revenue, Expenses: 0, Purchases: 0, Profit: 0 };
      }
    });

    filteredExpenses.forEach(e => {
      const dateStr = saleDateKey(e.date);
      const amount = Number(e.amount) || 0;
      if (map[dateStr]) {
        map[dateStr].Expenses += amount;
      } else {
        map[dateStr] = { Sales: 0, Expenses: amount, Purchases: 0, Profit: 0 };
      }
    });

    filteredPurchases.forEach(p => {
      const dateStr = saleDateKey(p.invoiceDate);
      const amount = Number(p.grandTotal) || 0;
      if (map[dateStr]) {
        map[dateStr].Purchases += amount;
      } else {
        map[dateStr] = { Sales: 0, Expenses: 0, Purchases: amount, Profit: 0 };
      }
    });

    Object.keys(map).forEach(dateStr => {
      const salesOnDate = filteredSales.filter(
        s => saleDateKey(s.date) === dateStr && isCompletedSale(s)
      );
      const cogsOnDate = salesOnDate.reduce((sum, s) => sum + saleCogs(s), 0);
      map[dateStr].Profit = map[dateStr].Sales - cogsOnDate - map[dateStr].Expenses;
    });

    // Long ranges: collapse daily noise into monthly buckets
    const dayCount = Object.keys(map).length;
    if (dayCount > 45) {
      const byMonth: Record<string, { Sales: number; Expenses: number; Purchases: number; Profit: number }> = {};
      Object.entries(map).forEach(([day, vals]) => {
        const month = day.slice(0, 7);
        if (!byMonth[month]) {
          byMonth[month] = { Sales: 0, Expenses: 0, Purchases: 0, Profit: 0 };
        }
        byMonth[month].Sales += vals.Sales;
        byMonth[month].Expenses += vals.Expenses;
        byMonth[month].Purchases += vals.Purchases;
        byMonth[month].Profit += vals.Profit;
      });
      return Object.entries(byMonth)
        .map(([name, vals]) => ({ name, ...vals }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return Object.entries(map).map(([name, vals]) => ({
      name,
      ...vals
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredSales, filteredExpenses, filteredPurchases, dateRange]);

  // Aggregate Expense Categories Chart Data
  const chartExpenseCategoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      const catLabel = 
        e.category === 'RENT' ? 'الإيجارات' :
        e.category === 'SALARY' ? 'الرواتب والأجور' :
        e.category === 'UTILITIES' ? 'المرافق والخدمات' :
        e.category === 'SUPPLIES' ? 'بضائع ومستلزمات' : 'نفقات أخرى';
      map[catLabel] = (map[catLabel] || 0) + (Number(e.amount) || 0);
    });

    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredExpenses]);

  // Aggregate Payment Methods Chart Data
  const chartPaymentMethodData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach(s => {
      if (!isCompletedSale(s)) return;
      const methodLabel = 
        s.paymentMethod === 'CASH' ? 'نقدية (كاش)' :
        s.paymentMethod === 'CARD' ? 'بطاقة ائتمانية' : 'محفظة موبايل';
      map[methodLabel] = (map[methodLabel] || 0) + saleRevenue(s);
    });

    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [filteredSales]);

  // Monthly sales totals (not cumulative)
  const monthlySalesChartData = useMemo(() => {
    const map: Record<string, number> = {};
    if (sales) {
      sales.forEach(s => {
        if (!isCompletedSale(s)) return;
        const month = saleDateKey(s.date).slice(0, 7);
        if (!month) return;
        map[month] = (map[month] || 0) + saleRevenue(s);
      });
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sales]);

  // Monthly completed purchases totals (not cumulative)
  const monthlyPurchasesChartData = useMemo(() => {
    const map: Record<string, number> = {};
    if (purchaseInvoices) {
      purchaseInvoices.forEach(p => {
        if (!isCompletedPurchase(p)) return;
        const month = saleDateKey(p.invoiceDate).slice(0, 7);
        if (!month) return;
        map[month] = (map[month] || 0) + (Number(p.grandTotal) || 0);
      });
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => a.name.localeCompare(b.name));
  }, [purchaseInvoices]);

  const completedSalesInRange = useMemo(
    () => filteredSales.filter(isCompletedSale),
    [filteredSales]
  );

  // Table Columns Definitions
  const salesColumns = [
    { header: 'رقم الفاتورة', accessor: 'saleNumber' as const, key: 'saleNumber', sortable: true },
    { 
      header: 'العميل', 
      accessor: (row: any) => customerMap[row.customerId] || row.customerId || 'عميل نقدي', 
      key: 'customerId' 
    },
    { header: 'التاريخ والوقت', accessor: (row: any) => row.date.replace('T', ' '), key: 'date', sortable: true },
    { 
      header: 'طريقة الدفع', 
      accessor: (row: any) => (
        <Badge variant={row.paymentMethod === 'CASH' ? 'success' : row.paymentMethod === 'CARD' ? 'primary' : 'warning'}>
          {row.paymentMethod === 'CASH' ? 'كاش' : row.paymentMethod === 'CARD' ? 'بطاقة' : 'محفظة'}
        </Badge>
      ), 
      key: 'paymentMethod' 
    },
    { header: 'القطع المباعة', accessor: (row: any) => row.items.reduce((s: number, i: any) => s + i.quantity, 0), key: 'items' },
    { header: 'المجموع الفعلي', accessor: (row: any) => formatMoney(saleRevenue(row)), key: 'totalAmount', sortable: true },
    { header: 'الخصم', accessor: (row: any) => formatMoney(row.discount), key: 'discount' },
    { 
      header: 'الحالة', 
      accessor: (row: any) => (
        <Badge variant={row.status === 'REFUNDED' ? 'danger' : 'success'}>
          {row.status === 'REFUNDED' ? 'مرتجعة' : 'مكتملة'}
        </Badge>
      ), 
      key: 'status' 
    }
  ];

  const purchasesColumns = [
    { header: 'رقم فاتورة المورد', accessor: 'invoiceNumber' as const, key: 'invoiceNumber', sortable: true },
    { header: 'المورد', accessor: 'supplierName' as const, key: 'supplierName', sortable: true },
    { header: 'تاريخ الفاتورة', accessor: 'invoiceDate' as const, key: 'invoiceDate', sortable: true },
    { header: 'الصافي (ج.م)', accessor: (row: any) => formatMoney(row.netTotal), key: 'netTotal' },
    { header: 'ضريبة القيمة المضافة', accessor: (row: any) => formatMoney(row.vat), key: 'vat' },
    { header: 'الشحن والمصاريف', accessor: (row: any) => formatMoney(row.shipping), key: 'shipping' },
    { header: 'الإجمالي النهائي', accessor: (row: any) => formatMoney(row.grandTotal), key: 'grandTotal', sortable: true },
    { 
      header: 'حالة السداد', 
      accessor: (row: any) => (
        <Badge variant={row.paymentStatus === 'PAID' ? 'success' : row.paymentStatus === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
          {row.paymentStatus === 'PAID' ? 'مدفوع' : row.paymentStatus === 'PARTIALLY_PAID' ? 'مدفوع جزئياً' : 'غير مدفوع'}
        </Badge>
      ), 
      key: 'paymentStatus' 
    }
  ];

  const expensesColumns = [
    { header: 'التاريخ والوقت', accessor: (row: any) => row.date.replace('T', ' '), key: 'date', sortable: true },
    { 
      header: 'التصنيف', 
      accessor: (row: any) => {
        if (row.category === 'RENT') return 'إيجار المقر';
        if (row.category === 'SALARY') return 'رواتب الموظفين';
        if (row.category === 'UTILITIES') return 'مرافق وكهرباء';
        if (row.category === 'SUPPLIES') return 'بضائع ومستلزمات';
        if (row.category === 'OTHER') return 'تشغيلي عام / أخرى';
        return row.category;
      }, 
      key: 'category', 
      sortable: true 
    },
    { header: 'البيان / تفاصيل الوصف', accessor: 'description' as const, key: 'description' },
    { 
      header: 'حساب الخصم', 
      accessor: (row: any) => row.paidFrom === 'BANK' ? 'حساب بنكي' : 'النقدية بالدرج', 
      key: 'paidFrom' 
    },
    { header: 'القيمة المالية', accessor: (row: any) => formatMoney(row.amount), key: 'amount', sortable: true }
  ];

  // Excel Export Handler
  const handleExcelExport = (type: 'SALES' | 'PURCHASES' | 'EXPENSES' | 'PL') => {
    let exportData: any[] = [];
    let fileName = '';
    let sheetName = '';

    if (type === 'SALES') {
      fileName = `Sales_Report_${dateRange.start}_to_${dateRange.end}`;
      sheetName = 'تقرير المبيعات';
      exportData = filteredSales.map(s => ({
        'رقم الفاتورة': s.saleNumber,
        'تاريخ الفاتورة': s.date.replace('T', ' '),
        'العميل': customerMap[s.customerId || ''] || 'عميل نقدي',
        'طريقة الدفع': s.paymentMethod === 'CASH' ? 'كاش' : s.paymentMethod === 'CARD' ? 'بطاقة' : 'محفظة',
        'عدد القطع': s.items.reduce((sum, item) => sum + item.quantity, 0),
        'قيمة الخصم': s.discount,
        'إجمالي الفاتورة': saleRevenue(s),
        'حالة المعاملة': s.status === 'REFUNDED' ? 'مرتجعة' : 'مكتملة'
      }));
    } else if (type === 'PURCHASES') {
      fileName = `Purchases_Report_${dateRange.start}_to_${dateRange.end}`;
      sheetName = 'تقرير المشتريات';
      exportData = filteredPurchases.map(p => ({
        'رقم فاتورة المورد': p.invoiceNumber,
        'المورد': p.supplierName,
        'تاريخ الفاتورة': p.invoiceDate,
        'الصافي': p.netTotal,
        'الضريبة': p.vat,
        'تكاليف الشحن': p.shipping,
        'الإجمالي الكلي': p.grandTotal,
        'حالة السداد': p.paymentStatus === 'PAID' ? 'سداد كامل' : p.paymentStatus === 'PARTIALLY_PAID' ? 'سداد جزئي' : 'غير مسدد'
      }));
    } else if (type === 'EXPENSES') {
      fileName = `Expenses_Report_${dateRange.start}_to_${dateRange.end}`;
      sheetName = 'تقرير المصاريف';
      exportData = filteredExpenses.map(e => ({
        'التاريخ': e.date.replace('T', ' '),
        'التصنيف': e.category === 'RENT' ? 'إيجار' : e.category === 'SALARY' ? 'رواتب' : e.category === 'UTILITIES' ? 'كهرباء ومرافق' : e.category === 'SUPPLIES' ? 'بضائع ومستلزمات' : e.category === 'OTHER' ? 'أخرى' : e.category,
        'البيان': e.description,
        'طريقة الدفع': e.paidFrom === 'BANK' ? 'حساب بنكي' : 'درج النقدية',
        'المبلغ': e.amount
      }));
    } else if (type === 'PL') {
      fileName = `PL_Statement_${dateRange.start}_to_${dateRange.end}`;
      sheetName = 'قائمة الأرباح والخسائر';
      exportData = [
        { 'البند المالي': 'إجمالي الإيرادات المبيعات (Revenue)', 'القيمة (ج.م)': metrics.current.revenue },
        { 'البند المالي': 'تكلفة البضاعة المباعة (COGS)', 'القيمة (ج.م)': -metrics.current.cogs },
        { 'البند المالي': 'إجمالي الربح (Gross Profit)', 'القيمة (ج.م)': metrics.current.grossProfit },
        { 'البند المالي': 'مصاريف الأجور والرواتب (Salary)', 'القيمة (ج.م)': -filteredExpenses.filter(e => e.category === 'SALARY').reduce((sum, e) => sum + e.amount, 0) },
        { 'البند المالي': 'مصاريف الإيجارات (Rent)', 'القيمة (ج.م)': -filteredExpenses.filter(e => e.category === 'RENT').reduce((sum, e) => sum + e.amount, 0) },
        { 'البند المالي': 'مصاريف المرافق والكهرباء (Utilities)', 'القيمة (ج.م)': -filteredExpenses.filter(e => e.category === 'UTILITIES').reduce((sum, e) => sum + e.amount, 0) },
        { 'البند المالي': 'مصاريف البضاعة والمستلزمات (Supplies)', 'القيمة (ج.م)': -filteredExpenses.filter(e => e.category === 'SUPPLIES').reduce((sum, e) => sum + e.amount, 0) },
        { 'البند المالي': 'مصاريف تشغيلية أخرى (Other)', 'القيمة (ج.م)': -filteredExpenses.filter(e => !['RENT', 'SALARY', 'UTILITIES', 'SUPPLIES'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0) },
        { 'البند المالي': 'إجمالي المصاريف التشغيلية (Expenses)', 'القيمة (ج.م)': -metrics.current.opExpenses },
        { 'البند المالي': 'صافي الأرباح التشغيلية (Net Profit)', 'القيمة (ج.م)': metrics.current.netProfit },
        { 'البند المالي': 'هامش صافي الربح (Net Margin)', 'القيمة (%)': metrics.current.margin.toFixed(2) }
      ];
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  // Printable P&L triggering
  const handlePrint = () => {
    window.print();
  };

  // Loading/Skeleton States
  const isLoading = loadingSales || loadingExpenses || loadingPurchases;
  if (isLoading) {
    return (
      <div className="workspace">
        <PageHeader title="التقارير المالية والتحليلات" subtitle="تحميل المؤشرات والتقارير المالية للمؤسسة..." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '110px' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-4)' }}>
          <div className="skeleton" style={{ height: '300px' }} />
          <div className="skeleton" style={{ height: '300px' }} />
        </div>
      </div>
    );
  }

  // Error States
  const isError = errorSales || errorExpenses || errorPurchases;
  if (isError) {
    return (
      <div className="workspace">
        <PageHeader title="التقارير المالية والتحليلات" subtitle="حدث خطأ في النظام المحاسبي" />
        <Card style={{ padding: 'var(--spacing-6)', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-4)', border: '1px solid var(--color-danger)' }}>
          <AlertCircle size={48} color="var(--color-danger)" />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'bold' }}>حدث خطأ أثناء تحميل البيانات المالية</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>يرجى التحقق من اتصال قاعدة البيانات بالخادم وإعادة المحاولة.</p>
          </div>
          <Button variant="primary" onClick={() => {
            refetchSales();
            refetchExpenses();
            refetchPurchases();
          }}>
            <RefreshCw size={14} /> إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  // Check Empty State
  const hasNoData = filteredSales.length === 0 && filteredExpenses.length === 0 && filteredPurchases.length === 0;

  return (
    <div className="workspace" style={{ direction: 'rtl' }}>
      {/* Dynamic Print CSS Injection */}
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            font-size: 12pt !important;
          }
          .erp-sidebar, .erp-topbar, .no-print, .workspace-header, .workspace-toolbar, .tabs-container {
            display: none !important;
          }
          .workspace {
            padding: 0 !important;
            margin: 0 !important;
          }
          .print-section {
            border: none !important;
            box-shadow: none !important;
            width: 100% !important;
            position: absolute;
            left: 0;
            top: 0;
            direction: rtl !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="workspace-header no-print">
        <PageHeader 
          title="التقارير المالية والمحاسبية" 
          subtitle="تقارير الأداء التشغيلي المالي، كشف المبيعات والمصاريف والأرباح" 
          actions={
            <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
              <Can anyOf={[PERMISSIONS.REPORTS_EXPORT_EXCEL]}>
                <Button onClick={() => handleExcelExport(activeTab)} variant="secondary" size="sm">
                  <Download size={14} /> تصدير إكسل ({activeTab === 'PL' ? 'كشف الأرباح' : 'الجدول'})
                </Button>
              </Can>
              {activeTab === 'PL' && (
                <Can permission={PERMISSIONS.REPORTS_PRINT}>
                  <Button onClick={handlePrint} variant="primary" size="sm">
                    <Printer size={14} /> طباعة القائمة المالية
                  </Button>
                </Can>
              )}
            </div>
          }
        />
      </div>

      {/* Filters Toolbar */}
      <div className="workspace-toolbar no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-4)', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>الفترة المحددة:</span>
          <Select 
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value)}
            options={[
              { value: 'TODAY', label: 'اليوم (التشغيل اليومي)' },
              { value: 'YESTERDAY', label: 'أمس' },
              { value: 'LAST_7_DAYS', label: 'آخر 7 أيام' },
              { value: 'LAST_30_DAYS', label: 'آخر 30 يوم' },
              { value: 'THIS_MONTH', label: 'الشهر الحالي' },
              { value: 'LAST_MONTH', label: 'الشهر السابق' },
              { value: 'THIS_YEAR', label: 'السنة الحالية الكاملة' },
              { value: 'CUSTOM', label: 'تحديد فترة مخصصة...' },
            ]}
            style={{ width: '220px' }}
          />
        </div>

        {datePreset === 'CUSTOM' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
            <Input 
              type="date" 
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              label="من تاريخ"
              containerStyle={{ width: '150px' }}
            />
            <Input 
              type="date" 
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              label="إلى تاريخ"
              containerStyle={{ width: '150px' }}
            />
          </div>
        )}

        <div style={{ marginRight: 'auto', display: 'flex', gap: 'var(--spacing-2)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
          <span>نطاق البحث المالي:</span>
          <strong>{dateRange.start}</strong> إلى <strong>{dateRange.end}</strong>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 'var(--spacing-4)' }}>
        {/* KPI 1: Revenue */}
        <Card style={{ padding: 'var(--spacing-4)', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>إجمالي الإيرادات (المبيعات)</span>
            <ShoppingCart size={20} color="var(--color-primary)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', marginTop: '6px' }}>
            {formatMoney(metrics.current.revenue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: 'var(--font-size-xs)' }}>
            <TrendBadge trend={metrics.trends.revenue} />
            <span style={{ color: 'var(--color-text-secondary)' }}>مقارنة بالفترة السابقة</span>
          </div>
        </Card>

        {/* KPI 2: COGS */}
        <Card style={{ padding: 'var(--spacing-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>تكلفة البضاعة المباعة (COGS)</span>
            <Tag size={20} color="var(--color-warning)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', marginTop: '6px' }}>
            {formatMoney(metrics.current.cogs)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: 'var(--font-size-xs)' }}>
            <TrendBadge trend={metrics.trends.cogs} invert />
            <span style={{ color: 'var(--color-text-secondary)' }}>مقارنة بالفترة السابقة</span>
          </div>
        </Card>

        {/* KPI 3: Expenses */}
        <Card style={{ padding: 'var(--spacing-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>إجمالي المصاريف التشغيلية</span>
            <Layers size={20} color="var(--color-danger)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', marginTop: '6px' }}>
            {formatMoney(metrics.current.opExpenses)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: 'var(--font-size-xs)' }}>
            <TrendBadge trend={metrics.trends.opExpenses} invert />
            <span style={{ color: 'var(--color-text-secondary)' }}>مقارنة بالفترة السابقة</span>
          </div>
        </Card>

        {/* KPI 4: Net Profit */}
        <Card style={{ padding: 'var(--spacing-4)', background: 'var(--color-primary-light)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-primary)' }}>صافي الأرباح المحققة</span>
            <DollarSign size={20} color="var(--color-primary)" />
          </div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold', marginTop: '6px', color: 'var(--color-primary)' }}>
            {formatMoney(metrics.current.netProfit)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: 'var(--font-size-xs)' }}>
            <TrendBadge trend={metrics.trends.netProfit} />
            <span style={{ color: 'var(--color-text-secondary)' }}>مقارنة بالفترة السابقة</span>
          </div>
        </Card>
      </div>

      {/* KPI Cards Extra */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 'var(--spacing-4)', marginTop: 'var(--spacing-4)' }}>
        {/* KPI 5: Avg Invoice */}
        <Card style={{ padding: 'var(--spacing-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>متوسط قيمة الفاتورة</span>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', marginTop: '4px' }}>
            {formatMoney(metrics.current.avgInvoice)}
          </div>
        </Card>
        {/* KPI 6: Invoice Count */}
        <Card style={{ padding: 'var(--spacing-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>عدد فواتير المبيعات</span>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', marginTop: '4px' }}>
            {metrics.current.salesCount} فاتورة
          </div>
        </Card>
        {/* KPI 7: Net Profit Margin */}
        <Card style={{ padding: 'var(--spacing-3)' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>هامش صافي الربح</span>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {metrics.current.margin.toFixed(1)}%
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'normal', color: 'var(--color-text-secondary)' }}>
              (إجمالي {metrics.current.grossMargin.toFixed(1)}%)
            </span>
          </div>
        </Card>
      </div>

      {/* Empty State */}
      {hasNoData ? (
        <Card style={{ padding: 'var(--spacing-8)', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-4)', marginTop: 'var(--spacing-6)' }}>
          <FileText size={48} color="var(--color-text-secondary)" />
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'bold' }}>لا توجد بيانات مالية مطابقة</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>لا توجد فواتير مبيعات، مصروفات أو مشتريات مسجلة ضمن الفترة المحددة ({dateRange.start} إلى {dateRange.end})</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Charts Section */}
          <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 'var(--spacing-4)', marginTop: 'var(--spacing-6)' }}>
            {/* Chart 1: Revenue vs Expenses Timeline */}
            <Card title="مقارنة الإيرادات بالمصاريف والأرباح">
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={chartTimelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={10} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={10} />
                    <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }} />
                    <Legend verticalAlign="top" height={36}/>
                    <Area type="monotone" name="المبيعات" dataKey="Sales" stroke="#2563eb" fillOpacity={1} fill="url(#colorSales)" strokeWidth={2} />
                    <Area type="monotone" name="صافي الربح" dataKey="Profit" stroke="#10b981" fillOpacity={1} fill="url(#colorProfit)" strokeWidth={2} />
                    <Line type="monotone" name="المصاريف" dataKey="Expenses" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Chart 2: Expenses Breakdown */}
            {chartExpenseCategoryData.length > 0 && (
              <Card title="توزيع النفقات والمصاريف تشغيلياً">
                <div style={{ display: 'flex', alignItems: 'center', height: 260, justifyContent: 'space-around', flexWrap: 'wrap' }}>
                  <div style={{ width: '50%', height: '100%' }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={chartExpenseCategoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {chartExpenseCategoryData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatMoney(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--font-size-xs)' }}>
                    {chartExpenseCategoryData.map((entry, index) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '2px', backgroundColor: COLORS[index % COLORS.length] }} />
                        <span style={{ color: 'var(--color-text-secondary)' }}>{entry.name}:</span>
                        <strong>{formatMoney(entry.value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Chart 3: Payment Methods */}
            {chartPaymentMethodData.length > 0 && (
              <Card title="مستحقات طرق الدفع للمبيعات">
                <div style={{ display: 'flex', alignItems: 'center', height: 260, justifyContent: 'space-around', flexWrap: 'wrap' }}>
                  <div style={{ width: '50%', height: '100%' }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={chartPaymentMethodData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          labelLine={false}
                          dataKey="value"
                        >
                          {chartPaymentMethodData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatMoney(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--font-size-xs)' }}>
                    {chartPaymentMethodData.map((entry, index) => (
                      <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: COLORS[(index + 2) % COLORS.length] }} />
                        <span style={{ color: 'var(--color-text-secondary)' }}>{entry.name}:</span>
                        <strong>{formatMoney(entry.value)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {/* Chart 4: Monthly Revenue Comparison */}
            <Card title="مؤشر المبيعات الشهري">
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={monthlySalesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={10} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={10} />
                    <Tooltip formatter={(value: number) => formatMoney(value)} />
                    <Bar name="إجمالي المبيعات" dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Chart 5: Monthly Purchases Comparison */}
            <Card title="مؤشر المشتريات الشهري من الموردين">
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={monthlyPurchasesChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={10} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={10} />
                    <Tooltip formatter={(value: number) => formatMoney(value)} />
                    <Bar name="إجمالي المشتريات" dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Subtabs for Details */}
          <div className="tabs-container no-print" style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: 'var(--spacing-2)', paddingBottom: '4px', marginTop: 'var(--spacing-6)' }}>
            <button
              onClick={() => setActiveTab('SALES')}
              className="btn-ghost"
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '6px 16px',
                borderBottom: activeTab === 'SALES' ? '2px solid var(--color-primary)' : 'none',
                color: activeTab === 'SALES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeTab === 'SALES' ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              مبيعات المعرض ({completedSalesInRange.length})
            </button>
            <button
              onClick={() => setActiveTab('PURCHASES')}
              className="btn-ghost"
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '6px 16px',
                borderBottom: activeTab === 'PURCHASES' ? '2px solid var(--color-primary)' : 'none',
                color: activeTab === 'PURCHASES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeTab === 'PURCHASES' ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              فواتير المشتريات الموردين ({filteredPurchases.length})
            </button>
            <button
              onClick={() => setActiveTab('EXPENSES')}
              className="btn-ghost"
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '6px 16px',
                borderBottom: activeTab === 'EXPENSES' ? '2px solid var(--color-primary)' : 'none',
                color: activeTab === 'EXPENSES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeTab === 'EXPENSES' ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              المصاريف التشغيلية ({filteredExpenses.length})
            </button>
            <button
              onClick={() => setActiveTab('PL')}
              className="btn-ghost"
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '6px 16px',
                borderBottom: activeTab === 'PL' ? '2px solid var(--color-primary)' : 'none',
                color: activeTab === 'PL' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: activeTab === 'PL' ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '6px'
              }}
            >
              قائمة الأرباح والخسائر P&L
            </button>
          </div>

          {/* Tables Content */}
          <div className="no-print" style={{ marginTop: 'var(--spacing-4)' }}>
            {activeTab === 'SALES' && (
              <DataTable 
                data={filteredSales}
                columns={salesColumns}
                rowKey="id"
                pageSize={10}
                searchPlaceholder="البحث في فواتير المبيعات..."
                searchField="saleNumber"
              />
            )}

            {activeTab === 'PURCHASES' && (
              <DataTable 
                data={filteredPurchases}
                columns={purchasesColumns}
                rowKey="id"
                pageSize={10}
                searchPlaceholder="البحث في فواتير الموردين..."
                searchField="invoiceNumber"
              />
            )}

            {activeTab === 'EXPENSES' && (
              <DataTable 
                data={filteredExpenses}
                columns={expensesColumns}
                rowKey="id"
                pageSize={10}
                searchPlaceholder="البحث في المصروفات المسجلة..."
                searchField="description"
              />
            )}
          </div>

          {/* Printable P&L Statement Layout */}
          <div className={`print-section ${activeTab !== 'PL' ? 'no-print' : ''}`} style={{ display: activeTab === 'PL' ? 'block' : 'none', marginTop: 'var(--spacing-4)' }}>
            <Card style={{ padding: 'var(--spacing-8)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)', borderRadius: 'var(--radius-lg)' }}>
              {/* Statement Header */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid var(--color-border)', paddingBottom: 'var(--spacing-4)', marginBottom: 'var(--spacing-6)' }}>
                <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'bold' }}>Amazon Pet</h2>
                <p style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>قائمة الأرباح والخسائر التشغيلية المبسطة (Profit & Loss Statement)</p>
                <p style={{ fontSize: 'var(--font-size-sm)', marginTop: '8px', fontWeight: 'bold' }}>
                  الفترة المالية: من {dateRange.start} إلى {dateRange.end}
                </p>
              </div>

              {/* Statement Content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
                {/* Revenue */}
                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>
                    <span>الإيرادات والمبيعات (Operating Revenue)</span>
                    <span>{formatMoney(metrics.current.revenue)}</span>
                  </div>
                  <div style={{ paddingRight: '20px', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span>مبيعات المعرض (POS Sales)</span>
                    <span>{formatMoney(metrics.current.revenue)}</span>
                  </div>
                </div>

                {/* COGS */}
                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>
                    <span>تكلفة المبيعات (Cost of Goods Sold - COGS)</span>
                    <span style={{ color: 'var(--color-danger)' }}>{formatMoney(-metrics.current.cogs)}</span>
                  </div>
                </div>

                {/* Gross Profit */}
                <div style={{ borderBottom: '2px dashed var(--color-border)', paddingBottom: 'var(--spacing-3)', paddingTop: 'var(--spacing-1)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 'var(--font-size-lg)', color: 'var(--color-success)' }}>
                    <span>إجمالي الربح (Gross Profit)</span>
                    <span>{formatMoney(metrics.current.grossProfit)}</span>
                  </div>
                </div>

                {/* Operating Expenses */}
                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--spacing-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>
                    <span>المصاريف التشغيلية العامة (Operating Expenses)</span>
                    <span style={{ color: 'var(--color-danger)' }}>{formatMoney(-metrics.current.opExpenses)}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '20px', marginTop: '6px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>رواتب وأجور الموظفين (Salaries)</span>
                      <span>{formatMoney(filteredExpenses.filter(e => e.category === 'SALARY').reduce((sum, e) => sum + e.amount, 0))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>إيجار مقر ومرافق المحل (Rent)</span>
                      <span>{formatMoney(filteredExpenses.filter(e => e.category === 'RENT').reduce((sum, e) => sum + e.amount, 0))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>مصاريف الكهرباء والإنترنت والماء (Utilities)</span>
                      <span>{formatMoney(filteredExpenses.filter(e => e.category === 'UTILITIES').reduce((sum, e) => sum + e.amount, 0))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>مستلزمات عامة وبضائع للمحل (Supplies)</span>
                      <span>{formatMoney(filteredExpenses.filter(e => e.category === 'SUPPLIES').reduce((sum, e) => sum + e.amount, 0))}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>نفقات ومصاريف تشغيلية أخرى (Other)</span>
                      <span>{formatMoney(filteredExpenses.filter(e => !['RENT', 'SALARY', 'UTILITIES', 'SUPPLIES'].includes(e.category)).reduce((sum, e) => sum + e.amount, 0))}</span>
                    </div>
                  </div>
                </div>

                {/* Net Profit */}
                <div style={{ borderBottom: '3px double var(--color-border)', paddingBottom: 'var(--spacing-4)', paddingTop: 'var(--spacing-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 'var(--font-size-xl)', color: metrics.current.netProfit >= 0 ? 'var(--color-primary)' : 'var(--color-danger)' }}>
                    <span>صافي الأرباح التشغيلية للفترة (Net Profit)</span>
                    <span>{formatMoney(metrics.current.netProfit)}</span>
                  </div>
                </div>
              </div>

              {/* Statement Footer Signatures */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', padding: '0 20px' }}>
                <div style={{ textAlign: 'center' }}>
                  <p>توقيع المدير المالي المحاسب</p>
                  <div style={{ borderBottom: '1px solid var(--color-text-secondary)', width: '120px', height: '40px', margin: '0 auto' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <p>اعتماد مالك المؤسسة (مروان)</p>
                  <div style={{ borderBottom: '1px solid var(--color-text-secondary)', width: '120px', height: '40px', margin: '0 auto' }} />
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Reports;
