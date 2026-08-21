import React from 'react';
import { useUIStore } from '../../core/stores/uiStore';
import {
  useKPIMetrics, useDashboardMetrics, useSales, useAppointments, useExpenses, useServices, usePets,
  useProducts, useVariants, useDailyClosings, useBatches
} from '../../core/hooks/useERPData';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  DollarSign, ShoppingCart, Scissors, Package,
  TrendingUp, AlertTriangle, Users, Play, FileText, CheckCircle, Truck
} from 'lucide-react';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import type { Appointment, Batch, DashboardAlert, Product, ProductVariant, Sale } from '../../types/erp';
import { isCompletedSale, saleRevenue } from '../../core/utils/saleFinance';
import { formatMoney } from '../../core/utils/money';
import {
  buildSalesExpensesChart,
  inRange,
  pctChange,
  startOfMonth,
  startOfNextMonth,
  trendFromPct,
} from '../../core/utils/periodFinance';
import Can from '../../components/ui/Can';
import { usePermissions } from '../../core/permissions/usePermissions';
import { hasRestrictedSalesScope } from '../../core/permissions/salesAuth';
import { PERMISSIONS } from '../../core/permissions/permissions';
import type {
  InventoryDrilldownTab,
  ReportsDrilldownPreset,
  ReportsDrilldownTab,
} from '../../core/stores/uiStore';

function alertSeverityType(severity: string): 'danger' | 'warning' {
  const s = severity.toLowerCase();
  if (s.includes('حر') || s.includes('critical') || s.includes('عالية')) return 'danger';
  return 'warning';
}

function mapBackendAlerts(alerts: DashboardAlert[] | undefined) {
  return (alerts ?? []).map(a => ({
    title: a.rule.replace(/_/g, ' '),
    desc: a.message,
    type: alertSeverityType(a.severity),
  }));
}

function expiringBatches(
  batches: Batch[] | undefined,
  variants: ProductVariant[] | undefined,
  products: Product[] | undefined,
  withinDays = 90
) {
  if (!batches) return [];
  const now = Date.now();
  return batches
    .filter(b => {
      if (!b.expiryDate) return false;
      const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24));
      return daysLeft >= 0 && daysLeft < withinDays;
    })
    .map(b => {
      const variant = variants?.find(v => v.id === b.productVariantId);
      const prod = variant ? products?.find(p => p.id === variant.productId) : null;
      const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24));
      return { batch: b, variant, prod, daysLeft };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function isActiveAppointment(apt: Appointment) {
  return apt.status === 'SCHEDULED' || apt.status === 'COMPLETED';
}

function calcRepeatCustomerRate(sales: Sale[], start: Date, end: Date) {
  const completed = sales.filter(isCompletedSale);
  const inPeriod = completed.filter(s => inRange(s.date, start, end) && s.customerId);
  const prior = completed.filter(s => {
    if (!s.customerId || !s.date) return false;
    const t = new Date(s.date).getTime();
    return !Number.isNaN(t) && t < start.getTime();
  });

  const periodCustomers = new Set(inPeriod.map(s => s.customerId!));
  if (periodCustomers.size === 0) return 0;

  const priorCustomers = new Set(prior.map(s => s.customerId!));
  let repeaters = 0;
  periodCustomers.forEach(id => {
    if (priorCustomers.has(id)) repeaters += 1;
  });
  return (repeaters / periodCustomers.size) * 100;
}

function RankingTable({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Array<Record<string, string | number>>;
  columns: Array<{ key: string; header: string; align?: 'left' | 'right' }>;
}) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <div style={{ padding: 'var(--spacing-3)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
          لا توجد بيانات لهذا الشهر
        </div>
      ) : (
        <div className="table-container">
          <table className="erp-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {columns.map(col => (
                    <td key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export const Dashboard: React.FC = () => {
  const activeModule = useUIStore(s => s.activeModule);
  const setActiveModule = useUIStore(s => s.setActiveModule);
  const setPendingReportsFilter = useUIStore(s => s.setPendingReportsFilter);
  const setPendingInventoryTab = useUIStore(s => s.setPendingInventoryTab);
  const { hasPermission, canAccessModule } = usePermissions();
  const restrictedSalesScope = hasRestrictedSalesScope(hasPermission);

  // Dashboard KPI drill-down: navigates to the existing page that explains a KPI,
  // carrying over the same date range/context the KPI card used to compute its number.
  // Only wired up when the current user can actually access the destination module,
  // so a card stays visually identical (non-interactive) for users without permission.
  const goToReports = (tab: ReportsDrilldownTab, preset: ReportsDrilldownPreset) =>
    canAccessModule('reports')
      ? () => {
          setPendingReportsFilter({ tab, preset });
          setActiveModule('reports');
        }
      : undefined;

  const goToInventory = (tab: InventoryDrilldownTab) =>
    canAccessModule('inventory')
      ? () => {
          setPendingInventoryTab(tab);
          setActiveModule('inventory');
        }
      : undefined;

  const goToServices = () =>
    canAccessModule('services') ? () => setActiveModule('services') : undefined;

  const inventoryValueTab: InventoryDrilldownTab = hasPermission(PERMISSIONS.INVENTORY_BATCH)
    ? 'FIFO'
    : 'STOCK';

  const { data: kpis, isLoading: loadingKpis } = useKPIMetrics();
  const { data: dashboard, isLoading: loadingDashboard } = useDashboardMetrics();
  const { data: salesPage, isLoading: loadingSales } = useSales({ page: 0, size: 5000, sort: 'date,desc' });
  const sales = salesPage?.content;
  const { data: appointments } = useAppointments();
  const { data: expenses } = useExpenses();
  const { data: services } = useServices();
  const { data: pets } = usePets();
  const { data: products } = useProducts();
  const { data: variants } = useVariants();
  const { data: closings } = useDailyClosings();
  const { data: batches } = useBatches();

  const alertsList = React.useMemo(() => {
    const alerts: Array<{ title: string; desc: string; type: 'danger' | 'warning' }> = [
      ...mapBackendAlerts(dashboard?.alerts),
    ];

    if (closings) {
      closings.forEach(c => {
        if (c.difference !== 0) {
          alerts.push({
            title: `عجز/زيادة في درج الكاشير يوم ${c.date}`,
            desc: `المتوقع بالدرج: ${formatMoney(c.systemExpected)} | الفعلي: ${formatMoney(c.physicalActual)} (الفارق: ${formatMoney(c.difference, { signed: true })})`,
            type: 'danger'
          });
        }
      });
    }

    return alerts;
  }, [dashboard?.alerts, closings]);

  const executiveMetrics = React.useMemo(() => {
    const now = new Date();
    const thisStart = startOfMonth(now);
    const thisEnd = startOfNextMonth(now);
    const prevStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevEnd = thisStart;

    const completedSales = (sales ?? []).filter(isCompletedSale);
    const thisMonthSales = completedSales.filter(s => inRange(s.date, thisStart, thisEnd));
    const prevMonthSales = completedSales.filter(s => inRange(s.date, prevStart, prevEnd));

    const thisPosCount = thisMonthSales.length;
    const prevPosCount = prevMonthSales.length;

    const activeApts = (appointments ?? []).filter(isActiveAppointment);
    const thisApts = activeApts.filter(a => inRange(a.dateTime, thisStart, thisEnd));
    const prevApts = activeApts.filter(a => inRange(a.dateTime, prevStart, prevEnd));

    let lowStockCount = 0;
    if (variants && products) {
      for (const v of variants) {
        const prod = products.find(p => p.id === v.productId);
        if (prod && v.stockQuantity < prod.minStockLimit) lowStockCount += 1;
      }
    }

    return {
      posCount: thisPosCount,
      posTrend: pctChange(thisPosCount, prevPosCount),
      appointmentsCount: thisApts.length,
      appointmentsTrend: pctChange(thisApts.length, prevApts.length),
      lowStockCount,
      lowStockTrend: lowStockCount > 0
        ? { value: 'تتطلب إجراءً', type: 'down' as const }
        : { value: 'مستقر', type: 'neutral' as const },
    };
  }, [sales, appointments, variants, products]);

  const chartData = React.useMemo(() => {
    if (dashboard?.monthlyChart?.length) {
      return dashboard.monthlyChart.map(p => ({
        name: p.month,
        Sales: p.sales,
        Expenses: p.expenses,
      }));
    }
    return buildSalesExpensesChart(sales, expenses, 6);
  }, [dashboard?.monthlyChart, sales, expenses]);

  const productServiceChart = React.useMemo(() => {
    if (dashboard?.monthlyChart?.length) {
      return dashboard.monthlyChart.map(p => ({
        name: p.month,
        Products: p.productRevenue,
        Services: p.serviceRevenue,
      }));
    }
    return [];
  }, [dashboard?.monthlyChart]);

  const operationsMetrics = React.useMemo(() => {
    const now = new Date();
    const thisStart = startOfMonth(now);
    const thisEnd = startOfNextMonth(now);
    const prevStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevEnd = thisStart;

    const saleList = sales ?? [];
    const aptList = appointments ?? [];

    const thisSales = saleList.filter(s => isCompletedSale(s) && inRange(s.date, thisStart, thisEnd));
    const prevSales = saleList.filter(s => isCompletedSale(s) && inRange(s.date, prevStart, prevEnd));

    const thisRevenue = thisSales.reduce((sum, s) => sum + saleRevenue(s), 0);
    const prevRevenue = prevSales.reduce((sum, s) => sum + saleRevenue(s), 0);
    const averageBasket = thisSales.length > 0 ? thisRevenue / thisSales.length : 0;
    const prevAverageBasket = prevSales.length > 0 ? prevRevenue / prevSales.length : 0;

    const activeBookings = aptList.filter(a => a.status === 'SCHEDULED').length;
    const prevActiveBookings = aptList.filter(
      a => a.status === 'SCHEDULED' && inRange(a.dateTime, prevStart, prevEnd)
    ).length;
    const thisScheduled = aptList.filter(
      a => a.status === 'SCHEDULED' && inRange(a.dateTime, thisStart, thisEnd)
    ).length;

    const repeatRate = calcRepeatCustomerRate(saleList, thisStart, thisEnd);
    const prevRepeatRate = calcRepeatCustomerRate(saleList, prevStart, prevEnd);

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const todaysAppointments = aptList
      .filter(a => a.status !== 'CANCELLED' && inRange(a.dateTime, todayStart, todayEnd))
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    return {
      averageBasket,
      averageBasketTrend: pctChange(averageBasket, prevAverageBasket),
      activeBookings,
      activeBookingsTrend: pctChange(thisScheduled, prevActiveBookings),
      repeatRate,
      repeatRateTrend: pctChange(repeatRate, prevRepeatRate),
      todaysAppointments,
    };
  }, [sales, appointments]);

  const expiringBatchRows = React.useMemo(
    () => expiringBatches(batches, variants, products, 90),
    [batches, variants, products]
  );

  const uniqueCategoryCount = React.useMemo(() => {
    if (!products) return 0;
    const catSet = new Set(products.map((p) => p.categoryId).filter(Boolean));
    return catSet.size;
  }, [products]);

  const isLoadingExecutiveFinancial = loadingDashboard || loadingKpis;

  if (isLoadingExecutiveFinancial && (activeModule === 'dashboard-executive' || activeModule === 'dashboard-financial')) {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px', width: '200px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="skeleton" style={{ height: '120px' }} />)}
        </div>
        <div className="skeleton" style={{ height: '300px', width: '100%' }} />
      </div>
    );
  }

  if (loadingSales && activeModule === 'dashboard-operations') {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px', width: '200px' }} />
        <div className="skeleton" style={{ height: '300px', width: '100%' }} />
      </div>
    );
  }

  const recentSales = sales ? [...sales].reverse().slice(0, 5) : [];
  const recentApts = appointments ? [...appointments].reverse().slice(0, 5) : [];
  const d = dashboard;

  if (activeModule === 'dashboard-executive') {
    return (
      <div className="workspace">
        <PageHeader
          title="لوحة التحكم التنفيذية"
          subtitle="لوحة التقييم والتحليلات الاستراتيجية الفورية للمحل"
          actions={
            <Can module="ai">
              <Button onClick={() => setActiveModule('ai')} variant="primary" size="sm">
                <TrendingUp size={14} /> فتح مستشار الذكاء الاصطناعي
              </Button>
            </Can>
          }
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard
            title="مبيعات اليوم"
            value={formatMoney(d?.todaySales.revenue ?? 0)}
            trend={trendFromPct(d?.todaySales.trendPct ?? 0)}
            description={`${d?.todaySales.count ?? 0} فاتورة • مقارنة بالأمس`}
            icon={<ShoppingCart size={18} />}
            onClick={goToReports('SALES', 'TODAY')}
          />
          <StatCard
            title="مبيعات الشهر"
            value={formatMoney(d?.monthlySales.revenue ?? 0)}
            trend={trendFromPct(d?.monthlySales.trendPct ?? 0)}
            description={`${d?.monthlySales.count ?? 0} فاتورة • مقارنة بالشهر السابق`}
            icon={<DollarSign size={18} />}
            onClick={goToReports('SALES', 'THIS_MONTH')}
          />
          <StatCard
            title="صافي الربح"
            value={formatMoney(d?.netProfit.amount ?? 0)}
            trend={trendFromPct(d?.netProfit.trendPct ?? 0)}
            description="هذا الشهر (إيراد − COGS − مصاريف)"
            icon={<TrendingUp size={18} />}
            onClick={goToReports('PL', 'THIS_MONTH')}
          />
          <StatCard
            title="المصاريف"
            value={formatMoney(d?.expenses.amount ?? 0)}
            trend={trendFromPct(d?.expenses.trendPct ?? 0)}
            description="مصاريف تشغيلية هذا الشهر"
            icon={<FileText size={18} />}
            onClick={goToReports('EXPENSES', 'THIS_MONTH')}
          />
          <StatCard
            title="المشتريات"
            value={formatMoney(d?.purchases.amount ?? 0)}
            trend={trendFromPct(d?.purchases.trendPct ?? 0)}
            description="فواتير موردين معتمدة هذا الشهر"
            icon={<Truck size={18} />}
            onClick={goToReports('PURCHASES', 'THIS_MONTH')}
          />
          <StatCard
            title="قيمة المخزون"
            value={formatMoney(d?.inventoryValue ?? kpis?.inventoryValue ?? 0)}
            description="تقييم FIFO للمخزون الفعلي"
            icon={<Package size={18} />}
            onClick={goToInventory(inventoryValueTab)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard
            title="عمليات البيع (POS)"
            value={executiveMetrics.posCount}
            trend={executiveMetrics.posTrend}
            description="فواتير مكتملة هذا الشهر"
            icon={<ShoppingCart size={18} />}
            onClick={goToReports('SALES', 'THIS_MONTH')}
          />
          <StatCard
            title="حجوزات الخدمات"
            value={executiveMetrics.appointmentsCount}
            trend={executiveMetrics.appointmentsTrend}
            description="خدمات مكتملة ومجدولة"
            icon={<Scissors size={18} />}
            onClick={goToServices()}
          />
          <StatCard
            title="تنبيهات المخزون"
            value={`${executiveMetrics.lowStockCount} تنبيه`}
            trend={executiveMetrics.lowStockTrend}
            description="أصناف دون الحد الأدنى"
            icon={<AlertTriangle size={18} />}
            onClick={goToInventory('STOCK')}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-6)', alignItems: 'start' }}>
          <Card title="إجمالي المبيعات مقابل المصاريف التشغيلية">
            <div style={{ width: '100%', height: 260 }}>
              {chartData.every(p => p.Sales === 0 && p.Expenses === 0) ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  لا توجد مبيعات أو مصاريف مسجّلة خلال آخر 6 أشهر
                </div>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={11} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
                    <Tooltip
                      formatter={(value: number, key: string) => [
                        formatMoney(Number(value)),
                        key === 'Sales' ? 'المبيعات' : 'المصاريف'
                      ]}
                    />
                    <Legend verticalAlign="top" height={36} iconType="square" fontSize={11} />
                    <Line name="المبيعات" type="monotone" dataKey="Sales" stroke="var(--color-primary)" strokeWidth={2} activeDot={{ r: 6 }} dot={false} />
                    <Line name="المصاريف" type="monotone" dataKey="Expenses" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
            <Card title="التنبيهات والموافقات المطلوبة">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                {alertsList.length > 0 ? (
                  alertsList.slice(0, 8).map((alert, index) => (
                    <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: 'var(--spacing-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                      <AlertTriangle size={16} style={{ color: alert.type === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)', marginTop: '2px', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)' }}>{alert.title}</div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{alert.desc}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: 'var(--spacing-2)', textAlign: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    ✅ لا توجد تنبيهات نشطة حالياً.
                  </div>
                )}
              </div>
            </Card>

            <Card title="إجراءات سريعة للموظف">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-2)' }}>
                <Can module="pos">
                  <Button onClick={() => setActiveModule('pos')} variant="primary" size="sm" style={{ justifyContent: 'start' }}>
                    <Play size={14} /> نقطة البيع
                  </Button>
                </Can>
                <Can module="inventory">
                  <Button onClick={() => setActiveModule('inventory')} variant="secondary" size="sm" style={{ justifyContent: 'start' }}>
                    <Package size={14} /> تعديل الجرد
                  </Button>
                </Can>
                <Can module="services">
                  <Button onClick={() => setActiveModule('services')} variant="secondary" size="sm" style={{ justifyContent: 'start' }}>
                    <Scissors size={14} /> جدولة موعد
                  </Button>
                </Can>
                <Can module="finance">
                  <Button onClick={() => setActiveModule('finance')} variant="secondary" size="sm" style={{ justifyContent: 'start' }}>
                    <FileText size={14} /> تسجيل مصروف
                  </Button>
                </Can>
              </div>
            </Card>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--spacing-6)' }}>
          <RankingTable
            title="الأكثر مبيعاً (هذا الشهر)"
            rows={(d?.bestSellingProducts ?? []).map((item, i) => ({
              rank: i + 1,
              name: item.name,
              qty: item.quantity ?? 0,
              revenue: formatMoney(item.revenue ?? 0),
            }))}
            columns={[
              { key: 'rank', header: '#' },
              { key: 'name', header: 'المنتج' },
              { key: 'qty', header: 'الكمية', align: 'right' },
              { key: 'revenue', header: 'الإيراد', align: 'right' },
            ]}
          />
          <RankingTable
            title="أفضل العملاء (هذا الشهر)"
            rows={(d?.topCustomers ?? []).map((item, i) => ({
              rank: i + 1,
              name: item.name,
              orders: item.orderCount ?? 0,
              spend: formatMoney(item.totalSpend ?? 0),
            }))}
            columns={[
              { key: 'rank', header: '#' },
              { key: 'name', header: 'العميل' },
              { key: 'orders', header: 'الطلبات', align: 'right' },
              { key: 'spend', header: 'الإنفاق', align: 'right' },
            ]}
          />
          <RankingTable
            title="أفضل الموردين (هذا الشهر)"
            rows={(d?.topSuppliers ?? []).map((item, i) => ({
              rank: i + 1,
              name: item.name,
              invoices: item.invoiceCount ?? 0,
              total: formatMoney(item.totalPurchases ?? 0),
            }))}
            columns={[
              { key: 'rank', header: '#' },
              { key: 'name', header: 'المورد' },
              { key: 'invoices', header: 'الفواتير', align: 'right' },
              { key: 'total', header: 'الإجمالي', align: 'right' },
            ]}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-6)' }}>
          <Card title="آخر الفواتير الصادرة من نقاط البيع">
            {restrictedSalesScope ? (
              <div style={{ padding: 'var(--spacing-3) 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                لأسباب الأمان، لا تظهر قائمة الفواتير هنا. لمراجعة أو إرجاع فاتورة، افتح شاشة "الفواتير" واكتب أو امسح رقم الفاتورة.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
                {recentSales.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div>
                      <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{s.saleNumber}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>
                        {s.paymentMethod === 'CASH' ? 'نقدي' : 'بطاقة'} • {s.items.length} أصناف
                      </span>
                    </div>
                    <span style={{ fontWeight: 'bold' }}>{formatMoney(saleRevenue(s))}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="آخر مواعيد وجدول الخدمات">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              {recentApts.map(a => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>موعد #{a.id.slice(-4)}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>
                      {new Date(a.dateTime).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant={a.status === 'COMPLETED' ? 'success' : 'primary'}>
                    {a.status === 'COMPLETED' ? 'مكتمل' : 'مجدول'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (activeModule === 'dashboard-financial') {
    const avgMonthlyExpenses = dashboard?.monthlyChart?.length
      ? dashboard.monthlyChart.reduce((sum, p) => sum + p.expenses, 0) / dashboard.monthlyChart.length
      : 0;

    return (
      <div className="workspace">
        <PageHeader
          title="لوحة التحكم المالية"
          subtitle="دفتر الحسابات ومؤشرات الأرباح والخسائر التشغيلية للمحل"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard
            title="مبيعات الشهر"
            value={formatMoney(d?.monthlySales.revenue ?? 0)}
            trend={trendFromPct(d?.monthlySales.trendPct ?? 0)}
            description="إيرادات مكتملة هذا الشهر"
            icon={<DollarSign size={18} />}
            onClick={goToReports('SALES', 'THIS_MONTH')}
          />
          <StatCard
            title="هامش الربح الإجمالي"
            value={`${(d?.grossMargin ?? 0).toFixed(1)}%`}
            description="هذا الشهر"
            icon={<DollarSign size={18} />}
            onClick={goToReports('PL', 'THIS_MONTH')}
          />
          <StatCard
            title="تكلفة البضاعة المباعة (COGS)"
            value={formatMoney(d?.cogs ?? 0)}
            description="تكلفة السلع المباعة هذا الشهر"
            icon={<TrendingUp size={18} />}
            onClick={goToReports('PL', 'THIS_MONTH')}
          />
          <StatCard
            title="المصاريف"
            value={formatMoney(d?.expenses.amount ?? 0)}
            trend={trendFromPct(d?.expenses.trendPct ?? 0)}
            description={`متوسط 6 أشهر: ${formatMoney(avgMonthlyExpenses)}`}
            icon={<FileText size={18} />}
            onClick={goToReports('EXPENSES', 'THIS_MONTH')}
          />
          <StatCard
            title="المشتريات"
            value={formatMoney(d?.purchases.amount ?? 0)}
            trend={trendFromPct(d?.purchases.trendPct ?? 0)}
            description="فواتير موردين هذا الشهر"
            icon={<Truck size={18} />}
            onClick={goToReports('PURCHASES', 'THIS_MONTH')}
          />
          <StatCard
            title="صافي الربح"
            value={formatMoney(d?.netProfit.amount ?? 0)}
            trend={trendFromPct(d?.netProfit.trendPct ?? 0)}
            description="الإيراد − COGS − المصاريف"
            icon={<DollarSign size={18} />}
            onClick={goToReports('PL', 'THIS_MONTH')}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-6)', alignItems: 'start' }}>
          <Card title="مساهمة مبيعات المنتجات مقابل الخدمات">
            <div style={{ width: '100%', height: 260 }}>
              {productServiceChart.length === 0 || productServiceChart.every(p => p.Products === 0 && p.Services === 0) ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  لا توجد بيانات منتجات/خدمات لعرضها
                </div>
              ) : (
                <ResponsiveContainer>
                  <BarChart data={productServiceChart} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={11} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
                    <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                    <Legend verticalAlign="top" height={36} iconType="square" fontSize={11} />
                    <Bar name="المنتجات" dataKey="Products" fill="var(--color-primary)" />
                    <Bar name="الخدمات" dataKey="Services" fill="var(--color-success)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card title="دفتر إغلاقات ورديات الكاشير الأخيرة">
            <div className="table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المتوقع</th>
                    <th>النقدي الفعلي</th>
                    <th>الفارق</th>
                  </tr>
                </thead>
                <tbody>
                  {closings?.slice(0, 5).map(c => (
                    <tr key={c.id}>
                      <td>{c.date}</td>
                      <td>{formatMoney(c.systemExpected)}</td>
                      <td>{formatMoney(c.physicalActual)}</td>
                      <td>
                        <span style={{ color: c.difference === 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 'bold' }}>
                          {c.difference === 0 ? formatMoney(0) : formatMoney(c.difference, { signed: true })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (activeModule === 'dashboard-inventory') {
    return (
      <div className="workspace">
        <PageHeader
          title="لوحة تحكم المنتجات والمخزون"
          subtitle="مراقبة كميات السلع، الجرد الفعلي ومؤشرات الحركة"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard title="المنتجات المسجلة" value={products?.length || 0} description={`عدد الأقسام والتصنيفات: ${uniqueCategoryCount || '—'}`} icon={<Package size={18} />} onClick={goToInventory('STOCK')} />
          <StatCard title="الأصناف المسجلة" value={variants?.length || 0} description="الأوزان والأحجام المسجلة" icon={<Package size={18} />} onClick={goToInventory('STOCK')} />
          <StatCard title="قيمة المخزون" value={formatMoney(d?.inventoryValue ?? kpis?.inventoryValue ?? 0)} description="تقييم FIFO" icon={<DollarSign size={18} />} onClick={goToInventory(inventoryValueTab)} />
          <StatCard title="المنتجات الراكدة" value={kpis?.deadStockCount || 0} description="لم تباع منذ 30 يوماً" icon={<AlertTriangle size={18} />} onClick={goToInventory('STOCK')} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--spacing-6)' }}>
          <Card title="حالة وجرد السلع في المخزن">
            <div className="table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>الصنف</th>
                    <th>الكمية المتاحة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {variants?.map(v => {
                    const prodName = products?.find(p => p.id === v.productId)?.name || '';
                    const minLimit = products?.find(p => p.id === v.productId)?.minStockLimit || 10;
                    const isLow = v.stockQuantity < minLimit;
                    return (
                      <tr key={v.id}>
                        <td>{prodName}</td>
                        <td>{v.name}</td>
                        <td>{v.stockQuantity}</td>
                        <td>
                          <Badge variant={isLow ? 'danger' : 'success'}>
                            {isLow ? 'مخزون منخفض' : 'ممتاز'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="شحنات تقترب صلاحيتها من الانتهاء (أغذية وأدوية)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              {expiringBatchRows.length === 0 ? (
                <div style={{ padding: 'var(--spacing-3)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  لا توجد دفعات تنتهي خلال 90 يوماً
                </div>
              ) : (
                expiringBatchRows.map(({ batch, variant, prod, daysLeft }) => (
                  <div key={batch.id} style={{ padding: 'var(--spacing-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{prod?.name || '—'} - {variant?.name || '—'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        رقم الشحنة: {batch.batchNumber} • الكمية: {batch.quantity} • متبقي {daysLeft} يوم
                      </div>
                    </div>
                    <Badge variant={daysLeft < 30 ? 'danger' : 'warning'}>
                      {batch.expiryDate}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (activeModule === 'dashboard-operations') {
    return (
      <div className="workspace">
        <PageHeader
          title="لوحة التحكم التشغيلية"
          subtitle="إنتاجية الموظفين ومؤشرات أداء الخدمات"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard
            title="متوسط السلة الشرائية"
            value={formatMoney(operationsMetrics.averageBasket)}
            trend={operationsMetrics.averageBasketTrend}
            description="متوسط قيمة الفاتورة المكتملة هذا الشهر"
            icon={<ShoppingCart size={18} />}
            onClick={goToReports('SALES', 'THIS_MONTH')}
          />
          <StatCard
            title="الخدمات النشطة المحجوزة"
            value={operationsMetrics.activeBookings}
            trend={operationsMetrics.activeBookingsTrend}
            description="مواعيد بحالة مجدول فقط"
            icon={<CheckCircle size={18} />}
            onClick={goToServices()}
          />
          <StatCard
            title="نسبة تكرار العملاء"
            value={`${operationsMetrics.repeatRate.toFixed(1)}%`}
            trend={operationsMetrics.repeatRateTrend}
            description="عملاء هذا الشهر الذين اشتروا سابقاً"
            icon={<Users size={18} />}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--spacing-6)' }}>
          <Card title="جدول مواعيد الخدمات النشط اليوم">
            <div className="table-container">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>رقم الموعد</th>
                    <th>الوقت</th>
                    <th>الحيوان الأليف</th>
                    <th>الخدمة</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {operationsMetrics.todaysAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        لا توجد مواعيد لهذا اليوم
                      </td>
                    </tr>
                  ) : (
                    operationsMetrics.todaysAppointments.map(a => {
                      const pet = pets?.find(p => p.id === a.petId);
                      const service = services?.find(s => s.id === a.serviceId);
                      return (
                        <tr key={a.id}>
                          <td>موعد #{a.id.slice(-4)}</td>
                          <td>{new Date(a.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td>{pet ? `${pet.name} (${pet.species})` : '—'}</td>
                          <td>{service?.name || '—'}</td>
                          <td>
                            <Badge variant={a.status === 'COMPLETED' ? 'success' : 'primary'}>
                              {a.status === 'COMPLETED' ? 'مكتمل' : 'مجدول'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return null;
};

export default Dashboard;
