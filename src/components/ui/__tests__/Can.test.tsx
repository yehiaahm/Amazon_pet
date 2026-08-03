import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Can } from '../Can';
import { usePermissionStore } from '../../../core/permissions/permissionStore';
import { PERMISSIONS } from '../../../core/permissions/permissions';

describe('Can', () => {
  beforeEach(() => {
    usePermissionStore.getState().clearPermissions();
  });

  it('renders children when permission is granted', () => {
    usePermissionStore.getState().setPermissions([PERMISSIONS.SALES_CREATE]);

    render(
      <Can permission={PERMISSIONS.SALES_CREATE}>
        <span>Allowed content</span>
      </Can>
    );

    expect(screen.getByText('Allowed content')).toBeInTheDocument();
  });

  it('does not render children when permission is denied', () => {
    render(
      <Can permission={PERMISSIONS.SALES_CREATE}>
        <span>Allowed content</span>
      </Can>
    );

    expect(screen.queryByText('Allowed content')).not.toBeInTheDocument();
  });

  it('renders fallback when permission is denied', () => {
    render(
      <Can permission={PERMISSIONS.SALES_CREATE} fallback={<span>Denied</span>}>
        <span>Allowed content</span>
      </Can>
    );

    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.queryByText('Allowed content')).not.toBeInTheDocument();
  });
});
