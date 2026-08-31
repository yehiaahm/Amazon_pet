import React, { useState, useEffect } from 'react';
import { 
  useBoardingReservations, useCreateBoardingReservation, 
  useUpdateBoardingStatus, useDeleteBoardingReservation, 
  usePets, useCustomers
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import PageHeader from '../../components/ui/PageHeader';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import DataTable from '../../components/ui/DataTable';
import Modal from '../../components/ui/Modal';
import { Phone, Plus, Trash, Check, AlertTriangle } from 'lucide-react';
import Can from '../../components/ui/Can';
import { PERMISSIONS } from '../../core/permissions/permissions';

export const Boarding: React.FC = () => {
  const { data: reservations, isLoading: loadingRes } = useBoardingReservations();
  const { data: pets } = usePets();
  const { data: customers } = useCustomers();
  const { mutateAsync: createReservation } = useCreateBoardingReservation();
  const { mutateAsync: updateStatus } = useUpdateBoardingStatus();
  const { mutateAsync: deleteRes } = useDeleteBoardingReservation();
  
  const addNotification = useUIStore(s => s.addNotification);
  const notifications = useUIStore(s => s.notifications);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [petId, setPetId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [roomNum, setRoomNum] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | { type: 'checkout' | 'cancel'; id: string }>(null);

  // Alarm system checking check-out dates
  useEffect(() => {
    if (!reservations) return;

    const now = new Date();
    reservations.forEach(res => {
      if (res.status === 'ACTIVE') {
        const checkOutDate = new Date(res.checkOutDate);
        const diffTime = checkOutDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        // Alert if staying checkout is within 3 days
        if (diffDays <= 3 && diffDays >= 0) {
          const expectedTitle = `تنبيه إقامة: ${res.petName}`;
          // Check if notification already exists
          const exists = notifications.some(n => n.title === expectedTitle);
          if (!exists) {
            addNotification(
              'WARNINGS',
              expectedTitle,
              `يتبقى ${diffDays === 0 ? 'أقل من يوم' : diffDays + ' أيام'} على انتهاء إقامة ${res.petName}. يرجى الاتصال بالعميل ${res.customerName} على رقم ${res.customerPhone || 'غير مسجل'}.`
            );
          }
        }
      }
    });
  }, [reservations, notifications, addNotification]);

  if (loadingRes) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  // Count active warnings
  const now = new Date();
  const warningReservations = reservations?.filter(res => {
    if (res.status !== 'ACTIVE') return false;
    const checkout = new Date(res.checkOutDate);
    const diff = checkout.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days <= 3 && days >= 0;
  }) || [];

  const handleCreate = async () => {
    if (!petId || !checkIn || !checkOut) {
      alert('يرجى ملء الحقول الإجبارية (الحيوان، تاريخ الدخول، تاريخ الخروج)');
      return;
    }

    const selectedPet = pets?.find(p => p.id === petId);
    if (!selectedPet) {
      alert('الحيوان المختار غير موجود. حدّث الصفحة واختر حيواناً من القائمة.');
      return;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
      alert('تواريخ الدخول/الخروج غير صالحة');
      return;
    }
    if (checkOutDate <= checkInDate) {
      alert('تاريخ الخروج يجب أن يكون بعد تاريخ الدخول');
      return;
    }

    setSaving(true);
    try {
      await createReservation({
        petId: selectedPet.id,
        checkInDate: checkInDate.toISOString(),
        checkOutDate: checkOutDate.toISOString(),
        roomNumber: roomNum,
        notes
      });

      setShowAddModal(false);
      setPetId('');
      setCheckIn('');
      setCheckOut('');
      setRoomNum('');
      setNotes('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الحجز';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckout = async (id: string) => {
    setConfirmAction({ type: 'checkout', id });
  };

  const handleCancel = async (id: string) => {
    setConfirmAction({ type: 'cancel', id });
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    const { type, id } = confirmAction;
    setConfirmAction(null);
    if (type === 'checkout') {
      await updateStatus({ id, status: 'COMPLETED' });
    } else {
      await deleteRes(id);
    }
  };

  const triggerCallAlert = (res: any) => {
    const checkOutDate = new Date(res.checkOutDate);
    const diff = checkOutDate.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    let daysMsg = '';
    if (days < 0) daysMsg = 'منتهية بالفعل';
    else if (days === 0) daysMsg = 'تنتهي اليوم';
    else daysMsg = `تنتهي خلال ${days} أيام`;

    alert(
      `📞 جاري الاتصال بالعميل...\n\n` +
      `👤 اسم المالك: ${res.customerName}\n` +
      `📱 رقم الهاتف: ${res.customerPhone || 'غير متوفر'}\n` +
      `🐶 اسم الأليف: ${res.petName}\n` +
      `📅 حالة الإقامة: ${daysMsg}\n\n` +
      `💬 التنبيه: تذكير باستلام الأليف وسداد المستحقات المالية للإقامة المتبقية.`
    );
  };

  const getDaysRemainingText = (checkOutStr: string, status: string) => {
    if (status !== 'ACTIVE') return '-';
    
    const checkout = new Date(checkOutStr);
    const diff = checkout.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) {
      return <span style={{ color: 'var(--color-error)', fontWeight: 'bold' }}>⚠️ متأخر عن المغادرة</span>;
    }
    if (days === 0) {
      return <span style={{ color: 'var(--color-error)', fontWeight: 'bold' }}>🚨 يغادر اليوم!</span>;
    }
    if (days <= 3) {
      return <span style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>⚠️ يغادر بعد {days} أيام (تنبيه اتصل بالعميل)</span>;
    }
    return <span style={{ color: 'var(--color-success)' }}>متبقي {days} يوم إقامة</span>;
  };

  const columns = [
    { header: 'اسم الأليف', accessor: 'petName' as const, key: 'petName', sortable: true },
    { header: 'اسم العميل (المالك)', accessor: 'customerName' as const, key: 'customerName', sortable: true },
    { header: 'رقم الهاتف', accessor: 'customerPhone' as const, key: 'customerPhone' },
    { header: 'تاريخ الدخول', accessor: (row: any) => new Date(row.checkInDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }), key: 'checkInDate', sortable: true },
    { header: 'تاريخ الخروج المتوقع', accessor: (row: any) => new Date(row.checkOutDate).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }), key: 'checkOutDate', sortable: true },
    { header: 'رقم الغرفة/القفص', accessor: 'roomNumber' as const, key: 'roomNumber', sortable: true },
    { 
      header: 'الوقت المتبقي', 
      accessor: (row: any) => getDaysRemainingText(row.checkOutDate, row.status), 
      key: 'remaining' 
    },
    { 
      header: 'الحالة', 
      accessor: (row: any) => (
        <Badge variant={row.status === 'ACTIVE' ? 'primary' : row.status === 'COMPLETED' ? 'success' : 'gray'}>
          {row.status === 'ACTIVE' ? 'نشط إقامة' : row.status === 'COMPLETED' ? 'تمت المغادرة' : 'ملغي'}
        </Badge>
      ), 
      key: 'status',
      sortable: true
    },
    {
      header: 'إجراءات سريعة',
      accessor: (row: any) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          {row.status === 'ACTIVE' && (
            <>
              <Button onClick={() => triggerCallAlert(row)} variant="secondary" size="sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Phone size={10} /> اتصل للتذكير
              </Button>
              <Can permission={PERMISSIONS.BOARDING_EDIT}>
                <Button onClick={() => handleCheckout(row.id)} variant="primary" size="sm" style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}>
                  <Check size={10} /> إتمام المغادرة
                </Button>
              </Can>
            </>
          )}
          <Can permission={PERMISSIONS.BOARDING_CANCEL}>
            <Button onClick={() => handleCancel(row.id)} variant="secondary" size="sm" style={{ color: 'var(--color-error)' }}>
              <Trash size={10} /> حذف
            </Button>
          </Can>
        </div>
      ),
      key: 'actions'
    }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="حجوزات وإقامة الحيوانات الأليفة (Pet Boarding)" 
        subtitle="متابعة الغرف والأقفاص وإقامات النزلاء في الفندق البيطري مع التنبيه التلقائي للمغادرة"
        actions={
          <Can permission={PERMISSIONS.BOARDING_CREATE}>
            <Button onClick={() => setShowAddModal(true)} variant="primary" size="sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> حجز إقامة جديدة
            </Button>
          </Can>
        }
      />

      {/* Warning Notification Banner */}
      {warningReservations.length > 0 && (
        <div style={{
          backgroundColor: '#fdf6b2',
          border: '1px solid #f3c01c',
          borderRadius: '8px',
          padding: '12px var(--spacing-4)',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          color: '#723b13',
          fontSize: 'var(--font-size-sm)'
        }}>
          <AlertTriangle size={24} style={{ color: '#d03803' }} />
          <div>
            <strong>تنبيهات المغادرة الفورية (خلال 3 أيام):</strong> لديك عدد <strong>{warningReservations.length} إقامات</strong> توشك على الانتهاء. يرجى مراجعة الجدول والاتصال بالعملاء لتذكيرهم بموعد الاستلام.
          </div>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={reservations || []}
          columns={columns}
          rowKey="id"
          searchField="petName"
          searchPlaceholder="ابحث باسم الحيوان..."
        />
      </div>

      {/* ADD RESERVATION MODAL */}
      <Modal
        isOpen={showAddModal}
        onClose={() => !saving && setShowAddModal(false)}
        title="تسجيل حجز إقامة (فندق/إقامة)"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button disabled={saving} onClick={() => setShowAddModal(false)} variant="secondary">إلغاء</Button>
            <Button disabled={saving} onClick={handleCreate} variant="primary">حفظ وتأكيد حجز الغرفة</Button>
          </div>
        }
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Select
            label="اختر الحيوان الأليف (المسجل)"
            value={petId}
            onChange={(e) => setPetId(e.target.value)}
            options={[
              { value: '', label: '-- اختر الحيوان --' },
              ...(pets || []).map(p => {
                const ownerName = customers?.find(c => c.id === p.customerId)?.name;
                const breedPart = p.breed ? ` - ${p.breed}` : '';
                const ownerPart = ownerName ? ` (مالكه: ${ownerName})` : '';
                return { value: p.id, label: `${p.name}${breedPart}${ownerPart}` };
              })
            ]}
          />
          
          <div className="grid-split" style={{ '--split-ratio': '1fr 1fr', gap: '12px' } as React.CSSProperties}>
            <Input
              label="تاريخ ووقت الدخول"
              type="datetime-local"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
            <Input
              label="تاريخ ووقت الخروج"
              type="datetime-local"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>

          <Input
            label="رقم الغرفة / القفص (أو رمز الجناح)"
            value={roomNum}
            onChange={(e) => setRoomNum(e.target.value)}
            placeholder="مثال: Box-A3"
          />

          <Input
            label="توصيات غذائية أو دوائية خاصة"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: يرجى التغذية مرتين يومياً وحرص التفاعل"
          />
        </div>
      </Modal>

      {/* CONFIRM ACTION MODAL */}
      <Modal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'checkout' ? 'تأكيد إتمام المغادرة' : 'تأكيد حذف الحجز'}
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={() => setConfirmAction(null)} variant="secondary">إلغاء</Button>
            <Button
              onClick={executeConfirmAction}
              variant={confirmAction?.type === 'cancel' ? 'danger' : 'primary'}
            >
              {confirmAction?.type === 'checkout' ? 'تأكيد المغادرة' : 'تأكيد الحذف'}
            </Button>
          </div>
        }
      >
        <p style={{ fontSize: 'var(--font-size-sm)', direction: 'rtl', margin: 0 }}>
          {confirmAction?.type === 'checkout'
            ? 'هل تريد تأكيد إتمام مغادرة الأليف للغرفة وإنهاء الإقامة؟'
            : 'هل تريد إلغاء حجز الإقامة وحذفه من النظام؟'}
        </p>
      </Modal>
    </div>
  );
};

export default Boarding;
