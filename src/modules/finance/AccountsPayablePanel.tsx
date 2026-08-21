import React, { useState } from 'react';
import {
  useAccountsPayableDashboard,
  usePayInstallment,
  useSetInvoiceInstallments,
  useUpdateAccountsPayableSettings,
  usePurchaseInvoices,
} from '../../core/hooks/useERPData';
import {
  AlertTriangle, CalendarClock, Wallet, Building2, Bell, CreditCard,
  Plus, Trash2, Settings2
} from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import { formatMoney } from '../../core/utils/money';
import type { PurchaseInvoiceInstallment, SupplierPayableSummary } from '../../types/erp';

type InstallmentDraft = { installmentNumber: number; dueDate: string; amount: string; notes: string };

const AccountsPayablePanel: React.FC = () => {
  const { data: dashboard, isLoading } = useAccountsPayableDashboard();
  const { data: invoices = [] } = usePurchaseInvoices();
  const { mutate: payInstallment, isPending: paying } = usePayInstallment();
  const { mutate: setInstallments, isPending: savingSchedule } = useSetInvoiceInstallments();
  const { mutate: updateSettings, isPending: savingSettings } = useUpdateAccountsPayableSettings();

  const [payingItem, setPayingItem] = useState<PurchaseInvoiceInstallment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'BANK' | 'INSTAPAY' | 'VODAFONE_CASH'>('CASH');
  const [payNotes, setPayNotes] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [reminderDays, setReminderDays] = useState('7');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleInvoiceId, setScheduleInvoiceId] = useState('');
  const [paymentType, setPaymentType] = useState<'LUMP_SUM' | 'INSTALLMENTS'>('LUMP_SUM');
  const [installmentDrafts, setInstallmentDrafts] = useState<InstallmentDraft[]>([
    { installmentNumber: 1, dueDate: new Date().toISOString().split('T')[0], amount: '', notes: '' },
  ]);
  const [activeView, setActiveView] = useState<'PRIORITY' | 'SUPPLIERS'>('PRIORITY');

  if (isLoading || !dashboard) {
    return <div className="skeleton" style={{ height: '200px' }} />;
  }

  const openPayModal = (item: PurchaseInvoiceInstallment) => {
    setPayingItem(item);
    setPayAmount(String(item.remainingAmount ?? (item.amount - item.paidAmount)));
    setPayMethod('CASH');
    setPayNotes('');
  };

  const handlePay = () => {
    if (!payingItem) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return;

    let methodLabel = 'نقدي';
    if (payMethod === 'BANK') methodLabel = 'تحويل بنكي';
    if (payMethod === 'INSTAPAY') methodLabel = 'إنستاباي (Instapay)';
    if (payMethod === 'VODAFONE_CASH') methodLabel = 'فودافون كاش';

    const finalNotes = payNotes ? `[${methodLabel}] ${payNotes}` : `[${methodLabel}]`;

    payInstallment(
      { installmentId: payingItem.id, amount, notes: finalNotes },
      { onSuccess: () => setPayingItem(null) }
    );
  };

  const openScheduleModal = (invoiceId?: string) => {
    const inv = invoices.find(i => i.id === invoiceId) || invoices.find(i => i.paymentStatus !== 'PAID');
    if (!inv) return;
    setScheduleInvoiceId(inv.id);
    setPaymentType(inv.paymentType || 'LUMP_SUM');
    if (inv.installments && inv.installments.length > 0) {
      setInstallmentDrafts(inv.installments.map(inst => ({
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate?.substring(0, 10) || '',
        amount: String(inst.amount),
        notes: inst.notes || '',
      })));
    } else {
      setInstallmentDrafts([{
        installmentNumber: 1,
        dueDate: inv.dueDate?.substring(0, 10) || inv.invoiceDate?.substring(0, 10) || new Date().toISOString().split('T')[0],
        amount: String(inv.grandTotal),
        notes: '',
      }]);
    }
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = () => {
    const inv = invoices.find(i => i.id === scheduleInvoiceId);
    if (!inv) return;

    if (paymentType === 'INSTALLMENTS') {
      const parsed = installmentDrafts.map((d, idx) => ({
        installmentNumber: d.installmentNumber || idx + 1,
        dueDate: d.dueDate,
        amount: parseFloat(d.amount) || 0,
        notes: d.notes || undefined,
      }));
      const total = parsed.reduce((s, p) => s + p.amount, 0);
      if (Math.abs(total - inv.grandTotal) > 0.01) {
        alert(`مجموع الدفعات (${formatMoney(total)}) يجب أن يساوي إجمالي الفاتورة (${formatMoney(inv.grandTotal)})`);
        return;
      }
      setInstallments(
        { invoiceId: scheduleInvoiceId, paymentType: 'INSTALLMENTS', installments: parsed },
        { onSuccess: () => setShowScheduleModal(false) }
      );
    } else {
      setInstallments(
        { invoiceId: scheduleInvoiceId, paymentType: 'LUMP_SUM', installments: [] },
        { onSuccess: () => setShowScheduleModal(false) }
      );
    }
  };

  const handleSaveSettings = () => {
    const days = parseInt(reminderDays, 10);
    if (days < 1 || days > 90) return;
    updateSettings(days, { onSuccess: () => setShowSettings(false) });
  };

  const statusBadge = (item: PurchaseInvoiceInstallment) => {
    if (item.overdue) return <Badge variant="danger">متأخرة ({Math.abs(item.daysUntilDue ?? 0)} يوم)</Badge>;
    if (item.dueSoon) return <Badge variant="warning">مستحقة قريباً ({item.daysUntilDue} يوم)</Badge>;
    if (item.status === 'PARTIALLY_PAID') return <Badge variant="info">مدفوعة جزئياً</Badge>;
    if (!item.dueDate) return <Badge variant="gray">مفتوحة — ادفع وقت ما تحب</Badge>;
    return <Badge variant="gray">معلقة</Badge>;
  };

  const priorityColumns = [
    {
      header: 'الأولوية',
      accessor: (row: PurchaseInvoiceInstallment) => {
        const idx = dashboard.priorityQueue.findIndex(p => p.id === row.id);
        return `#${idx + 1}`;
      },
      key: 'priority',
    },
    { header: 'المورد', accessor: 'supplierName' as const, key: 'supplier', sortable: true },
    { header: 'رقم الفاتورة', accessor: 'invoiceNumber' as const, key: 'invoiceNumber', sortable: true },
    {
      header: 'الدفعة',
      accessor: (row: PurchaseInvoiceInstallment) =>
        row.installmentNumber > 1 || (dashboard.priorityQueue.filter(p => p.purchaseInvoiceId === row.purchaseInvoiceId).length > 1)
          ? `دفعة ${row.installmentNumber}`
          : 'دفعة واحدة',
      key: 'installment',
    },
    {
      header: 'تاريخ الاستحقاق',
      accessor: (row: PurchaseInvoiceInstallment) =>
        row.dueDate ? new Date(row.dueDate).toLocaleDateString('ar-EG') : 'مفتوح — بدون موعد محدد',
      key: 'dueDate',
      sortable: true,
    },
    {
      header: 'المبلغ المتبقي',
      accessor: (row: PurchaseInvoiceInstallment) => formatMoney(row.remainingAmount ?? (row.amount - row.paidAmount)),
      key: 'remaining',
      sortable: true,
    },
    {
      header: 'الحالة',
      accessor: (row: PurchaseInvoiceInstallment) => statusBadge(row),
      key: 'status',
    },
    {
      header: 'إجراء',
      accessor: (row: PurchaseInvoiceInstallment) => (
        <Button variant="primary" size="sm" onClick={() => openPayModal(row)}>
          <CreditCard size={12} /> سداد
        </Button>
      ),
      key: 'actions',
    },
  ];

  const supplierColumns = [
    { header: 'المورد', accessor: 'supplierName' as const, key: 'name', sortable: true },
    { header: 'إجمالي المديونية', accessor: (r: SupplierPayableSummary) => formatMoney(r.totalDebt), key: 'debt', sortable: true },
    { header: 'المدفوع', accessor: (r: SupplierPayableSummary) => formatMoney(r.totalPaid), key: 'paid' },
    { header: 'المتبقي', accessor: (r: SupplierPayableSummary) => formatMoney(r.remaining), key: 'remaining', sortable: true },
    {
      header: 'متأخرة',
      accessor: (r: SupplierPayableSummary) => r.overdueCount > 0
        ? <Badge variant="danger">{r.overdueCount}</Badge>
        : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>,
      key: 'overdue',
    },
    {
      header: 'مستحقة قريباً',
      accessor: (r: SupplierPayableSummary) => r.dueSoonCount > 0
        ? <Badge variant="warning">{r.dueSoonCount}</Badge>
        : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>,
      key: 'dueSoon',
    },
    { header: 'فواتير مفتوحة', accessor: 'openInvoiceCount' as const, key: 'openInvoices' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-3)' }}>
        <SummaryCard icon={<Wallet size={20} />} label="إجمالي المتبقي" value={formatMoney(dashboard.totalRemaining)} color="var(--color-primary)" />
        <SummaryCard icon={<AlertTriangle size={20} />} label="دفعات متأخرة" value={String(dashboard.overdueCount)} color="var(--color-danger)" />
        <SummaryCard icon={<CalendarClock size={20} />} label={`مستحقة خلال ${dashboard.reminderDaysBeforeDue} أيام`} value={String(dashboard.dueSoonCount)} color="var(--color-warning)" />
        <SummaryCard icon={<Building2 size={20} />} label="دفعات معلقة" value={String(dashboard.openInstallmentCount)} color="var(--color-info)" />
      </div>

      {/* Alerts banner */}
      {dashboard.alerts.length > 0 && (
        <div style={{
          background: 'var(--color-warning-bg, rgba(245,158,11,0.1))',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-3)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--spacing-2)',
        }}>
          <Bell size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>تنبيهات السداد ({dashboard.alerts.length})</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              {dashboard.alerts.slice(0, 3).map(a => (
                <div key={a.id}>
                  {a.supplierName} — فاتورة {a.invoiceNumber} — {formatMoney(a.remainingAmount ?? (a.amount - a.paidAmount))}
                  {a.overdue ? ' (متأخرة)' : ` (خلال ${a.daysUntilDue} يوم)`}
                </div>
              ))}
              {dashboard.alerts.length > 3 && <div>... و {dashboard.alerts.length - 3} تنبيهات أخرى</div>}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveView('PRIORITY')}
            className="btn-ghost"
            style={{
              padding: '6px 16px',
              borderBottom: activeView === 'PRIORITY' ? '2px solid var(--color-primary)' : 'none',
              color: activeView === 'PRIORITY' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeView === 'PRIORITY' ? 'bold' : 'normal',
            }}
          >
            أولوية السداد
          </button>
          <button
            onClick={() => setActiveView('SUPPLIERS')}
            className="btn-ghost"
            style={{
              padding: '6px 16px',
              borderBottom: activeView === 'SUPPLIERS' ? '2px solid var(--color-primary)' : 'none',
              color: activeView === 'SUPPLIERS' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: activeView === 'SUPPLIERS' ? 'bold' : 'normal',
            }}
          >
            ملخص الموردين
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="secondary" size="sm" onClick={() => { setReminderDays(String(dashboard.reminderDaysBeforeDue)); setShowSettings(true); }}>
            <Settings2 size={14} /> إعدادات التنبيه ({dashboard.reminderDaysBeforeDue} يوم)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openScheduleModal()}>
            <Plus size={14} /> جدولة دفعات
          </Button>
        </div>
      </div>

      {activeView === 'PRIORITY' && (
        <DataTable
          data={dashboard.priorityQueue}
          columns={priorityColumns}
          rowKey="id"
          searchField="supplierName"
          searchPlaceholder="ابحث بالمورد..."
        />
      )}

      {activeView === 'SUPPLIERS' && (
        <DataTable
          data={dashboard.supplierSummaries.map(s => ({ ...s, id: s.supplierId || s.supplierName }))}
          columns={supplierColumns}
          rowKey="id"
          searchField="supplierName"
          searchPlaceholder="ابحث بالمورد..."
        />
      )}

      {/* Pay modal */}
      <Modal
        isOpen={!!payingItem}
        onClose={() => setPayingItem(null)}
        title={`سداد دفعة — ${payingItem?.supplierName}`}
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setPayingItem(null)}>إلغاء</Button>
            <Button variant="primary" onClick={handlePay} disabled={paying}>تسجيل السداد</Button>
          </div>
        }
      >
        {payingItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              فاتورة {payingItem.invoiceNumber} — دفعة {payingItem.installmentNumber}
              <br />
              المتبقي: {formatMoney(payingItem.remainingAmount ?? (payingItem.amount - payingItem.paidAmount))}
            </div>
            <Input
              label="مبلغ السداد (ج.م)"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="0.00"
            />
            <Select
              label="طريقة الدفع"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as any)}
              options={[
                { value: 'CASH', label: 'نقدي (من الخزنة)' },
                { value: 'BANK', label: 'تحويل بنكي' },
                { value: 'INSTAPAY', label: 'إنستاباي (Instapay)' },
                { value: 'VODAFONE_CASH', label: 'فودافون كاش' },
              ]}
            />
            <Input
              label="ملاحظات (اختياري)"
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="رقم التحويل، رقم الهاتف المحول منه..."
            />
          </div>
        )}
      </Modal>

      {/* Settings modal */}
      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="إعدادات تنبيهات السداد"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setShowSettings(false)}>إلغاء</Button>
            <Button variant="primary" onClick={handleSaveSettings} disabled={savingSettings}>حفظ</Button>
          </div>
        }
      >
        <Input
          label="عدد أيام التنبيه قبل الاستحقاق"
          value={reminderDays}
          onChange={(e) => setReminderDays(e.target.value)}
          placeholder="7"
        />
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          سيظهر تنبيه للدفعات التي موعد استحقاقها خلال هذا العدد من الأيام (مثلاً 7 أو 15 يوم).
        </p>
      </Modal>

      {/* Schedule installments modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="جدولة دفعات الفاتورة"
        maxWidth="640px"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" onClick={() => setShowScheduleModal(false)}>إلغاء</Button>
            <Button variant="primary" onClick={handleSaveSchedule} disabled={savingSchedule}>حفظ الجدول</Button>
          </div>
        }
      >
        <Select
          label="الفاتورة"
          value={scheduleInvoiceId}
          onChange={(e) => openScheduleModal(e.target.value)}
          options={invoices
            .filter(i => i.paymentStatus !== 'PAID')
            .map(i => ({
              value: i.id,
              label: `${i.supplierName} — ${i.invoiceNumber} (${formatMoney(i.grandTotal - (i.paidAmount || 0))} متبقي)`,
            }))}
        />
        <Select
          label="نوع السداد"
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value as 'LUMP_SUM' | 'INSTALLMENTS')}
          options={[
            { value: 'LUMP_SUM', label: 'دفعة واحدة' },
            { value: 'INSTALLMENTS', label: 'على دفعات' },
          ]}
        />

        {paymentType === 'INSTALLMENTS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>جدول الدفعات</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setInstallmentDrafts(prev => [
                  ...prev,
                  {
                    installmentNumber: prev.length + 1,
                    dueDate: new Date().toISOString().split('T')[0],
                    amount: '',
                    notes: '',
                  },
                ])}
              >
                <Plus size={12} /> إضافة دفعة
              </Button>
            </div>
            {installmentDrafts.map((draft, idx) => (
              <div key={idx} style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr auto',
                gap: '8px',
                alignItems: 'end',
                padding: '8px',
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}>
                <DatePicker
                  label={`دفعة ${idx + 1} — تاريخ الاستحقاق`}
                  value={draft.dueDate}
                  onChange={(v) => {
                    const next = [...installmentDrafts];
                    next[idx] = { ...next[idx], dueDate: v };
                    setInstallmentDrafts(next);
                  }}
                />
                <Input
                  label="المبلغ (ج.م)"
                  value={draft.amount}
                  onChange={(e) => {
                    const next = [...installmentDrafts];
                    next[idx] = { ...next[idx], amount: e.target.value };
                    setInstallmentDrafts(next);
                  }}
                  placeholder="0.00"
                />
                <Input
                  label="ملاحظات"
                  value={draft.notes}
                  onChange={(e) => {
                    const next = [...installmentDrafts];
                    next[idx] = { ...next[idx], notes: e.target.value };
                    setInstallmentDrafts(next);
                  }}
                />
                {installmentDrafts.length > 1 && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setInstallmentDrafts(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
              </div>
            ))}
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              المجموع: {formatMoney(installmentDrafts.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0))}
              {scheduleInvoiceId && (() => {
                const inv = invoices.find(i => i.id === scheduleInvoiceId);
                return inv ? ` / ${formatMoney(inv.grandTotal)} (إجمالي الفاتورة)` : '';
              })()}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({
  icon, label, value, color,
}) => (
  <div style={{
    padding: 'var(--spacing-3)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-surface, var(--color-bg))',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color, fontSize: 'var(--font-size-sm)' }}>
      {icon} {label}
    </div>
    <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>{value}</div>
  </div>
);

export default AccountsPayablePanel;
