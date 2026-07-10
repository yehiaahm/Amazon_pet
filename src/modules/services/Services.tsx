import React, { useState } from 'react';
import { 
  useAppointments, useCreateAppointment, 
  useUpdateAppointmentStatus, useServices, usePets 
} from '../../core/hooks/useERPData';
import { PlusCircle, Check, X } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';

export const Services: React.FC = () => {
  const { data: appointments, isLoading: loadingApts } = useAppointments();
  const { data: servicesList } = useServices();
  const { data: pets } = usePets();
  
  const { mutate: bookApt, isPending: booking } = useCreateAppointment();
  const { mutate: updateStatus } = useUpdateAppointmentStatus();

  // Local state
  const [showBookModal, setShowBookModal] = useState(false);
  const [selectedPet, setSelectedPet] = useState('pet-1');
  const [selectedService, setSelectedService] = useState('srv-1');
  const [aptTime, setAptTime] = useState('2026-07-06T14:00');
  const [aptNotes, setAptNotes] = useState('');

  if (loadingApts) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const handleBookAppointment = () => {
    bookApt({
      petId: selectedPet,
      serviceId: selectedService,
      employeeId: 'e-3', // Groomer Bob
      dateTime: aptTime,
      notes: aptNotes
    }, {
      onSuccess: () => {
        setShowBookModal(false);
        setAptNotes('');
      }
    });
  };

  // Columns Definitions
  const appointmentsColumns = [
    { 
      header: 'التاريخ والوقت', 
      accessor: (row: any) => new Date(row.dateTime).toLocaleString(), 
      key: 'dateTime', 
      sortable: true 
    },
    { 
      header: 'اسم الأليف', 
      accessor: (row: any) => pets?.find(p => p.id === row.petId)?.name || 'ماكس', 
      key: 'pet' 
    },
    { 
      header: 'الخدمة المطلوبة', 
      accessor: (row: any) => {
        const srv = servicesList?.find(s => s.id === row.serviceId);
        if (!srv) return 'تنظيف كامل';
        if (srv.name === 'Full Grooming & Wash') return 'غسيل وقص شعر كامل';
        if (srv.name === 'Nail Trimming') return 'قص وتقليم الأظافر';
        if (srv.name === 'Medicated Bath') return 'حمام صحي بالدواء';
        return srv.name;
      }, 
      key: 'service' 
    },
    { 
      header: 'سعر الخدمة ($)', 
      accessor: (row: any) => {
        const val = servicesList?.find(s => s.id === row.serviceId)?.price || 0;
        return `$${val.toFixed(2)}`;
      }, 
      key: 'price' 
    },
    { 
      header: 'الموظف المسؤول', 
      accessor: () => 'بوب جونسون', 
      key: 'groomer' 
    },
    {
      header: 'الحالة',
      accessor: (row: any) => (
        <Badge variant={
          row.status === 'COMPLETED' ? 'success' : 
          row.status === 'CANCELLED' ? 'danger' : 'primary'
        }>
          {row.status === 'COMPLETED' ? 'مكتمل' : row.status === 'CANCELLED' ? 'ملغي' : 'مجدول'}
        </Badge>
      ),
      key: 'status',
      sortable: true
    },
    {
      header: 'إجراءات الموعد',
      accessor: (row: any) => {
        if (row.status !== 'SCHEDULED') return <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>مغلق</span>;
        return (
          <div style={{ display: 'flex', gap: '4px' }}>
            <Button onClick={() => updateStatus({ id: row.id, status: 'COMPLETED' })} variant="success" size="sm" style={{ padding: '2px 6px' }}>
              <Check size={14} /> إكمال الموعد
            </Button>
            <Button onClick={() => updateStatus({ id: row.id, status: 'CANCELLED' })} variant="danger" size="sm" style={{ padding: '2px 6px' }}>
              <X size={14} /> إلغاء
            </Button>
          </div>
        );
      },
      key: 'actions'
    }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="جدولة وحجوزات خدمات الصالون" 
        subtitle="مراقبة وتنظيم عمليات الغسيل، قص الشعر، والتنظيف الصحي للحيوانات الأليفة"
        actions={
          <Button onClick={() => setShowBookModal(true)} variant="primary" size="sm">
            <PlusCircle size={14} /> حجز موعد جديد
          </Button>
        }
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={[...(appointments || [])].reverse()}
          columns={appointmentsColumns}
          rowKey="id"
        />
      </div>

      {/* BOOK APPOINTMENT MODAL */}
      <Modal
        isOpen={showBookModal}
        onClose={() => setShowBookModal(false)}
        title="حجز موعد خدمة صالون جديد"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowBookModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleBookAppointment} disabled={booking} variant="primary">حفظ وتأكيد الحجز</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <Select
            label="اختر حيوان أليف للعميل"
            value={selectedPet}
            onChange={(e) => setSelectedPet(e.target.value)}
            options={pets?.map(p => ({ value: p.id, label: `${p.name} (${p.species === 'DOG' ? 'كلب' : 'قطة'} - السلالة: ${p.breed})` })) || []}
          />

          <Select
            label="الخدمة المطلوبة"
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            options={servicesList?.map(s => {
              let arName = s.name;
              if (s.name === 'Full Grooming & Wash') arName = 'غسيل وقص شعر كامل';
              if (s.name === 'Nail Trimming') arName = 'قص وتقليم الأظافر';
              if (s.name === 'Medicated Bath') arName = 'حمام صحي بالدواء';
              return { value: s.id, label: `${arName} ($${s.price.toFixed(2)})` };
            }) || []}
          />

          <Input
            label="تاريخ ووقت الموعد"
            type="datetime-local"
            value={aptTime}
            onChange={(e) => setAptTime(e.target.value)}
          />

          <Input
            label="ملاحظات الموعد / توجيهات المربين"
            value={aptNotes}
            onChange={(e) => setAptNotes(e.target.value)}
            placeholder="مثال: حساسية جلدية، يرجى تجنب استخدام الصابون الكيميائي العادي"
          />
        </div>
      </Modal>
    </div>
  );
};

export default Services;
