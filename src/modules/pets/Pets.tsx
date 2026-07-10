import React from 'react';
import { usePets, useCustomers } from '../../core/hooks/useERPData';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';

export const Pets: React.FC = () => {
  const { data: pets, isLoading: loadingPets } = usePets();
  const { data: customers } = useCustomers();

  if (loadingPets) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const columns = [
    { header: 'رقم التعريف', accessor: 'id' as const, key: 'id' },
    { header: 'اسم الأليف', accessor: 'name' as const, key: 'name', sortable: true },
    { 
      header: 'اسم المالك (العميل)', 
      accessor: (row: any) => customers?.find(c => c.id === row.customerId)?.name || 'سارة أحمد', 
      key: 'owner',
      sortable: true
    },
    { 
      header: 'الفصيلة', 
      accessor: (row: any) => {
        const val = row.species;
        return (
          <Badge variant={val === 'DOG' ? 'primary' : val === 'CAT' ? 'success' : 'gray'}>
            {val === 'DOG' ? 'كلب' : val === 'CAT' ? 'قطة' : val === 'BIRD' ? 'طائر' : 'آخر'}
          </Badge>
        );
      }, 
      key: 'species',
      sortable: true 
    },
    { header: 'السلالة', accessor: 'breed' as const, key: 'breed', sortable: true },
    { header: 'العمر (سنوات)', accessor: 'age' as const, key: 'age', sortable: true }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="دليل وسجلات الحيوانات الأليفة" 
        subtitle="متابعة ملفات الحيوانات الأليفة للمشتركين وربطها بالمالكين والعملاء"
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={pets || []}
          columns={columns}
          rowKey="id"
          searchField="name"
          searchPlaceholder="ابحث باسم الحيوان..."
        />
      </div>
    </div>
  );
};

export default Pets;
