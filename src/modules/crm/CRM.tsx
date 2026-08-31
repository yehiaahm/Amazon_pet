import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  useCustomers,
  useAddCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useSales,
  usePets,
  useAppointments,
  useLoyaltyAccount,
  useLoyaltyLedger,
  useAdjustLoyalty,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { PlusCircle, AlertTriangle, Pencil, History, ChevronDown, ChevronUp, Receipt, Wallet, Settings2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import type { Appointment, Customer, Sale } from '../../types/erp';
import { isCompletedSale, saleRevenue, saleStatusLabel, saleStatusBadgeVariant } from '../../core/utils/saleFinance';
import { formatMoney } from '../../core/utils/money';
import Can from '../../components/ui/Can';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';
import LoyaltySettingsPanel from '../loyalty/LoyaltySettingsPanel';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة بنكية',
  MOBILE: 'دفع إلكتروني',
  INSTAPAY: 'إنستاباي',
  VODAFONE_CASH: 'فودافون كاش',
};

const LOYALTY_LEDGER_TYPE_LABELS: Record<string, string> = {
  EARNED: 'كسب',
  USED: 'استخدام',
  RETURN_REVERSAL: 'عكس مرتجع',
  MANUAL_ADJUSTMENT: 'تعديل يدوي',
  EXPIRED: 'انتهاء صلاحية',
};

function startOfCurrentMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function appointmentPetId(a: Appointment | Record<string, unknown>): string | undefined {
  if (typeof (a as Appointment).petId === 'string') return (a as Appointment).petId;
  const nested = (a as { pet?: { id?: string } }).pet;
  return nested?.id;
}

/**
 * Per-customer visit / loyalty metrics from real sales + completed appointments.
 *
 * Visit events:
 *   - completed sales with sale.customerId === customerId
 *   - COMPLETED appointments for pets owned by the customer
 *
 * monthlyVisits  = count of visit events whose date falls in the current calendar month
 * lastVisitDate  = latest visit event date (sale.date or appointment.dateTime)
 * diffDays       = whole days since lastVisitDate (0 if none)
 *
 * Loyalty status formula:
 *   NO_VISITS  — no visit events ever
 *   CHURN_RISK — last visit > 30 days ago
 *   LOYAL      — last visit ≤ 30 days AND monthlyVisits ≥ 3
 *   REGULAR    — last visit ≤ 30 days AND monthlyVisits < 3
 */
type LoyaltyMetrics = {
  monthlyVisits: number;
  lastVisitDate: Date | null;
  diffDays: number;
  status: 'NO_VISITS' | 'CHURN_RISK' | 'LOYAL' | 'REGULAR';
};

type CustomerRow = Customer & { searchText: string };

const EMPTY_LOYALTY: LoyaltyMetrics = {
  monthlyVisits: 0,
  lastVisitDate: null,
  diffDays: 0,
  status: 'NO_VISITS',
};

export const CRM: React.FC = () => {
  const { data: customers, isLoading: loadingCusts } = useCustomers();
  const { mutate: createCustomer, isPending: adding } = useAddCustomer();
  const { mutate: updateCustomer, mutateAsync: updateCustomerAsync, isPending: updating } = useUpdateCustomer();
  const { mutateAsync: deleteCustomerAsync } = useDeleteCustomer();
  const { data: salesPage } = useSales({ page: 0, size: 5000, sort: 'date,desc' });
  const sales = salesPage?.content;
  const { data: pets } = usePets();
  const { data: appointments } = useAppointments();

  const addNotification = useUIStore(s => s.addNotification);
  const notifications = useUIStore(s => s.notifications);
  const { hasPermission } = usePermissions();

  // Local state
  const [showAddModal, setShowAddModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custAddress, setCustAddress] = useState('');

  // Pet options for quick CRM binding
  const [petName, setPetName] = useState('');
  const [petSpecies, setPetSpecies] = useState('DOG');
  const [petBreed, setPetBreed] = useState('');
  const [petAge, setPetAge] = useState('');

  // Edit customer
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editBanned, setEditBanned] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Add customer form
  const [custNotes, setCustNotes] = useState('');

  // Purchase history modal
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Loyalty balance / ledger modal
  const [loyaltyCustomer, setLoyaltyCustomer] = useState<Customer | null>(null);
  const [loyaltyLedgerPageIdx, setLoyaltyLedgerPageIdx] = useState(0);
  const [showLoyaltySettings, setShowLoyaltySettings] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const { data: loyaltyAccount } = useLoyaltyAccount(loyaltyCustomer?.id ?? null);
  const { data: loyaltyLedgerPage } = useLoyaltyLedger(loyaltyCustomer?.id ?? null, loyaltyLedgerPageIdx, 10);
  const { mutate: adjustLoyalty, isPending: adjustingLoyalty } = useAdjustLoyalty();

  const customerIdByPetId = useMemo(() => {
    const map = new Map<string, string>();
    (pets ?? []).forEach(p => {
      if (p.customerId) map.set(p.id, p.customerId);
    });
    return map;
  }, [pets]);

  const customerRows = useMemo<CustomerRow[]>(() =>
    (customers ?? []).map(c => ({
      ...c,
      searchText: [c.name, c.phone, c.email].filter(Boolean).join(' '),
    })),
  [customers]);

  const loyaltyByCustomer = useMemo(() => {
    const map = new Map<string, LoyaltyMetrics>();
    const now = new Date();
    const monthStart = startOfCurrentMonth(now).getTime();
    const monthEnd = startOfNextMonth(now).getTime();

    const visitTimesByCustomer = new Map<string, number[]>();

    const pushVisit = (customerId: string, raw: string | Date | undefined | null) => {
      if (!customerId || raw == null) return;
      const t = new Date(raw).getTime();
      if (Number.isNaN(t)) return;
      const list = visitTimesByCustomer.get(customerId) ?? [];
      list.push(t);
      visitTimesByCustomer.set(customerId, list);
    };

    (sales ?? []).forEach(s => {
      if (!s.customerId || !isCompletedSale(s)) return;
      pushVisit(s.customerId, s.date);
    });

    (appointments ?? []).forEach(a => {
      if (a.status !== 'COMPLETED') return;
      const petId = appointmentPetId(a);
      if (!petId) return;
      const customerId = customerIdByPetId.get(petId);
      if (customerId) pushVisit(customerId, a.dateTime);
    });

    const customerIds = new Set<string>([
      ...(customers ?? []).map(c => c.id),
      ...visitTimesByCustomer.keys(),
    ]);

    customerIds.forEach(customerId => {
      const visitTimes = visitTimesByCustomer.get(customerId);
      if (!visitTimes || visitTimes.length === 0) {
        map.set(customerId, EMPTY_LOYALTY);
        return;
      }

      const monthlyVisits = visitTimes.filter(t => t >= monthStart && t < monthEnd).length;
      const lastMs = Math.max(...visitTimes);
      const lastVisitDate = new Date(lastMs);
      const diffDays = Math.floor((now.getTime() - lastMs) / (1000 * 60 * 60 * 24));

      let status: LoyaltyMetrics['status'] = 'REGULAR';
      if (diffDays > 30) {
        status = 'CHURN_RISK';
      } else if (monthlyVisits >= 3) {
        status = 'LOYAL';
      }

      map.set(customerId, { monthlyVisits, lastVisitDate, diffDays, status });
    });

    return map;
  }, [customers, sales, appointments, customerIdByPetId]);

  const getCustomerLoyalty = useCallback(
    (customerId: string): LoyaltyMetrics => loyaltyByCustomer.get(customerId) ?? EMPTY_LOYALTY,
    [loyaltyByCustomer]
  );

  const historySales = useMemo<Sale[]>(() => {
    if (!historyCustomer) return [];
    return (sales ?? []).filter(s => s.customerId === historyCustomer.id);
  }, [sales, historyCustomer]);

  const historyStats = useMemo(() => {
    const totalSpent = historySales.reduce((sum, s) => sum + saleRevenue(s), 0);
    return { invoiceCount: historySales.length, totalSpent };
  }, [historySales]);

  const openPurchaseHistory = (customer: Customer) => {
    setExpandedSaleId(null);
    setHistoryCustomer(customer);
  };

  const closePurchaseHistory = () => {
    setHistoryCustomer(null);
    setExpandedSaleId(null);
  };

  const openLoyalty = (customer: Customer) => {
    setLoyaltyLedgerPageIdx(0);
    setAdjustAmount('');
    setAdjustReason('');
    setLoyaltyCustomer(customer);
  };

  const closeLoyalty = () => {
    setLoyaltyCustomer(null);
  };

  const handleAdjustLoyalty = () => {
    if (!loyaltyCustomer) return;
    const amount = parseFloat(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      addNotification('WARNINGS', 'قيمة غير صالحة', 'أدخل قيمة تعديل صحيحة لا تساوي صفر.');
      return;
    }
    if (!adjustReason.trim()) {
      addNotification('WARNINGS', 'السبب مطلوب', 'يرجى إدخال سبب التعديل.');
      return;
    }
    adjustLoyalty(
      { customerId: loyaltyCustomer.id, amount, reason: adjustReason.trim() },
      {
        onSuccess: () => {
          setAdjustAmount('');
          setAdjustReason('');
        },
      }
    );
  };

  useEffect(() => {
    if (!customers) return;

    customers.forEach(cust => {
      const loyalty = getCustomerLoyalty(cust.id);
      if (loyalty.status === 'CHURN_RISK') {
        const expectedTitle = `تنبيه غياب: ${cust.name}`;
        const exists = notifications.some(n => n.title === expectedTitle);
        if (!exists) {
          addNotification(
            'WARNINGS',
            expectedTitle,
            `العميل ${cust.name} لم يزر المحل منذ ${loyalty.diffDays} يوم (آخر زيارة: ${loyalty.lastVisitDate?.toLocaleDateString('ar-EG')}). يرجى التواصل معه هاتفياً (${cust.phone || 'غير متوفر'}).`
          );
        }
      }
    });
  }, [customers, getCustomerLoyalty, notifications, addNotification]);

  if (loadingCusts) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const handleAddCustomer = () => {
    if (!custName.trim()) return;

    createCustomer({
      customer: {
        name: custName,
        phone: custPhone,
        email: custEmail,
        address: custAddress.trim() || undefined,
        isBanned: false,
        discount: 0,
        notes: custNotes.trim() || undefined,
      },
      pet: petName.trim() ? {
        name: petName,
        species: petSpecies,
        breed: petBreed,
        age: parseInt(petAge) || 1
      } : undefined
    }, {
      onSuccess: () => {
        setShowAddModal(false);
        setCustName('');
        setCustPhone('');
        setCustEmail('');
        setCustAddress('');
        setCustNotes('');
        setPetName('');
        setPetBreed('');
        setPetAge('');
      }
    });
  };

  const openEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setEditName(customer.name || '');
    setEditPhone(customer.phone || '');
    setEditEmail(customer.email || '');
    setEditAddress(customer.address || '');
    setEditDiscount(String(Number(customer.discount ?? 0)));
    setEditBanned(Boolean(customer.isBanned));
    setEditNotes(customer.notes || '');
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingCustomer(null);
    setEditName('');
    setEditPhone('');
    setEditEmail('');
    setEditAddress('');
    setEditDiscount('0');
    setEditBanned(false);
    setEditNotes('');
  };

  const handleUpdateCustomer = () => {
    if (!editingCustomer) return;
    if (!editName.trim()) {
      alert('يرجى إدخال اسم العميل');
      return;
    }

    const discountPct = parseInt(editDiscount || '0', 10);
    if (Number.isNaN(discountPct) || discountPct < 0 || discountPct > 100) {
      alert('برجاء إدخال نسبة خصم صحيحة بين 0 و 100.');
      return;
    }

    updateCustomer({
      id: editingCustomer.id,
      customer: {
        name: editName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        address: editAddress.trim() || undefined,
        discount: discountPct,
        isBanned: editBanned,
        notes: editNotes.trim() || undefined,
      },
    }, {
      onSuccess: () => {
        alert('✅ تم تحديث بيانات العميل بنجاح');
        closeEditModal();
      },
      onError: (err: any) => {
        alert('❌ فشل تحديث العميل: ' + (err?.message || 'خطأ غير معروف'));
      },
    });
  };

  const persistCustomerPatch = async (
    row: Customer,
    patch: Partial<Pick<Customer, 'isBanned' | 'discount'>>
  ) => {
    await updateCustomerAsync({
      id: row.id,
      customer: {
        name: row.name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        isBanned: patch.isBanned ?? Boolean(row.isBanned),
        discount: patch.discount ?? Number(row.discount ?? 0),
        notes: row.notes,
      },
    });
  };

  const churnedCustomers = customers?.filter(cust => {
    const loyalty = getCustomerLoyalty(cust.id);
    return loyalty.status === 'CHURN_RISK';
  }) || [];

  const columns = [
    { header: 'رقم العميل', accessor: 'id' as const, key: 'id' },
    { header: 'الاسم الكامل', accessor: 'name' as const, key: 'name', sortable: true },
    { header: 'رقم الهاتف', accessor: 'phone' as const, key: 'phone' },
    { header: 'البريد الإلكتروني', accessor: 'email' as const, key: 'email', sortable: true },
    {
      header: 'زيارات هذا الشهر',
      accessor: (row: Customer) => getCustomerLoyalty(row.id).monthlyVisits,
      key: 'monthlyVisits',
      sortable: true
    },
    {
      header: 'تاريخ آخر زيارة',
      accessor: (row: Customer) => {
        const loyalty = getCustomerLoyalty(row.id);
        if (!loyalty.lastVisitDate) return 'لا يوجد زيارات';
        return `${loyalty.lastVisitDate.toLocaleDateString('ar-EG')} (منذ ${loyalty.diffDays} يوم)`;
      },
      key: 'lastVisit',
      sortable: true
    },
    {
      header: 'مستوى الولاء والنشاط',
      accessor: (row: Customer) => {
        const loyalty = getCustomerLoyalty(row.id);
        if (loyalty.status === 'LOYAL') return <Badge variant="success">🟢 عميل متكرر (ولاء عالي)</Badge>;
        if (loyalty.status === 'REGULAR') return <Badge variant="primary">🟡 عميل نشط</Badge>;
        if (loyalty.status === 'CHURN_RISK') return <Badge variant="danger">🔴 منقطع &gt; 30 يوم (خطر خسارة)</Badge>;
        return <Badge variant="gray">⚪ بدون زيارات</Badge>;
      },
      key: 'loyaltyStatus',
      sortable: true
    },
    {
      header: 'الحالة',
      accessor: (row: Customer) => (
        <Badge variant={row.isBanned ? 'danger' : 'success'}>
          {row.isBanned ? 'محظور (Ban)' : 'نشط'}
        </Badge>
      ),
      key: 'status'
    },
    {
      header: 'نسبة الخصم',
      accessor: (row: Customer) => `${Number(row.discount ?? 0)}%`,
      key: 'discount'
    },
    {
      header: 'إجراءات',
      accessor: (row: Customer) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <Can permission={PERMISSIONS.CUSTOMERS_HISTORY}>
            <Button
              onClick={() => openPurchaseHistory(row)}
              variant="secondary"
              size="sm"
              style={{ padding: '2px 8px' }}
              title="سجل المشتريات والفواتير"
            >
              <History size={14} /> سجل المشتريات
            </Button>
          </Can>
          <Can permission={PERMISSIONS.CUSTOMERS_HISTORY}>
            <Button
              onClick={() => openLoyalty(row)}
              variant="secondary"
              size="sm"
              style={{ padding: '2px 8px' }}
              title="رصيد وتاريخ حركات الولاء"
            >
              <Wallet size={14} /> الولاء
            </Button>
          </Can>
          <Can permission={PERMISSIONS.CUSTOMERS_EDIT}>
            <Button
              onClick={() => openEditCustomer(row)}
              variant="secondary"
              size="sm"
              style={{ padding: '2px 8px' }}
              title="تعديل بيانات العميل"
            >
              <Pencil size={14} /> تعديل
            </Button>
          </Can>
        </div>
      ),
      key: 'actions'
    }
  ];

  const bulkActions = [
    hasPermission(PERMISSIONS.CUSTOMERS_BAN) && {
      label: '🚫 حظر العملاء (Ban)',
      variant: 'danger' as const,
      action: async (rows: Customer[]) => {
        if (!confirm(`هل أنت متأكد من حظر عدد ${rows.length} عميل؟ لن يتمكنوا من الشراء.`)) return;
        try {
          await Promise.all(rows.map(r => persistCustomerPatch(r, { isBanned: true })));
          alert(`تم حظر ${rows.length} عميل بنجاح`);
        } catch (err: any) {
          alert('❌ فشل حظر العملاء: ' + (err?.message || 'خطأ غير معروف'));
        }
      }
    },
    hasPermission(PERMISSIONS.CUSTOMERS_BAN) && {
      label: '✅ إلغاء حظر العملاء',
      variant: 'success' as const,
      action: async (rows: Customer[]) => {
        try {
          await Promise.all(rows.map(r => persistCustomerPatch(r, { isBanned: false })));
          alert(`تم إلغاء حظر ${rows.length} عميل بنجاح`);
        } catch (err: any) {
          alert('❌ فشل إلغاء الحظر: ' + (err?.message || 'خطأ غير معروف'));
        }
      }
    },
    hasPermission(PERMISSIONS.CUSTOMERS_LOYALTY) && {
      label: '💸 منح خصم ترويجي',
      variant: 'primary' as const,
      action: async (rows: Customer[]) => {
        const pctStr = prompt('أدخل نسبة الخصم المراد منحها للعملاء المحددين (نسبة مئوية من 0 إلى 100):');
        const pct = parseInt(pctStr || '0', 10);
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          alert('برجاء إدخال نسبة خصم صحيحة بين 0 و 100.');
          return;
        }
        try {
          await Promise.all(rows.map(r => persistCustomerPatch(r, { discount: pct })));
          alert(`تم منح خصم بقيمة ${pct}% لعدد ${rows.length} عميل بنجاح!`);
        } catch (err: any) {
          alert('❌ فشل منح الخصم: ' + (err?.message || 'خطأ غير معروف'));
        }
      }
    },
    hasPermission(PERMISSIONS.CUSTOMERS_DELETE) && {
      label: '🗑️ حذف العملاء نهائياً',
      variant: 'danger' as const,
      action: async (rows: Customer[]) => {
        if (!confirm(`هل أنت متأكد من حذف عدد ${rows.length} عميل نهائياً من دليل المحل؟`)) return;
        try {
          await Promise.all(rows.map(r => deleteCustomerAsync(r.id)));
          alert(`تم حذف ${rows.length} عميل بنجاح`);
        } catch (err: any) {
          alert('❌ \u0641\u0634\u0644 حذف العملاء: ' + (err?.message || 'خطأ غير معروف'));
        }
      }
    }
  ].filter(Boolean) as Array<{
    label: string;
    variant: 'danger' | 'success' | 'primary';
    action: (rows: Customer[]) => Promise<void>;
  }>;

  return (
    <div className="workspace">
      <PageHeader
        title="دليل وحسابات العملاء (CRM)"
        subtitle="إدارة ملفات العملاء، سجلات الاتصال، وتخصيص بيانات الحيوانات الأليفة"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Can permission={PERMISSIONS.CUSTOMERS_LOYALTY}>
              <Button onClick={() => setShowLoyaltySettings(true)} variant="secondary" size="sm">
                <Settings2 size={14} /> إعدادات الولاء
              </Button>
            </Can>
            <Can permission={PERMISSIONS.CUSTOMERS_ADD}>
              <Button onClick={() => setShowAddModal(true)} variant="primary" size="sm">
                <PlusCircle size={14} /> إضافة عميل جديد
              </Button>
            </Can>
          </div>
        }
      />

      {/* Customer Loyalty Banner Warning */}
      {churnedCustomers.length > 0 && (
        <div style={{
          backgroundColor: '#fde8e8',
          border: '1px solid #f8b4b4',
          borderRadius: '8px',
          padding: '12px var(--spacing-4)',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          color: '#9b1c1c',
          fontSize: 'var(--font-size-sm)'
        }}>
          <AlertTriangle size={24} style={{ color: '#e02424' }} />
          <div>
            <strong>تنبيه ولاء العملاء (خطر خسارة العملاء):</strong> هناك عدد <strong>{churnedCustomers.length} عملاء</strong> لم يقوموا بزيارة المركز منذ أكثر من 30 يوماً! يُرجى الاتصال بهم وتقديم عروض ترويجية لاسترجاعهم.
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={customerRows}
          columns={columns}
          rowKey="id"
          searchField="searchText"
          searchPlaceholder="ابحث باسم العميل..."
          bulkActions={bulkActions}
        />
      </div>

      {/* ADD CUSTOMER MODAL */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة عميل وحيوان أليف جديد"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={() => setShowAddModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleAddCustomer} disabled={adding} variant="primary">حفظ الملف</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>
            بيانات اتصال العميل
          </div>
          <Input
            label="الاسم الكامل"
            value={custName}
            onChange={(e) => setCustName(e.target.value)}
            placeholder="مثال: أحمد محمد"
          />
          <Input
            label="رقم الهاتف"
            value={custPhone}
            onChange={(e) => setCustPhone(e.target.value)}
            placeholder="مثال: 055512345"
          />
          <Input
            label="البريد الإلكتروني"
            value={custEmail}
            onChange={(e) => setCustEmail(e.target.value)}
            placeholder="مثال: client@domain.com"
          />
          <Input
            label="العنوان"
            value={custAddress}
            onChange={(e) => setCustAddress(e.target.value)}
            placeholder="مثال: القاهرة، مدينة نصر، شارع مصطفى النحاس"
          />

          {/* Notes field */}
          <div>
            <label style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              marginBottom: '6px',
              color: 'var(--text-primary)',
            }}>
              ⚠️ ملاحظات داخلية (تظهر للكاشير عند اختيار العميل)
            </label>
            <textarea
              value={custNotes}
              onChange={(e) => setCustNotes(e.target.value)}
              placeholder="مثال: العميل دائماً يطلب خصم إضافي..."
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-warning, #f59e0b)',
                backgroundColor: 'var(--color-warning-bg, rgba(245,158,11,0.08))',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
                resize: 'vertical',
                direction: 'rtl',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginTop: 'var(--spacing-3)' }}>
            تسجيل بيانات حيوان أليف مرتبط (اختياري)
          </div>
          <Input
            label="اسم الحيوان"
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            placeholder="مثال: فلفل"
          />
          <Select
            label="النوع"
            value={petSpecies}
            onChange={(e) => setPetSpecies(e.target.value)}
            options={[
              { value: 'DOG', label: 'كلب' },
              { value: 'CAT', label: 'قطة' },
              { value: 'BIRD', label: 'طائر' },
              { value: 'OTHER', label: 'آخر' }
            ]}
          />
          <Input
            label="السلالة"
            value={petBreed}
            onChange={(e) => setPetBreed(e.target.value)}
            placeholder="مثال: شيرازي"
          />
          <Input
            label="العمر (بالسنوات)"
            value={petAge}
            onChange={(e) => setPetAge(e.target.value)}
            placeholder="2"
          />
        </div>
      </Modal>

      {/* EDIT CUSTOMER MODAL */}
      <Modal
        isOpen={showEditModal}
        onClose={closeEditModal}
        title="تعديل بيانات العميل"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={closeEditModal} variant="secondary">إلغاء</Button>
            <Button onClick={handleUpdateCustomer} disabled={updating || !editName.trim()} variant="primary">
              {updating ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)', borderBottom: '1px solid var(--color-border)', paddingBottom: '4px' }}>
            بيانات اتصال العميل
          </div>
          <Input
            label="الاسم الكامل"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="مثال: أحمد محمد"
          />
          <Input
            label="رقم الهاتف"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder="مثال: 055512345"
          />
          <Input
            label="البريد الإلكتروني"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="مثال: client@domain.com"
          />
          <Input
            label="العنوان"
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="مثال: القاهرة، مدينة نصر، شارع مصطفى النحاس"
          />
          <Can permission={PERMISSIONS.CUSTOMERS_LOYALTY}>
            <Input
              label="نسبة الخصم (%)"
              type="number"
              value={editDiscount}
              onChange={(e) => setEditDiscount(e.target.value)}
              placeholder="0"
            />
          </Can>
          <Can permission={PERMISSIONS.CUSTOMERS_BAN}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-sm)' }}>
              <input
                type="checkbox"
                checked={editBanned}
                onChange={(e) => setEditBanned(e.target.checked)}
              />
              محظور من الشراء (Ban)
            </label>
          </Can>

          {/* Notes field */}
          <div style={{ marginTop: '4px' }}>
            <label style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              marginBottom: '6px',
              color: 'var(--text-primary)',
            }}>
              ⚠️ ملاحظات داخلية (تظهر للكاشير عند اختيار العميل)
            </label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="مثال: العميل دائماً يطلب خصم إضافي..."
              rows={3}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-warning, #f59e0b)',
                backgroundColor: 'var(--color-warning-bg, rgba(245,158,11,0.08))',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-sm)',
                resize: 'vertical',
                direction: 'rtl',
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </Modal>

      {/* PURCHASE HISTORY MODAL */}
      <Modal
        isOpen={Boolean(historyCustomer)}
        onClose={closePurchaseHistory}
        title={`سجل مشتريات: ${historyCustomer?.name ?? ''}`}
        maxWidth="800px"
      >
        {historyCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            {/* Summary bar */}
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-4)',
              flexWrap: 'wrap',
              padding: 'var(--spacing-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>عدد الفواتير</div>
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>{historyStats.invoiceCount}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>إجمالي المشتريات</div>
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>{formatMoney(historyStats.totalSpent)}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>آخر زيارة</div>
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-base)' }}>
                  {getCustomerLoyalty(historyCustomer.id).lastVisitDate?.toLocaleDateString('ar-EG') ?? 'لا يوجد'}
                </div>
              </div>
            </div>

            {/* Invoice list */}
            {historySales.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-8)', color: 'var(--color-text-secondary)' }}>
                لا توجد فواتير مسجلة لهذا العميل حتى الآن.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '55vh', overflowY: 'auto' }}>
                {historySales.map(sale => {
                  const isExpanded = expandedSaleId === sale.id;
                  return (
                    <div
                      key={sale.id}
                      style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 'var(--spacing-3)',
                          padding: 'var(--spacing-2) var(--spacing-3)',
                          cursor: 'pointer',
                          backgroundColor: isExpanded ? 'var(--color-primary-light)' : 'var(--color-surface)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <Receipt size={15} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>{sale.saleNumber}</div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                              {new Date(sale.date).toLocaleString('ar-EG')}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                          <Badge variant="gray" style={{ fontSize: '10px', padding: '2px 6px' }}>
                            {PAYMENT_METHOD_LABELS[sale.paymentMethod] ?? sale.paymentMethod}
                          </Badge>
                          <Badge variant={saleStatusBadgeVariant(sale.status)}>
                            {saleStatusLabel(sale.status)}
                          </Badge>
                          <span style={{ fontWeight: 'bold', minWidth: '70px', textAlign: 'left' }}>
                            {formatMoney(saleRevenue(sale))}
                          </span>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: 'var(--spacing-2) var(--spacing-3)', borderTop: '1px solid var(--color-border)' }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', minWidth: '360px', fontSize: 'var(--font-size-xs)' }}>
                            <thead>
                              <tr style={{ color: 'var(--color-text-secondary)' }}>
                                <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '4px' }}>الصنف</th>
                                <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>الكمية</th>
                                <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>سعر الوحدة</th>
                                <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '4px' }}>الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(sale.items ?? []).map(item => (
                                <tr key={item.id}>
                                  <td style={{ padding: '4px' }}>
                                    {item.name}
                                    {(item.quantityReturned ?? 0) > 0 && (
                                      <Badge variant="warning" style={{ fontSize: '9px', padding: '1px 4px', marginRight: '6px' }}>
                                        مرتجع {item.quantityReturned}
                                      </Badge>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center', padding: '4px' }}>{item.quantity}</td>
                                  <td style={{ textAlign: 'center', padding: '4px' }}>{formatMoney(item.price)}</td>
                                  <td style={{ textAlign: 'left', padding: '4px', fontWeight: 'bold' }}>
                                    {formatMoney(item.price * item.quantity)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* LOYALTY BALANCE / LEDGER MODAL */}
      <Modal
        isOpen={Boolean(loyaltyCustomer)}
        onClose={closeLoyalty}
        title={`رصيد الولاء: ${loyaltyCustomer?.name ?? ''}`}
        maxWidth="700px"
      >
        {loyaltyCustomer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--spacing-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
            }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>الرصيد الحالي</span>
              <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-lg)' }}>
                {formatMoney(loyaltyAccount?.balance ?? 0)}
              </span>
            </div>

            <Can permission={PERMISSIONS.CUSTOMERS_LOYALTY}>
              <div style={{
                display: 'flex', gap: 'var(--spacing-2)', alignItems: 'flex-end', flexWrap: 'wrap',
                padding: 'var(--spacing-2)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)',
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                    قيمة التعديل (+/-)
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="مثال: 50 أو -20"
                    style={{ maxWidth: '140px' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '180px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                    السبب
                  </div>
                  <Input
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="سبب التعديل"
                  />
                </div>
                <Button onClick={handleAdjustLoyalty} disabled={adjustingLoyalty} variant="primary" size="sm">
                  تطبيق التعديل
                </Button>
              </div>
            </Can>

            <div>
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px' }}>سجل الحركات</div>
              {(!loyaltyLedgerPage || loyaltyLedgerPage.content.length === 0) ? (
                <div style={{ textAlign: 'center', padding: 'var(--spacing-6)', color: 'var(--color-text-secondary)' }}>
                  لا توجد حركات ولاء مسجلة لهذا العميل حتى الآن.
                </div>
              ) : (
                <div style={{ maxHeight: '40vh', overflowY: 'auto', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: '480px', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'normal' }}>التاريخ</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'normal' }}>النوع</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'normal' }}>الفاتورة</th>
                        <th style={{ textAlign: 'right', padding: '4px', fontWeight: 'normal' }}>الكاشير</th>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'normal' }}>القيمة</th>
                        <th style={{ textAlign: 'left', padding: '4px', fontWeight: 'normal' }}>الرصيد بعد</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loyaltyLedgerPage.content.map(entry => (
                        <tr key={entry.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <td style={{ padding: '4px' }}>{new Date(entry.createdAt).toLocaleString('ar-EG')}</td>
                          <td style={{ padding: '4px' }}>{LOYALTY_LEDGER_TYPE_LABELS[entry.type] ?? entry.type}</td>
                          <td style={{ padding: '4px' }}>{entry.saleNumber ?? '-'}</td>
                          <td style={{ padding: '4px' }}>{entry.employeeName ?? '-'}</td>
                          <td style={{
                            padding: '4px', textAlign: 'left', fontWeight: 'bold',
                            color: entry.amount >= 0 ? '#059669' : '#dc2626',
                          }}>
                            {entry.amount >= 0 ? '+' : ''}{formatMoney(entry.amount)}
                          </td>
                          <td style={{ padding: '4px', textAlign: 'left' }}>{formatMoney(entry.balanceAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {loyaltyLedgerPage && loyaltyLedgerPage.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={loyaltyLedgerPageIdx <= 0}
                    onClick={() => setLoyaltyLedgerPageIdx(p => Math.max(0, p - 1))}
                  >
                    السابق
                  </Button>
                  <span style={{ fontSize: '11px' }}>
                    {loyaltyLedgerPageIdx + 1} / {loyaltyLedgerPage.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={loyaltyLedgerPageIdx >= loyaltyLedgerPage.totalPages - 1}
                    onClick={() => setLoyaltyLedgerPageIdx(p => p + 1)}
                  >
                    التالي
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* LOYALTY SETTINGS MODAL */}
      <Modal
        isOpen={showLoyaltySettings}
        onClose={() => setShowLoyaltySettings(false)}
        title="إعدادات برنامج الولاء"
        maxWidth="700px"
      >
        <LoyaltySettingsPanel />
      </Modal>
    </div>
  );
};

export default CRM;
