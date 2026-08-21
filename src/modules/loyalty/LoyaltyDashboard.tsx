import React from 'react';
import { useLoyaltyDashboard } from '../../core/hooks/useERPData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { Wallet, TrendingUp, TrendingDown, Users, Search } from 'lucide-react';
import StatCard from '../../components/ui/StatCard';
import Card from '../../components/ui/Card';
import PageHeader from '../../components/ui/PageHeader';
import Input from '../../components/ui/Input';
import { formatMoney } from '../../core/utils/money';

export const LoyaltyDashboard: React.FC = () => {
  const { data, isLoading } = useLoyaltyDashboard();
  const [search, setSearch] = React.useState('');

  const chartData = React.useMemo(() => {
    if (!data) return [];
    return [
      { name: 'إجمالي المكتسب', value: data.totalEarned, fill: 'var(--color-primary)' },
      { name: 'المستبدل فعلياً (تكلفة حقيقية)', value: data.totalRedeemed, fill: 'var(--color-danger)' },
      { name: 'الرصيد المستحق حالياً', value: data.totalOutstandingLiability, fill: 'var(--color-warning)' },
    ];
  }, [data]);

  const filteredCustomers = React.useMemo(() => {
    const list = data?.customers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q));
  }, [data?.customers, search]);

  const netLifetimeCost = (data?.totalRedeemed ?? 0) - (data?.totalExpired ?? 0);

  if (isLoading) {
    return (
      <div className="workspace">
        <div className="skeleton" style={{ height: '40px', width: '260px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: '120px' }} />)}
        </div>
        <div className="skeleton" style={{ height: '300px', width: '100%' }} />
      </div>
    );
  }

  return (
    <div className="workspace">
      <PageHeader
        title="لوحة تحكم برنامج الولاء"
        subtitle="رصيد كل عميل بالجنيه، وإجمالي المكتسب مقابل المستبدل فعلياً، لمعرفة تكلفة البرنامج الحقيقية على المحل"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--spacing-4)' }}>
        <StatCard
          title="الرصيد المستحق للعملاء الآن"
          value={formatMoney(data?.totalOutstandingLiability ?? 0)}
          description="لو استخدم كل عميل رصيده اليوم بالكامل"
          icon={<Wallet size={18} />}
        />
        <StatCard
          title="إجمالي المكتسب (كل الوقت)"
          value={formatMoney(data?.totalEarned ?? 0)}
          description="قيمة النقاط اللي اتحسبت من كل المبيعات"
          icon={<TrendingUp size={18} />}
        />
        <StatCard
          title="التكلفة الفعلية المدفوعة"
          value={formatMoney(data?.totalRedeemed ?? 0)}
          description="خصومات صُرفت فعلاً عند البيع (خسارة حقيقية، مش متوقعة)"
          icon={<TrendingDown size={18} />}
        />
        <StatCard
          title="عملاء لديهم رصيد"
          value={data?.activeCustomersCount ?? 0}
          description="من إجمالي العملاء المسجلين"
          icon={<Users size={18} />}
        />
      </div>

      <Card title="هل البرنامج بيكسبني ولا بيخسرني؟">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
            <strong>الرصيد المستحق</strong> ({formatMoney(data?.totalOutstandingLiability ?? 0)}) لسه ملكاش خسارة فعلية — ده مجرد التزام مستقبلي محتمل لو العملاء استخدموه.
            {' '}<strong>التكلفة الفعلية</strong> ({formatMoney(data?.totalRedeemed ?? 0)}) هي الخصم اللي اتصرف بالفعل من فواتير حقيقية.
            {(data?.totalExpired ?? 0) > 0 && (
              <> وفيه {formatMoney(data?.totalExpired ?? 0)} نقاط انتهت صلاحيتها قبل ما تتصرف، يعني وفّرت على المحل.</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>صافي التكلفة حتى الآن (مستبدل − منتهي)</div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: netLifetimeCost > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                {formatMoney(netLifetimeCost)}
              </div>
            </div>
            {(data?.totalManualAdjustments ?? 0) !== 0 && (
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>صافي التعديلات اليدوية</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'bold' }}>{formatMoney(data?.totalManualAdjustments ?? 0, { signed: true })}</div>
              </div>
            )}
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-text-secondary)" fontSize={11} />
                <YAxis stroke="var(--color-text-secondary)" fontSize={11} />
                <Tooltip formatter={(value: number) => formatMoney(Number(value))} />
                <Legend verticalAlign="top" height={30} iconType="square" fontSize={11} />
                <Bar name="القيمة" dataKey="value">
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      <Card
        title="كل العملاء ورصيد الولاء"
        extra={
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', insetInlineStart: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
            <Input
              placeholder="ابحث بالاسم أو رقم الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingInlineStart: '32px' }}
            />
          </div>
        }
      >
        {filteredCustomers.length === 0 ? (
          <div style={{ padding: 'var(--spacing-3)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
            لا يوجد عملاء مطابقين
          </div>
        ) : (
          <div className="table-container">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>الهاتف</th>
                  <th style={{ textAlign: 'right' }}>الرصيد الحالي</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map(c => (
                  <tr key={c.customerId}>
                    <td>{c.name}</td>
                    <td>{c.phone || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: c.balance > 0 ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {formatMoney(c.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default LoyaltyDashboard;
