import React, { useState, useEffect } from 'react';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import { ModalFooterActions, ModalHint } from '../../components/ui/ModalFormControls';
import { useAdministerVaccination } from '../../core/hooks/useERPData';
import type { VaccinationRecord } from '../../types/erp';

interface AdministerVaccinationModalProps {
  record: VaccinationRecord | null;
  onClose: () => void;
}

const today = () => new Date().toISOString().split('T')[0];

export const AdministerVaccinationModal: React.FC<AdministerVaccinationModalProps> = ({ record, onClose }) => {
  const { mutate: administer, isPending } = useAdministerVaccination();
  const [administeredDate, setAdministeredDate] = useState(today());
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (record) {
      setAdministeredDate(today());
      setNotes('');
    }
  }, [record]);

  const handleSave = () => {
    if (!record) return;
    administer(
      { id: record.id, administeredDate, notes: notes || undefined },
      { onSuccess: onClose }
    );
  };

  return (
    <Modal
      isOpen={!!record}
      onClose={onClose}
      title={`تسجيل أخذ التطعيم — ${record?.vaccineName ?? ''}`}
      footer={
        <ModalFooterActions
          onCancel={onClose}
          onSave={handleSave}
          saveDisabled={isPending}
          saveLabel="تسجيل"
        />
      }
    >
      {record && (
        <>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {record.petName}
            {record.intervalMonths ? ` — يتكرر كل ${record.intervalMonths} شهر` : ' — تطعيم لمرة واحدة'}
          </div>
          <DatePicker
            label="تاريخ أخذ التطعيم"
            value={administeredDate}
            onChange={setAdministeredDate}
            max={today()}
          />
          <Input
            label="ملاحظات (اختياري)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {record.intervalMonths && (
            <ModalHint>
              سيتم تحديد موعد الاستحقاق القادم تلقائياً بعد {record.intervalMonths} شهر من هذا التاريخ.
            </ModalHint>
          )}
        </>
      )}
    </Modal>
  );
};

export default AdministerVaccinationModal;
