import React, { useState } from 'react';
import { useExpenses, useDailyClosings, useAddExpense, useAuditLogs, useSales } from '../../core/hooks/useERPData';
import { PlusCircle, Landmark, BookOpen, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';

export const Finance: React.FC = () => {
  const { data: expenses, isLoading: loadingExpenses } = useExpenses();
  const { data: closings, isLoading: loadingClosings } = useDailyClosings();
  const { data: auditLogs } = useAuditLogs();
  const { data: sales } = useSales();
  const { mutate: logExpense, isPending: logging } = useAddExpense();

  // Local state
  const [activeSubTab, setActiveSubTab] = useState<'EXPENSES' | 'CLOSINGS' | 'JOURNAL' | 'AUDIT'>('EXPENSES');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<'RENT' | 'SALARY' | 'UTILITIES' | 'SUPPLIES' | 'OTHER'>('SUPPLIES');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expSource, setExpSource] = useState<'CASH' | 'BANK'>('BANK');

  if (loadingExpenses || loadingClosings) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const handleRecordExpense = () => {
    const amount = parseFloat(expAmount) || 0;
    if (amount <= 0) return;

    logExpense({
      branchId: 'b-1',
      category: expCategory,
      description: expDescription,
      amount,
      paidFrom: expSource
    }, {
      onSuccess: () => {
        setShowExpenseModal(false);
        setExpDescription('');
        setExpAmount('');
      }
    });
  };

  // Columns Definitions
  const expensesColumns = [
    { header: 'التاريخ', accessor: 'date' as const, key: 'date', sortable: true },
    { 
      header: 'التصنيف', 
      accessor: (row: any) => {
        if (row.category === 'RENT') return 'إيجار المقر';
        if (row.category === 'SALARY') return 'رواتب الموظفين';
        if (row.category === 'UTILITIES') return 'مرافق (كهرباء/إنترنت)';
        if (row.category === 'SUPPLIES') return 'مستلزمات وبضائع للمحل';
        return 'أخرى / تشغيلي عام';
      },
      key: 'category', 
      sortable: true 
    },
    { header: 'البيان / الوصف', accessor: 'description' as const, key: 'description' },
    { 
      header: 'القيمة', 
      accessor: (row: any) => `$${row.amount.toFixed(2)}`, 
      key: 'amount', 
      sortable: true 
    },
    { 
      header: 'الدفع من حـ/', 
      accessor: (row: any) => row.paidFrom === 'BANK' ? 'الحساب البنكي' : 'النقدية بالدرج', 
      key: 'paidFrom' 
    }
  ];

  const closingsColumns = [
    { header: 'تاريخ الوردية', accessor: 'date' as const, key: 'date', sortable: true },
    { 
      header: 'الرصيد الدفتري المتوقع ($)', 
      accessor: (row: any) => `$${row.systemExpected.toFixed(2)}`, 
      key: 'systemExpected' 
    },
    { 
      header: 'العد النقدي الفعلي ($)', 
      accessor: (row: any) => `$${row.physicalActual.toFixed(2)}`, 
      key: 'physicalActual' 
    },
    {
      header: 'الفارق النقدي ($)',
      accessor: (row: any) => {
        const isDiff = row.difference !== 0;
        return (
          <span style={{ color: isDiff ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 'bold' }}>
            {row.difference === 0 ? '$0.00' : `${row.difference > 0 ? '+' : ''}$${row.difference.toFixed(2)}`}
          </span>
        );
      },
      key: 'difference'
    },
    {
      header: 'تدقيق الحسابات',
      accessor: (row: any) => (
        <Badge variant={row.difference === 0 ? 'success' : 'danger'}>
          {row.difference === 0 ? 'متطابق' : 'فروقات تطلب مراجعة'}
        </Badge>
      ),
      key: 'auditCheck'
    }
  ];

  // Dynamic double-entry generation based on recent sales & refunds
  const dynamicJournals = [...(sales || [])].reverse().slice(0, 15).flatMap((s) => {
    const dateStr = s.date.split('T')[0];
    const isRefunded = s.status === 'REFUNDED';
    
    const entries = [
      {
        id: `j-sale-${s.id}`,
        date: dateStr,
        desc: `مبيعات عملاء - فاتورة ${s.saleNumber}`,
        debit: s.paymentMethod === 'CASH' ? 'أصل (صندوق النقدية بالدرج)' : 'أصل (حساب البنك Operating)',
        credit: 'إيراد (مبيعات منتجات POS)',
        val: s.totalAmount
      }
    ];

    if (isRefunded) {
      entries.unshift({
        id: `j-ref-${s.id}`,
        date: dateStr,
        desc: `عكس قيد مبيعات - إرجاع فاتورة ${s.saleNumber} بالكامل`,
        debit: 'إيراد (مبيعات منتجات POS)',
        credit: s.paymentMethod === 'CASH' ? 'أصل (صندوق النقدية بالدرج)' : 'أصل (حساب البنك Operating)',
        val: s.totalAmount
      });
    }

    return entries;
  });

  const allJournalEntries = [
    ...dynamicJournals,
    { id: 'j-init-3', date: '2026-07-05', desc: 'إيداع نقدي من الدرج لحساب البنك Corporate', debit: 'أصل (حساب البنك Operating)', credit: 'أصل (صندوق النقدية بالدرج)', val: 120.00 },
    { id: 'j-init-4', date: '2026-07-01', desc: 'سداد إيجار مقر المحل الشهري للفرع', debit: 'مصروف (حساب الإيجارات)', credit: 'أصل (حساب البنك Operating)', val: 1500.00 }
  ];

  const journalColumns = [
    { header: 'تاريخ الترحيل', accessor: 'date' as const, key: 'date' },
    { header: 'البيان / الوصف', accessor: 'desc' as const, key: 'desc' },
    { header: 'الجانب المدين (حـ/)', accessor: 'debit' as const, key: 'debit' },
    { header: 'الجانب الدائن (حـ/)', accessor: 'credit' as const, key: 'credit' },
    { 
      header: 'القيمة المالية ($)', 
      accessor: (row: any) => `$${row.val.toFixed(2)}`, 
      key: 'val' 
    }
  ];

  const auditColumns = [
    { header: 'التاريخ والوقت', accessor: 'timestamp' as const, key: 'timestamp', sortable: true },
    { header: 'الموظف المسؤول', accessor: 'employeeName' as const, key: 'employeeName', sortable: true },
    { 
      header: 'نوع العملية', 
      accessor: (row: any) => (
        <Badge variant={row.action === 'REFUND' ? 'danger' : row.action === 'LOGIN' ? 'info' : 'warning'}>
          {row.action === 'REFUND' ? 'إلغاء ومرتجع' : row.action === 'LOGIN' ? 'تسجيل دخول' : 'تعديل جرد'}
        </Badge>
      ), 
      key: 'action', 
      sortable: true 
    },
    { header: 'تفاصيل الإجراء والمراقبة الأمنية', accessor: 'message' as const, key: 'message' }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="الدفتر المالي والعمليات المحاسبية" 
        subtitle="مراقبة قيود اليومية المزدوجة، إغلاق ورديات الكاشير، وتسجيل المصاريف"
        actions={
          <Button onClick={() => setShowExpenseModal(true)} variant="primary" size="sm">
            <PlusCircle size={14} /> تسجيل مصروف تشغيلي جديد
          </Button>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: 'var(--spacing-2)', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveSubTab('EXPENSES')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'EXPENSES' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'EXPENSES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'EXPENSES' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
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
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <FileSpreadsheet size={16} /> إغلاقات درج الكاشير اليومية
        </button>
        <button
          onClick={() => setActiveSubTab('JOURNAL')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'JOURNAL' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'JOURNAL' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'JOURNAL' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <BookOpen size={16} /> قيود اليومية المزدوجة
        </button>
        <button
          onClick={() => setActiveSubTab('AUDIT')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'AUDIT' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'AUDIT' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'AUDIT' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <ShieldAlert size={16} /> سجل رقابة وتدقيق العمليات أمنياً
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
          <DataTable
            data={[...(closings || [])].reverse()}
            columns={closingsColumns}
            rowKey="id"
          />
        )}

        {activeSubTab === 'JOURNAL' && (
          <DataTable
            data={allJournalEntries}
            columns={journalColumns}
            rowKey="id"
            searchField="desc"
            searchPlaceholder="ابحث بالبيان المحاسبي للقيود..."
          />
        )}

        {activeSubTab === 'AUDIT' && (
          <DataTable
            data={auditLogs || []}
            columns={auditColumns}
            rowKey="id"
            searchField="message"
            searchPlaceholder="ابحث في سجل تدقيق العمليات..."
          />
        )}
      </div>

      {/* RECORD EXPENSE MODAL */}
      <Modal
        isOpen={showExpenseModal}
        onClose={() => setShowExpenseModal(false)}
        title="تسجيل مصروف تشغيلي جديد"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowExpenseModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleRecordExpense} disabled={logging} variant="primary">حفظ وتسجيل المصروف</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Select
            label="تصنيف المصروف"
            value={expCategory}
            onChange={(e) => setExpCategory(e.target.value as any)}
            options={[
              { value: 'SUPPLIES', label: 'مستلزمات وبضائع للمحل والحيوانات' },
              { value: 'RENT', label: 'إيجار مقر الفرع' },
              { value: 'SALARY', label: 'رواتب وأجور الموظفين' },
              { value: 'UTILITIES', label: 'فواتير ومرافق (كهرباء/إنترنت/مياه)' },
              { value: 'OTHER', label: 'نفقات تشغيلية أخرى عامة' }
            ]}
          />

          <Input
            label="قيمة المصروف ($)"
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
              { value: 'CASH', label: 'درج الكاشير النقدي بالفرع' }
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Finance;
