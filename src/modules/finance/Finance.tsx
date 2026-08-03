import React, { useState } from 'react';
import { useExpenses, useDailyClosings, useAddExpense, useDeleteExpense } from '../../core/hooks/useERPData';
import { PlusCircle, Landmark, FileSpreadsheet, Trash2, HandCoins } from 'lucide-react';
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
import QueryErrorFallback from '../../components/ui/QueryErrorFallback';

export const Finance: React.FC = () => {
  const { data: expenses, isLoading: loadingExpenses, isError: expensesError, refetch: refetchExpenses } = useExpenses();
  const { data: closings, isLoading: loadingClosings, isError: closingsError, refetch: refetchClosings } = useDailyClosings();
  const { mutate: logExpense, isPending: logging } = useAddExpense();
  const { mutate: deleteExpense } = useDeleteExpense();

  const [activeSubTab, setActiveSubTab] = useState<'EXPENSES' | 'CLOSINGS' | 'PAYABLE'>('EXPENSES');
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<string>('SUPPLIES');
  const [customCategory, setCustomCategory] = useState('');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expSource, setExpSource] = useState<'CASH' | 'BANK'>('BANK');

  if (loadingExpenses || loadingClosings) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  if (expensesError || closingsError) {
    return (
      <QueryErrorFallback
        title="تعذر تحميل بيانات المالية"
        onRetry={() => {
          void refetchExpenses();
          void refetchClosings();
        }}
      />
    );
  }

  const handleRecordExpense = () => {
    const amount = parseFloat(expAmount) || 0;
    if (amount <= 0) return;

    const finalCategory = expCategory === 'CUSTOM' ? customCategory.trim() : expCategory;
    if (!finalCategory) return;

    logExpense({
      branchId: 'b-1',
      category: finalCategory,
      description: expDescription,
      amount,
      paidFrom: expSource
    }, {
      onSuccess: () => {
        setShowExpenseModal(false);
        setExpDescription('');
        setExpAmount('');
        setCustomCategory('');
        setExpCategory('SUPPLIES');
      }
    });
  };

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
      sortable: true 
    },
    { header: 'البيان / الوصف', accessor: 'description' as const, key: 'description' },
    { 
      header: 'القيمة', 
      accessor: (row: any) => formatMoney(row.amount), 
      key: 'amount', 
      sortable: true 
    },
    { 
      header: 'الدفع من حـ/', 
      accessor: (row: any) => row.paidFrom === 'BANK' ? 'الحساب البنكي' : 'النقدية بالدرج', 
      key: 'paidFrom' 
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
      key: 'actions'
    }
  ];

  const closingsColumns = [
    { header: 'تاريخ الوردية', accessor: 'date' as const, key: 'date', sortable: true },
    { 
      header: 'الرصيد الدفتري المتوقع (ج.م)', 
      accessor: (row: any) => formatMoney(row.systemExpected), 
      key: 'systemExpected' 
    },
    { 
      header: 'العد النقدي الفعلي (ج.م)', 
      accessor: (row: any) => formatMoney(row.physicalActual), 
      key: 'physicalActual' 
    },
    {
      header: 'الفارق النقدي (ج.م)',
      accessor: (row: any) => {
        const isDiff = row.difference !== 0;
        return (
          <span style={{ color: isDiff ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: 'bold' }}>
            {row.difference === 0 ? formatMoney(0) : formatMoney(row.difference, { signed: true })}
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

  return (
    <div className="workspace">
      <PageHeader 
        title="الدفتر المالي والعمليات المحاسبية" 
        subtitle="إغلاق ورديات الكاشير، وتسجيل المصاريف التشغيلية"
        actions={
          <Can permission={PERMISSIONS.FINANCE_ADD_EXPENSE}>
            <Button onClick={() => setShowExpenseModal(true)} variant="primary" size="sm">
              <PlusCircle size={14} /> تسجيل مصروف تشغيلي جديد
            </Button>
          </Can>
        }
      />

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
          onClick={() => setActiveSubTab('PAYABLE')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'PAYABLE' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'PAYABLE' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'PAYABLE' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <HandCoins size={16} /> حسابات الموردين (أجل)
        </button>
      </div>

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

        {activeSubTab === 'PAYABLE' && <AccountsPayablePanel />}
      </div>

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
            onChange={(e) => setExpCategory(e.target.value)}
            options={[
              { value: 'SUPPLIES', label: 'مستلزمات وبضائع للمحل والحيوانات' },
              { value: 'RENT', label: 'إيجار مقر الفرع' },
              { value: 'SALARY', label: 'رواتب وأجور الموظفين' },
              { value: 'UTILITIES', label: 'فواتير ومرافق (كهرباء/إنترنت/مياه)' },
              { value: 'OTHER', label: 'نفقات تشغيلية أخرى عامة' },
              { value: 'CUSTOM', label: 'تصنيف مخصص... (أدخل اسماً مخصصاً)' }
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
              { value: 'CASH', label: 'درج الكاشير النقدي بالفرع' }
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Finance;
