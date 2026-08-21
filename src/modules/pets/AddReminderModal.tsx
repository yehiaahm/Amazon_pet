import React, { useState } from 'react';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import DatePicker from '../../components/ui/DatePicker';
import { ModalFooterActions } from '../../components/ui/ModalFormControls';
import { useAddAnimalReminder } from '../../core/hooks/useERPData';

interface AddReminderModalProps {
  isOpen: boolean;
  onClose: () => void;
  petId: string;
}

export const AddReminderModal: React.FC<AddReminderModalProps> = ({ isOpen, onClose, petId }) => {
  const { mutate: addReminder, isPending } = useAddAnimalReminder();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = () => {
    if (!title.trim() || !dueDate) return;
    addReminder(
      { petId, title: title.trim(), description: description || undefined, dueDate },
      { onSuccess: handleClose }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="إضافة تذكير"
      footer={
        <ModalFooterActions
          onCancel={handleClose}
          onSave={handleSave}
          saveDisabled={isPending || !title.trim() || !dueDate}
        />
      }
    >
      <Input
        label="عنوان التذكير"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="مثال: مراجعة دكتور، جرعة دواء، Grooming..."
      />
      <DatePicker
        label="تاريخ الاستحقاق"
        value={dueDate}
        onChange={setDueDate}
      />
      <Input
        label="ملاحظات (اختياري)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
    </Modal>
  );
};

export default AddReminderModal;
