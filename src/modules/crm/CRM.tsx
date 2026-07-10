import React, { useState } from 'react';
import { useCustomers, useAddCustomer } from '../../core/hooks/useERPData';
import { PlusCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';

export const CRM: React.FC = () => {
  const { data: customers, isLoading: loadingCusts } = useCustomers();
  const { mutate: createCustomer, isPending: adding } = useAddCustomer();

  // Local state
  const [showAddModal, setShowAddModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custEmail, setCustEmail] = useState('');
  
  // Pet options for quick CRM binding
  const [petName, setPetName] = useState('');
  const [petSpecies, setPetSpecies] = useState('DOG');
  const [petBreed, setPetBreed] = useState('');
  const [petAge, setPetAge] = useState('');

  if (loadingCusts) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const handleAddCustomer = () => {
    if (!custName.trim()) return;

    createCustomer({
      customer: {
        name: custName,
        phone: custPhone,
        email: custEmail
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
        setPetName('');
        setPetBreed('');
        setPetAge('');
      }
    });
  };

  const columns = [
    { header: 'رقم العميل', accessor: 'id' as const, key: 'id' },
    { header: 'الاسم الكامل', accessor: 'name' as const, key: 'name', sortable: true },
    { header: 'رقم الهاتف', accessor: 'phone' as const, key: 'phone' },
    { header: 'البريد الإلكتروني', accessor: 'email' as const, key: 'email', sortable: true }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="دليل وحسابات العملاء (CRM)" 
        subtitle="إدارة ملفات العملاء، سجلات الاتصال، وتخصيص بيانات الحيوانات الأليفة"
        actions={
          <Button onClick={() => setShowAddModal(true)} variant="primary" size="sm">
            <PlusCircle size={14} /> إضافة عميل جديد
          </Button>
        }
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={customers || []}
          columns={columns}
          rowKey="id"
          searchField="name"
          searchPlaceholder="ابحث باسم العميل..."
        />
      </div>

      {/* ADD CUSTOMER MODAL */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة عميل وحيوان أليف جديد"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowAddModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleAddCustomer} disabled={adding} variant="primary">حفظ الملف</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {/* Customer CRM section */}
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

          {/* Pet CRM section */}
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
    </div>
  );
};

export default CRM;
