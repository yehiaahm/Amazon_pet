import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import { useUIStore } from '../../../core/stores/uiStore';
import { usePermissionStore } from '../../../core/permissions/permissionStore';
import { PERMISSIONS } from '../../../core/permissions/permissions';

vi.mock('../../../core/stores/uiStore', () => ({
  useUIStore: vi.fn(),
}));

describe('CommandPalette permission filtering', () => {
  const setOpen = vi.fn();
  const setActiveModule = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    usePermissionStore.getState().clearPermissions();

    vi.mocked(useUIStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({
        commandPaletteOpen: true,
        setCommandPaletteOpen: setOpen,
        setActiveModule,
        currentEmployee: { id: 'e-1', fullName: 'Tester', role: 'MANAGER' },
      })
    );
  });

  it('hides inventory-only actions without products.add permission', () => {
    usePermissionStore.getState().setPermissions([
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.INVENTORY_VIEW,
    ]);

    render(<CommandPalette />);

    expect(screen.queryByText('Add New Product')).not.toBeInTheDocument();
    expect(screen.getByText('Go to POS Cash Register')).toBeInTheDocument();
  });

  it('shows expense action when finance.add_expense is granted', () => {
    usePermissionStore.getState().setPermissions([
      PERMISSIONS.FINANCE_VIEW_EXPENSES,
      PERMISSIONS.FINANCE_ADD_EXPENSE,
    ]);

    render(<CommandPalette />);

    expect(screen.getAllByText('Record New Expense').length).toBeGreaterThan(0);
  });
});
