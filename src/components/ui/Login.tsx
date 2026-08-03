import React, { useState, useEffect } from 'react';
import { useUIStore } from '../../core/stores/uiStore';
import { usePermissionStore } from '../../core/permissions/permissionStore';
import { resolveFirstAccessibleModule, canAccessModuleWithPermissions } from '../../core/permissions/navigationUtils';
import { getBackendUrl } from '../../core/api/backendUrl';
import { Sparkles, AlertCircle, Delete, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const setCurrentEmployee = useUIStore(s => s.setCurrentEmployee);
  const setAuthenticated = useUIStore(s => s.setAuthenticated);
  const setActiveModule = useUIStore(s => s.setActiveModule);

  const [pinCode, setPinCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerLogin = async (code: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const backendUrl = getBackendUrl();
      const response = await fetch(`${backendUrl}/auth/pin-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': crypto.randomUUID?.()?.substring(0, 12) ?? String(Date.now()),
        },
        body: JSON.stringify({ pin: code }),
        signal: AbortSignal.timeout(30_000),
      });

      const resJson = await response.json();
      if (!response.ok || !resJson.success) {
        throw new Error(resJson.message || `HTTP ${response.status}`);
      }

      const authData = resJson.data;
      localStorage.setItem('token', authData.token);

      if (Array.isArray(authData.permissions)) {
        usePermissionStore.getState().setPermissions(authData.permissions);
      }

      setCurrentEmployee({
        id: authData.employeeId,
        username: authData.username,
        fullName: String(authData.fullName || '').trim().split(' ')[0],
        email: '',
        role: authData.role as any,
        branchId: authData.branchId,
        active: true
      });
      setAuthenticated(true);

      const permissionCodes = Array.isArray(authData.permissions) ? authData.permissions : [];
      const landing = resolveFirstAccessibleModule((moduleId) =>
        canAccessModuleWithPermissions(permissionCodes, moduleId)
      );
      if (landing) {
        setActiveModule(landing);
      }
    } catch (err: any) {
      const raw = err?.message || '';
      const msg =
        raw === 'Failed to fetch'
          ? 'تعذر الاتصال بالخادم. تأكد أن Amazon Pet يعمل وأن المنفذ 8080 متاح.'
          : raw || 'خطأ في الاتصال بالخادم. تأكد من تشغيل الـ Backend.';
      setErrorMsg(msg);
      setPinCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const autoLoginTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyPress = (num: string) => {
    if (isSubmitting) return;
    setErrorMsg('');
    if (pinCode.length < 4) {
      const newPin = pinCode + num;
      setPinCode(newPin);
      if (newPin.length === 4) {
        if (autoLoginTimerRef.current) clearTimeout(autoLoginTimerRef.current);
        autoLoginTimerRef.current = setTimeout(() => triggerLogin(newPin), 200);
      }
    }
  };

  React.useEffect(() => {
    return () => {
      if (autoLoginTimerRef.current) clearTimeout(autoLoginTimerRef.current);
    };
  }, []);

  const handleBackspace = () => {
    setErrorMsg('');
    setPinCode(prev => prev.slice(0, -1));
  };

  const handleLoginSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    triggerLogin(pinCode);
  };

  // Listen to physical keyboard events globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow only numbers 0-9, backspace, and enter keys
      if (e.key >= '0' && e.key <= '9') {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        handleLoginSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pinCode]);


  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at center, #1e1b4b 0%, #0f172a 100%)',
      fontFamily: 'Inter, sans-serif',
      color: '#fff',
      padding: 'var(--spacing-4)',
      boxSizing: 'border-box',
      overflow: 'hidden'
    }}>
      
      {/* Background Decorative Blur Orbs */}
      <div style={{
        position: 'absolute',
        top: '15%',
        left: '25%',
        width: '300px',
        height: '300px',
        borderRadius: '50%',
        background: 'rgba(99, 102, 241, 0.15)',
        filter: 'blur(80px)',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: '15%',
        right: '25%',
        width: '350px',
        height: '350px',
        borderRadius: '50%',
        background: 'rgba(236, 72, 153, 0.1)',
        filter: 'blur(90px)',
        zIndex: 0
      }} />

      {/* Main Glassmorphism Container */}
      <div style={{
        zIndex: 1,
        width: '100%',
        maxWidth: '420px',
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
        padding: 'var(--spacing-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-5)',
        boxSizing: 'border-box'
      }}>
        
        {/* Header branding */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--color-primary) 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
          }}>
            <Sparkles size={22} color="#fff" />
          </div>
          <h2 style={{ margin: '8px 0 2px 0', fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-primary-light)' }}>
            نظام Amazon Pet ERP المؤسسي
          </h2>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            ادخل رمز الموظف السري للدخول المباشر لوحة التحكم
          </span>
        </div>

        {/* Form Inputs */}
        <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
          
          {/* Masked code visualizer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', fontWeight: 'bold', paddingRight: '2px', textAlign: 'right' }}>
              رمز الدخول السري (PIN)
            </label>
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '16px',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              height: '48px',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}>
              {[0, 1, 2, 3].map((idx) => {
                const filled = pinCode.length > idx;
                return (
                  <div
                    key={idx}
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '50%',
                      backgroundColor: filled ? 'var(--color-primary-light)' : 'rgba(255, 255, 255, 0.15)',
                      boxShadow: filled ? '0 0 10px var(--color-primary-light)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px var(--spacing-3)',
              color: '#f87171',
              fontSize: '11px',
              direction: 'rtl'
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}


          {/* Keypad Grid (Makes POS login extremely premium and quick) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginTop: '8px',
            direction: 'ltr' // Standard dialpad alignment
          }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                style={{
                  padding: '14px 0',
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 'bold',
                  color: '#fff',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)'}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              style={{
                padding: '14px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: '12px',
                cursor: 'pointer',
                color: '#f87171',
                outline: 'none'
              }}
            >
              <Delete size={16} />
            </button>
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              style={{
                padding: '14px 0',
                fontSize: 'var(--font-size-base)',
                fontWeight: 'bold',
                color: '#fff',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '12px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              0
            </button>
            <button
              type="submit"
              disabled={pinCode.length === 0}
              style={{
                padding: '14px 0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--color-primary)',
                border: 'none',
                borderRadius: '12px',
                cursor: pinCode.length === 0 ? 'not-allowed' : 'pointer',
                color: '#fff',
                opacity: pinCode.length === 0 ? 0.6 : 1,
                outline: 'none'
              }}
            >
              <ArrowRight size={18} />
            </button>
          </div>


        </form>

      </div>
      
      {/* Footer Branding */}
      <div style={{
        marginTop: 'var(--spacing-5)',
        fontSize: '10px',
        color: 'rgba(255,255,255,0.3)',
        zIndex: 1,
        textAlign: 'center'
      }}>
        نظام Amazon Pet للتحكم بالصلاحيات والمخازن • إصدار 1.0.0
      </div>

    </div>
  );
};

export default Login;
