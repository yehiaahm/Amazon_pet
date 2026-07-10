import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useCartStore } from '../../core/stores/cartStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useUIStore } from '../../core/stores/uiStore';
import { 
  useVariants, useProducts, useServices, 
  useCustomers, useCreateSale, useSales, useRefundSale 
} from '../../core/hooks/useERPData';
import { 
  Search, Trash2, ShoppingCart,
  UserPlus, DollarSign, CreditCard, Smartphone, Printer 
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';

export const POS: React.FC = () => {
  const currentEmployee = useUIStore(s => s.currentEmployee)!;
  
  // Zustand session & cart stores
  const activeSession = useSessionStore(s => s.activeSession);
  const startSession = useSessionStore(s => s.startSession);
  const endSession = useSessionStore(s => s.endSession);
  const fetchSessions = useSessionStore(s => s.fetchSessions);
  
  const cartItems = useCartStore(s => s.cartItems);
  const addItem = useCartStore(s => s.addItem);
  const removeItem = useCartStore(s => s.removeItem);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const customerId = useCartStore(s => s.customerId);
  const setCustomerId = useCartStore(s => s.setCustomerId);
  const discount = useCartStore(s => s.discount);
  const setDiscount = useCartStore(s => s.setDiscount);
  const paymentMethod = useCartStore(s => s.paymentMethod);
  const setPaymentMethod = useCartStore(s => s.setPaymentMethod);
  const clearCart = useCartStore(s => s.clearCart);
  const getTotals = useCartStore(s => s.getTotals);

  // Queries & Mutations
  const { data: products } = useProducts();
  const { data: variants } = useVariants();
  const { data: services } = useServices();
  const { data: customers } = useCustomers();
  const { mutate: executeSale, isPending: checkingOut } = useCreateSale();
  const { data: sales } = useSales();
  const { mutate: triggerRefund } = useRefundSale();

  // Local state
  const [openingFloat, setOpeningFloat] = useState('150.00');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'PRODUCTS' | 'SERVICES' | 'INVOICES'>('ALL');
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [countedCash, setCountedCash] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load active sessions
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleShortcuts = (e: KeyboardEvent) => {
      if (!activeSession) return;

      if (e.key === 'F1') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        setPaymentMethod('CASH');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setPaymentMethod('CARD');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        clearCart();
      }
    };
    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [activeSession, setPaymentMethod, clearCart]);

  // POS opening calculation
  const handleStartShift = async () => {
    const balance = parseFloat(openingFloat) || 0;
    await startSession(currentEmployee.id, balance);
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    const totals = getTotals();
    const saleData = {
      posSessionId: activeSession!.id,
      totalAmount: totals.total,
      tax: totals.tax,
      discount: totals.discount,
      paymentMethod,
      employeeId: currentEmployee.id,
      customerId: customerId || undefined,
      items: cartItems
    };

    executeSale(saleData, {
      onSuccess: (newSale) => {
        setActiveReceipt(newSale);
        clearCart();
      }
    });
  };

  const handleCloseShift = async () => {
    const cashCounted = parseFloat(countedCash) || 0;
    
    // Calculate expected balance (mock calculations based on today's sales)
    const expected = (activeSession?.openingBalance || 150) + 120.00; // Expected drawer amount simulation
    await endSession(
      activeSession!.id, 
      cashCounted, 
      expected, 
      cashCounted, 
      currentEmployee.id
    );
    setShowCloseShiftModal(false);
    setCountedCash('');
  };

  // Filter Catalog Items
  const catalogItems = useMemo(() => {
    const list: any[] = [];
    
    // Products
    if (selectedCategory === 'ALL' || selectedCategory === 'PRODUCTS') {
      variants?.forEach(v => {
        const prod = products?.find(p => p.id === v.productId);
        if (prod) {
          list.push({
            id: v.id,
            name: `${prod.name} (${v.name})`,
            price: v.price,
            cost: v.cost,
            type: 'PRODUCT',
            stock: v.stockQuantity,
            sku: prod.sku
          });
        }
      });
    }

    // Services
    if (selectedCategory === 'ALL' || selectedCategory === 'SERVICES') {
      services?.forEach(s => {
        list.push({
          id: s.id,
          name: `${s.name} (${s.durationMinutes} min)`,
          price: s.price,
          cost: s.price * 0.3, // 30% overhead mock
          type: 'SERVICE',
          stock: null,
          sku: 'SRV-JOB'
        });
      });
    }

    // Filter by query
    if (searchQuery) {
      return list.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return list;
  }, [variants, products, services, searchQuery, selectedCategory]);

  const totals = getTotals();

  // ==========================================
  // VIEW: OPEN SHIFT SESSION DIALOG
  // ==========================================
  if (!activeSession) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg)' }}>
        <Card title="بدء الوردية - إعداد درج الكاشير" style={{ width: '100%', maxWidth: '380px', padding: 'var(--spacing-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)' }}>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              الرجاء جرد وتأكيد عهدة النقود الافتتاحية في الدرج قبل بدء عمليات البيع اليومية.
            </div>
            
            <Input
              label="العهدة النقدية الافتتاحية ($)"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="150.00"
            />
            
            <Button onClick={handleStartShift} variant="primary" style={{ width: '100%' }}>
              فتح الدرج وبدء نقطة البيع
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ==========================================
  // VIEW: MAIN ACTIVE POS CART SCREEN
  // ==========================================
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', flex: 1, overflow: 'hidden' }}>
      
      {/* LEFT: Product Catalog Section */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--color-border)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-surface)'
      }}>
        {/* Search Bar / Filters */}
        <div style={{ padding: 'var(--spacing-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ position: 'relative' }}>
            <Search 
              size={16} 
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} 
            />
            <Input
              ref={searchInputRef}
              placeholder="ابحث بالاسم أو امسح الباركود... (F1)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
          </div>

          {/* Catalog Filter Tabs */}
          <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
            {(['ALL', 'PRODUCTS', 'SERVICES', 'INVOICES'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setSelectedCategory(tab)}
                className="btn-ghost"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  padding: '4px 12px',
                  backgroundColor: selectedCategory === tab ? 'var(--color-primary-light)' : 'transparent',
                  color: selectedCategory === tab ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: selectedCategory === tab ? 'bold' : 'normal',
                  borderRadius: 'var(--radius-md)'
                }}
              >
                {tab === 'ALL' ? 'الكل' : tab === 'PRODUCTS' ? 'المنتجات' : tab === 'SERVICES' ? 'الخدمات' : 'الفواتير الأخيرة'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid List of Catalog Items or Invoices History */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: 'var(--spacing-4)', 
          display: selectedCategory === 'INVOICES' ? 'block' : 'grid', 
          gridTemplateColumns: selectedCategory === 'INVOICES' ? 'none' : 'repeat(auto-fill, minmax(170px, 1fr))', 
          gap: 'var(--spacing-3)', 
          alignContent: 'start' 
        }}>
          {selectedCategory === 'INVOICES' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', width: '100%', direction: 'rtl' }}>
              <h3 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', margin: '0 0 var(--spacing-2) 0', color: 'var(--color-text-secondary)' }}>سجل الفواتير الأخيرة (انقر لإرجاع أو إلغاء فاتورة)</h3>
              {sales && [...sales].reverse().slice(0, 10).map((s) => {
                const isRefunded = s.status === 'REFUNDED';
                return (
                  <div key={s.id} style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-3)',
                    backgroundColor: 'var(--color-surface)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--spacing-4)',
                    marginBottom: 'var(--spacing-2)'
                  }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)' }}>{s.saleNumber}</span>
                        <Badge variant={isRefunded ? 'danger' : 'success'}>
                          {isRefunded ? 'مرتجعة / ملغية' : 'مكتملة'}
                        </Badge>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                        التاريخ: {new Date(s.date).toLocaleString()} • {s.items.length} أصناف
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-4)' }}>
                      <strong style={{ fontSize: 'var(--font-size-sm)' }}>${s.totalAmount.toFixed(2)}</strong>
                      {!isRefunded && (
                        <Button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من رغبتك في إرجاع وإلغاء الفاتورة ${s.saleNumber} بالكامل بقيمة $${s.totalAmount.toFixed(2)}؟ سيتم إعادة البضائع للمخزن تلقائياً وتسجيل المحضر للرقابة.`)) {
                              triggerRefund({ saleId: s.id, employeeId: currentEmployee.id });
                            }
                          }}
                          variant="danger"
                          size="sm"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          إرجاع الفاتورة
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            catalogItems.map((item: any) => {
              const isOutOfStock = item.type === 'PRODUCT' && item.stock <= 0;
              return (
                <div
                  key={item.id}
                  onClick={() => !isOutOfStock && addItem({ itemId: item.id, type: item.type as 'PRODUCT' | 'SERVICE', name: item.name, price: item.price, cost: item.cost })}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-3)',
                    cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '110px',
                    opacity: isOutOfStock ? 0.5 : 1,
                    backgroundColor: 'var(--color-bg)',
                    transition: 'border-color var(--transition-fast)'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)', lineBreak: 'anywhere' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                      رمز الصنف: {item.sku.slice(0, 10)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                      ${item.price.toFixed(2)}
                    </span>
                    {item.stock !== null && (
                      <Badge variant={item.stock < 10 ? 'danger' : 'success'} style={{ fontSize: '9px', padding: '1px 4px' }}>
                        {item.stock} متاح
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: POS Shopping Cart Section */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: 'var(--color-bg)',
        overflow: 'hidden'
      }}>
        {/* Cart Headers & Actions */}
        <div style={{ padding: 'var(--spacing-4)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
            <ShoppingCart size={18} />
            <span style={{ fontWeight: 'bold' }}>السلة الحالية ({cartItems.length})</span>
          </div>
          <Button onClick={() => setShowCloseShiftModal(true)} variant="danger" size="sm">
            إغلاق الوردية (جرد النقدية)
          </Button>
        </div>

        {/* Scrollable list of cart items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
          {cartItems.length === 0 ? (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
              <ShoppingCart size={48} style={{ opacity: 0.3, marginBottom: 'var(--spacing-2)' }} />
              <span>سلة المشتريات فارغة.</span>
            </div>
          ) : (
            cartItems.map(item => (
              <div 
                key={`${item.type}-${item.itemId}`}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                    ${item.price.toFixed(2)} للوحدة
                  </div>
                </div>

                {/* Quantity Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                  <button 
                    onClick={() => updateQuantity(item.itemId, item.type, item.quantity - 1)}
                    className="btn-secondary"
                    style={{ padding: '2px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'bold', minWidth: '20px', textAlign: 'center' }}>
                    {item.quantity}
                  </span>
                  <button 
                    onClick={() => updateQuantity(item.itemId, item.type, item.quantity + 1)}
                    className="btn-secondary"
                    style={{ padding: '2px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                  >
                    +
                  </button>
                  <button 
                    onClick={() => removeItem(item.itemId, item.type)}
                    className="btn-ghost" 
                    style={{ color: 'var(--color-danger)', border: 'none', padding: '6px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pricing calculations & checkout actions */}
        <div style={{
          backgroundColor: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--spacing-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-3)'
        }}>
          {/* Customer CRM Selector */}
          <div style={{ display: 'flex', gap: 'var(--spacing-2)' }}>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="">اختر العميل المسجل...</option>
              {customers?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
            </select>
            <Button variant="secondary" size="sm">
              <UserPlus size={16} />
            </Button>
          </div>

          {/* Discount Field */}
          <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>الخصم الإجمالي ($)</span>
            <Input
              type="number"
              value={discount || ''}
              onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              style={{ padding: '4px var(--spacing-2)' }}
            />
          </div>

          {/* Pricing Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--spacing-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>المجموع الفرعي</span>
              <span>${totals.subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>الخصم</span>
              <span>-${totals.discount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ضريبة القيمة المضافة (10%)</span>
              <span>${totals.tax.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: '4px', marginTop: '4px' }}>
              <span>المجموع الكلي</span>
              <span>${totals.total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Methods buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-2)', marginTop: 'var(--spacing-1)' }}>
            <button
              onClick={() => setPaymentMethod('CASH')}
              className="btn-secondary"
              style={{
                borderColor: paymentMethod === 'CASH' ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: paymentMethod === 'CASH' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: paymentMethod === 'CASH' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px'
              }}
            >
              <DollarSign size={16} /> نقدي (F3)
            </button>
            <button
              onClick={() => setPaymentMethod('CARD')}
              className="btn-secondary"
              style={{
                borderColor: paymentMethod === 'CARD' ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: paymentMethod === 'CARD' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: paymentMethod === 'CARD' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px'
              }}
            >
              <CreditCard size={16} /> بطاقة (F4)
            </button>
            <button
              onClick={() => setPaymentMethod('MOBILE')}
              className="btn-secondary"
              style={{
                borderColor: paymentMethod === 'MOBILE' ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: paymentMethod === 'MOBILE' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: paymentMethod === 'MOBILE' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px'
              }}
            >
              <Smartphone size={16} /> دفع إلكتروني
            </button>
          </div>

          {/* Complete sale checkout button */}
          <Button
            onClick={handleCheckout}
            disabled={cartItems.length === 0 || checkingOut}
            variant="success"
            style={{ width: '100%', padding: 'var(--spacing-3)', fontSize: 'var(--font-size-base)', fontWeight: 'bold', marginTop: 'var(--spacing-2)' }}
          >
            إتمام عملية البيع وطباعة الفاتورة
          </Button>
        </div>
      </div>

      {/* 1. MOCK RECEIPT DIALOG VIEW */}
      <Modal
        isOpen={activeReceipt !== null}
        onClose={() => setActiveReceipt(null)}
        title="تم تسجيل الفاتورة وإتمام المبيعات بنجاح"
        footer={
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <Button onClick={() => window.print()} variant="secondary" style={{ flex: 1 }}>
              <Printer size={14} /> طباعة الفاتورة
            </Button>
            <Button onClick={() => setActiveReceipt(null)} variant="primary" style={{ flex: 1 }}>
              فتح سلة جديدة
            </Button>
          </div>
        }
      >
        {activeReceipt && (
          <div style={{
            fontFamily: 'Courier New, Courier, monospace',
            fontSize: 'var(--font-size-xs)',
            lineHeight: '1.4',
            padding: 'var(--spacing-4)',
            border: '1px dashed var(--color-border)',
            backgroundColor: 'var(--color-bg)',
            color: '#000000'
          }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>مركز أنيما سيس للحيوانات الأليفة</div>
            <div style={{ textAlign: 'center' }}>مكتب فرع وسط المدينة</div>
            <div style={{ textAlign: 'center' }}>الهاتف: +123-456-789</div>
            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
            <div>التاريخ: {new Date(activeReceipt.date).toLocaleString()}</div>
            <div>رقم الفاتورة: {activeReceipt.saleNumber}</div>
            <div>الكاشير: {currentEmployee.fullName}</div>
            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
            
            {/* Items list */}
            {activeReceipt.items.map((i: any) => (
              <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div>{i.quantity}x {i.name.slice(0, 20)}</div>
                <div>${(i.price * i.quantity).toFixed(2)}</div>
              </div>
            ))}

            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>الضريبة (10%):</span>
              <span>${activeReceipt.tax.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>إجمالي المدفوع:</span>
              <span>${activeReceipt.totalAmount.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span>طريقة الدفع:</span>
              <span>{activeReceipt.paymentMethod === 'CASH' ? 'نقدي' : 'بطاقة'}</span>
            </div>
            <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }} />
            <div style={{ textAlign: 'center', marginTop: '12px' }}>شكراً لتسوقكم معنا!</div>
            <div style={{ textAlign: 'center' }}>تابعونا للمزيد @animasys</div>
          </div>
        )}
      </Modal>

      {/* 2. CLOSE SHIFT DRAWER BALANCE MODAL */}
      <Modal
        isOpen={showCloseShiftModal}
        onClose={() => setShowCloseShiftModal(false)}
        title="وردية نقطة البيع - جرد ومطابقة نقود درج الكاشير"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowCloseShiftModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleCloseShift} variant="danger">تأكيد وإغلاق الوردية</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            قم بجرود جميع الأوراق النقدية والعملات المعدنية الموجودة في درج الكاشير وأدخل القيمة الكلية. سيقوم النظام تلقائياً بتسجيل الفروقات.
          </div>
          
          <div style={{ padding: 'var(--spacing-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', marginBottom: '4px' }}>
              <span>النقدية المتوقعة في الدرج:</span>
              <strong>$270.00</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
              <span>عهدة البداية النقدي:</span>
              <span>${activeSession.openingBalance.toFixed(2)}</span>
            </div>
          </div>

          <Input
            label="إجمالي النقد الفعلي الذي تم جردة في الدرج ($)"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </Modal>
    </div>
  );
};

export default POS;
