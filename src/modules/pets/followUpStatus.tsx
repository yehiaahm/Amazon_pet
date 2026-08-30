import Badge from '../../components/ui/Badge';
import type { FollowUpStatus } from '../../types/erp';

export function followUpStatusBadge(status: FollowUpStatus, daysUntilDue?: number | null) {
  switch (status) {
    case 'OVERDUE':
      return <Badge variant="danger">متأخر{daysUntilDue != null ? ` ${Math.abs(daysUntilDue)} يوم` : ''}</Badge>;
    case 'DUE_TODAY':
      return <Badge variant="warning">مستحق اليوم</Badge>;
    case 'DUE_SOON':
      return <Badge variant="warning">خلال {daysUntilDue ?? 0} يوم</Badge>;
    case 'UPCOMING':
      return <Badge variant="gray">{daysUntilDue != null ? `خلال ${daysUntilDue} يوم` : 'قادم'}</Badge>;
    case 'COMPLETED':
    default:
      return <Badge variant="success">مكتمل</Badge>;
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ar-EG');
}

export function waLink(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // Egyptian local numbers (01xxxxxxxxx) need the country code for wa.me links.
  const withCountryCode = digits.startsWith('0') ? `20${digits.slice(1)}` : digits;
  return `https://wa.me/${withCountryCode}`;
}
