import type { Expense, Sale } from '../../types/erp';
import { isCompletedSale, saleCogs, saleDateKey, saleRevenue } from './saleFinance';

export type TrendDirection = 'up' | 'down' | 'neutral';

export type Trend = { value: string; type: TrendDirection };

export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** Local YYYY-MM-DD — avoids UTC day-shift from toISOString(). */
export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export function inRange(dateStr: string | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  return t >= start.getTime() && t < end.getTime();
}

export function pctChange(current: number, previous: number): Trend {
  if (previous === 0) {
    if (current === 0) return { value: '0%', type: 'neutral' };
    return { value: '+100%', type: 'up' };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct).toFixed(1);
  if (pct > 0.05) return { value: `+${rounded}%`, type: 'up' };
  if (pct < -0.05) return { value: `-${rounded}%`, type: 'down' };
  return { value: '0%', type: 'neutral' };
}

export function trendFromPct(pct: number): Trend {
  const rounded = Math.abs(pct).toFixed(1);
  if (pct > 0.05) return { value: `+${rounded}%`, type: 'up' };
  if (pct < -0.05) return { value: `-${rounded}%`, type: 'down' };
  return { value: '0%', type: 'neutral' };
}

/** Period-over-period percent; null when no baseline (show "جديد" in UI). */
export function calcTrendPct(curr: number, prev: number): number | null {
  if (prev === 0) {
    if (curr === 0) return 0;
    return null;
  }
  return ((curr - prev) / prev) * 100;
}

export function sumExpensesInRange(expenses: Expense[], start: Date, end: Date): number {
  return expenses
    .filter(e => inRange(e.date, start, end))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

export function calcPeriodFinance(sales: Sale[], expenses: Expense[], start: Date, end: Date) {
  const periodSales = sales.filter(s => isCompletedSale(s) && inRange(s.date, start, end));
  const periodExpenses = expenses.filter(e => inRange(e.date, start, end));

  const revenue = periodSales.reduce((sum, s) => sum + saleRevenue(s), 0);
  const cogs = periodSales.reduce((sum, s) => sum + saleCogs(s), 0);
  const opExpenses = periodExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - opExpenses;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return { revenue, cogs, opExpenses, grossProfit, netProfit, grossMargin };
}

export function buildSalesExpensesChart(
  sales: Sale[] | undefined,
  expenses: Expense[] | undefined,
  monthCount = 6
): Array<{ name: string; Sales: number; Expenses: number }> {
  const now = new Date();
  const completed = (sales ?? []).filter(isCompletedSale);
  const expenseList = expenses ?? [];
  const points: Array<{ name: string; Sales: number; Expenses: number }> = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = startOfMonth(monthDate);
    const end = startOfNextMonth(monthDate);

    const salesTotal = completed
      .filter(s => inRange(s.date, start, end))
      .reduce((sum, s) => sum + saleRevenue(s), 0);

    const expensesTotal = expenseList
      .filter(e => inRange(e.date, start, end))
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const yearShort = String(monthDate.getFullYear()).slice(-2);
    points.push({
      name: `${ARABIC_MONTHS[monthDate.getMonth()]} ${yearShort}`,
      Sales: Math.round(salesTotal * 100) / 100,
      Expenses: Math.round(expensesTotal * 100) / 100,
    });
  }

  return points;
}

export function filterSalesByDateRange(
  sales: Sale[] | undefined,
  start: string,
  end: string
): Sale[] {
  if (!sales) return [];
  return sales.filter(s => {
    const saleDate = saleDateKey(s.date);
    return saleDate >= start && saleDate <= end;
  });
}

export function filterExpensesByDateRange(
  expenses: Expense[] | undefined,
  start: string,
  end: string
): Expense[] {
  if (!expenses) return [];
  return expenses.filter(e => {
    const expDate = saleDateKey(e.date);
    return expDate >= start && expDate <= end;
  });
}

export function getInitialMonthDateRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  return { start: formatLocalDate(start), end: formatLocalDate(today) };
}
