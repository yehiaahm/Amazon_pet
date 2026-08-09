import React, { useState } from 'react';
import { 
  useEmployeesList, 
  useAddEmployee, 
  useUpdateEmployee,
  useDeleteEmployee, 
  useChangePassword,
  useRolesList,
  useCreateRole
} from '../../core/hooks/useERPData';
import { useUIStore } from '../../core/stores/uiStore';
import { PERMISSIONS } from '../../core/permissions/permissions';
import Can from '../../components/ui/Can';
import { PlusCircle, Trash2, Key, AlertCircle, Edit } from 'lucide-react';
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
  const { mutate: updateEmployee, isPending: updating } = useUpdateEmployee();
  const { mutate: createRole } = useCreateRole();
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
  const [customRoleName, setCustomRoleName] = useState('');
  const [addError, setAddError] = useState('');

  // Edit Employee State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editEmpId, setEditEmpId] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('CASHIER');
  const [editCustomRoleName, setEditCustomRoleName] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState('');

  // Change Password State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  if (isLoading) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  const submitEmployeeCreation = (finalRoleCode: string) => {
    addEmployee({
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim() || undefined,
      password: password.trim(),
      role: finalRoleCode.trim()
    }, {
      onSuccess: () => {
        setShowAddModal(false);
        setFullName('');
        setUsername('');
        setEmail('');
        setPassword('');
        setRole('CASHIER');
        setCustomRoleName('');
      },
      onError: (err: any) => {
        setAddError(err?.message || 'فشل إضافة الموظف. قد يكون اسم المستخدم مكرر.');
      }
    });
  };

  const handleAddEmployeeSubmit = () => {
    setAddError('');
    if (!fullName.trim() || !username.trim() || !password.trim()) {
      setAddError('يرجى ملء جميع الحقول الإجبارية (الاسم، اسم المستخدم، كلمة المرور)');
      return;
    }

    if (role === 'CUSTOM') {
      if (!customRoleName.trim()) {
        setAddError('يرجى إدخال اسم المسمى الوظيفي / الدور الجديد');
        return;
      }
      const generatedCode = 'ROLE_' + Date.now().toString(36).toUpperCase();
      createRole({
        code: generatedCode,
        name: customRoleName.trim(),
        description: `دور مخصص لـ ${fullName.trim()}`,
      }, {
        onSuccess: () => {
          submitEmployeeCreation(generatedCode);
        },
        onError: (err: any) => {
          setAddError(err?.message || 'فشل إنشاء الدور الجديد.');
        }
      });
    } else {
      submitEmployeeCreation(role);
    }
  };

  const submitEmployeeUpdate = (finalRoleCode: string) => {
    updateEmployee({
      id: editEmpId,
      fullName: editFullName.trim(),
      email: editEmail.trim(),
      role: finalRoleCode.trim(),
      active: editActive
    }, {
      onSuccess: () => {
        setShowEditModal(false);
        setEditEmpId('');
        setEditFullName('');
        setEditEmail('');
        setEditRole('CASHIER');
        setEditCustomRoleName('');
      },
      onError: (err: any) => {
        setEditError(err?.message || 'فشل تحديث بيانات الموظف.');
      }
    });
  };

  const handleEditEmployeeSubmit = () => {
    setEditError('');
    if (!editFullName.trim()) {
      setEditError('يرجى ملء الاسم بالكامل');
      return;
    }

    if (editRole === 'CUSTOM') {
      if (!editCustomRoleName.trim()) {
        setEditError('يرجى إدخال اسم المسمى الوظيفي / الدور الجديد');
        return;
      }
      const generatedCode = 'ROLE_' + Date.now().toString(36).toUpperCase();
      createRole({
        code: generatedCode,
        name: editCustomRoleName.trim(),
        description: `دور مخصص لـ ${editFullName.trim()}`,
      }, {
        onSuccess: () => {
          submitEmployeeUpdate(generatedCode);
        },
        onError: (err: any) => {
          setEditError(err?.message || 'فشل إنشاء الدور الجديد.');
        }
      });
    } else {
      submitEmployeeUpdate(editRole);
    }
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
      header: 'الصلاحية / الدور',
      accessor: (row: any) => {
        const roleLabelMap: Record<string, string> = {
          OWNER: 'المالك / المدير العام',
          MANAGER: 'مدير الفرع / التشغيل',
          CASHIER: 'الكاشير / المبيعات',
          GROOMER: 'أخصائي التجميل والعناية'
        };
        const badgeVariantMap: Record<string, 'primary' | 'success' | 'warning' | 'gray'> = {
          OWNER: 'danger' as any,
          MANAGER: 'primary',
          CASHIER: 'success',
          GROOMER: 'warning'
        };
        const matchedRoleObj = (rolesList || []).find((r: any) => r.code === row.role);
        const displayName = matchedRoleObj?.name || roleLabelMap[row.role] || row.role;

        return (
          <Badge variant={badgeVariantMap[row.role] || 'gray'}>
            {displayName}
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
            <Can permission={PERMISSIONS.EMPLOYEES_EDIT}>
              <Button
                onClick={() => {
                  setEditEmpId(row.id);
                  setEditFullName(row.fullName || '');
                  setEditEmail(row.email || '');
                  setEditRole(row.role || 'CASHIER');
                  setEditActive(row.active !== false);
                  setEditError('');
                  setShowEditModal(true);
                }}
                variant="ghost"
                size="sm"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', color: 'var(--color-primary)' }}
                title="تعديل الموظف والدور"
              >
                <Edit size={12} /> تعديل
              </Button>
            </Can>

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
            options={[
              ...((rolesList && rolesList.length > 0)
                ? rolesList.map((r: any) => ({ value: r.code, label: `${r.name} (${r.code})` }))
                : [
                    { value: 'CASHIER', label: 'الكاشير / المبيعات' },
                    { value: 'OWNER', label: 'المالك / المدير العام' }
                  ]),
              { value: 'CUSTOM', label: '✍️ + كتابة مسمى دور / وظيفة جديدة...' }
            ]}
          />

          {role === 'CUSTOM' && (
            <Input
              label="مسمى الدور / الوظيفة الجديدة *"
              value={customRoleName}
              onChange={(e) => setCustomRoleName(e.target.value)}
              placeholder="مثال: مشرف وردية، مسؤول استلام، محاسب"
            />
          )}
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

      {/* Edit Employee Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="تعديل بيانات وحساب الموظف"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowEditModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleEditEmployeeSubmit} disabled={updating} variant="primary">حفظ التغييرات</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          {editError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)' }}>
              <AlertCircle size={14} />
              <span>{editError}</span>
            </div>
          )}

          <Input
            label="الاسم بالكامل *"
            value={editFullName}
            onChange={(e) => setEditFullName(e.target.value)}
          />

          <Input
            label="البريد الإلكتروني"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
          />

          <Select
            label="تغيير الدور / الصلاحية الوظيفية *"
            value={editRole}
            onChange={(e) => setEditRole(e.target.value)}
            options={[
              ...((rolesList && rolesList.length > 0)
                ? rolesList.map((r: any) => ({ value: r.code, label: `${r.name} (${r.code})` }))
                : [
                    { value: 'CASHIER', label: 'الكاشير / المبيعات' },
                    { value: 'OWNER', label: 'المالك / المدير العام' }
                  ]),
              { value: 'CUSTOM', label: '✍️ + كتابة مسمى دور / وظيفة جديدة...' }
            ]}
          />

          {editRole === 'CUSTOM' && (
            <Input
              label="مسمى الدور / الوظيفة الجديدة *"
              value={editCustomRoleName}
              onChange={(e) => setEditCustomRoleName(e.target.value)}
              placeholder="مثال: مشرف وردية، مسؤول استلام، محاسب"
            />
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 'var(--font-size-sm)' }}>
            <input
              type="checkbox"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
            />
            <span>حساب الموظف نشط ويمكنه الدخول إلى النظام</span>
          </label>
        </div>
      </Modal>
    </div>
  );
};

export default Employees;
