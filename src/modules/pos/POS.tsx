import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '../../core/stores/cartStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useUIStore } from '../../core/stores/uiStore';
import { 
  useVariants, useProducts, useServices, 
  useCustomers, useCreateSale, useSales, useRefundSale, useAddCustomer,
  useExpenses
} from '../../core/hooks/useERPData';
import { 
  Search, Trash2, ShoppingCart,
  UserPlus, DollarSign, CreditCard, Smartphone, Printer, Mic, MicOff, AlertTriangle
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { formatMoney } from '../../core/utils/money';
import {
  getSpeechRecognitionCtor,
  matchSpokenCatalog,
  type VoiceCatalogItem,
} from '../../core/pos/voiceCatalogMatch';
import {
  buildAmazonPetInvoiceHtml,
  printAmazonPetInvoice,
  printThermalReceipt,
  saleToInvoiceData,
} from '../../core/pos/amazonPetInvoice';
import { api } from '../../core/api/endpoints';
import type { SaleBatchAllocationRow } from '../../types/erp';
import { type PosCatalogLine } from '../../core/pos/catalogDedupe';
import {
  formatPriceAdjustment,
  MAX_POS_PRICE_DISCOUNT_PERCENT,
  minAllowedSalePrice,
  isBelowMinAllowedSalePrice,
} from '../../core/pos/priceOverride';
import CartLinePriceInput from '../../components/sales/CartLinePriceInput';
import { useBarcodeWedgeListener } from '../../core/pos/useBarcodeWedgeListener';
import { usePermissions } from '../../core/permissions/usePermissions';
import { PERMISSIONS } from '../../core/permissions/permissions';
import {
  canOverridePriceWithoutApproval,
  hasRestrictedSalesScope,
  needsManagerApprovalForRefund,
} from '../../core/permissions/salesAuth';
import { useDebouncedValue } from '../../core/hooks/useDebouncedValue';
import {
  buildBaseCatalogItems,
  buildProductByIdMap,
  buildScanCatalogItems,
  filterCatalogItems,
} from './buildPosCatalog';
import { PosVirtualCatalogGrid } from './PosVirtualCatalogGrid';

export const POS: React.FC = () => {
  const currentEmployee = useUIStore(s => s.currentEmployee)!;
  const setCurrentEmployee = useUIStore(s => s.setCurrentEmployee);
  const setAuthenticated = useUIStore(s => s.setAuthenticated);
  const addNotification = useUIStore(s => s.addNotification);
  const { hasPermission } = usePermissions();
  const restrictedSalesScope = hasRestrictedSalesScope(hasPermission);
  const elevatedSalesPrivileges = canOverridePriceWithoutApproval(hasPermission);
  const canRefundSales = hasPermission(PERMISSIONS.SALES_REFUND);
  const canApplyDiscount = hasPermission(PERMISSIONS.SALES_DISCOUNT);
  const canPrintThermal = hasPermission(PERMISSIONS.SALES_THERMAL);
  const canPrintA4 = hasPermission(PERMISSIONS.SALES_A4);
  
  // Zustand session & cart stores
  const activeSession = useSessionStore(s => s.activeSession);
  const startSession = useSessionStore(s => s.startSession);
  const endSession = useSessionStore(s => s.endSession);
  const fetchSessions = useSessionStore(s => s.fetchSessions);
  
  const cartItems = useCartStore(s => s.cartItems);
  const addItem = useCartStore(s => s.addItem);
  const removeItem = useCartStore(s => s.removeItem);
  const updateQuantity = useCartStore(s => s.updateQuantity);
  const updateUnitPrice = useCartStore(s => s.updateUnitPrice);
  const customerId = useCartStore(s => s.customerId);
  const setCustomerId = useCartStore(s => s.setCustomerId);
  const discountPercent = useCartStore(s => s.discountPercent);
  const setDiscountPercent = useCartStore(s => s.setDiscountPercent);
  const setLoyaltyPercent = useCartStore(s => s.setLoyaltyPercent);
  const paymentMethod = useCartStore(s => s.paymentMethod);
  const setPaymentMethod = useCartStore(s => s.setPaymentMethod);
  const clearCart = useCartStore(s => s.clearCart);
  const getTotals = useCartStore(s => s.getTotals);
  const belowMinManagerPassword = useCartStore(s => s.belowMinManagerPassword);
  const setBelowMinManagerPassword = useCartStore(s => s.setBelowMinManagerPassword);

  // Queries & Mutations
  const { data: products } = useProducts();
  const { data: variants } = useVariants();
  const { data: services } = useServices();
  const { data: customers } = useCustomers();
  const { data: expenses } = useExpenses();
  const { mutate: executeSale, isPending: checkingOut } = useCreateSale();
  const { data: salesPage } = useSales({
    page: 0,
    size: 100,
    sort: 'date,desc',
    ...(restrictedSalesScope ? { employee: currentEmployee.id } : {}),
    ...(activeSession?.openedAt ? { dateFrom: activeSession.openedAt } : {}),
  });
  const sales = salesPage?.content;
  const { mutate: triggerRefund } = useRefundSale();

  // Quick Customer Creation
  const { mutate: createCustomer, isPending: addingCustomer } = useAddCustomer();
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState('DOG');
  const [newPetBreed, setNewPetBreed] = useState('');
  const [newPetAge, setNewPetAge] = useState('');

  // Local state
  const [openingFloat, setOpeningFloat] = useState('150.00');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 280);
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'PRODUCTS' | 'SERVICES' | 'INVOICES'>('ALL');
  
  // Autocomplete customer search states
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [showCustSuggestions, setShowCustSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [activeReceipt, setActiveReceipt] = useState<any | null>(null);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [countedCash, setCountedCash] = useState('');

  const [showPriceManagerModal, setShowPriceManagerModal] = useState(false);
  const [priceManagerCode, setPriceManagerCode] = useState('');
  const [pendingPriceChange, setPendingPriceChange] = useState<{
    itemId: string;
    type: 'PRODUCT' | 'SERVICE';
    price: number;
    itemName?: string;
  } | null>(null);
  const [checkoutManagerCode, setCheckoutManagerCode] = useState('');
  const [showCheckoutManagerModal, setShowCheckoutManagerModal] = useState(false);

  // Trigger close shift modal automatically from other layouts/modules
  const autoOpenCloseShiftModal = useUIStore(s => s.autoOpenCloseShiftModal);
  const setAutoOpenCloseShiftModal = useUIStore(s => s.setAutoOpenCloseShiftModal);
  const logoutAfterCloseShift = useUIStore(s => s.logoutAfterCloseShift);
  const setLogoutAfterCloseShift = useUIStore(s => s.setLogoutAfterCloseShift);
  useEffect(() => {
    if (autoOpenCloseShiftModal) {
      setShowCloseShiftModal(true);
      setAutoOpenCloseShiftModal(false);
    }
  }, [autoOpenCloseShiftModal, setAutoOpenCloseShiftModal]);
  const [visibleInvoicesLimit, setVisibleInvoicesLimit] = useState(10);
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundQuantities, setRefundQuantities] = useState<Record<string, number>>({});

  const { data: receiptBatchAllocations } = useQuery({
    queryKey: ['saleBatchAllocations', activeReceipt?.id],
    queryFn: () => api.getSaleBatchAllocations(activeReceipt!.id),
    enabled: !!activeReceipt?.id,
  });

  useEffect(() => {
    if (!refundTarget?.items) {
      setRefundQuantities({});
      return;
    }
    const initial: Record<string, number> = {};
    refundTarget.items
      .filter((i: any) => (i.type || 'PRODUCT') === 'PRODUCT')
      .forEach((i: any) => {
        initial[i.id] = Number(i.quantity) || 0;
      });
    setRefundQuantities(initial);
  }, [refundTarget]);

  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [scanArmed, setScanArmed] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceCatalogRef = useRef<VoiceCatalogItem[]>([]);
  const addItemRef = useRef(addItem);
  const updateQuantityRef = useRef(updateQuantity);
  const cartItemsRef = useRef(cartItems);
  const addNotificationRef = useRef(addNotification);
  const scanCatalogRef = useRef<PosCatalogLine[]>([]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const clearScanBufferRef = useRef<() => void>(() => {});

  // Calculate expected cash dynamically
  const expectedCashBalance = useMemo(() => {
    if (!activeSession) return 0;
    const opening = activeSession.openingBalance || 0;
    const sessionOpenedAt = activeSession.openedAt
      ? new Date(activeSession.openedAt).getTime()
      : 0;

    const cashSalesTotal = (sales || [])
      .filter(
        (sale) =>
          sale.posSessionId === activeSession.id &&
          sale.status !== 'REFUNDED' &&
          sale.paymentMethod === 'CASH'
      )
      .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    const cashRefundsTotal = (sales || [])
      .filter(
        (sale) =>
          sale.posSessionId === activeSession.id &&
          sale.status === 'REFUNDED' &&
          sale.paymentMethod === 'CASH'
      )
      .reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

    const cashExpensesTotal = (expenses || [])
      .filter((exp) => {
        if (exp.paidFrom !== 'CASH') return false;
        const expTime = new Date(exp.date).getTime();
        return !sessionOpenedAt || expTime >= sessionOpenedAt;
      })
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    return opening + cashSalesTotal - cashRefundsTotal - cashExpensesTotal;
  }, [activeSession, sales, expenses]);

  // Reset limit when query changes
  useEffect(() => {
    setVisibleInvoicesLimit(10);
  }, [searchQuery]);

  const filteredSalesInPOS = useMemo(() => {
    if (!sales) return [];
    let list = [...sales].reverse();

    // Restricted sales scope: own invoices from today only
    if (restrictedSalesScope) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      list = list.filter((s) => {
        const d = new Date(s.date);
        const saleStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return s.employeeId === currentEmployee.id && saleStr === todayStr;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(s => 
        s.saleNumber.toLowerCase().includes(q) ||
        (customers?.find(c => c.id === s.customerId)?.name || '').toLowerCase().includes(q) ||
        (customers?.find(c => c.id === s.customerId)?.phone || '').includes(q)
      );
    }
    return list;
  }, [sales, searchQuery, customers, currentEmployee, restrictedSalesScope]);

  // Invoice navigation helpers inside POS Receipt Modal
  const activeReceiptIndex = useMemo(() => {
    if (!activeReceipt || !filteredSalesInPOS.length) return -1;
    return filteredSalesInPOS.findIndex(s => s.id === activeReceipt.id);
  }, [activeReceipt, filteredSalesInPOS]);

  const handlePrevReceipt = () => {
    if (activeReceiptIndex <= 0) return;
    setActiveReceipt(filteredSalesInPOS[activeReceiptIndex - 1]);
  };

  const handleNextReceipt = () => {
    if (activeReceiptIndex === -1 || activeReceiptIndex >= filteredSalesInPOS.length - 1) return;
    setActiveReceipt(filteredSalesInPOS[activeReceiptIndex + 1]);
  };

  // Load active sessions
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Sync selected customer details to input field
  const selectedCustomer = useMemo(() => {
    return customers?.find(c => c.id === customerId);
  }, [customers, customerId]);

  useEffect(() => {
    if (selectedCustomer) {
      setCustSearchQuery(`${selectedCustomer.name} (${selectedCustomer.phone})`);
    } else {
      setCustSearchQuery('');
    }
  }, [selectedCustomer]);

  // Filter customers by typed query
  const customerSuggestions = useMemo(() => {
    if (!customers) return [];
    const q = custSearchQuery.trim().toLowerCase();
    if (!q || q.includes('(')) return [];
    return customers.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.phone.includes(q)
    );
  }, [customers, custSearchQuery]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowCustSuggestions(false);
      }
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, []);

  // POS opening calculation
  const handleStartShift = async () => {
    const balance = parseFloat(openingFloat) || 0;
    try {
      await startSession(currentEmployee.id, balance);
    } catch {
      // Error surfaced via sessionStore notification
    }
  };

  const resolveInvoiceItemName = (item: { name?: string; itemId?: string; type?: string }) => {
    if (item.type === 'SERVICE' || (!item.type && services?.some((s) => s.id === item.itemId))) {
      return services?.find((s) => s.id === item.itemId)?.name;
    }
    const variant = variants?.find((v) => v.id === item.itemId);
    if (!variant) return undefined;
    const prod = products?.find((p) => p.id === variant.productId);
    if (prod?.name && variant.name && prod.name !== variant.name) {
      return `${prod.name} (${variant.name})`;
    }
    return prod?.name || variant.name;
  };

  const printReceipt = (receipt: any) => {
    const cust = customers?.find((c) => c.id === receipt.customerId);
    printAmazonPetInvoice(
      saleToInvoiceData({
        sale: receipt,
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone,
        cashierName: currentEmployee.fullName || currentEmployee.username || 'Cashier',
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
  };

  const printThermal = (receipt: any) => {
    const cust = customers?.find((c) => c.id === receipt.customerId);
    printThermalReceipt(
      saleToInvoiceData({
        sale: receipt,
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone,
        cashierName: currentEmployee.fullName || currentEmployee.username || 'Cashier',
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
  };

  const receiptPreviewHtml = useMemo(() => {
    if (!activeReceipt) return '';
    const cust = customers?.find((c) => c.id === activeReceipt.customerId);
    return buildAmazonPetInvoiceHtml(
      saleToInvoiceData({
        sale: activeReceipt,
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone,
        cashierName: currentEmployee.fullName || currentEmployee.username || 'Cashier',
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
  }, [activeReceipt, customers, currentEmployee, variants, products, services]);

  const handleRequireManagerPriceApproval = (
    itemId: string,
    type: 'PRODUCT' | 'SERVICE',
    price: number
  ) => {
    const item = cartItems.find((i) => i.itemId === itemId && i.type === type);
    setPendingPriceChange({ itemId, type, price, itemName: item?.name });
    setPriceManagerCode('');
    setShowPriceManagerModal(true);
  };

  const handlePriceManagerAuthSubmit = () => {
    if (!pendingPriceChange) return;
    if (!priceManagerCode.trim()) {
      addNotification('WARNINGS', 'رمز مطلوب', 'يرجى إدخال رمز المدير للموافقة على السعر.');
      return;
    }
    updateUnitPrice(
      pendingPriceChange.itemId,
      pendingPriceChange.type,
      pendingPriceChange.price,
      { belowMinApproved: true }
    );
    setBelowMinManagerPassword(priceManagerCode);
    setShowPriceManagerModal(false);
    setPendingPriceChange(null);
    setPriceManagerCode('');
    addNotification('FINANCE', 'تمت الموافقة', 'تم اعتماد السعر بموافقة المدير لهذا البند.');
  };

  const executeCheckout = (managerPassword?: string) => {
    const totals = getTotals();
    const resolvedManagerPassword = managerPassword || belowMinManagerPassword || undefined;
    const saleData = {
      posSessionId: activeSession!.id,
      totalAmount: totals.total,
      tax: totals.tax,
      discount: totals.discount,
      paymentMethod,
      employeeId: currentEmployee.id,
      customerId: customerId || undefined,
      items: cartItems.map((item) => ({
        ...item,
        listPrice: item.listPrice ?? item.price,
      })),
      ...(resolvedManagerPassword ? { managerPassword: resolvedManagerPassword } : {}),
    };

    executeSale(saleData as any, {
      onSuccess: (newSale) => {
        const receipt = { ...newSale, status: (newSale as any).status || 'COMPLETED' };
        setActiveReceipt(receipt);
        clearCart();
        setShowCheckoutManagerModal(false);
        setCheckoutManagerCode('');
        if (canPrintA4) {
          setTimeout(() => printReceipt(receipt), 300);
        }
      },
      onError: (err: any) => {
        alert('❌ فشلت عملية البيع: ' + (err?.message || 'خطأ غير معروف'));
      },
    });
  };

  const handleCheckout = () => {
    if (cartItems.length === 0) return;
    if (selectedCustomer?.isBanned) {
      addNotification('WARNINGS', 'عميل محظور', 'لا يمكن إتمام البيع لعميل محظور. تم إلغاء اختيار العميل.');
      setCustomerId('');
      setLoyaltyPercent(0);
      setCustSearchQuery('');
      return;
    }

    const hasBelowMinPrices = cartItems.some((item) =>
      isBelowMinAllowedSalePrice(item.price, item.listPrice ?? item.price)
    );
    if (!elevatedSalesPrivileges && hasBelowMinPrices && !belowMinManagerPassword) {
      setCheckoutManagerCode('');
      setShowCheckoutManagerModal(true);
      return;
    }

    executeCheckout();
  };

  const handleCheckoutManagerAuthSubmit = () => {
    if (!checkoutManagerCode.trim()) {
      addNotification('WARNINGS', 'رمز مطلوب', 'يرجى إدخال رمز المدير لإتمام البيع بأسعار أقل من الحد الأدنى.');
      return;
    }
    executeCheckout(checkoutManagerCode);
    setBelowMinManagerPassword(checkoutManagerCode);
  };

  const handleCloseShift = async () => {
    const cashCounted = parseFloat(countedCash) || 0;

    try {
      await endSession(
        activeSession!.id,
        cashCounted,
        expectedCashBalance,
        cashCounted,
        currentEmployee.id
      );
      setShowCloseShiftModal(false);
      setCountedCash('');

      if (logoutAfterCloseShift) {
        setLogoutAfterCloseShift(false);
        localStorage.removeItem('token');
        setCurrentEmployee(null);
        setAuthenticated(false);
      }
    } catch {
      // Error surfaced via sessionStore notification
    }
  };

  const handleAddCustomer = () => {
    if (!newCustName.trim()) {
      alert('يرجى إدخال اسم العميل');
      return;
    }

    createCustomer({
      customer: {
        name: newCustName,
        phone: newCustPhone,
        email: newCustEmail
      },
      pet: newPetName.trim() ? {
        name: newPetName,
        species: newPetSpecies,
        breed: newPetBreed,
        age: parseInt(newPetAge) || 1
      } : undefined
    }, {
      onSuccess: (newCust: any) => {
        if (newCust && newCust.id) {
          setCustomerId(newCust.id);
          setCustSearchQuery(`${newCust.name} (${newCust.phone})`);
          setLoyaltyPercent(Number(newCust.discount) || 0);
        }
        setShowAddCustomerModal(false);
        setNewCustName('');
        setNewCustPhone('');
        setNewCustEmail('');
        setNewPetName('');
        setNewPetBreed('');
        setNewPetAge('');
        alert('تم تسجيل العميل الجديد وربطه بالسلة بنجاح!');
      },
      onError: (err: any) => {
        alert(err.message || 'فشلت عملية إضافة العميل');
      }
    });
  };

  const productById = useMemo(() => buildProductByIdMap(products), [products]);

  const baseCatalogItems = useMemo(
    () => buildBaseCatalogItems(variants, productById, services, selectedCategory),
    [variants, productById, services, selectedCategory]
  );

  const catalogItems = useMemo(
    () => filterCatalogItems(baseCatalogItems, debouncedSearchQuery),
    [baseCatalogItems, debouncedSearchQuery]
  );

  const catalogItemsForEnter = useMemo(
    () => filterCatalogItems(baseCatalogItems, searchQuery),
    [baseCatalogItems, searchQuery]
  );

  const voiceCatalogItems = useMemo((): VoiceCatalogItem[] => {
    const productsDeduped = buildScanCatalogItems(variants, productById);
    const list: VoiceCatalogItem[] = productsDeduped.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      type: 'PRODUCT',
      price: p.price,
      cost: p.cost,
      stock: p.stock,
    }));
    services?.forEach((s) => {
      list.push({
        id: s.id,
        name: s.name,
        sku: 'SRV',
        type: 'SERVICE',
        price: s.price,
        cost: 0,
        stock: null,
      });
    });
    return list;
  }, [variants, productById, services]);

  const scanCatalogItems = useMemo(
    () => buildScanCatalogItems(variants, productById),
    [variants, productById]
  );

  useEffect(() => {
    voiceCatalogRef.current = voiceCatalogItems;
  }, [voiceCatalogItems]);

  useEffect(() => {
    scanCatalogRef.current = scanCatalogItems;
  }, [scanCatalogItems]);

  /** Resolve barcode/SKU to a sellable catalog line (exact match). */
  const findItemByBarcode = (rawCode: string) => {
    const code = rawCode.trim().toLowerCase();
    if (!code) return null;
    const matches = scanCatalogRef.current.filter(
      (item) => (item.sku || '').trim().toLowerCase() === code || (item.barcode || '').trim().toLowerCase() === code
    );
    if (matches.length === 0) return null;
    const inStock = matches.find(
      (m) => m.type !== 'PRODUCT' || m.stock == null || m.stock > 0
    );
    return inStock || matches[0];
  };

  const addCatalogLineToCart = (item: {
    id: string;
    name: string;
    price: number;
    cost: number;
    type: 'PRODUCT' | 'SERVICE';
    stock: number | null;
  }) => {
    if (item.type === 'PRODUCT' && item.stock != null && item.stock <= 0) {
      addNotificationRef.current(
        'WARNINGS',
        'نفد المخزون',
        `${item.name} غير متاح حالياً.`
      );
      return false;
    }
    addItemRef.current({
      itemId: item.id,
      type: item.type,
      name: item.name,
      price: item.price,
      listPrice: item.price,
      cost: item.cost,
      ...(item.type === 'PRODUCT' && item.stock != null
        ? { stockQuantity: item.stock, maxStock: item.stock }
        : {}),
    });
    return true;
  };

  const handleCatalogCardSelect = useCallback((item: PosCatalogLine) => {
    addItem({
      itemId: item.id,
      type: item.type,
      name: item.name,
      price: item.price,
      listPrice: item.price,
      cost: item.cost,
      ...(item.type === 'PRODUCT' && item.stock != null
        ? { stockQuantity: item.stock, maxStock: item.stock }
        : {}),
    });
  }, [addItem]);

  /** Instant add by barcode/SKU — no picking from search results. */
  const handleBarcodeScan = (rawCode: string, opts?: { silentIfMissing?: boolean }): boolean => {
    const code = rawCode.trim();
    if (!code) return false;
    const item = findItemByBarcode(code);
    if (!item) {
      if (!opts?.silentIfMissing) {
        addNotificationRef.current(
          'WARNINGS',
          'باركود غير معروف',
          `لم يتم العثور على صنف بالكود: ${code}`
        );
      }
      return false;
    }
    const ok = addCatalogLineToCart(item);
    if (ok) {
      addNotificationRef.current('INVENTORY', 'تمت الإضافة بالمسح', item.name);
      setSearchQuery('');
      setScanArmed(true);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
    return ok;
  };

  const armBarcodeScan = () => {
    setScanArmed(true);
    setSearchQuery('');
    clearScanBufferRef.current();
    searchInputRef.current?.focus();
  };

  const { clearScanBuffer } = useBarcodeWedgeListener({
    enabled: !!activeSession,
    scanArmed,
    searchInputRef,
    onArmScan: armBarcodeScan,
    onScan: handleBarcodeScan,
    onSetPaymentMethod: setPaymentMethod,
    onClearCart: clearCart,
  });
  clearScanBufferRef.current = clearScanBuffer;

  // Ready to scan when session opens (no need to click the search bar first)
  useEffect(() => {
    if (!activeSession) {
      setScanArmed(false);
      return;
    }
    const t = window.setTimeout(() => {
      const ae = document.activeElement as HTMLElement | null;
      const tag = ae?.tagName?.toLowerCase();
      const typingElsewhere =
        tag === 'input' || tag === 'textarea' || tag === 'select' || ae?.isContentEditable;
      if (!typingElsewhere) {
        setScanArmed(true);
        searchInputRef.current?.focus();
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [activeSession]);

  useEffect(() => {
    addItemRef.current = addItem;
    updateQuantityRef.current = updateQuantity;
    cartItemsRef.current = cartItems;
    addNotificationRef.current = addNotification;
  }, [addItem, updateQuantity, cartItems, addNotification]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const applyVoiceTranscript = (transcript: string) => {
    const text = transcript.trim();
    if (!text) return;

    const matches = matchSpokenCatalog(text, voiceCatalogRef.current);
    if (matches.length === 0) {
      addNotificationRef.current(
        'WARNINGS',
        'No product matched',
        `Heard: “${text}” — say an English catalog name (e.g. “cat food”).`
      );
      return;
    }

    const names: string[] = [];
    for (const m of matches) {
      const existing = cartItemsRef.current.find(
        (c) => c.itemId === m.item.id && c.type === m.item.type
      );
      if (existing) {
        const maxStock =
          m.item.type === 'PRODUCT' ? (m.item.stock ?? undefined) : undefined;
        const nextQty = existing.quantity + m.quantity;
        if (maxStock != null && nextQty > maxStock) {
          addNotificationRef.current(
            'WARNINGS',
            'Stock exceeded',
            `${m.item.name}: available ${maxStock}`
          );
          updateQuantityRef.current(m.item.id, m.item.type, maxStock);
        } else {
          updateQuantityRef.current(m.item.id, m.item.type, nextQty);
        }
      } else {
        for (let i = 0; i < m.quantity; i++) {
          addItemRef.current({
            itemId: m.item.id,
            type: m.item.type,
            name: m.item.name,
            price: m.item.price,
            listPrice: m.item.price,
            cost: m.item.cost,
            ...(m.item.type === 'PRODUCT' && m.item.stock != null
              ? { stockQuantity: m.item.stock, maxStock: m.item.stock }
              : {}),
          });
        }
      }
      names.push(m.quantity > 1 ? `${m.item.name} ×${m.quantity}` : m.item.name);
    }

    addNotificationRef.current(
      'INVENTORY',
      'Added by voice',
      names.join(' · ')
    );
    setSearchQuery('');
    if (selectedCategory === 'INVOICES') {
      setSelectedCategory('ALL');
    }
  };

  const toggleVoiceInput = () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      addNotification(
        'WARNINGS',
        'Voice not supported',
        'This browser does not support speech recognition. Use Chrome or the Electron app.'
      );
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceTranscript('');
    };

    recognition.onerror = (ev) => {
      setIsListening(false);
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        addNotification(
          'WARNINGS',
          'Microphone blocked',
          'Allow microphone access in browser settings, then try again.'
        );
      } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        addNotification('WARNINGS', 'Voice error', `Recognition failed: ${ev.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onresult = (event) => {
      let interim = '';
      const finals: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          for (let a = 0; a < result.length; a++) {
            const piece = result[a]?.transcript?.trim();
            if (piece) finals.push(piece);
          }
        } else {
          interim += result[0]?.transcript || '';
        }
      }
      if (interim) setVoiceTranscript(interim);
      if (finals.length > 0) {
        setVoiceTranscript(finals[0]);
        let matched = false;
        for (const alt of finals) {
          const matches = matchSpokenCatalog(alt, voiceCatalogRef.current);
          if (matches.length > 0) {
            applyVoiceTranscript(alt);
            matched = true;
            break;
          }
        }
        if (!matched) {
          applyVoiceTranscript(finals[0]);
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      addNotification('WARNINGS', 'Could not start voice', 'Try again in a moment.');
      setIsListening(false);
    }
  };

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
              label="العهدة النقدية الافتتاحية (ج.م)"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              placeholder="150.00"
            />
            
            <Button onClick={handleStartShift} variant="primary" style={{ width: '100%' }}>
              فتح الدرج وبدء نقطة البيع
            </Button>

            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 'var(--spacing-1) 0' }} />

            <Button 
              onClick={() => {
                setLogoutAfterCloseShift(false);
                localStorage.removeItem('token');
                setCurrentEmployee(null);
                setAuthenticated(false);
              }} 
              variant="ghost" 
              style={{ width: '100%', color: 'var(--color-danger)', fontWeight: 'bold' }}
            >
              تسجيل الخروج من الحساب
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
          <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search 
                size={16} 
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} 
              />
              <Input
                ref={searchInputRef}
                placeholder={
                  scanArmed
                    ? 'جاهز للمسح — امسح الباركود أو اكتب الكود ثم Enter'
                    : 'ابحث بالاسم… أو اضغط سلة المشتريات للمسح'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setScanArmed(true)}
                onBlur={() => {
                  // Keep armed if focus moves to cart empty area; disarm when leaving POS fields
                  window.setTimeout(() => {
                    if (document.activeElement !== searchInputRef.current) {
                      /* stay armed so wedge scanner still works after click empty cart */
                    }
                  }, 0);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const code = searchQuery.trim();
                  if (!code) return;

                  // 1) Exact barcode/SKU → add instantly (no clicking a product card)
                  if (handleBarcodeScan(code, { silentIfMissing: true })) return;

                  // 2) Name search: if exactly one visible result, add it
                  if (selectedCategory !== 'INVOICES' && catalogItemsForEnter.length === 1) {
                    const only = catalogItemsForEnter[0];
                    if (only.type === 'PRODUCT' && only.stock != null && only.stock <= 0) {
                      addNotification('WARNINGS', 'نفد المخزون', only.name);
                      return;
                    }
                    addCatalogLineToCart(only);
                    addNotification('INVENTORY', 'تمت الإضافة', only.name);
                    setSearchQuery('');
                    setScanArmed(true);
                    requestAnimationFrame(() => searchInputRef.current?.focus());
                    return;
                  }

                  // 3) Looks like a barcode but unknown
                  const looksLikeCode = /^[a-z0-9][a-z0-9\-_/]*$/i.test(code) && !/\s/.test(code) && code.length >= 3;
                  if (looksLikeCode) {
                    addNotification('WARNINGS', 'باركود غير معروف', `لم يتم العثور على صنف بالكود: ${code}`);
                    setSearchQuery('');
                  }
                }}
                style={{
                  paddingLeft: '32px',
                  boxShadow: scanArmed ? '0 0 0 2px rgba(34, 197, 94, 0.35)' : undefined,
                }}
              />
            </div>
            <Button
              type="button"
              variant={isListening ? 'danger' : 'primary'}
              onClick={toggleVoiceInput}
              title={isListening ? 'Stop voice input' : 'Voice add — speak English product names'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap',
                minWidth: '110px',
                boxShadow: isListening ? '0 0 0 2px rgba(239,68,68,0.35)' : undefined,
              }}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              {isListening ? 'Stop' : 'Voice'}
            </Button>
          </div>

          {isListening && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--color-danger)',
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 10px',
                direction: 'rtl',
              }}
            >
              <strong>Listening…</strong> English only — say what you mean naturally
              (e.g. “I need cat food and two dog shampoo”).
              {voiceTranscript ? (
                <div style={{ marginTop: '4px', color: 'var(--color-text-primary)' }}>
                  Heard: “{voiceTranscript}”
                </div>
              ) : null}
            </div>
          )}

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
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          {selectedCategory === 'INVOICES' ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', width: '100%', direction: 'rtl' }}>
              <h3 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', margin: '0 0 var(--spacing-2) 0', color: 'var(--color-text-secondary)' }}>سجل الفواتير (انقر على الفاتورة لفتحها ومعاينتها)</h3>
              {filteredSalesInPOS.slice(0, visibleInvoicesLimit).map((s) => {
                const isRefunded = s.status === 'REFUNDED';
                return (
                  <div 
                    key={s.id} 
                    onClick={() => setActiveReceipt(s)}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--spacing-3)',
                      backgroundColor: 'var(--color-surface)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 'var(--spacing-4)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-primary)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-3)' }}>
                      <strong style={{ fontSize: 'var(--font-size-sm)' }}>{formatMoney(s.totalAmount)}</strong>
                      {!isRefunded && canRefundSales && (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (needsManagerApprovalForRefund(hasPermission)) {
                              addNotification('WARNINGS', 'صلاحية غير كافية', 'يلزم موافقة المدير لإرجاع الفواتير.');
                              return;
                            }
                            setRefundTarget(s);
                          }}
                          variant="danger"
                          size="sm"
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          إرجاع
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              
              {filteredSalesInPOS.length > visibleInvoicesLimit && (
                <Button 
                  onClick={() => setVisibleInvoicesLimit(prev => prev + 10)}
                  variant="secondary"
                  size="sm"
                  style={{ width: '100%', marginTop: 'var(--spacing-2)' }}
                >
                  عرض المزيد من الفواتير ({filteredSalesInPOS.length - visibleInvoicesLimit} متبقية)
                </Button>
              )}
            </div>
            </div>
          ) : (
            <PosVirtualCatalogGrid items={catalogItems} onSelect={handleCatalogCardSelect} />
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
            <span
              style={{ fontWeight: 'bold', cursor: 'pointer' }}
              onClick={armBarcodeScan}
              title="اضغط للتجهيز لمسح الباركود"
            >
              السلة الحالية ({cartItems.length})
            </span>
          </div>
          <Button onClick={() => setShowCloseShiftModal(true)} variant="danger" size="sm">
            إغلاق الوردية (جرد النقدية)
          </Button>
        </div>

        {/* Scrollable list of cart items */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}
          onClick={(e) => {
            // Click empty space in cart → ready for next barcode (no search-bar hunt)
            if (e.target === e.currentTarget) armBarcodeScan();
          }}
        >
          {cartItems.length === 0 ? (
            <button
              type="button"
              onClick={armBarcodeScan}
              style={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-secondary)',
                background: scanArmed ? 'rgba(34, 197, 94, 0.06)' : 'transparent',
                border: scanArmed
                  ? '2px dashed rgba(34, 197, 94, 0.55)'
                  : '2px dashed var(--color-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                padding: 'var(--spacing-6)',
                minHeight: '180px',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              title="اضغط مرة واحدة ثم امسح الباركود لإضافة المنتج مباشرة"
            >
              <ShoppingCart size={48} style={{ opacity: 0.35, marginBottom: 'var(--spacing-2)' }} />
              <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                سلة المشتريات فارغة
              </span>
              <span style={{ marginTop: '8px', fontSize: '12px', textAlign: 'center', lineHeight: 1.5, maxWidth: '220px' }}>
                {scanArmed
                  ? 'جاهز للمسح — امسح الباركود الآن وسيُضاف المنتج فوراً'
                  : 'اضغط هنا مرة واحدة، ثم امسح الباركود — المنتج يُضاف مباشرة بدون اختيار من البحث'}
              </span>
            </button>
          ) : (
            cartItems.map(item => {
              const listPrice = item.listPrice ?? item.price;
              const minAllowed = minAllowedSalePrice(listPrice);
              const adjustment = formatPriceAdjustment(item.price, listPrice);
              const priceChanged = Math.abs(item.price - listPrice) > 0.001;
              return (
              <div 
                key={`${item.type}-${item.itemId}`}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                      السعر الأساسي: {formatMoney(listPrice)}
                      {priceChanged && (
                        <span style={{ color: item.price > listPrice ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>
                          {' '}· بيع: {formatMoney(item.price)} ({adjustment} ج.م)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
                      الحد الأدنى: {formatMoney(minAllowed)} (خصم {MAX_POS_PRICE_DISCOUNT_PERCENT}% كحد أقصى)
                    </div>
                  </div>
                  <button 
                    onClick={() => removeItem(item.itemId, item.type)}
                    className="btn-ghost" 
                    style={{ color: 'var(--color-danger)', border: 'none', padding: '4px' }}
                    title="حذف من السلة"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    سعر البيع
                    <CartLinePriceInput
                      itemId={item.itemId}
                      type={item.type}
                      price={item.price}
                      listPrice={listPrice}
                      minAllowedPrice={minAllowed}
                      isElevated={elevatedSalesPrivileges}
                      onCommit={(id, t, p, opts) => updateUnitPrice(id, t, p, opts)}
                      onWarn={(msg) => addNotification('WARNINGS', 'تعديل السعر', msg)}
                      onRequireManagerApproval={handleRequireManagerPriceApproval}
                    />
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)', marginRight: 'auto' }}>
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
                      onClick={() => {
                        const maxStock = item.stockQuantity ?? variants?.find(v => v.id === item.itemId)?.stockQuantity;
                        const nextQty = item.quantity + 1;
                        if (item.type === 'PRODUCT' && typeof maxStock === 'number' && nextQty > maxStock) {
                          addNotification('WARNINGS', 'تجاوز المخزون', `الكمية المتاحة لهذا الصنف: ${maxStock}`);
                          return;
                        }
                        updateQuantity(item.itemId, item.type, nextQty);
                      }}
                      className="btn-secondary"
                      style={{ padding: '2px 8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
                    >
                      +
                    </button>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', minWidth: '56px', textAlign: 'left' }}>
                      {formatMoney(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              </div>
              );
            })
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
            <div style={{ position: 'relative', flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <Input
                  placeholder="ابحث باسم العميل أو رقم الهاتف..."
                  value={custSearchQuery}
                  onChange={(e) => {
                    setCustSearchQuery(e.target.value);
                    setShowCustSuggestions(true);
                    if (!e.target.value) {
                      setCustomerId('');
                      setLoyaltyPercent(0);
                    }
                  }}
                  onFocus={() => setShowCustSuggestions(true)}
                  style={{ paddingLeft: selectedCustomer ? '30px' : '8px' }}
                />
                {selectedCustomer && (
                  <button
                    onClick={() => {
                      setCustomerId('');
                      setLoyaltyPercent(0);
                      setCustSearchQuery('');
                      setShowCustSuggestions(false);
                    }}
                    style={{
                      position: 'absolute',
                      left: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-secondary)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '4px'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Customer Notes Banner — shown immediately after selecting a customer with notes */}
              {selectedCustomer?.notes && (
                <div style={{
                  marginTop: '6px',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  direction: 'rtl',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#92400e', marginBottom: '2px' }}>
                      ملاحظة على العميل:
                    </div>
                    <div style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.4' }}>
                      {selectedCustomer.notes}
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestion Dropdown List */}
              {showCustSuggestions && custSearchQuery && customerSuggestions.length > 0 && (
                <div 
                  ref={suggestionsRef}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    width: '100%',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 50,
                    maxHeight: '180px',
                    overflowY: 'auto',
                    direction: 'rtl',
                    marginBottom: '4px'
                  }}
                >
                  {customerSuggestions.map(cust => (
                    <div
                      key={cust.id}
                      onClick={() => {
                        if (cust.isBanned) {
                          addNotification('WARNINGS', 'عميل محظور', `لا يمكن اختيار العميل ${cust.name} لأنه محظور.`);
                          setCustomerId('');
                          setLoyaltyPercent(0);
                          setCustSearchQuery('');
                          setShowCustSuggestions(false);
                          return;
                        }
                        setCustomerId(cust.id);
                        setLoyaltyPercent(Number(cust.discount) || 0);
                        setCustSearchQuery(`${cust.name} (${cust.phone})`);
                        setShowCustSuggestions(false);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-xs)',
                        borderBottom: '1px solid var(--color-border)',
                        textAlign: 'right',
                        transition: 'background-color var(--transition-fast)'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ fontWeight: 'bold' }}>{cust.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        📞 {cust.phone}
                        {cust.isBanned && <span style={{ color: '#ef4444', marginRight: '6px', fontWeight: 700 }}> ⛔ محظور</span>}
                      </div>
                      {cust.notes && (
                        <div style={{
                          fontSize: '10px',
                          marginTop: '4px',
                          padding: '3px 6px',
                          backgroundColor: 'rgba(245,158,11,0.15)',
                          borderRight: '2px solid #f59e0b',
                          borderRadius: '4px',
                          color: '#92400e',
                          direction: 'rtl',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '220px',
                        }}>
                          ⚠️ {cust.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Empty suggestion state */}
              {showCustSuggestions && custSearchQuery && customerSuggestions.length === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    width: '100%',
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 50,
                    padding: '12px',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    direction: 'rtl',
                    marginBottom: '4px',
                    textAlign: 'center'
                  }}
                >
                  ⚠️ لم يتم العثور على عملاء مطابقين
                </div>
              )}
            </div>
            <Button onClick={() => setShowAddCustomerModal(true)} variant="secondary" size="sm" title="إضافة عميل جديد">
              <UserPlus size={16} />
            </Button>
          </div>

          {/* Discount Field — max 10% */}
          {canApplyDiscount && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  خصم الكاشير (%)
                </span>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step="0.5"
                  value={discountPercent || ''}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    if (!Number.isFinite(raw) || raw < 0) {
                      setDiscountPercent(0);
                      return;
                    }
                    if (raw > 10) {
                      addNotification('WARNINGS', 'حد الخصم', 'نسبة خصم الكاشير لا تتجاوز 10% من إجمالي الفاتورة.');
                      setDiscountPercent(10);
                      return;
                    }
                    setDiscountPercent(raw);
                  }}
                  placeholder="0"
                  style={{ padding: '4px var(--spacing-2)', maxWidth: '100px' }}
                />
                <span style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>حد أقصى 10%</span>
              </div>
              {totals.manualDiscount > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  قيمة الخصم اليدوي: {formatMoney(totals.manualDiscount)}
                  {totals.loyaltyDiscount > 0 ? ` + ولاء: ${formatMoney(totals.loyaltyDiscount)}` : ''}
                </div>
              )}
            </div>
          )}

          {/* Pricing Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--spacing-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>المجموع الفرعي</span>
              <span>{formatMoney(totals.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>الخصم</span>
              <span>{formatMoney(-totals.discount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: '4px', marginTop: '4px' }}>
              <span>المجموع الكلي</span>
              <span>{formatMoney(totals.total)}</span>
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
        title={activeReceipt ? `معاينة وتدقيق الفاتورة ${activeReceipt.saleNumber}` : "معاينة الفاتورة"}
        maxWidth="920px"
        footer={
          <div style={{ display: 'flex', gap: '8px', width: '100%', direction: 'rtl' }}>
            {canPrintA4 && (
              <Button onClick={() => printReceipt(activeReceipt)} variant="secondary" style={{ flex: 1 }}>
                <Printer size={14} /> طباعة الفاتورة
              </Button>
            )}
            <Button onClick={() => setActiveReceipt(null)} variant="primary" style={{ flex: 1 }}>
              فتح سلة جديدة (إغلاق)
            </Button>
          </div>
        }
      >
        {activeReceipt && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            {/* Modal Toolbar (Requirement 7) */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              gap: '6px',
              flexWrap: 'wrap',
              direction: 'rtl'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <Button 
                  onClick={handlePrevReceipt} 
                  disabled={activeReceiptIndex <= 0} 
                  variant="secondary" 
                  size="sm"
                  style={{ padding: '3px 8px', fontSize: '10px' }}
                  title="الفاتورة السابقة"
                >
                  ◀ السابق
                </Button>
                <Button 
                  onClick={handleNextReceipt} 
                  disabled={activeReceiptIndex === -1 || activeReceiptIndex >= filteredSalesInPOS.length - 1}
                  variant="secondary" 
                  size="sm"
                  style={{ padding: '3px 8px', fontSize: '10px' }}
                  title="الفاتورة التالية"
                >
                  التالي ▶
                </Button>
              </div>

              {/* Quick Search inside modal */}
              <div style={{ position: 'relative', width: '130px' }}>
                <Search size={10} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
                <input 
                  type="text" 
                  placeholder="رقم الفاتورة + Enter..." 
                  style={{ padding: '3px 6px 3px 20px', fontSize: '9px', width: '100%', direction: 'ltr', textAlign: 'right' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const query = e.currentTarget.value.trim().toUpperCase();
                      if (query) {
                        const found = filteredSalesInPOS.find(s => s.saleNumber.includes(query) || s.id.includes(query));
                        if (found) {
                          setActiveReceipt(found);
                          e.currentTarget.value = '';
                        } else {
                          alert('لم يتم العثور على الفاتورة!');
                        }
                      }
                    }
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                {canPrintThermal && (
                  <button 
                    onClick={() => {
                      addNotification('FINANCE', 'طباعة حرارية', `إيصال حراري للفاتورة ${activeReceipt.saleNumber}`);
                      printThermal(activeReceipt);
                    }}
                    className="btn-secondary" 
                    style={{ padding: '4px 6px', fontSize: '10px' }}
                  >
                    🖨 حراري
                  </button>
                )}
                {canPrintA4 && (
                  <button 
                    onClick={() => printReceipt(activeReceipt)}
                    className="btn-secondary" 
                    style={{ padding: '4px 6px', fontSize: '10px' }}
                  >
                    🖨 A4
                  </button>
                )}
                <button 
                  onClick={() => {
                    addNotification('WARNINGS', 'غير متاح بعد', 'تصدير PDF غير متاح بعد.');
                  }}
                  className="btn-secondary" 
                  style={{ padding: '4px 6px', fontSize: '10px' }}
                >
                  📄 PDF
                </button>
                {activeReceipt.status !== 'REFUNDED' && canRefundSales && (
                  <button 
                    onClick={() => {
                      if (needsManagerApprovalForRefund(hasPermission)) {
                        addNotification('WARNINGS', 'صلاحية غير كافية', 'يلزم موافقة المدير لإرجاع الفواتير.');
                        return;
                      }
                      setRefundTarget(activeReceipt);
                    }}
                    className="btn-danger" 
                    style={{ padding: '4px 6px', fontSize: '10px', color: '#fff' }}
                  >
                    ↩ {activeReceipt.status === 'PARTIALLY_REFUNDED' ? 'إكمال الإرجاع' : 'Refund'}
                  </button>
                )}
              </div>
            </div>

            {Array.isArray(receiptBatchAllocations) && receiptBatchAllocations.length > 0 && (
              <div style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-2)',
                backgroundColor: 'var(--color-surface)',
                direction: 'rtl',
                fontSize: '11px',
              }}>
                <strong style={{ display: 'block', marginBottom: '6px' }}>تخصيص الدفعات (FIFO/FEFO) و COGS</strong>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'right', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '4px' }}>الصنف</th>
                      <th style={{ padding: '4px' }}>Batch</th>
                      <th style={{ padding: '4px' }}>الكمية</th>
                      <th style={{ padding: '4px' }}>تكلفة الوحدة</th>
                      <th style={{ padding: '4px' }}>COGS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(receiptBatchAllocations as SaleBatchAllocationRow[]).map((row, idx) => (
                      <tr key={`${row.saleItemId}-${row.inventoryBatchId}-${idx}`}>
                        <td style={{ padding: '4px' }}>{row.productName}</td>
                        <td style={{ padding: '4px', direction: 'ltr' }}>{row.batchNumber || row.inventoryBatchId}</td>
                        <td style={{ padding: '4px' }}>{row.quantityAllocated}</td>
                        <td style={{ padding: '4px' }}>{formatMoney(Number(row.unitCostAtSale || 0))}</td>
                        <td style={{ padding: '4px' }}>{formatMoney(Number(row.totalAllocatedCost || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Branded Amazon Pet invoice preview */}
            <div style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              backgroundColor: '#fff',
              height: '70vh',
              minHeight: '420px',
            }}>
              <iframe
                title="Amazon Pet Invoice Preview"
                srcDoc={receiptPreviewHtml}
                style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              />
            </div>
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
              <strong>{formatMoney(expectedCashBalance)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
              <span>عهدة البداية النقدي:</span>
              <span>{formatMoney(activeSession.openingBalance)}</span>
            </div>
          </div>

          <Input
            label="إجمالي النقد الفعلي الذي تم جردة في الدرج (ج.م)"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </Modal>

      {/* 3. QUICK CUSTOMER REGISTRATION MODAL */}
      <Modal
        isOpen={showAddCustomerModal}
        onClose={() => setShowAddCustomerModal(false)}
        title="إضافة عميل وحيوان أليف جديد للمبيعات السريعة"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowAddCustomerModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleAddCustomer} disabled={addingCustomer} variant="primary">تأكيد وحفظ العميل</Button>
          </div>
        }
        maxWidth="500px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', direction: 'rtl', textAlign: 'right' }}>
          <h5 style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', margin: 0 }}>بيانات العميل:</h5>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input
              label="اسم العميل (ثلاثي)*"
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="مثال: أحمد محمد علي"
            />
            <Input
              label="رقم الهاتف المحمول*"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="مثال: 01001234567"
            />
          </div>
          
          <Input
            label="البريد الإلكتروني (اختياري)"
            type="email"
            value={newCustEmail}
            onChange={(e) => setNewCustEmail(e.target.value)}
            placeholder="مثال: email@example.com"
          />

          <h5 style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', borderBottom: '1px solid var(--color-border)', paddingBottom: '6px', margin: '8px 0 0 0' }}>بيانات أليف العميل (اختياري للربط السريع):</h5>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input
              label="اسم الأليف"
              value={newPetName}
              onChange={(e) => setNewPetName(e.target.value)}
              placeholder="مثال: بوبي / ريكس"
            />
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)' }}>نوع الأليف</label>
              <select
                value={newPetSpecies}
                onChange={(e) => setNewPetSpecies(e.target.value)}
                style={{ width: '100%', height: '36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', padding: '0 8px' }}
              >
                <option value="DOG">كلب (Dog)</option>
                <option value="CAT">قطة (Cat)</option>
                <option value="BIRD">طائر (Bird)</option>
                <option value="OTHER">آخر (Other)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Input
              label="السلالة"
              value={newPetBreed}
              onChange={(e) => setNewPetBreed(e.target.value)}
              placeholder="مثال: جيرمن / شيراز"
            />
            <Input
              label="العمر (بالسنوات)"
              type="number"
              value={newPetAge}
              onChange={(e) => setNewPetAge(e.target.value)}
              placeholder="1"
            />
          </div>
        </div>
      </Modal>

      {/* 4. REFUND CONFIRMATION MODAL */}
      <Modal
        isOpen={refundTarget !== null}
        onClose={() => setRefundTarget(null)}
        title="تأكيد إرجاع الفاتورة"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setRefundTarget(null)} variant="secondary">إلغاء</Button>
            <Button
              onClick={() => {
                if (!refundTarget) return;
                const lines = Object.entries(refundQuantities)
                  .filter(([, qty]) => qty > 0)
                  .map(([saleItemId, quantity]) => ({ saleItemId, quantity }));
                if (lines.length === 0) {
                  addNotification('WARNINGS', 'إرجاع', 'حدد كمية واحدة على الأقل للإرجاع.');
                  return;
                }
                triggerRefund(
                  { saleId: refundTarget.id, employeeId: currentEmployee.id, lines },
                  {
                    onSuccess: (result) => {
                      const updatedStatus = result?.sale?.status || 'REFUNDED';
                      if (activeReceipt?.id === refundTarget.id) {
                        setActiveReceipt({ ...activeReceipt, status: updatedStatus, items: result?.sale?.items ?? activeReceipt.items });
                      }
                      setRefundTarget(null);
                    },
                  }
                );
              }}
              variant="danger"
            >
              تأكيد الإرجاع
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', fontSize: 'var(--font-size-sm)', direction: 'rtl' }}>
          <p>
            اختر الكميات المراد إرجاعها للفاتورة{' '}
            <strong>{refundTarget?.saleNumber}</strong>
            {refundTarget?.status === 'PARTIALLY_REFUNDED' && (
              <Badge variant="warning" style={{ marginRight: '8px' }}>مرتجع جزئي سابق</Badge>
            )}
          </p>
          {refundTarget?.items?.filter((i: any) => (i.type || 'PRODUCT') === 'PRODUCT').map((item: any) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--spacing-2)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                  sold: {item.quantity} × {formatMoney(Number(item.price || 0))}
                </div>
              </div>
              <Input
                type="number"
                min={0}
                max={Number(item.quantity) || 0}
                value={String(refundQuantities[item.id] ?? 0)}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(Number(item.quantity) || 0, parseInt(e.target.value, 10) || 0));
                  setRefundQuantities(prev => ({ ...prev, [item.id]: v }));
                }}
                style={{ width: '72px' }}
              />
            </div>
          ))}
          {refundTarget && (
            <div style={{
              padding: 'var(--spacing-2)',
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 'bold'
            }}>
              تقدير المرتجع:{' '}
              {formatMoney(
                (refundTarget.items || [])
                  .filter((i: any) => (i.type || 'PRODUCT') === 'PRODUCT')
                  .reduce((acc: number, i: any) => {
                    const q = refundQuantities[i.id] ?? 0;
                    return acc + q * (Number(i.price) || 0);
                  }, 0)
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showPriceManagerModal}
        onClose={() => {
          setShowPriceManagerModal(false);
          setPendingPriceChange(null);
        }}
        title="موافقة المدير — تخفيض السعر"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              onClick={() => {
                setShowPriceManagerModal(false);
                setPendingPriceChange(null);
              }}
              variant="secondary"
            >
              إلغاء
            </Button>
            <Button onClick={handlePriceManagerAuthSubmit} variant="danger">
              تأكيد الرمز
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-warning-light)',
            color: 'var(--color-warning)',
            padding: 'var(--spacing-2)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)',
          }}>
            <AlertTriangle size={16} />
            <span>
              السعر المطلوب ({pendingPriceChange ? formatMoney(pendingPriceChange.price) : '—'})
              أقل من الحد الأدنى المسموح للكاشير (خصم {MAX_POS_PRICE_DISCOUNT_PERCENT}%).
              {pendingPriceChange?.itemName ? ` — ${pendingPriceChange.itemName}` : ''}
            </span>
          </div>
          <Input
            label="رمز المدير أو المالك"
            type="password"
            value={priceManagerCode}
            onChange={(e) => setPriceManagerCode(e.target.value)}
            placeholder="••••"
            style={{ textAlign: 'center', letterSpacing: '4px' }}
          />
        </div>
      </Modal>

      <Modal
        isOpen={showCheckoutManagerModal}
        onClose={() => setShowCheckoutManagerModal(false)}
        title="موافقة المدير — إتمام البيع"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowCheckoutManagerModal(false)} variant="secondary">
              إلغاء
            </Button>
            <Button onClick={handleCheckoutManagerAuthSubmit} variant="danger" disabled={checkingOut}>
              {checkingOut ? 'جارٍ البيع...' : 'تأكيد وإتمام البيع'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-warning-light)',
            color: 'var(--color-warning)',
            padding: 'var(--spacing-2)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-xs)',
          }}>
            <AlertTriangle size={16} />
            <span>
              توجد أصناف بأسعار أقل من الحد الأدنى ({MAX_POS_PRICE_DISCOUNT_PERCENT}% خصم).
              يلزم رمز المدير لإتمام البيع.
            </span>
          </div>
          <ul style={{ fontSize: 'var(--font-size-xs)', margin: 0, paddingRight: '16px' }}>
            {cartItems
              .filter((item) => isBelowMinAllowedSalePrice(item.price, item.listPrice ?? item.price))
              .map((item) => (
              <li key={`${item.type}-${item.itemId}`}>
                {item.name}: {formatMoney(item.price)} (أساسي {formatMoney(item.listPrice ?? item.price)})
              </li>
            ))}
          </ul>
          <Input
            label="رمز المدير أو المالك"
            type="password"
            value={checkoutManagerCode}
            onChange={(e) => setCheckoutManagerCode(e.target.value)}
            placeholder="••••"
            style={{ textAlign: 'center', letterSpacing: '4px' }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default POS;
