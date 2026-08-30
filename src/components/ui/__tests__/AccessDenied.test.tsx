import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccessDenied } from '../AccessDenied';

describe('AccessDenied', () => {
  it('renders the default Arabic access denied message', () => {
    render(<AccessDenied />);

    expect(screen.getByText('غير مصرح بالوصول')).toBeInTheDocument();
    expect(screen.getByText('لا تملك الصلاحية المطلوبة لهذه الصفحة.')).toBeInTheDocument();
  });

  it('renders a module-specific Arabic message when moduleName is provided', () => {
    render(<AccessDenied moduleName="المخزون" />);

    expect(
      screen.getByText('لا تملك الصلاحية المطلوبة للوصول إلى "المخزون".')
    ).toBeInTheDocument();
  });

  it('renders the home button and calls onGoHome when clicked', async () => {
    const user = userEvent.setup();
    const onGoHome = vi.fn();

    render(<AccessDenied onGoHome={onGoHome} />);

    await user.click(screen.getByRole('button', { name: 'العودة للصفحة الرئيسية' }));

    expect(onGoHome).toHaveBeenCalledOnce();
  });
});
