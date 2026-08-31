import React, { useEffect, useMemo, useState } from 'react';
import {
  useAppointments,
  useCreateAppointment,
  useUpdateAppointmentStatus,
  useServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
  usePets,
  useCustomers,
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { PlusCircle, Check, X, Scissors, Edit2, Trash2 } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import { formatMoney } from '../../core/utils/money';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';
import Can from '../../components/ui/Can';

const STAFF_LIST = [
  { id: 'e-1', fullName: 'مروان (المالك)', role: 'OWNER' },
  { id: 'e-2', fullName: 'أمير (الكاشير)', role: 'CASHIER' },
  { id: 'e-3', fullName: 'بوب (الحلاق)', role: 'GROOMER' },
];

function defaultDateTimeLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60 - (d.getMinutes() % 15));
  d.setSeconds(0);
  d.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const Services: React.FC = () => {
  const currentEmployee = useUIStore((s) => s.currentEmployee);
  const setActiveModule = useUIStore((s) => s.setActiveModule);
  const addNotification = useUIStore((s) => s.addNotification);
  const { hasPermission, canAccessModule } = usePermissions();

  const { data: appointments, isLoading: loadingApts } = useAppointments();
  const { data: servicesList } = useServices();
  const { data: pets } = usePets();
  const { data: customers } = useCustomers();

  const { mutate: bookApt, isPending: booking } = useCreateAppointment();
  const { mutate: updateStatus } = useUpdateAppointmentStatus();
  const { mutate: createService, isPending: creatingService } = useCreateService();
  const { mutate: updateService, isPending: updatingService } = useUpdateService();
  const { mutate: deleteService } = useDeleteService();

  const [showBookModal, setShowBookModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showEditServiceModal, setShowEditServiceModal] = useState(false);

  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

  const [selectedPet, setSelectedPet] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [selectedStaff, setSelectedStaff] = useState('e-3');
  const [aptTime, setAptTime] = useState(defaultDateTimeLocal);
  const [aptNotes, setAptNotes] = useState('');

  const [svcName, setSvcName] = useState('');
  const [svcPrice, setSvcPrice] = useState('');
  const [svcDuration, setSvcDuration] = useState('30');

  const [editSvcName, setEditSvcName] = useState('');
  const [editSvcPrice, setEditSvcPrice] = useState('');
  const [editSvcDuration, setEditSvcDuration] = useState('30');

  const canManageServices = hasPermission(PERMISSIONS.GROOMING_EDIT);

  const petOptions = useMemo(() => {
    return (pets || []).map((p) => {
      const owner = customers?.find((c) => c.id === p.customerId);
      const species = p.species === 'DOG' ? 'كلب' : p.species === 'CAT' ? 'قطة' : p.species;
      const ownerLabel = owner?.name ? ` — ${owner.name}` : '';
      return {
        value: p.id,
        label: `${p.name} (${species}${p.breed ? ` / ${p.breed}` : ''})${ownerLabel}`,
      };
    });
  }, [pets, customers]);

  const staffOptions = useMemo(() => {
    const list = [...STAFF_LIST];
    if (currentEmployee && !list.some((e) => e.id === currentEmployee.id)) {
      list.push({
        id: currentEmployee.id,
        fullName: currentEmployee.fullName,
        role: currentEmployee.role,
      });
    }
    return list.map((e) => ({
      value: e.id,
      label: `${e.fullName} (${e.role})`,
    }));
  }, [currentEmployee]);

  useEffect(() => {
    if (!pets?.length) return;
    if (!selectedPet || !pets.some((p) => p.id === selectedPet)) {
      setSelectedPet(pets[0].id);
    }
  }, [pets, selectedPet]);

  useEffect(() => {
    if (!servicesList?.length) return;
    if (!selectedService || !servicesList.some((s) => s.id === selectedService)) {
      setSelectedService(servicesList[0].id);
    }
  }, [servicesList, selectedService]);

  useEffect(() => {
    if (!hasPermission(PERMISSIONS.EMPLOYEES_VIEW) && currentEmployee?.id) {
      setSelectedStaff(currentEmployee.id);
    }
  }, [currentEmployee, hasPermission]);

  const openBookModal = () => {
    setAptTime(defaultDateTimeLocal());
    setAptNotes('');
    setShowBookModal(true);
  };

  const handleBookAppointment = () => {
    if (!selectedPet) {
      addNotification('WARNINGS', 'حيوان مطلوب', 'اختر حيوانًا أليفًا أولًا أو سجّل حيوانًا من شاشة الحيوانات.');
      return;
    }
    if (!selectedService) {
      addNotification('WARNINGS', 'خدمة مطلوبة', 'اختر خدمة أو أضف خدمة جديدة أولًا.');
      return;
    }
    if (!aptTime) {
      addNotification('WARNINGS', 'الوقت مطلوب', 'حدد تاريخ ووقت الموعد.');
      return;
    }

    bookApt(
      {
        petId: selectedPet,
        serviceId: selectedService,
        employeeId: selectedStaff || 'e-3',
        dateTime: new Date(aptTime).toISOString(),
        notes: aptNotes,
      },
      {
        onSuccess: () => {
          setShowBookModal(false);
          setAptNotes('');
        },
        onError: (err: any) => {
          addNotification('WARNINGS', 'فشل الحجز', err?.message || 'تعذر حجز الموعد');
        },
      }
    );
  };

  const handleCreateService = () => {
    const name = svcName.trim();
    const price = parseFloat(svcPrice);
    const durationMinutes = parseInt(svcDuration, 10);
    if (!name) {
      addNotification('WARNINGS', 'اسم الخدمة مطلوب', 'اكتب اسم الخدمة (مثال: حمام كلب).');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      addNotification('WARNINGS', 'سعر غير صالح', 'أدخل سعرًا صحيحًا بالجنيه.');
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      addNotification('WARNINGS', 'المدة غير صالحة', 'أدخل مدة بالدقائق (مثال: 30).');
      return;
    }

    createService(
      { name, price, durationMinutes },
      {
        onSuccess: (created) => {
          setShowServiceModal(false);
          setSvcName('');
          setSvcPrice('');
          setSvcDuration('30');
          setSelectedService(created.id);
        },
      }
    );
  };

  const openEditServiceModal = (service: any) => {
    setEditingServiceId(service.id);
    setEditSvcName(service.name || '');
    setEditSvcPrice(String(service.price ?? ''));
    setEditSvcDuration(String(service.durationMinutes ?? '30'));
    setShowEditServiceModal(true);
  };

  const handleUpdateService = () => {
    if (!editingServiceId) return;
    const name = editSvcName.trim();
    const price = parseFloat(editSvcPrice);
    const durationMinutes = parseInt(editSvcDuration, 10);

    if (!name) {
      addNotification('WARNINGS', 'اسم الخدمة مطلوب', 'اكتب اسم الخدمة (مثال: حمام كلب).');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      addNotification('WARNINGS', 'سعر غير صالح', 'أدخل سعرًا صحيحًا بالجنيه.');
      return;
    }
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
      addNotification('WARNINGS', 'المدة غير صالحة', 'أدخل مدة بالدقائق (مثال: 30).');
      return;
    }

    updateService(
      { id: editingServiceId, name, price, durationMinutes },
      {
        onSuccess: () => {
          setShowEditServiceModal(false);
          setEditingServiceId(null);
        },
      }
    );
  };

  const handleDeleteService = (id: string, name: string) => {
    if (window.confirm(`هل أنت تأكد من إزالة الخدمة «${name}»؟`)) {
      deleteService(id);
    }
  };

  if (loadingApts) {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px' }} />
      </div>
    );
  }

  const appointmentsColumns = [
    {
      header: 'التاريخ والوقت',
      accessor: (row: any) => new Date(row.dateTime).toLocaleString('ar-EG'),
      key: 'dateTime',
      sortable: true,
    },
    {
      header: 'اسم الأليف',
      accessor: (row: any) => pets?.find((p) => p.id === row.petId)?.name || '—',
      key: 'pet',
    },
    {
      header: 'الخدمة المطلوبة',
      accessor: (row: any) => servicesList?.find((s) => s.id === row.serviceId)?.name || '—',
      key: 'service',
    },
    {
      header: 'سعر الخدمة',
      accessor: (row: any) => {
        const val = Number(servicesList?.find((s) => s.id === row.serviceId)?.price ?? 0);
        return formatMoney(val);
      },
      key: 'price',
    },
    {
      header: 'الموظف المسؤول',
      accessor: (row: any) => {
        const emp = STAFF_LIST.find((e) => e.id === row.employeeId);
        if (emp) return emp.fullName;
        if (currentEmployee?.id === row.employeeId) return currentEmployee?.fullName || '—';
        return row.employeeId || '—';
      },
      key: 'groomer',
    },
    {
      header: 'الحالة',
      accessor: (row: any) => (
        <Badge
          variant={
            row.status === 'COMPLETED' ? 'success' : row.status === 'CANCELLED' ? 'danger' : 'primary'
          }
        >
          {row.status === 'COMPLETED' ? 'مكتمل' : row.status === 'CANCELLED' ? 'ملغي' : 'مجدول'}
        </Badge>
      ),
      key: 'status',
      sortable: true,
    },
    {
      header: 'إجراءات الموعد',
      accessor: (row: any) => {
        if (row.status !== 'SCHEDULED') {
          return (
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
              مغلق
            </span>
          );
        }
        return (
          <div style={{ display: 'flex', gap: '4px' }}>
            <Can permission={PERMISSIONS.GROOMING_COMPLETE}>
              <Button
                onClick={() => updateStatus({ id: row.id, status: 'COMPLETED' })}
                variant="success"
                size="sm"
                style={{ padding: '2px 6px' }}
              >
                <Check size={14} /> إكمال
              </Button>
            </Can>
            <Can permission={PERMISSIONS.GROOMING_CANCEL}>
              <Button
                onClick={() => updateStatus({ id: row.id, status: 'CANCELLED' })}
                variant="danger"
                size="sm"
                style={{ padding: '2px 6px' }}
              >
                <X size={14} /> إلغاء
              </Button>
            </Can>
          </div>
        );
      },
      key: 'actions',
    },
  ];

  const servicesColumns = [
    { header: 'اسم الخدمة', accessor: 'name' as const, key: 'name', sortable: true },
    {
      header: 'السعر',
      accessor: (row: any) => formatMoney(Number(row.price)),
      key: 'price',
      sortable: true,
    },
    {
      header: 'المدة (دقيقة)',
      accessor: 'durationMinutes' as const,
      key: 'durationMinutes',
      sortable: true,
    },
    {
      header: 'إجراءات',
      accessor: (row: any) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          <Button
            onClick={() => openEditServiceModal(row)}
            variant="secondary"
            size="sm"
            style={{ padding: '2px 6px' }}
            title="تعديل الخدمة"
          >
            <Edit2 size={13} />
          </Button>
          <Button
            onClick={() => handleDeleteService(row.id, row.name)}
            variant="danger"
            size="sm"
            style={{ padding: '2px 6px' }}
            title="حذف الخدمة"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ),
      key: 'actions',
    },
  ];

  return (
    <div className="workspace">
      <PageHeader
        title="الخدمات وحجز المواعيد"
        subtitle="الكاشير وإدارة المحل يمكنهم إدارة خدمات الصالون والعيادة وحجز المواعيد للحيوانات الأليفة"
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {canAccessModule('pos') && (
              <Button onClick={() => setActiveModule('pos')} variant="secondary" size="sm">
                الرجوع لنقطة البيع
              </Button>
            )}
            {canManageServices && (
              <Button onClick={() => setShowServiceModal(true)} variant="secondary" size="sm">
                <Scissors size={14} /> إضافة خدمة جديدة
              </Button>
            )}
            <Can permission={PERMISSIONS.GROOMING_CREATE}>
              <Button onClick={openBookModal} variant="primary" size="sm">
                <PlusCircle size={14} /> حجز موعد جديد
              </Button>
            </Can>
          </div>
        }
      />

      <div
        className="grid-split"
        style={{
          '--split-ratio': 'minmax(320px, 400px) 1fr',
          gap: 'var(--spacing-4)',
          flex: 1,
          minHeight: 0,
        } as React.CSSProperties}
      >
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--spacing-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-2)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 'var(--font-size-sm)' }}>كتالوج الخدمات ({servicesList?.length || 0})</strong>
            <Badge variant="primary">{servicesList?.length || 0}</Badge>
          </div>
          {(servicesList?.length || 0) === 0 ? (
            <div
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-xs)',
                padding: '16px 4px',
                textAlign: 'center',
              }}
            >
              لا توجد خدمات بعد.
              {canManageServices ? ' اضغط «إضافة خدمة جديدة» لإنشاء أول خدمة.' : ''}
            </div>
          ) : (
            <div style={{ overflow: 'auto', flex: 1 }}>
              <DataTable data={servicesList || []} columns={servicesColumns} rowKey="id" />
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <DataTable
            data={[...(appointments || [])].reverse()}
            columns={appointmentsColumns}
            rowKey="id"
          />
        </div>
      </div>

      {/* BOOK APPOINTMENT */}
      <Modal
        isOpen={showBookModal}
        onClose={() => setShowBookModal(false)}
        title="حجز موعد لحيوان أليف"
        maxWidth="520px"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={() => setShowBookModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleBookAppointment} disabled={booking} variant="primary">
              حفظ وتأكيد الحجز
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {petOptions.length === 0 ? (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
              لا يوجد حيوانات مسجّلة. سجّل حيوانًا من شاشة «الحيوانات» أولًا.
            </div>
          ) : (
            <Select
              label="الحيوان الأليف"
              value={selectedPet}
              onChange={(e) => setSelectedPet(e.target.value)}
              options={petOptions}
            />
          )}

          {(servicesList?.length || 0) === 0 ? (
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
              لا توجد خدمات. أضف خدمة من زر «إضافة خدمة» ثم ارجع للحجز.
            </div>
          ) : (
            <Select
              label="الخدمة المطلوبة"
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              options={
                servicesList?.map((s) => ({
                  value: s.id,
                  label: `${s.name} — ${formatMoney(Number(s.price))} (${s.durationMinutes} د)`,
                })) || []
              }
            />
          )}

          <Select
            label="الموظف المسؤول (حلاق / موظف)"
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            options={staffOptions}
          />

          <Input
            label="تاريخ ووقت الموعد"
            type="datetime-local"
            value={aptTime}
            onChange={(e) => setAptTime(e.target.value)}
          />

          <Input
            label="ملاحظات الموعد"
            value={aptNotes}
            onChange={(e) => setAptNotes(e.target.value)}
            placeholder="مثال: حساسية جلدية — تجنّب الصابون العادي"
          />
        </div>
      </Modal>

      {/* ADD SERVICE */}
      <Modal
        isOpen={showServiceModal}
        onClose={() => setShowServiceModal(false)}
        title="إضافة خدمة جديدة للمحل"
        maxWidth="460px"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={() => setShowServiceModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleCreateService} disabled={creatingService} variant="primary">
              حفظ الخدمة
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Input
            label="اسم الخدمة"
            value={svcName}
            onChange={(e) => setSvcName(e.target.value)}
            placeholder="مثال: حمام كلب / قص شعر / تنظيف أذن"
          />
          <Input
            label="السعر (ج.م)"
            type="number"
            min={0}
            step="1"
            value={svcPrice}
            onChange={(e) => setSvcPrice(e.target.value)}
            placeholder="150"
          />
          <Input
            label="المدة بالدقائق"
            type="number"
            min={1}
            step="5"
            value={svcDuration}
            onChange={(e) => setSvcDuration(e.target.value)}
            placeholder="30"
          />
        </div>
      </Modal>

      {/* EDIT SERVICE */}
      <Modal
        isOpen={showEditServiceModal}
        onClose={() => setShowEditServiceModal(false)}
        title="تعديل بيانات الخدمة"
        maxWidth="460px"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button onClick={() => setShowEditServiceModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleUpdateService} disabled={updatingService} variant="primary">
              حفظ التعديلات
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Input
            label="اسم الخدمة"
            value={editSvcName}
            onChange={(e) => setEditSvcName(e.target.value)}
            placeholder="مثال: حمام كلب / قص شعر"
          />
          <Input
            label="السعر (ج.م)"
            type="number"
            min={0}
            step="1"
            value={editSvcPrice}
            onChange={(e) => setEditSvcPrice(e.target.value)}
            placeholder="150"
          />
          <Input
            label="المدة بالدقائق"
            type="number"
            min={1}
            step="5"
            value={editSvcDuration}
            onChange={(e) => setEditSvcDuration(e.target.value)}
            placeholder="30"
          />
        </div>
      </Modal>
    </div>
  );
};

export default Services;
