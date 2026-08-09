import React, { useState, useMemo } from 'react';
import {
  useExpenses,
  useDailyClosings,
  useAddExpense,
  useDeleteExpense,
  useSales,
  useKPIMetrics,
} from '../../core/hooks/useERPData';
import {
  PlusCircle,
  Landmark,
  FileSpreadsheet,
  Trash2,
  HandCoins,
  ArrowDownLeft,
  ArrowUpRight,
  Printer,
  Receipt,
  Building2,
  Smartphone,
  CreditCard,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import { formatMoney } from '../../core/utils/money';
import AccountsPayablePanel from './AccountsPayablePanel';
import Can from '../../components/ui/Can';
import { PERMISSIONS } from '../../core/permissions/permissions';

type FinancialEntry = {
  id: string;
  date: string;
  type: 'IN' | 'OUT';
  category: string;
  description: string;
  amount: number;
  paymentMethod: 'CASH' | 'BANK' | 'INSTAPAY' | 'VODAFONE_CASH';
  user: string;
  referenceId?: string;
};

export const Finance: React.FC = () => {
  const { data: expenses = [], isLoading: loadingExpenses } = useExpenses();
  const { data: closings = [], isLoading: loadingClosings } = useDailyClosings();
  const { data: salesPage } = useSales({ page: 0, size: 5000, sort: 'date,desc' });
  const { data: kpis } = useKPIMetrics();
  const { mutate: logExpense, isPending: logging } = useAddExpense();
  const { mutate: deleteExpense } = useDeleteExpense();

  const [activeSubTab, setActiveSubTab] = useState<'MASTER_LEDGER' | 'EXPENSES' | 'CLOSINGS' | 'PAYABLE'>('MASTER_LEDGER');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<string>('SUPPLIES');
  const [customCategory, setCustomCategory] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expSource, setExpSource] = useState<'CASH' | 'BANK'>('BANK');

  // Ledger Filter States
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [ledgerMethodFilter, setLedgerMethodFilter] = useState<string>('ALL');

  const sales = salesPage?.content || [];

  // Synthesize Unified Financial Master Ledger (Every Pound IN & OUT)
  const masterLedger = useMemo(() => {
    const entries: FinancialEntry[] = [];

    // 1. Add Sales (Money IN / المقبوضات)
    sales.forEach((s) => {
      const isRefunded = s.status === 'REFUNDED' || s.status === 'PARTIALLY_REFUNDED';
      const amount = Number(s.totalAmount) || 0;
      if (amount <= 0) return;

      const pMethod: FinancialEntry['paymentMethod'] =
        s.paymentMethod === 'CARD'
          ? 'BANK'
          : s.paymentMethod === 'INSTAPAY'
          ? 'INSTAPAY'
          : s.paymentMethod === 'VODAFONE_CASH'
          ? 'VODAFONE_CASH'
          : 'CASH';

      entries.push({
        id: `sale-${s.id}`,
        date: s.date || (s as any).createdAt || new Date().toISOString(),
        type: isRefunded ? 'OUT' : 'IN',
        category: isRefunded ? 'مرتجع مبيعات' : 'مبيعات محل/خدمات',
        description: `فاتورة مبيعات رقم #${s.id.slice(0, 8)} ${(s as any).customerFullName ? `— العميل: ${(s as any).customerFullName}` : ''}`,
        amount,
        paymentMethod: pMethod,
        user: s.employeeFullName || 'الكاشير',
        referenceId: s.id,
      });
    });

    // 2. Add Expenses (Money OUT / المصروفات)
    expenses.forEach((e) => {
      let catLabel = e.category;
      if (e.category === 'RENT') catLabel = 'إيجار المقر';
      else if (e.category === 'SALARY') catLabel = 'رواتب ومستحقات الموظفين';
      else if (e.category === 'UTILITIES') catLabel = 'فواتير ومرافق (كهرباء/إنترنت)';
      else if (e.category === 'SUPPLIES') catLabel = 'مستلزمات وبضائع للمحل';

      entries.push({
        id: `exp-${e.id}`,
        date: e.date || new Date().toISOString(),
        type: 'OUT',
        category: `مصروف: ${catLabel}`,
        description: e.description || `مصروف تشغيلي (${catLabel})`,
        amount: Number(e.amount) || 0,
        paymentMethod: e.paidFrom === 'BANK' ? 'BANK' : 'CASH',
        user: 'إدارة المالية',
        referenceId: e.id,
      });
    });

    // Sort descending by date
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [sales, expenses]);

  // Filtered Ledger
  const filteredLedger = useMemo(() => {
    return masterLedger.filter((item) => {
      if (ledgerTypeFilter !== 'ALL' && item.type !== ledgerTypeFilter) return false;
      if (ledgerMethodFilter !== 'ALL' && item.paymentMethod !== ledgerMethodFilter) return false;
      return true;
    });
  }, [masterLedger, ledgerTypeFilter, ledgerMethodFilter]);

  // Aggregated Financial Metrics
  const metrics = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let cashInDrawer = 0;
    let bankTotal = 0;
    let instapayTotal = 0;
    let vodafoneTotal = 0;

    masterLedger.forEach((entry) => {
      if (entry.type === 'IN') {
        totalIn += entry.amount;
        if (entry.paymentMethod === 'CASH') cashInDrawer += entry.amount;
        else if (entry.paymentMethod === 'BANK') bankTotal += entry.amount;
        else if (entry.paymentMethod === 'INSTAPAY') instapayTotal += entry.amount;
        else if (entry.paymentMethod === 'VODAFONE_CASH') vodafoneTotal += entry.amount;
      } else {
        totalOut += entry.amount;
        if (entry.paymentMethod === 'CASH') cashInDrawer -= entry.amount;
        else if (entry.paymentMethod === 'BANK') bankTotal -= entry.amount;
        else if (entry.paymentMethod === 'INSTAPAY') instapayTotal -= entry.amount;
        else if (entry.paymentMethod === 'VODAFONE_CASH') vodafoneTotal -= entry.amount;
      }
    });

    const netCashFlow = totalIn - totalOut;
    const realizedNetProfit = kpis?.netProfit ?? (totalIn - (kpis?.cogs || 0) - totalOut);

    return {
      totalIn,
      totalOut,
      netCashFlow,
      realizedNetProfit,
      cashInDrawer: Math.max(0, cashInDrawer),
      bankTotal,
      instapayTotal,
      vodafoneTotal,
    };
  }, [masterLedger, kpis]);

  const handleRecordExpense = () => {
    const amount = parseFloat(expAmount) || 0;
    if (amount <= 0) return;

    const finalCategory = expCategory === 'CUSTOM' ? customCategory.trim() : expCategory;
    if (!finalCategory) return;

    logExpense(
      {
        branchId: 'b-1',
        category: finalCategory,
        description: expDescription,
        amount,
        paidFrom: expSource,
      },
      {
        onSuccess: () => {
          setShowExpenseModal(false);
          setExpDescription('');
          setExpAmount('');
          setCustomCategory('');
          setExpCategory('SUPPLIES');
        },
      }
    );
  };

  const handlePrintAuditReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredLedger
      .slice(0, 300)
      .map(
        (entry) => `
        <tr>
          <td>${new Date(entry.date).toLocaleString('ar-EG')}</td>
          <td style="color: ${entry.type === 'IN' ? '#10B981' : '#EF4444'}; font-weight: bold;">
            ${entry.type === 'IN' ? '📥 مقبوضات (دخل)' : '📤 مدفوعات (خرج)'}
          </td>
          <td>${entry.category}</td>
          <td>${entry.description}</td>
          <td>${
            entry.paymentMethod === 'CASH'
              ? 'درج النقدية'
              : entry.paymentMethod === 'BANK'
              ? 'حساب بنكي / شبكة'
              : entry.paymentMethod === 'INSTAPAY'
              ? 'إنستاباي'
              : 'فودافون كاش'
          }</td>
          <td style="font-weight: bold; text-align: left;">${formatMoney(entry.amount)}</td>
        </tr>
      `
      )
      .join('');

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>تقرير كشف حركة الأموال والتدفقات المالية الشامل</title>
          <style>
            body { font-family: sans-serif; padding: 24px; color: #1e293b; }
            h2 { color: #0f172a; margin-bottom: 4px; }
            .header-info { margin-bottom: 20px; font-size: 14px; color: #64748b; }
            .summary-cards { display: flex; gap: 16px; margin-bottom: 24px; }
            .card { flex: 1; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
            .card-title { font-size: 12px; color: #64748b; margin-bottom: 4px; }
            .card-value { font-size: 18px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right; }
            th { background-color: #f1f5f9; }
          </style>
        </head>
        <body>
          <h2>تقرير التدفقات المالية وتفاصيل الدخل والخرج (360°)</h2>
          <div class="header-info">تاريخ التقرير: ${new Date().toLocaleString('ar-EG')} — إجمالي الحركات المسجلة: ${filteredLedger.length}</div>
          
          <div class="summary-cards">
            <div class="card">
              <div class="card-title">إجمالي المقبوضات والدواخل</div>
              <div class="card-value" style="color: #10B981;">${formatMoney(metrics.totalIn)}</div>
            </div>
            <div class="card">
              <div class="card-title">إجمالي المصاريف والمدفوعات</div>
              <div class="card-value" style="color: #EF4444;">${formatMoney(metrics.totalOut)}</div>
            </div>
            <div class="card">
              <div class="card-title">صافي التدفق النقدي</div>
              <div class="card-value" style="color: #3B82F6;">${formatMoney(metrics.netCashFlow)}</div>
            </div>
            <div class="card">
              <div class="card-title">النقدية المتوقعة بالدرج</div>
              <div class="card-value">${formatMoney(metrics.cashInDrawer)}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>اتجاه الحركة</th>
                <th>التصنيف</th>
                <th>البيان والتفاصيل</th>
                <th>قناة الدفع</th>
                <th>المبلغ (ج.م)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  const masterLedgerColumns = [
    {
      header: 'التاريخ والوقت',
      accessor: (row: FinancialEntry) => new Date(row.date).toLocaleString('ar-EG'),
      key: 'date',
      sortable: true,
    },
    {
      header: 'اتجاه الحركة',
      accessor: (row: FinancialEntry) => (
        <Badge variant={row.type === 'IN' ? 'success' : 'danger'} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {row.type === 'IN' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
          {row.type === 'IN' ? 'دخل / مقبوضات' : 'خرج / مدفوعات'}
        </Badge>
      ),
      key: 'type',
    },
    {
      header: 'التصنيف',
      accessor: (row: FinancialEntry) => (
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{row.category}</span>
      ),
      key: 'category',
    },
    {
      header: 'البيان والتفاصيل',
      accessor: (row: FinancialEntry) => row.description,
      key: 'description',
    },
    {
      header: 'قناة الدفع',
      accessor: (row: FinancialEntry) => {
        if (row.paymentMethod === 'CASH') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Wallet size={14} color="#10B981" /> درج الكاشير</span>;
        if (row.paymentMethod === 'BANK') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CreditCard size={14} color="#3B82F6" /> بنكي / شبكة</span>;
        if (row.paymentMethod === 'INSTAPAY') return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Building2 size={14} color="#8B5CF6" /> إنستاباي</span>;
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Smartphone size={14} color="#EC4899" /> فودافون كاش</span>;
      },
      key: 'paymentMethod',
    },
    {
      header: 'المبلغ',
      accessor: (row: FinancialEntry) => (
        <span style={{ fontWeight: 'bold', fontSize: '1rem', color: row.type === 'IN' ? 'var(--color-success)' : 'var(--color-danger)' }}>
          {row.type === 'IN' ? '+' : '-'}{formatMoney(row.amount)}
        </span>
      ),
      key: 'amount',
      sortable: true,
    },
    {
      header: 'المسئول',
      accessor: (row: FinancialEntry) => row.user || 'النظام',
      key: 'user',
    },
  ];

  const expensesColumns = [
    { header: 'التاريخ', accessor: 'date' as const, key: 'date', sortable: true },
    {
      header: 'التصنيف',
      accessor: (row: any) => {
        if (row.category === 'RENT') return 'إيجار المقر';
        if (row.category === 'SALARY') return 'رواتب الموظفين';
        if (row.category === 'UTILITIES') return 'مرافق (كهرباء/إنترنت)';
        if (row.category === 'SUPPLIES') return 'مستلزمات وبضائع للمحل';
        if (row.category === 'OTHER') return 'أخرى / تشغيلي عام';
        return row.category;
      },
      key: 'category',
      sortable: true,
    },
    { header: 'البيان / الوصف', accessor: 'description' as const, key: 'description' },
    {
      header: 'القيمة',
      accessor: (row: any) => formatMoney(row.amount),
      key: 'amount',
      sortable: true,
    },
    {
      header: 'الدفع من حـ/',
      accessor: (row: any) => (row.paidFrom === 'BANK' ? 'الحساب البنكي' : 'النقدية بالدرج'),
      key: 'paidFrom',
    },
    {
      header: 'إجراءات',
      accessor: (row: any) => (
        <Can permission={PERMISSIONS.FINANCE_DELETE_EXPENSE}>
          <Button
            onClick={() => {
              if (confirm('هل أنت متأكد من رغبتك في حذف هذا المصروف؟')) {
                deleteExpense(row.id);
              }
            }}
            variant="danger"
            size="sm"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px' }}
          >
            <Trash2 size={12} /> حذف
          </Button>
        </Can>
      ),
      key: 'actions',
    },
  ];

  const closingsColumns = [
    { header: 'تاريخ اليومية', accessor: 'date' as const, key: 'date', sortable: true },
    {
      header: 'مبيعات كاش',
      accessor: (row: any) => formatMoney(row.cashSalesTotal || 0),
      key: 'cashSalesTotal',
    },
    {
      header: 'مبيعات فيزا',
      accessor: (row: any) => formatMoney(row.cardSalesTotal || 0),
      key: 'cardSalesTotal',
    },
    {
      header: 'إنستاباي',
      accessor: (row: any) => formatMoney(row.instapaySalesTotal || 0),
      key: 'instapaySalesTotal',
    },
    {
      header: 'فودافون كاش',
      accessor: (row: any) => formatMoney(row.vodafoneSalesTotal || 0),
      key: 'vodafoneSalesTotal',
    },
    {
      header: 'إجمالي المبيعات',
      accessor: (row: any) => formatMoney(row.totalSales || 0),
      key: 'totalSales',
    },
    {
      header: 'إجمالي المتوقع بالنظام (ج.م)',
      accessor: (row: any) => formatMoney(row.systemExpected),
      key: 'systemExpected',
    },
    {
      header: 'المبلغ الفعلي المجرود (ج.م)',
      accessor: (row: any) => formatMoney(row.physicalActual),
      key: 'physicalActual',
    },
    {
      header: 'الفرق (عجز/زيادة) (ج.م)',
      accessor: (row: any) => {
        const isDiff = row.difference !== 0;
        return (
          <span style={{ color: isDiff ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 'bold' }}>
            {row.difference === 0 ? formatMoney(0) : formatMoney(row.difference, { signed: true })}
          </span>
        );
      },
      key: 'difference',
    },
    {
      header: 'حالة المطابقة',
      accessor: (row: any) => (
        <Badge variant={row.difference === 0 ? 'success' : 'danger'}>
          {row.difference === 0 ? 'متطابق' : 'يوجد فرق يحتاج تسوية'}
        </Badge>
      ),
      key: 'auditCheck',
    },
  ];

  if (loadingExpenses || loadingClosings) {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px' }} />
      </div>
    );
  }

  return (
    <div className="workspace" style={{ gap: 'var(--spacing-4)' }}>
      <PageHeader
        title="الدفتر المالي الرقابي وحركة الأموال (360° Money Flow)"
        subtitle="رقابة فورية على كل جنيه دخل وكل جنيه خرج بالتفاصيل المملة"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={handlePrintAuditReport} variant="secondary" size="sm">
              <Printer size={14} /> طباعة كشف التدفق النقدي
            </Button>
            <Can permission={PERMISSIONS.FINANCE_ADD_EXPENSE}>
              <Button onClick={() => setShowExpenseModal(true)} variant="primary" size="sm">
                <PlusCircle size={14} /> تسجيل مصروف تشغيلي جديد
              </Button>
            </Can>
          </div>
        }
      />

      {/* 4 Financial Control KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--spacing-3)',
        }}
      >
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              إجمالي الدواخل والمقبوضات 📥
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10B981' }}>
              {formatMoney(metrics.totalIn)}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              إجمالي المصاريف والمدفوعات 📤
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#EF4444' }}>
              {formatMoney(metrics.totalOut)}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#3B82F6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wallet size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              صافي التدفق الخزينة (Net Cash)
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
              {formatMoney(metrics.netCashFlow)}
            </div>
          </div>
        </div>

        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TrendingUp size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              صافي أرباح المحل الفعلية (Net Profit)
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#F59E0B' }}>
              {formatMoney(metrics.realizedNetProfit)}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--spacing-2)',
          paddingBottom: '4px',
        }}
      >
        <button
          onClick={() => setActiveSubTab('MASTER_LEDGER')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'MASTER_LEDGER' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'MASTER_LEDGER' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'MASTER_LEDGER' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Receipt size={16} /> كشف حركة الخزينة والتدفق المالي التفصيلي
        </button>
        <button
          onClick={() => setActiveSubTab('EXPENSES')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'EXPENSES' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'EXPENSES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'EXPENSES' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Landmark size={16} /> النفقات والمصاريف التشغيلية
        </button>
        <button
          onClick={() => setActiveSubTab('CLOSINGS')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'CLOSINGS' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'CLOSINGS' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'CLOSINGS' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <FileSpreadsheet size={16} /> إغلاقات درج الكاشير اليومية
        </button>
        <button
          onClick={() => setActiveSubTab('PAYABLE')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'PAYABLE' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'PAYABLE' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'PAYABLE' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <HandCoins size={16} /> حسابات الموردين (أجل)
        </button>
      </div>

      {/* Main Tab Views */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeSubTab === 'MASTER_LEDGER' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            {/* Filter Bar */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                background: 'var(--color-surface)',
                padding: 'var(--spacing-2) var(--spacing-3)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>اتجاه الحركة:</span>
                <Select
                  value={ledgerTypeFilter}
                  onChange={(e) => setLedgerTypeFilter(e.target.value as any)}
                  options={[
                    { value: 'ALL', label: 'جميع الحركات (دواخل ومخارج)' },
                    { value: 'IN', label: '📥 مقبوضات ودواخل فقط' },
                    { value: 'OUT', label: '📤 مصاريف ومخارج فقط' },
                  ]}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>قناة الدفع:</span>
                <Select
                  value={ledgerMethodFilter}
                  onChange={(e) => setLedgerMethodFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'جميع الحسابات' },
                    { value: 'CASH', label: 'درج الكاشير النقدي' },
                    { value: 'BANK', label: 'الحساب البنكي / الشبكة' },
                    { value: 'INSTAPAY', label: 'إنستاباي (InstaPay)' },
                    { value: 'VODAFONE_CASH', label: 'فودافون كاش' },
                  ]}
                />
              </div>
            </div>

            <DataTable
              data={filteredLedger}
              columns={masterLedgerColumns}
              rowKey="id"
              searchField="description"
              searchPlaceholder="ابحث بالبيان، اسم الفاتورة، أو اسم العميل..."
            />
          </div>
        )}

        {activeSubTab === 'EXPENSES' && (
          <DataTable
            data={[...(expenses || [])].reverse()}
            columns={expensesColumns}
            rowKey="id"
            searchField="description"
            searchPlaceholder="ابحث ببيان أو وصف المصروف..."
          />
        )}

        {activeSubTab === 'CLOSINGS' && (
          <DataTable data={[...(closings || [])].reverse()} columns={closingsColumns} rowKey="id" />
        )}

        {activeSubTab === 'PAYABLE' && <AccountsPayablePanel />}
      </div>

      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title="تسجيل مصروف تشغيلي جديد"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowExpenseModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleRecordExpense} disabled={logging} variant="primary">
              حفظ وتسجيل المصروف
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Select
            label="تصنيف المصروف"
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value)}
            options={[
              { value: 'SUPPLIES', label: 'مستلزمات وبضائع للمحل والحيوانات' },
              { value: 'RENT', label: 'إيجار مقر الفرع' },
              { value: 'SALARY', label: 'رواتب وأجور الموظفين' },
              { value: 'UTILITIES', label: 'فواتير ومرافق (كهرباء/إنترنت/مياه)' },
              { value: 'OTHER', label: 'نفقات تشغيلية أخرى عامة' },
              { value: 'CUSTOM', label: 'تصنيف مخصص... (أدخل اسماً مخصصاً)' },
            ]}
          />

          {expCategory === 'CUSTOM' && (
            <Input
              label="اسم التصنيف المخصص"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="مثال: مصاريف شخصية مروان، نظافة، ضيافة..."
            />
          )}

          <Input
            label="قيمة المصروف (ج.م)"
            value={expAmount}
            onChange={(e) => setExpAmount(e.target.value)}
            placeholder="0.00"
          />

          <Input
            label="بيان أو وصف المصروف"
            value={expDescription}
            onChange={(e) => setExpDescription(e.target.value)}
            placeholder="مثال: شراء شامبو تنظيف شعر الحيوانات الاحترافي"
          />

          <Select
            label="حساب مصدر الدفع"
            value={expSource}
            onChange={(e) => setExpSource(e.target.value as any)}
            options={[
              { value: 'BANK', label: 'الحساب البنكي الرئيسي للمؤسسة' },
              { value: 'CASH', label: 'درج الكاشير النقدي بالفرع' },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Finance;
