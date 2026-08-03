import React, { useState } from 'react';
import { 
  useEmployeesList, 
  useAddEmployee, 
  useDeleteEmployee, 
  useChangePassword,
  useRolesList
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { PERMISSIONS } from '../../core/permissions/permissions';
import Can from '../../components/ui/Can';
import { PlusCircle, Trash2, Key, AlertCircle } from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';
import Badge from '../../components/ui/Badge';

export const Employees: React.FC = () => {
  const { data: employees, isLoading } = useEmployeesList();
  const { data: rolesList } = useRolesList();
  const { mutate: addEmployee, isPending: adding } = useAddEmployee();
  const { mutate: deleteEmployee } = useDeleteEmployee();
  const { mutate: changePassword, isPending: changingPassword } = useChangePassword();

  const currentEmployee = useUIStore(s => s.currentEmployee);

  // Add Employee State
  const [showAddModal, setShowAddModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CASHIER');
  const [addError, setAddError] = useState('');

  // Change Password State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  if (isLoading) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const handleAddEmployeeSubmit = () => {
    setAddError('');
    if (!fullName.trim() || !username.trim() || !password.trim()) {
      setAddError('يرجى ملء جميع الحقول الإجبارية (الاسم، اسم المستخدم، كلمة المرور)');
      return;
    }

    addEmployee({
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim() || undefined,
      password: password.trim(),
      role: role.trim()
    }, {
      onSuccess: () => {
        setShowAddModal(false);
        setFullName('');
        setUsername('');
        setEmail('');
        setPassword('');
        setRole('CASHIER');
      },
      onError: (err: any) => {
        setAddError(err?.message || 'فشل إضافة الموظف. قد يكون اسم المستخدم مكرر.');
      }
    });
  };

  const handleChangePasswordSubmit = () => {
    setPasswordError('');
    if (!newPassword.trim()) {
      setPasswordError('يرجى إدخال كلمة المرور الجديدة');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('كلمتا المرور غير متطابقتين');
      return;
    }

    changePassword({
      id: selectedEmp.id,
      newPassword: newPassword.trim()
    }, {
      onSuccess: () => {
        setShowPasswordModal(false);
        setSelectedEmp(null);
        setNewPassword('');
        setConfirmPassword('');
      },
      onError: (err: any) => {
        setPasswordError(err?.message || 'فشل تغيير كلمة المرور.');
      }
    });
  };

  const columns = [
    {
      header: 'الاسم بالكامل',
      accessor: 'fullName' as const,
      key: 'fullName',
      sortable: true
    },
    {
      header: 'اسم المستخدم',
      accessor: 'username' as const,
      key: 'username',
      sortable: true
    },
    {
      header: 'البريد الإلكتروني',
      accessor: 'email' as const,
      key: 'email'
    },
    {
      header: 'الصلاحية',
      accessor: (row: any) => {
        const roleLabelMap: Record<string, string> = {
          OWNER: 'مالك النظام',
          MANAGER: 'مدير النظام',
          CASHIER: 'كاشير / مبيعات',
          GROOMER: 'أخصائي العناية بالحيوانات'
        };
        const badgeVariantMap: Record<string, 'primary' | 'success' | 'warning' | 'gray'> = {
          OWNER: 'danger' as any,
          MANAGER: 'primary',
          CASHIER: 'success',
          GROOMER: 'warning'
        };
        return (
          <Badge variant={badgeVariantMap[row.role] || 'gray'}>
            {roleLabelMap[row.role] || row.role}
          </Badge>
        );
      },
      key: 'role',
      sortable: true
    },
    {
      header: 'الحالة',
      accessor: (row: any) => (
        <Badge variant={row.active ? 'success' : 'gray'}>
          {row.active ? 'نشط' : 'غير نشط'}
        </Badge>
      ),
      key: 'active'
    },
    {
      header: 'إجراءات وحماية',
      accessor: (row: any) => {
        const isCurrent = currentEmployee?.id === row.id;
        return (
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              onClick={() => {
                setSelectedEmp(row);
                setShowPasswordModal(true);
                setPasswordError('');
              }}
              variant="ghost"
              size="sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', color: 'var(--color-primary)' }}
              title="تغيير كلمة المرور"
            >
              <Key size={12} /> كلمة المرور
            </Button>
            
            {!isCurrent && (
              <Can permission={PERMISSIONS.EMPLOYEES_DELETE}>
                <Button
                  onClick={() => {
                    if (confirm(`هل أنت متأكد من حذف الموظف "${row.fullName}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) {
                      deleteEmployee(row.id);
                    }
                  }}
                  variant="ghost"
                  size="sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', color: 'var(--color-danger)' }}
                  title="حذف حساب الموظف"
                >
                  <Trash2 size={12} /> حذف
                </Button>
              </Can>
            )}
          </div>
        );
      },
      key: 'actions'
    }
  ];

  return (
    <div className="workspace">
      <PageHeader
        title="إدارة المستخدمين وحسابات الموظفين"
        subtitle="إضافة وتعديل صلاحيات وحذف حسابات الكاشير والمشرفين في الفرع"
        actions={
          <Can permission={PERMISSIONS.EMPLOYEES_ADD}>
            <Button onClick={() => { setShowAddModal(true); setAddError(''); }} variant="primary" size="sm">
              <PlusCircle size={14} /> إضافة حساب موظف جديد
            </Button>
          </Can>
        }
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          data={employees || []}
          columns={columns}
          rowKey="id"
          searchField="fullName"
          searchPlaceholder="ابحث باسم الموظف..."
        />
      </div>

      {/* Add Employee Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="تسجيل حساب موظف جديد"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowAddModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleAddEmployeeSubmit} disabled={adding} variant="primary">إضافة الموظف</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {addError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)' }}>
              <AlertCircle size={14} />
              <span>{addError}</span>
            </div>
          )}

          <Input
            label="الاسم بالكامل (يظهر في التقارير والفواتير) *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="مثال: أمير أحمد"
          />

          <Input
            label="اسم المستخدم (لتسجيل الدخول) *"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="مثال: cashier_amir"
          />

          <Input
            label="الرمز السري / كلمة المرور (PIN رقمي أو كلمة مرور) *"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="مثال: 1234 أو كلمة مرور آمنة"
            type="password"
          />

          <Input
            label="البريد الإلكتروني (اختياري)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="amir@example.com"
          />

          <Select
            label="نوع الصلاحية / الدور الوظيفي *"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={
              (rolesList && rolesList.length > 0)
                ? rolesList.map((r: any) => ({ value: r.code, label: r.name }))
                : [
                    { value: 'CASHIER', label: 'كاشير (صلاحيات محدودة للبيع والإقامة فقط)' },
                    { value: 'GROOMER', label: 'أخصائي عناية بالحيوانات (صلاحيات الحجوزات والحيوانات)' },
                    { value: 'MANAGER', label: 'مشرف / مدير فرع (صلاحيات كاملة عدا تصفير النظام)' },
                    { value: 'OWNER', label: 'مالك المؤسسة (صلاحيات كاملة للمؤسسة والتحكم الشامل)' }
                  ]
            }
          />
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => { setShowPasswordModal(false); setSelectedEmp(null); }}
        title={`تحديث كلمة مرور الموظف: ${selectedEmp?.fullName || ''}`}
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => { setShowPasswordModal(false); setSelectedEmp(null); }} variant="secondary">إلغاء</Button>
            <Button onClick={handleChangePasswordSubmit} disabled={changingPassword} variant="primary">تحديث كلمة المرور</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {passwordError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)' }}>
              <AlertCircle size={14} />
              <span>{passwordError}</span>
            </div>
          )}

          <div style={{ padding: 'var(--spacing-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)', fontSize: 'var(--font-size-xs)' }}>
            <strong>اسم المستخدم: </strong>
            <code style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>{selectedEmp?.username}</code>
          </div>

          <Input
            label="رمز الدخول / كلمة المرور الجديدة *"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="أدخل كلمة مرور أو رمز PIN جديد"
            type="password"
          />

          <Input
            label="تأكيد كلمة المرور الجديدة *"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="أعد كتابة كلمة المرور للـتأكيد"
            type="password"
          />
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
