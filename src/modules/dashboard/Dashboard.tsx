import React from 'react';
import { useUIStore } from '../../core/stores/uiStore';
import { 
  useKPIMetrics, useSales, useAppointments, 
  useProducts, useVariants, useDailyClosings, useBatches 
} from '../../core/hooks/useERPData';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { 
  DollarSign, ShoppingCart, Scissors, Package, 
  TrendingUp, AlertTriangle, Users, Play, FileText, CheckCircle 
} from 'lucide-react';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';

export const Dashboard: React.FC = () => {
  const activeModule = useUIStore(s => s.activeModule);
  const setActiveModule = useUIStore(s => s.setActiveModule);

  // Queries
  const { data: kpis, isLoading: loadingKpis } = useKPIMetrics();
  const { data: sales, isLoading: loadingSales } = useSales();
  const { data: appointments } = useAppointments();
  const { data: products } = useProducts();
  const { data: variants } = useVariants();
  const { data: closings } = useDailyClosings();
  const { data: batches } = useBatches();

  const alertsList = React.useMemo(() => {
    const alerts: Array<{ title: string; desc: string; type: 'danger' | 'warning' }> = [];

    // 1. Cash drawer closing discrepancies
    if (closings) {
      closings.forEach(c => {
        if (c.difference !== 0) {
          alerts.push({
            title: `عجز/زيادة في درج الكاشير يوم ${c.date}`,
            desc: `المتوقع بالدرج: $${c.systemExpected.toFixed(2)} | الفعلي: $${c.physicalActual.toFixed(2)} (الفارق: ${c.difference > 0 ? '+' : ''}$${c.difference.toFixed(2)})`,
            type: 'danger'
          });
        }
      });
    }

    // 2. Low stock
    if (variants && products) {
      variants.forEach(v => {
        const prod = products.find(p => p.id === v.productId);
        if (prod && v.stockQuantity < prod.minStockLimit) {
          alerts.push({
            title: `مخزون منخفض: ${prod.name} (${v.name})`,
            desc: `المخزون الحالي: ${v.stockQuantity} وحدة (الحد الأدنى الآمن: ${prod.minStockLimit})`,
            type: v.stockQuantity === 0 ? 'danger' : 'warning'
          });
        }
      });
    }

    // 3. Expiry
    if (batches && variants && products) {
      const now = new Date();
      batches.forEach(b => {
        const variant = variants.find(v => v.id === b.productVariantId);
        const prod = variant ? products.find(p => p.id === variant.productId) : null;
        const daysLeft = Math.ceil((new Date(b.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft < 90) {
          alerts.push({
            title: `اقتراب انتهاء صلاحية ${prod?.name || ''}`,
            desc: `الدفعة ${b.batchNumber} تنتهي في ${b.expiryDate} (متبقي ${daysLeft} يوم) | الكمية: ${b.quantity} وحدة`,
            type: daysLeft < 30 ? 'danger' : 'warning'
          });
        }
      });
    }

    return alerts;
  }, [closings, variants, products, batches]);

  if (loadingKpis || loadingSales) {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px', width: '200px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '120px' }} />)}
        </div>
        <div className="skeleton" style={{ height: '300px', width: '100%' }} />
      </div>
    );
  }

  // Monthly Sales vs Expenses Chart Data (Mock calculations from fetched entries)
  const chartData = [
    { name: 'أبريل 26', Sales: 24200, Expenses: 4880 },
    { name: 'مايو 26', Sales: 28500, Expenses: 4880 },
    { name: 'يونيو 26', Sales: 31400, Expenses: 5120 },
    { name: 'يوليو 26', Sales: 16800, Expenses: 1680 }
  ];

  const recentSales = sales ? [...sales].reverse().slice(0, 5) : [];
  const recentApts = appointments ? [...appointments].reverse().slice(0, 5) : [];

  // ==========================================
  // VIEW 1: EXECUTIVE DASHBOARD
  // ==========================================
  if (activeModule === 'dashboard-executive') {
    return (
      <div className="workspace">
        <PageHeader 
          title="لوحة التحكم التنفيذية" 
          subtitle="لوحة التقييم والتحليلات الاستراتيجية الفورية للمحل" 
          actions={
            <Button onClick={() => setActiveModule('ai')} variant="primary" size="sm">
              <TrendingUp size={14} /> فتح مستشار الذكاء الاصطناعي
            </Button>
          }
        />

        {/* 1. Hero Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard 
            title="إجمالي الإيرادات" 
            value={`$${kpis?.grossProfit.toLocaleString()}`} 
            trend={{ value: '+8.4%', type: 'up' }}
            description="مقارنة بالشهر السابق"
            icon={<DollarSign size={18} />}
          />
          <StatCard 
            title="عمليات البيع (POS)" 
            value={sales?.length || 0} 
            trend={{ value: '+4.2%', type: 'up' }}
            description="إجمالي الفواتير المكتملة"
            icon={<ShoppingCart size={18} />}
          />
          <StatCard 
            title="حجوزات الخدمات" 
            value={appointments?.length || 0} 
            trend={{ value: '+12.1%', type: 'up' }}
            description="الخدمات المكتملة والمجدولة"
            icon={<Scissors size={18} />}
          />
          <StatCard 
            title="تنبيهات المخزون" 
            value="3 تنبيهات سلع" 
            trend={{ value: 'تتطلب إجراءً', type: 'down' }}
            description="أصناف دون الحد الأدنى الآمن"
            icon={<Package size={18} />}
          />
        </div>

        {/* 2. Primary layout grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-6)', alignItems: 'start' }}>
          {/* Left Side: Financial Trends Line Chart */}
          <Card title="إجمالي المبيعات مقابل المصاريف التشغيلية">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} iconType="square" fontSize={11} />
                  <Line name="المبيعات" type="monotone" dataKey="Sales" stroke="var(--color-primary)" strokeWidth={2} activeDot={{ r: 6 }} dot={false} />
                  <Line name="المصاريف" type="monotone" dataKey="Expenses" stroke="var(--color-danger)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Right Side: Quick Actions & Alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
            <Card title="التنبيهات والموافقات المطلوبة">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                {alertsList.length > 0 ? (
                  alertsList.slice(0, 5).map((alert, index) => (
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
                <Button onClick={() => setActiveModule('pos')} variant="primary" size="sm" style={{ justifyContent: 'start' }}>
                  <Play size={14} /> نقطة البيع
                </Button>
                <Button onClick={() => setActiveModule('inventory')} variant="secondary" size="sm" style={{ justifyContent: 'start' }}>
                  <Package size={14} /> تعديل الجرد
                </Button>
                <Button onClick={() => setActiveModule('services')} variant="secondary" size="sm" style={{ justifyContent: 'start' }}>
                  <Scissors size={14} /> جدولة موعد
                </Button>
                <Button onClick={() => setActiveModule('finance')} variant="secondary" size="sm" style={{ justifyContent: 'start' }}>
                  <FileText size={14} /> تسجيل مصروف
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* 3. Recent Activity Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-6)' }}>
          <Card title="آخر الفواتير الصادرة من نقاط البيع">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              {recentSales.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{s.saleNumber}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginLeft: '12px' }}>
                      {s.paymentMethod === 'CASH' ? 'نقدي' : 'بطاقة'} • {s.items.length} أصناف
                    </span>
                  </div>
                  <span style={{ fontWeight: 'bold' }}>${s.totalAmount.toFixed(2)}</span>
                </div>
              ))}
            </div>
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

  // ==========================================
  // VIEW 2: FINANCIAL DASHBOARD
  // ==========================================
  if (activeModule === 'dashboard-financial') {
    return (
      <div className="workspace">
        <PageHeader 
          title="لوحة التحكم المالية" 
          subtitle="دفتر الحسابات ومؤشرات الأرباح والخسائر التشغيلية للمحل"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard title="هامش الربح الإجمالي" value={`${kpis?.profitMargin || 0}%`} trend={{ value: '+1.5%', type: 'up' }} description="نسبة كفاءة التشغيل" icon={<DollarSign size={18} />} />
          <StatCard title="تكلفة البضاعة المباعة (COGS)" value={`$${kpis?.cogs.toLocaleString()}`} description="تكلفة السلع المباعة" icon={<TrendingUp size={18} />} />
          <StatCard title="معدل المصاريف الشهري" value={`$${kpis?.burnRate.toLocaleString()}`} description="متوسط المصاريف العامة" icon={<TrendingUp size={18} />} />
          <StatCard title="صافي الربح" value={`$${kpis?.netProfit.toLocaleString()}`} trend={{ value: '+5.4%', type: 'up' }} description="الأرباح الصافية المحققة" icon={<DollarSign size={18} />} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-6)', alignItems: 'start' }}>
          <Card title="مساهمة مبيعات المنتجات مقابل الخدمات في الأرباح">
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} iconType="square" fontSize={11} />
                  <Bar name="المبيعات" dataKey="Sales" fill="var(--color-primary)" />
                  <Bar name="المصاريف" dataKey="Expenses" fill="var(--color-danger)" />
                </BarChart>
              </ResponsiveContainer>
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
                      <td>${c.systemExpected.toFixed(2)}</td>
                      <td>${c.physicalActual.toFixed(2)}</td>
                      <td>
                        <span style={{ color: c.difference === 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 'bold' }}>
                          {c.difference === 0 ? '$0.00' : `${c.difference > 0 ? '+' : ''}$${c.difference.toFixed(2)}`}
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

  // ==========================================
  // VIEW 3: INVENTORY DASHBOARD
  // ==========================================
  if (activeModule === 'dashboard-inventory') {
    return (
      <div className="workspace">
        <PageHeader 
          title="لوحة تحكم المخازن والمستودعات" 
          subtitle="أرصدة المستودعات ومؤشرات حركة السلع"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard title="المنتجات المسجلة" value={products?.length || 0} description="تصنيفات السلع المختلفة" icon={<Package size={18} />} />
          <StatCard title="الأصناف المسجلة" value={variants?.length || 0} description="الأوزان والأحجام المسجلة" icon={<Package size={18} />} />
          <StatCard title="معدل دوران المخزون" value={`${kpis?.inventoryTurnover}x`} description="معدل تدوير السلع السنوي" icon={<TrendingUp size={18} />} />
          <StatCard title="المنتجات الراكدة" value={kpis?.deadStockCount || 0} trend={{ value: 'صنفان', type: 'down' }} description="لم تباع منذ 30 يوماً" icon={<AlertTriangle size={18} />} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 'var(--spacing-6)' }}>
          <Card title="حالة وجرد السلع في المستودع">
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
              {batches?.map(b => {
                const varName = variants?.find(v => v.id === b.productVariantId)?.name || '';
                const prodId = variants?.find(v => v.id === b.productVariantId)?.productId || '';
                const prodName = products?.find(p => p.id === prodId)?.name || '';
                return (
                  <div key={b.id} style={{ padding: 'var(--spacing-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{prodName} - {varName}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>رقم الشحنة: {b.batchNumber} • الكمية: {b.quantity}</div>
                    </div>
                    <div>
                      <Badge variant="danger">تاريخ الانتهاء: {b.expiryDate}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 4: OPERATIONS DASHBOARD
  // ==========================================
  if (activeModule === 'dashboard-operations') {
    return (
      <div className="workspace">
        <PageHeader 
          title="لوحة التحكم التشغيلية" 
          subtitle="إنتاجية الموظفين ومؤشرات أداء الخدمات"
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          <StatCard title="متوسط السلة الشرائية" value={`$${kpis?.averageBasket.toFixed(2)}`} description="لكل فاتورة مبيعات" icon={<ShoppingCart size={18} />} />
          <StatCard title="استغلال طاقة الموظفين" value={`${kpis?.repeatCustomerRate || 68}%`} description="نسبة ساعات العمل الفعلية" icon={<Scissors size={18} />} />
          <StatCard title="الخدمات النشطة المحجوزة" value={appointments?.length || 0} description="عمليات الغسيل وقص الشعر" icon={<CheckCircle size={18} />} />
          <StatCard title="نسبة تكرار العملاء" value={`${kpis?.repeatCustomerRate}%`} trend={{ value: '+2.1%', type: 'up' }} description="ولاء وحفظ العملاء" icon={<Users size={18} />} />
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
                    <th>الموظف الموكل</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments?.slice(0, 5).map(a => (
                    <tr key={a.id}>
                      <td>موعد #{a.id.slice(-4)}</td>
                      <td>{new Date(a.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>ماكس (كلب)</td>
                      <td>بوب جونسون</td>
                      <td>
                        <Badge variant={a.status === 'COMPLETED' ? 'success' : 'primary'}>
                          {a.status === 'COMPLETED' ? 'مكتمل' : 'مجدول'}
                        </Badge>
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

  return null;
};

export default Dashboard;
