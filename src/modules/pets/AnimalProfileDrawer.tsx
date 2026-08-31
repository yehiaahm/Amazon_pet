import React, { useState } from 'react';
import { Phone, MessageCircle, Plus, Syringe, Trash2, CheckCircle2 } from 'lucide-react';
import Drawer from '../../components/ui/Drawer';
import Button from '../../components/ui/Button';
import { usePetFollowUp, useDeleteVaccination, useDeleteAnimalReminder, useCompleteAnimalReminder } from '../../core/hooks/useERPData';
import { followUpStatusBadge, formatDate, waLink } from './followUpStatus';
import AddVaccinationModal from './AddVaccinationModal';
import AdministerVaccinationModal from './AdministerVaccinationModal';
import AddReminderModal from './AddReminderModal';
import type { VaccinationRecord } from '../../types/erp';

interface AnimalProfileDrawerProps {
  petId: string | null;
  onClose: () => void;
}

export const AnimalProfileDrawer: React.FC<AnimalProfileDrawerProps> = ({ petId, onClose }) => {
  const { data: view, isLoading } = usePetFollowUp(petId ?? undefined);
  const { mutate: deleteVaccination } = useDeleteVaccination();
  const { mutate: deleteReminder } = useDeleteAnimalReminder();
  const { mutate: completeReminder } = useCompleteAnimalReminder();

  const [showAddVaccination, setShowAddVaccination] = useState(false);
  const [showAddReminder, setShowAddReminder] = useState(false);
  const [administering, setAdministering] = useState<VaccinationRecord | null>(null);

  const isOpen = !!petId;
  const wa = waLink(view?.owner?.phone);

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title={view ? `ملف المتابعة — ${view.petName}` : 'ملف المتابعة'} maxWidth="720px">
        {isLoading && <div className="skeleton" style={{ height: '120px' }} />}

        {!isLoading && view && (
          <>
            {/* Owner card */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
              padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>المالك</div>
                <div style={{ fontWeight: 'bold' }}>{view.owner?.name ?? 'غير معروف'}</div>
                {view.owner?.phone && (
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{view.owner.phone}</div>
                )}
              </div>
              {view.owner?.phone && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button variant="secondary" size="sm" onClick={() => window.open(`tel:${view.owner!.phone}`, '_self')}>
                    <Phone size={12} /> اتصال
                  </Button>
                  {wa && (
                    <Button variant="secondary" size="sm" onClick={() => window.open(wa, '_blank', 'noopener,noreferrer')}>
                      <MessageCircle size={12} /> واتساب
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Vaccinations */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold' }}>التطعيمات</span>
              <Button variant="secondary" size="sm" onClick={() => setShowAddVaccination(true)}>
                <Plus size={12} /> إضافة تطعيم
              </Button>
            </div>
            {view.vaccinations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                لا توجد تطعيمات مسجلة لهذا الحيوان.
              </div>
            ) : (
              <div className="table-container">
                <table style={{ width: '100%', fontSize: 'var(--font-size-xs)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--color-text-secondary)' }}>
                      <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>التطعيم</th>
                      <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>آخر جرعة</th>
                      <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>الموعد القادم</th>
                      <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>الحالة</th>
                      <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.vaccinations.map(v => (
                      <tr key={v.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '6px 4px' }}>{v.vaccineName}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>{formatDate(v.lastAdministeredDate)}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>{formatDate(v.nextDueDate)}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px' }}>{followUpStatusBadge(v.status, v.daysUntilDue)}</td>
                        <td style={{ textAlign: 'left', padding: '6px 4px' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <Button variant="primary" size="sm" onClick={() => setAdministering(v)}>
                              <Syringe size={12} /> تسجيل
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => deleteVaccination(v.id)}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* General reminders */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-2)' }}>
              <span style={{ fontWeight: 'bold' }}>التذكيرات العامة</span>
              <Button variant="secondary" size="sm" onClick={() => setShowAddReminder(true)}>
                <Plus size={12} /> إضافة تذكير
              </Button>
            </div>
            {view.reminders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-3)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                لا توجد تذكيرات مسجلة لهذا الحيوان.
              </div>
            ) : (
              <div className="table-container">
                <table style={{ width: '100%', fontSize: 'var(--font-size-xs)', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--color-text-secondary)' }}>
                      <th style={{ textAlign: 'right', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>التذكير</th>
                      <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>تاريخ الاستحقاق</th>
                      <th style={{ textAlign: 'center', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>الحالة</th>
                      <th style={{ textAlign: 'left', fontWeight: 'normal', padding: '4px', whiteSpace: 'nowrap' }}>إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.reminders.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '6px 4px' }}>
                          {r.title}
                          {r.description && (
                            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{r.description}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>{formatDate(r.dueDate)}</td>
                        <td style={{ textAlign: 'center', padding: '6px 4px' }}>{followUpStatusBadge(r.status, r.daysUntilDue)}</td>
                        <td style={{ textAlign: 'left', padding: '6px 4px' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {r.status !== 'COMPLETED' && (
                              <Button variant="primary" size="sm" onClick={() => completeReminder(r.id)}>
                                <CheckCircle2 size={12} /> إتمام
                              </Button>
                            )}
                            <Button variant="danger" size="sm" onClick={() => deleteReminder(r.id)}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Drawer>

      {petId && (
        <>
          <AddVaccinationModal isOpen={showAddVaccination} onClose={() => setShowAddVaccination(false)} petId={petId} />
          <AddReminderModal isOpen={showAddReminder} onClose={() => setShowAddReminder(false)} petId={petId} />
        </>
      )}
      <AdministerVaccinationModal record={administering} onClose={() => setAdministering(null)} />
    </>
  );
};

export default AnimalProfileDrawer;
