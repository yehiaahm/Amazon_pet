import React, { useMemo } from 'react';
import {
  useAIInsights,
  useSales,
  useExpenses,
  useVariants,
  useProducts,
  useCustomers,
  useAppointments,
  useServices,
} from '../../core/hooks/useERPData';
import {
  Sparkles, AlertOctagon, TrendingUp, TrendingDown
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { LiveInsightEngine } from '../../core/ai/LiveInsightEngine';

export const AIAdvisor: React.FC = () => {
  const { data: remoteInsights, isLoading: loadingInsights, isError: insightsError } = useAIInsights();
  const { data: salesPage, isLoading: loadingSales } = useSales({ page: 0, size: 5000, sort: 'date,desc' });
  const sales = salesPage?.content;
  const { data: expenses } = useExpenses();
  const { data: variants } = useVariants();
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const { data: appointments } = useAppointments();
  const { data: services } = useServices();

  const liveBundle = useMemo(() => ({
    sales: sales || [],
    expenses: expenses || [],
    variants: variants || [],
    products: products || [],
    customers: customers || [],
    appointments: appointments || [],
    services: services || [],
  }), [sales, expenses, variants, products, customers, appointments, services]);

  const liveInsights = useMemo(
    () => LiveInsightEngine.buildInsights(liveBundle),
    [liveBundle]
  );

  const insights = useMemo(() => {
    // Structured cards always from live math; narrative prefers Gemini when available
    const geminiSummary = remoteInsights?.businessSummary?.trim();
    return {
      ...liveInsights,
      businessSummary: geminiSummary
        ? `${geminiSummary}\n\n---\nملحق رقمي من النظام:\n${liveInsights.businessSummary}`
        : liveInsights.businessSummary,
      forecastText: liveInsights.forecastText || remoteInsights?.forecastText || '',
    };
  }, [liveInsights, remoteInsights]);

  const forecastChartData = useMemo(
    () => LiveInsightEngine.buildForecastSeries(sales || []),
    [sales]
  );

  // ---- Product Sales Ranking (by units sold) ----
  const productSalesRanking = useMemo(() => {
    const completed = (sales || []).filter(
      (s: any) => s.status === 'COMPLETED' || s.status === 'completed'
    );
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    completed.forEach((sale: any) => {
      (sale.items || []).forEach((item: any) => {
        if (item.type === 'SERVICE') return; // products only
        const key = item.itemId || item.name;
        if (!map[key]) map[key] = { name: item.name, qty: 0, revenue: 0 };
        map[key].qty      += Number(item.quantity) || 0;
        map[key].revenue  += (Number(item.price) || 0) * (Number(item.quantity) || 0);
      });
    });
    const sorted = Object.values(map).filter(x => x.qty > 0).sort((a, b) => b.qty - a.qty);
    return {
      best:  sorted.slice(0, 5),
      worst: sorted.slice(-5).reverse(),   // least sold (still have sales)
    };
  }, [sales]);

  const connected = !insightsError && !!localStorage.getItem('token');



  if (loadingSales || (loadingInsights && !sales)) {
    return <div className="workspace"><div className="skeleton" style={{ height: '400px' }} /></div>;
  }

  return (
    <div className="workspace">
      <PageHeader
        title="مستشار الأعمال الذكي بالذكاء الاصطناعي"
        subtitle="تشخيصات وتشغيل مبنية على بيانات المبيعات والمخزون والمصاريف الفعلية"
        actions={
          <Badge variant={connected ? 'primary' : 'warning'} style={{ display: 'flex', gap: '4px' }}>
            <Sparkles size={12} />
            {connected ? 'متصل بالخادم + بيانات حية' : 'وضع محلي — بيانات حية'}
          </Badge>
        }
      />

      <div className="grid-split" style={{ '--split-ratio': '1.4fr 1fr', gap: 'var(--spacing-6)', alignItems: 'start' } as React.CSSProperties}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          <Card title="الملخص التشغيلي والتنفيذي">
            <p style={{ lineHeight: '1.7', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
              {insights.businessSummary}
            </p>
          </Card>

          <Card title="أبرز فرص زيادة الإيرادات والنمو">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              {insights.topOpportunities.length === 0 && (
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>لا توجد فرص محسوبة بعد — أضف مبيعات لبدء التشخيص.</span>
              )}
              {insights.topOpportunities.map((op, i) => (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>{op.title}</span>
                    <Badge variant={op.priority === 'HIGH' ? 'danger' : 'warning'}>
                      أولوية {op.priority === 'HIGH' ? 'مرتفعة' : op.priority === 'MEDIUM' ? 'متوسطة' : 'منخفضة'}
                    </Badge>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{op.description}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="توصيات وإجراءات تشغيل مقترحة">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              {insights.recommendations.map((rec, i) => (
                <div key={i} className="grid-split" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', '--split-ratio': '1.5fr 1.2fr', gap: 'var(--spacing-4)', backgroundColor: 'var(--color-bg)' } as React.CSSProperties}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>{rec.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>الإجراء: {rec.action}</div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--spacing-4)' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>الأثر المتوقع</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '2px' }}>{rec.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          <Card title="تحذيرات وتنبيهات تشغيلية">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              {insights.criticalAlerts.map((al, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <AlertOctagon size={16} style={{ color: al.severity === 'CRITICAL' ? 'var(--color-danger)' : 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{al.title}</div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>{al.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="مسار المبيعات الشهري + تقدير">
            <div style={{ width: '100%', height: 160 }}>
              {forecastChartData.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                  لا توجد مبيعات كافية لرسم التوقعات
                </div>
              ) : (
                <ResponsiveContainer>
                  <LineChart data={forecastChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={10} />
                    <YAxis stroke="var(--color-text-secondary)" fontSize={10} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" name="المبيعات" dataKey="Sales" stroke="var(--color-success)" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{insights.forecastText}</span>
          </Card>

          {/* ====== Best & Worst Sellers Card ====== */}
          <Card title="📊 أكثر وأقل المنتجات مبيعاً">
            {productSalesRanking.best.length === 0 ? (
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '16px 0' }}>
                لا توجد بيانات مبيعات منتجات بعد
              </p>
            ) : (
              <div className="grid-split" style={{ '--split-ratio': '1fr 1fr', gap: '12px' } as React.CSSProperties}>

                {/* Best sellers */}
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '11px', fontWeight: 700,
                    color: '#16a34a', marginBottom: '8px',
                  }}>
                    <TrendingUp size={13} /> الأكثر مبيعاً
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {productSalesRanking.best.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(22,163,74,0.07)',
                        border: '1px solid rgba(22,163,74,0.2)',
                      }}>
                        <span style={{
                          minWidth: '20px', height: '20px',
                          borderRadius: '50%',
                          backgroundColor: i === 0 ? '#16a34a' : 'rgba(22,163,74,0.3)',
                          color: i === 0 ? '#fff' : '#166534',
                          fontSize: '10px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '11px', fontWeight: 600,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{p.name}</div>
                          <div style={{ fontSize: '10px', color: '#16a34a' }}>
                            {p.qty} وحدة
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Worst sellers */}
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '11px', fontWeight: 700,
                    color: '#b45309', marginBottom: '8px',
                  }}>
                    <TrendingDown size={13} /> الأقل مبيعاً
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {productSalesRanking.worst.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(180,83,9,0.07)',
                        border: '1px solid rgba(180,83,9,0.2)',
                      }}>
                        <span style={{
                          minWidth: '20px', height: '20px',
                          borderRadius: '50%',
                          backgroundColor: 'rgba(180,83,9,0.15)',
                          color: '#92400e',
                          fontSize: '10px', fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '11px', fontWeight: 600,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{p.name}</div>
                          <div style={{ fontSize: '10px', color: '#b45309' }}>
                            {p.qty} وحدة
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AIAdvisor;
