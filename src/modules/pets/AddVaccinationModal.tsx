import React, { useState } from 'react';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import { ModalFooterActions, ModalHint } from '../../components/ui/ModalFormControls';
import { useAddVaccination } from '../../core/hooks/useERPData';

interface AddVaccinationModalProps {
  isOpen: boolean;
  onClose: () => void;
  petId: string;
}

export const AddVaccinationModal: React.FC<AddVaccinationModalProps> = ({ isOpen, onClose, petId }) => {
  const { mutate: addVaccination, isPending } = useAddVaccination();
  const [vaccineName, setVaccineName] = useState('');
  const [intervalMonths, setIntervalMonths] = useState('12');
  const [lastAdministeredDate, setLastAdministeredDate] = useState('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setVaccineName('');
    setIntervalMonths('12');
    setLastAdministeredDate('');
    setNotes('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = () => {
    if (!vaccineName.trim()) return;
    addVaccination(
      {
        petId,
        vaccineName: vaccineName.trim(),
        intervalMonths: intervalMonths ? parseInt(intervalMonths, 10) : null,
        lastAdministeredDate: lastAdministeredDate || null,
        notes: notes || undefined,
      },
      { onSuccess: handleClose }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="إضافة تطعيم"
      footer={
        <ModalFooterActions
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={isPending || !vaccineName.trim()}
        />
      }
    >
      <Input
        label="اسم التطعيم"
        value={vaccineName}
        onChange={(e) => setVaccineName(e.target.value)}
        placeholder="مثال: داء الكلب (Rabies)"
      />
      <Input
        label="فترة التكرار (بالأشهر)"
        type="number"
        value={intervalMonths}
        onChange={(e) => setIntervalMonths(e.target.value)}
        placeholder="12"
      />
      <DatePicker
        label="آخر جرعة (اختياري)"
        value={lastAdministeredDate}
        onChange={setLastAdministeredDate}
      />
      <Input
        label="ملاحظات (اختياري)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <ModalHint>
        لو اخترت آخر جرعة وفترة التكرار، هيتم حساب موعد الاستحقاق القادم تلقائياً.
      </ModalHint>
    </Modal>
  );
};

export default AddVaccinationModal;
