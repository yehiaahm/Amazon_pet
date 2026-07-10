import React, { useState } from 'react';
import SettingsLayout from '../../layouts/SettingsLayout';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [showSavedMsg, setShowSavedMsg] = useState(false);

  // General state config
  const [busName, setBusName] = useState('AnimaSys Pet Center');
  const [busAddress, setBusAddress] = useState('123 Retail Ave, Downtown');
  const [vatTax, setVatTax] = useState('10.0');
  const [aiProvider, setAiProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('••••••••••••••••••••••••••••••••');
  
  const [useRealBackend, setUseRealBackend] = useState(localStorage.getItem('USE_REAL_BACKEND') === 'true');
  const [backendUrl, setBackendUrl] = useState(localStorage.getItem('BACKEND_URL') || 'http://localhost:8080/api');

  const handleSaveSettings = () => {
    setShowSavedMsg(true);
    setTimeout(() => setShowSavedMsg(false), 3000);
  };

  return (
    <div className="workspace">
      <PageHeader 
        title="إعدادات نظام ERP" 
        subtitle="إدارة نسب الضرائب العامة، فواتير نقاط البيع، وصلاحيات الذكاء الاصطناعي للفرع"
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {showSavedMsg && <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>تم حفظ الإعدادات بنجاح!</span>}
            <Button onClick={handleSaveSettings} variant="primary" size="sm">
              حفظ وتطبيق التكوين
            </Button>
          </div>
        }
      />

      <SettingsLayout activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeTab === 'general' && (
          <Card title="إعدادات المتجر العامة" style={{ gap: 'var(--spacing-4)' }}>
            <Input
              label="الاسم التجاري للمؤسسة / المحل"
              value={busName}
              onChange={(e) => setBusName(e.target.value)}
            />
            <Input
              label="العنوان الجغرافي للمحل"
              value={busAddress}
              onChange={(e) => setBusAddress(e.target.value)}
            />
            <Select
              label="العملة الأساسية الافتراضية"
              value="USD"
              options={[
                { value: 'USD', label: 'دولار أمريكي ($)' },
                { value: 'EUR', label: 'يورو (€)' },
                { value: 'EGP', label: 'جنيه مصري (EGP)' }
              ]}
            />
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: '4px 0', marginTop: '8px' }}>
              <input 
                type="checkbox" 
                checked={useRealBackend} 
                onChange={(e) => {
                  setUseRealBackend(e.target.checked);
                  localStorage.setItem('USE_REAL_BACKEND', e.target.checked.toString());
                  if (!e.target.checked) localStorage.removeItem('token');
                }} 
              />
              <strong>تفعيل الربط البرمجي مع سيرفر Spring Boot REST API</strong>
            </label>

            {useRealBackend && (
              <Input
                label="رابط الـ API الأساسي لسيرفر Spring Boot"
                value={backendUrl}
                onChange={(e) => {
                  setBackendUrl(e.target.value);
                  localStorage.setItem('BACKEND_URL', e.target.value);
                }}
              />
            )}
          </Card>
        )}

        {activeTab === 'pos' && (
          <Card title="تكوين شاشات مبيعات ونقاط البيع (POS)" style={{ gap: 'var(--spacing-4)' }}>
            <Select
              label="العهدة النقدية الافتراضية لبدء الوردية ($)"
              value="150"
              options={[
                { value: '100', label: '$100.00' },
                { value: '150', label: '$150.00' },
                { value: '200', label: '$200.00' }
              ]}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: '4px 0' }}>
              <input type="checkbox" defaultChecked />
              طباعة إيصال الفاتورة تلقائياً فور تأكيد الكاشير
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', cursor: 'pointer', padding: '4px 0' }}>
              <input type="checkbox" defaultChecked />
              تشغيل نغمة تنبيه (Beep) عند فتح درج الكاشير الإلكتروني
            </label>
          </Card>
        )}

        {activeTab === 'tax' && (
          <Card title="إعدادات الضرائب والحسابات المالية" style={{ gap: 'var(--spacing-4)' }}>
            <Input
              label="نسبة ضريبة القيمة المضافة (VAT) (%)"
              value={vatTax}
              onChange={(e) => setVatTax(e.target.value)}
            />
            <Input
              label="الرقم الضريبي المسجل للمنشأة (TRN)"
              defaultValue="TRN-902-819-32A"
            />
          </Card>
        )}

        {activeTab === 'ai' && (
          <Card title="إعدادات ومفاتيح الذكاء الاصطناعي الآمنة" style={{ gap: 'var(--spacing-4)' }}>
            <Select
              label="مزود وموديل محرك الذكاء الاصطناعي"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              options={[
                { value: 'gemini', label: 'Google Gemini Pro 1.5' },
                { value: 'openai', label: 'OpenAI GPT-4o' },
                { value: 'claude', label: 'Anthropic Claude 3.5 Sonnet' },
                { value: 'local', label: 'محرك التحليلات الداخلي وقواعد العمل (أوفلاين - لا يتطلب كود API)' }
              ]}
            />
            
            {aiProvider !== 'local' && (
              <Input
                label="مفتاح الـ API السري للخدمة (API Key)"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="أدخل كود الـ API الخاص بالخدمة"
              />
            )}
            
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', lineHeight: '1.4' }}>
              ℹ️ يتم معالجة وتمرير مفاتيح الـ API السرية بأمان تام على خادم AnimaSys الرئيسي بالخلفية. ولا يتم تخزينها أو كشفها لمتصفح المستخدم نهائياً.
            </div>
          </Card>
        )}
      </SettingsLayout>
    </div>
  );
};

export default Settings;
