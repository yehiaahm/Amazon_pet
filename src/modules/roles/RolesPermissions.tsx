import React, { useMemo, useState } from 'react';
import {
  useRolesList,
  usePermissionsCatalog,
  useRoleDetail,
  useUpdateRolePermissions,
  useCreateRole,
  useDeleteRole,
} from '../../core/hooks/useERPData';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';
import Can from '../../components/ui/Can';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Shield, CheckSquare, Square, ChevronLeft, Plus, Trash2 } from 'lucide-react';

interface PermissionCatalogEntry {
  code: string;
  name: string;
  module: string;
}

interface PermissionCatalogGroup {
  module: string;
  permissions: PermissionCatalogEntry[];
}

export const RolesPermissions: React.FC = () => {
  const { hasPermission } = usePermissions();
  const { data: roles, isLoading: rolesLoading } = useRolesList();
  const { data: catalog } = usePermissionsCatalog();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [draftCodes, setDraftCodes] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [createError, setCreateError] = useState('');

  const { data: roleDetail, isLoading: detailLoading } = useRoleDetail(selectedRoleId);
  const { mutate: savePermissions, isPending: saving } = useUpdateRolePermissions();
  const { mutate: createRole, isPending: creating } = useCreateRole();
  const { mutate: deleteRole } = useDeleteRole();

  React.useEffect(() => {
    if (roleDetail?.permissionCodes) {
      setDraftCodes(new Set(roleDetail.permissionCodes));
      setDirty(false);
    }
  }, [roleDetail]);

  const filteredCatalog = useMemo((): PermissionCatalogGroup[] => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    const groups = catalog as PermissionCatalogGroup[];
    if (!q) return groups;
    return groups
      .map((group) => ({
        ...group,
        permissions: group.permissions.filter(
          (p: PermissionCatalogEntry) =>
            p.name.toLowerCase().includes(q) ||
            p.code.toLowerCase().includes(q) ||
            p.module.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [catalog, search]);

  const allPermissionCodes = useMemo(() => {
    if (!catalog) return [];
    return (catalog as PermissionCatalogGroup[]).flatMap((g) =>
      g.permissions.map((p: PermissionCatalogEntry) => p.code)
    );
  }, [catalog]);

  const togglePermission = (code: string) => {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
    setDirty(true);
  };

  const toggleModule = (codes: string[], select: boolean) => {
    setDraftCodes((prev) => {
      const next = new Set(prev);
      codes.forEach((c) => (select ? next.add(c) : next.delete(c)));
      return next;
    });
    setDirty(true);
  };

  const handleSelectAll = (select: boolean) => {
    setDraftCodes(select ? new Set(allPermissionCodes) : new Set());
    setDirty(true);
  };

  const handleSave = () => {
    if (!selectedRoleId) return;
    savePermissions(
      { roleId: selectedRoleId, permissionCodes: Array.from(draftCodes) },
      { onSuccess: () => setDirty(false) }
    );
  };

  const handleCancel = () => {
    if (roleDetail?.permissionCodes) {
      setDraftCodes(new Set(roleDetail.permissionCodes));
      setDirty(false);
    }
  };

  const handleCreateRole = () => {
    setCreateError('');
    if (!newCode.trim() || !newName.trim()) {
      setCreateError('رمز الدور والاسم مطلوبان');
      return;
    }
    createRole(
      { code: newCode.trim(), name: newName.trim(), description: newDescription.trim() || undefined },
      {
        onSuccess: (created) => {
          setShowCreateModal(false);
          setNewCode('');
          setNewName('');
          setNewDescription('');
          setSelectedRoleId(created.id);
        },
        onError: (err: any) => setCreateError(err?.message || 'فشل إنشاء الدور'),
      }
    );
  };

  const handleDeleteRole = (roleId: string, systemRole: boolean) => {
    if (systemRole) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا الدور؟')) return;
    deleteRole(roleId, {
      onSuccess: () => {
        if (selectedRoleId === roleId) setSelectedRoleId(null);
      },
    });
  };

  if (!hasPermission(PERMISSIONS.ROLES_VIEW)) {
    return (
      <div className="workspace">
        <p>ليس لديك صلاحية عرض الأدوار والصلاحيات.</p>
      </div>
    );
  }

  if (rolesLoading) {
    return <div className="workspace"><div className="skeleton" style={{ height: 200 }} /></div>;
  }

  // ── Role list view ──
  if (!selectedRoleId) {
    return (
      <div className="workspace">
        <PageHeader
          title="الأدوار والصلاحيات"
          subtitle="إدارة أدوار الموظفين وصلاحيات كل دور"
          actions={
            <Can permission={PERMISSIONS.ROLES_CREATE}>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus size={16} /> دور جديد
              </Button>
            </Can>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-4)' }}>
          {(roles || []).map((role) => (
            <div
              key={role.id}
              className="card"
              style={{ cursor: 'pointer', padding: 'var(--spacing-4)' }}
              onClick={() => setSelectedRoleId(role.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Shield size={20} color="var(--color-primary)" />
                <strong>{role.name}</strong>
                {role.systemRole && <Badge variant="info">نظام</Badge>}
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', margin: '0 0 12px' }}>
                {role.description || role.code}
              </p>
              <div style={{ display: 'flex', gap: 16, fontSize: 'var(--font-size-sm)' }}>
                <span>{role.employeeCount} موظف</span>
                <span>{role.permissionCount} صلاحية</span>
              </div>
              <Can permission={PERMISSIONS.ROLES_DELETE}>
                {!role.systemRole && (
                  <Button
                    variant="ghost"
                    size="sm"
                    style={{ marginTop: 12 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRole(role.id, role.systemRole);
                    }}
                  >
                    <Trash2 size={14} /> حذف
                  </Button>
                )}
              </Can>
            </div>
          ))}
        </div>

        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="إنشاء دور جديد">
          {createError && <p style={{ color: 'var(--color-danger)' }}>{createError}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input label="رمز الدور (بالإنجليزية)" value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="SUPERVISOR" />
            <Input label="اسم الدور" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مشرف" />
            <Input label="الوصف" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>إلغاء</Button>
              <Button onClick={handleCreateRole} disabled={creating}>إنشاء</Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Permission editor view ──
  return (
    <div className="workspace">
      <PageHeader
        title={roleDetail?.name || 'تحرير الصلاحيات'}
        subtitle={roleDetail?.description || roleDetail?.code}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => { setSelectedRoleId(null); setDirty(false); }}>
              <ChevronLeft size={16} /> رجوع
            </Button>
            <Can permission={PERMISSIONS.ROLES_ASSIGN}>
              <Button variant="ghost" onClick={handleCancel} disabled={!dirty || saving}>إلغاء</Button>
              <Button onClick={handleSave} disabled={!dirty || saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</Button>
            </Can>
          </div>
        }
      />

      {detailLoading ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <Input
                placeholder="بحث عن صلاحية..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Can permission={PERMISSIONS.ROLES_ASSIGN}>
              <Button variant="ghost" size="sm" onClick={() => handleSelectAll(true)}>
                <CheckSquare size={14} /> تحديد الكل
              </Button>
              <Button variant="ghost" size="sm" onClick={() => handleSelectAll(false)}>
                <Square size={14} /> إلغاء الكل
              </Button>
            </Can>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {filteredCatalog.map((group: PermissionCatalogGroup) => {
              const codes = group.permissions.map((p: PermissionCatalogEntry) => p.code);
              const allSelected = codes.every((c: string) => draftCodes.has(c));
              const someSelected = codes.some((c: string) => draftCodes.has(c));
              return (
                <div key={group.module} className="card" style={{ padding: 'var(--spacing-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>{group.module}</h3>
                    <Can permission={PERMISSIONS.ROLES_ASSIGN}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleModule(codes, !allSelected)}
                      >
                        {allSelected ? 'إلغاء المجموعة' : someSelected ? 'تحديد المجموعة' : 'تحديد المجموعة'}
                      </Button>
                    </Can>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
                    {group.permissions.map((perm: PermissionCatalogEntry) => (
                      <label
                        key={perm.code}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: draftCodes.has(perm.code) ? 'var(--color-primary-light, rgba(59,130,246,0.1))' : 'var(--color-bg-secondary)',
                          cursor: hasPermission(PERMISSIONS.ROLES_ASSIGN) ? 'pointer' : 'default',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={draftCodes.has(perm.code)}
                          disabled={!hasPermission(PERMISSIONS.ROLES_ASSIGN)}
                          onChange={() => togglePermission(perm.code)}
                        />
                        <span style={{ fontSize: 'var(--font-size-sm)' }}>{perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default RolesPermissions;
