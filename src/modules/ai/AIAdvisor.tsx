import React, { useState, useRef, useEffect } from 'react';
import { useAIInsights } from '../../core/hooks/useERPData';
import { 
  Send, Sparkles, AlertOctagon, HelpCircle, Brain, Database, Zap
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer 
} from 'recharts';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { SystemContextEngine } from '../../core/ai/SystemContextEngine';
import { AIEngine } from '../../core/ai/AIEngine';

export const AIAdvisor: React.FC = () => {
  const { data: insights, isLoading } = useAIInsights();

  // Local chat states
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'USER' | 'AI'; text: string; isAnalyzing?: boolean }>>([
    { sender: 'AI', text: "أهلاً بك! أنا مستشار الأعمال الذكي الخاص بك. كيف يمكنني مساعدتك في تحسين وتطوير أداء المحل اليوم؟" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [answering, setAnswering] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, answering]);

  if (isLoading) {
    return <div className="workspace"><div className="skeleton" style={{ height: '400px' }} /></div>;
  }

  // ── المحرك الذكي الحقيقي ──────────────────────────────────
  const handleSendChat = async () => {
    if (!chatInput.trim() || answering) return;
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { sender: 'USER', text: userMsg }]);
    setChatInput('');
    setAnswering(true);

    try {
      // الخطوة 1: جمع بيانات النظام
      setAnalysisStep('🔍 جاري جمع بيانات النظام...');
      await new Promise(r => setTimeout(r, 300));
      const snapshot = SystemContextEngine.buildFullSnapshot();

      // الخطوة 2: بناء السياق الكامل
      setAnalysisStep('🧠 جاري تحليل المبيعات والمخزون والمالية...');
      await new Promise(r => setTimeout(r, 400));
      const contextString = SystemContextEngine.buildContextString(snapshot);

      // الخطوة 3: توليد الرد الذكي
      setAnalysisStep('💡 جاري صياغة التوصيات...');
      const reply = await AIEngine.generateResponse(userMsg, snapshot, contextString);

      setChatMessages(prev => [...prev, { sender: 'AI', text: reply }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { sender: 'AI', text: '⚠️ حدث خطأ أثناء تحليل البيانات. يرجى المحاولة مجدداً.' }]);
    } finally {
      setAnswering(false);
      setAnalysisStep('');
    }
  };

  // Forecast Chart Data
  const forecastChartData = [
    { month: 'يوليو 26 (فعلي)', Sales: 16800 },
    { month: 'أغسطس 26 (تقديري)', Sales: 33100 },
    { month: 'سبتمبر 26 (تقديري)', Sales: 34900 },
    { month: 'أكتوبر 26 (تقديري)', Sales: 36200 }
  ];

  return (
    <div className="workspace">
      <PageHeader 
        title="مستشار الأعمال الذكي بالذكاء الاصطناعي" 
        subtitle="تشخيصات الأعمال المحسوبة والاتجاهات والتوجيهات التشغيلية للمحل"
        actions={<Badge variant="primary" style={{ display: 'flex', gap: '4px' }}><Sparkles size={12} /> مستشار جيمي متصل سحابياً</Badge>}
      />

      {/* Primary Layout Split: Left structural advice card, Right auxiliary chat & forecast */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--spacing-6)', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Structural Advisor Insights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          {/* 1. Business Health Summary */}
          <Card title="الملخص التشغيلي والتنفيذي">
            <p style={{ lineHeight: '1.6', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>
              {insights?.businessSummary}
            </p>
          </Card>

          {/* 2. Top Actionable Opportunities */}
          <Card title="أبرز فرص زيادة الإيرادات والنمو">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              {insights?.topOpportunities.map((op, i) => (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>{op.title}</span>
                    <Badge variant={op.priority === 'HIGH' ? 'danger' : 'warning'}>أولوية {op.priority === 'HIGH' ? 'مرتفعة' : 'متوسطة'}</Badge>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{op.description}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* 3. Action Recommendations */}
          <Card title="توصيات وإجراءات نمو مقترحة للتشغيل">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              {insights?.recommendations.map((rec, i) => (
                <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', display: 'grid', gridTemplateColumns: '1.5fr 1.2fr', gap: 'var(--spacing-4)', backgroundColor: 'var(--color-bg)' }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>{rec.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>الإجراء: {rec.action}</div>
                  </div>
                  <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 'var(--spacing-4)' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>الأثر المالي المتوقع</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-primary)', marginTop: '2px' }}>{rec.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Forecast Chart & Ask AI Interactive Console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-6)' }}>
          {/* 1. Critical alerts warnings */}
          <Card title="تحذيرات وتنبيهات تشغيلية حرجة">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
              {insights?.criticalAlerts.map((al, i) => (
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

          {/* 2. Forecast chart */}
          <Card title="توقعات نمو المبيعات للفترة القادمة">
            <div style={{ width: '100%', height: 160 }}>
              <ResponsiveContainer>
                <LineChart data={forecastChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" stroke="var(--color-text-secondary)" fontSize={10} />
                  <YAxis stroke="var(--color-text-secondary)" fontSize={10} />
                  <Tooltip />
                  <Line type="monotone" dataKey="Sales" stroke="var(--color-success)" strokeWidth={2} dot={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{insights?.forecastText}</span>
          </Card>

          {/* 3. Ask AI (Secondary dialogue feed) */}
          <Card title="اسأل مستشار الأعمال الذكي">
            <div style={{ display: 'flex', flexDirection: 'column', height: '280px', justifyContent: 'space-between' }}>
              {/* Chat Feed viewport */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', paddingRight: '4px', marginBottom: 'var(--spacing-3)' }}>
                {chatMessages.map((m, idx) => (
                  <div 
                    key={idx} 
                    style={{
                      alignSelf: m.sender === 'USER' ? 'flex-end' : 'flex-start',
                      backgroundColor: m.sender === 'USER' ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: m.sender === 'USER' ? '#fff' : 'var(--color-text-primary)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--spacing-2) var(--spacing-3)',
                      fontSize: 'var(--font-size-xs)',
                      maxWidth: '92%',
                      whiteSpace: 'pre-wrap',
                      lineHeight: '1.6',
                      border: m.sender === 'AI' ? '1px solid var(--color-border)' : 'none'
                    }}
                  >
                    {m.text}
                  </div>
                ))}
                {answering && (
                  <div style={{
                    alignSelf: 'flex-start',
                    backgroundColor: 'var(--color-bg)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-2) var(--spacing-3)',
                    fontSize: 'var(--font-size-xs)',
                    maxWidth: '85%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                      <Brain size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      مستشار الأعمال يحلل النظام...
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)', fontSize: '10px' }}>
                      <Database size={10} />
                      {analysisStep || 'جاري المعالجة...'}
                    </div>
                    <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          backgroundColor: 'var(--color-primary)',
                          animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`
                        }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Quick Prompt Pills */}
              <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', paddingBottom: '8px', fontSize: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => setChatInput("ما وضع المحل المالي الآن؟")} className="btn-secondary" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <Zap size={10} /> الوضع المالي
                </button>
                <button onClick={() => setChatInput("اعطيني تقرير شامل عن المحل")} className="btn-secondary" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <HelpCircle size={10} /> تقرير شامل
                </button>
                <button onClick={() => setChatInput("ما هي التنبيهات والمشاكل الحالية؟")} className="btn-secondary" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <HelpCircle size={10} /> التنبيهات
                </button>
                <button onClick={() => setChatInput("حلل مبيعاتي وأخبرني أكثر المنتجات مبيعاً")} className="btn-secondary" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <HelpCircle size={10} /> تحليل المبيعات
                </button>
                <button onClick={() => setChatInput("ما المنتجات التي تحتاج إعادة طلب؟")} className="btn-secondary" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <HelpCircle size={10} /> إعادة الطلب
                </button>
                <button onClick={() => setChatInput("توقع إيرادات الشهر القادم")} className="btn-secondary" style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <HelpCircle size={10} /> توقعات النمو
                </button>
              </div>

              {/* Chat Input form */}
              <div style={{ display: 'flex', gap: 'var(--spacing-2)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--spacing-2)' }}>
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="اسأل المستشار عن أداء المحل..."
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  style={{ padding: '6px' }}
                />
                <Button onClick={handleSendChat} variant="primary" style={{ padding: '6px var(--spacing-3)' }}>
                  <Send size={14} />
                </Button>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default AIAdvisor;
