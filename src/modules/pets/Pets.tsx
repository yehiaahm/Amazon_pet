import React, { useState } from 'react';
import { AlertTriangle, CalendarClock, Bell, Settings2, Syringe } from 'lucide-react';
import {
  usePets, useCustomers, usePetFollowUpSummary, useAnimalFollowUpDashboard,
  useUpdateAnimalFollowUpSettings,
} from '../../core/hooks/useERPData';
import PageHeader from '../../components/ui/PageHeader';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { followUpStatusBadge, formatDate } from './followUpStatus';
import AnimalProfileDrawer from './AnimalProfileDrawer';
import type { Pet } from '../../types/erp';

export const Pets: React.FC = () => {
  const { data: pets, isLoading: loadingPets } = usePets();
  const { data: customers } = useCustomers();
  const { data: followUpSummary } = usePetFollowUpSummary();
  const { data: dashboard } = useAnimalFollowUpDashboard();
  const { mutate: updateSettings, isPending: savingSettings } = useUpdateAnimalFollowUpSettings();

  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [thresholdDraft, setThresholdDraft] = useState('30');

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
    { header: 'العمر (سنوات)', accessor: 'age' as const, key: 'age', sortable: true },
    {
      header: 'المتابعة',
      accessor: (row: Pet) => {
        const summary = followUpSummary?.[row.id];
        if (!summary || (summary.overdueCount === 0 && summary.dueSoonCount === 0)) {
          return <span style={{ color: 'var(--color-text-secondary)' }}>—</span>;
        }
        return (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
            {summary.overdueCount > 0 && <Badge variant="danger">متأخر {summary.overdueCount}</Badge>}
            {summary.dueSoonCount > 0 && <Badge variant="warning">قريب {summary.dueSoonCount}</Badge>}
          </div>
        );
      },
      key: 'followUp',
    },
    {
      header: 'إجراء',
      accessor: (row: Pet) => (
        <Button variant="secondary" size="sm" onClick={() => setSelectedPetId(row.id)}>
          <Syringe size={12} /> ملف المتابعة
        </Button>
      ),
      key: 'actions',
    },
  ];

  return (
    <div className="workspace">
      <PageHeader
        title="دليل وسجلات الحيوانات الأليفة"
        subtitle="متابعة ملفات الحيوانات الأليفة للمشتركين وربطها بالمالكين والعملاء"
      />

      {dashboard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', marginBottom: 'var(--spacing-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <button
              onClick={() => setShowDashboard(v => !v)}
              className="btn-ghost"
              style={{ padding: '4px 8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Bell size={16} /> متابعة التطعيمات والتذكيرات {showDashboard ? '▾' : '▸'}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setThresholdDraft(String(dashboard.dueSoonThresholdDays)); setShowSettings(true); }}
            >
              <Settings2 size={14} /> إعدادات التنبيه ({dashboard.dueSoonThresholdDays} يوم)
            </Button>
          </div>

          {showDashboard && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-3)' }}>
                <SummaryCard icon={<AlertTriangle size={20} />} label="تطعيمات متأخرة" value={String(dashboard.vaccinationsOverdueCount)} color="var(--color-danger)" />
                <SummaryCard icon={<CalendarClock size={20} />} label="تطعيمات قريبة" value={String(dashboard.vaccinationsDueSoonCount)} color="var(--color-warning)" />
                <SummaryCard icon={<AlertTriangle size={20} />} label="تذكيرات متأخرة" value={String(dashboard.remindersOverdueCount)} color="var(--color-danger)" />
                <SummaryCard icon={<Bell size={20} />} label="تذكيرات هذا الأسبوع" value={String(dashboard.remindersDueThisWeekCount)} color="var(--color-info)" />
              </div>

              {(dashboard.vaccinationsOverdue.length > 0 || dashboard.remindersOverdue.length > 0) && (
                <div style={{
                  background: 'var(--color-danger-bg, rgba(239,68,68,0.1))',
                  border: '1px solid var(--color-danger)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-3)',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 6 }}>متأخرة — تحتاج متابعة فورية</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-sm)' }}>
                    {dashboard.vaccinationsOverdue.map(v => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSelectedPetId(v.petId)}>
                        <span>{v.petName} — {v.vaccineName} ({v.ownerName})</span>
                        {followUpStatusBadge(v.status, v.daysUntilDue)}
                      </div>
                    ))}
                    {dashboard.remindersOverdue.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSelectedPetId(r.petId)}>
                        <span>{r.petName} — {r.title} ({r.ownerName})</span>
                        {followUpStatusBadge(r.status, r.daysUntilDue)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dashboard.vaccinationsDueSoon.length > 0 && (
                <div style={{
                  background: 'var(--color-warning-bg, rgba(245,158,11,0.1))',
                  border: '1px solid var(--color-warning)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-3)',
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 6 }}>تطعيمات مستحقة قريباً</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-sm)' }}>
                    {dashboard.vaccinationsDueSoon.slice(0, 8).map(v => (
                      <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setSelectedPetId(v.petId)}>
                        <span>{v.petName} — {v.vaccineName} — {formatDate(v.nextDueDate)} ({v.ownerName})</span>
                        {followUpStatusBadge(v.status, v.daysUntilDue)}
                      </div>
                    ))}
                    {dashboard.vaccinationsDueSoon.length > 8 && (
                      <div style={{ color: 'var(--color-text-secondary)' }}>... و {dashboard.vaccinationsDueSoon.length - 8} أخرى</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={pets || []}
          columns={columns}
          rowKey="id"
          searchField="name"
          searchPlaceholder="ابحث باسم الحيوان..."
        />
      </div>

      <AnimalProfileDrawer petId={selectedPetId} onClose={() => setSelectedPetId(null)} />

      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title="إعدادات تنبيهات المتابعة"
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setShowSettings(false)}>إلغاء</Button>
            <Button
              variant="primary"
              disabled={savingSettings}
              onClick={() => {
                const days = parseInt(thresholdDraft, 10);
                if (days < 1 || days > 180) return;
                updateSettings(days, { onSuccess: () => setShowSettings(false) });
              }}
            >
              حفظ
            </Button>
          </div>
        }
      >
        <Input
          label="عدد الأيام قبل الاستحقاق لاعتبار التطعيم/التذكير قريباً"
          value={thresholdDraft}
          onChange={(e) => setThresholdDraft(e.target.value)}
          placeholder="30"
        />
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', margin: 0 }}>
          سيظهر تنبيه "قريب" للتطعيمات والتذكيرات المستحقة خلال هذا العدد من الأيام (مثلاً 30 يوم).
        </p>
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

export default Pets;
