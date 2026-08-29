import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCartStore } from '../../core/stores/cartStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useUIStore } from '../../core/stores/uiStore';
import { logout } from '../../core/auth/logout';
import {
  useVariants, useProducts, useServices,
  useCustomers, useCreateSale, useSales, useRefundSale, useAddCustomer,
  useExpenses, useLoyaltyAccount, useLoyaltySettings, useSetLoyaltyProgramOpen
} from '../../core/hooks/useERPData';
import {
  Search, Trash2, ShoppingCart,
  UserPlus, DollarSign, CreditCard, Smartphone, Printer, Mic, MicOff, AlertTriangle, Truck
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { formatMoney } from '../../core/utils/money';
import { levenshteinDistance } from '../../core/utils/productMatcher';
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
  const loyaltyRedeemAmount = useCartStore(s => s.loyaltyRedeemAmount);
  const setLoyaltyRedeemAmount = useCartStore(s => s.setLoyaltyRedeemAmount);
  const paymentMethod = useCartStore(s => s.paymentMethod);
  const setPaymentMethod = useCartStore(s => s.setPaymentMethod);
  const isSplitPayment = useCartStore(s => s.isSplitPayment);
  const setSplitPaymentEnabled = useCartStore(s => s.setSplitPaymentEnabled);
  const splitPayments = useCartStore(s => s.splitPayments);
  const setSplitPaymentLine = useCartStore(s => s.setSplitPaymentLine);
  const clearCart = useCartStore(s => s.clearCart);
  const getTotals = useCartStore(s => s.getTotals);
  const belowMinManagerPassword = useCartStore(s => s.belowMinManagerPassword);
  const setBelowMinManagerPassword = useCartStore(s => s.setBelowMinManagerPassword);
  const isDelivery = useCartStore(s => s.isDelivery);
  const setIsDelivery = useCartStore(s => s.setIsDelivery);
  const deliveryFee = useCartStore(s => s.deliveryFee);
  const setDeliveryFee = useCartStore(s => s.setDeliveryFee);
  const deliveryAddress = useCartStore(s => s.deliveryAddress);
  const setDeliveryAddress = useCartStore(s => s.setDeliveryAddress);

  const checkoutIdempotencyKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    checkoutIdempotencyKeyRef.current = crypto.randomUUID();
  }, [cartItems, customerId, paymentMethod, isSplitPayment, splitPayments, discountPercent, isDelivery, deliveryFee, deliveryAddress, loyaltyRedeemAmount]);

  // Queries & Mutations
  const { data: products } = useProducts();
  const { data: variants } = useVariants();
  const { data: services } = useServices();
  const { data: customers } = useCustomers();
  const { data: expenses } = useExpenses();
  const { data: loyaltySettings } = useLoyaltySettings();
  const { data: loyaltyAccount } = useLoyaltyAccount(customerId || null);
  const { mutate: toggleLoyaltyProgram, isPending: togglingLoyaltyProgram } = useSetLoyaltyProgramOpen();
  const canManageLoyalty = hasPermission(PERMISSIONS.CUSTOMERS_LOYALTY);
  const loyaltyBalance = loyaltyAccount?.balance ?? 0;
  const { mutate: executeSale, isPending: checkingOut } = useCreateSale();
  // Scope to "today" (not "since this session opened") so a cashier can still find
  // an invoice from earlier today after closing/reopening their register session.
  const todayStartIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const { data: salesPage } = useSales({
    page: 0,
    size: 100,
    sort: 'date,desc',
    ...(restrictedSalesScope ? { employee: currentEmployee.id } : {}),
    dateFrom: todayStartIso,
  });
  const sales = salesPage?.content;
  const { mutate: triggerRefund } = useRefundSale();

  // Quick Customer Creation
  const { mutate: createCustomer, isPending: addingCustomer } = useAddCustomer();
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEmail, setNewCustEmail] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
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
  const [isCopyingReceiptImage, setIsCopyingReceiptImage] = useState(false);

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
  const shiftReport = useMemo(() => {
    if (!activeSession) return null;
    const opening = activeSession.openingBalance || 0;
    const sessionOpenedAt = activeSession.openedAt
      ? new Date(activeSession.openedAt).getTime()
      : 0;

    let cashSalesTotal = 0;
    let cardSalesTotal = 0;
    let instapaySalesTotal = 0;
    let vodafoneSalesTotal = 0;
    let otherSalesTotal = 0;
    let deliveryOrdersCount = 0;
    let deliveryFeesTotal = 0;

    const getNetSaleAmount = (sale: any) => {
      if (sale.status === 'REFUNDED') return 0;
      if (sale.status !== 'PARTIALLY_REFUNDED') return sale.totalAmount || 0;

      let originalSubtotal = 0;
      let retainedSubtotal = 0;

      (sale.items || []).forEach((item: any) => {
        const price = Number(item.price) || 0;
        const qty = Number(item.quantity) || 0;
        const returnedQty = Number(item.quantityReturned) || 0;
        const retainedQty = Math.max(0, qty - returnedQty);

        originalSubtotal += price * qty;
        retainedSubtotal += price * retainedQty;
      });

      if (originalSubtotal === 0) return 0;

      const discount = Number(sale.discount) || 0;
      const tax = Number(sale.tax) || 0;

      const retainedDiscount = (discount * retainedSubtotal) / originalSubtotal;
      const retainedTax = (tax * retainedSubtotal) / originalSubtotal;

      return retainedSubtotal - retainedDiscount + retainedTax;
    };

    const addToBucket = (method: string, amount: number) => {
      if (method === 'CASH') cashSalesTotal += amount;
      else if (method === 'CARD') cardSalesTotal += amount;
      else if (method === 'INSTAPAY') instapaySalesTotal += amount;
      else if (method === 'VODAFONE_CASH') vodafoneSalesTotal += amount;
      else otherSalesTotal += amount;
    };

    (sales || []).forEach(sale => {
      if (sale.posSessionId === activeSession.id && sale.status !== 'REFUNDED') {
        const amt = getNetSaleAmount(sale);

        if (sale.paymentMethod === 'SPLIT' && Array.isArray(sale.payments) && sale.payments.length > 0) {
          const saleTotal = Number(sale.totalAmount) || 0;
          const retainedRatio = saleTotal > 0 ? amt / saleTotal : 0;
          sale.payments.forEach((payment: any) => {
            addToBucket(payment.method, (Number(payment.amount) || 0) * retainedRatio);
          });
        } else {
          addToBucket(sale.paymentMethod, amt);
        }

        if (sale.delivery) {
          deliveryOrdersCount += 1;
          deliveryFeesTotal += Number(sale.deliveryFee) || 0;
        }
      }
    });

    const cashRefundsTotal = 0; // Handled dynamically in getNetSaleAmount now

    const cashExpensesTotal = (expenses || [])
      .filter((exp) => {
        if (exp.paidFrom !== 'CASH') return false;
        const expTime = new Date(exp.date).getTime();
        return !sessionOpenedAt || expTime >= sessionOpenedAt;
      })
      .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    const expectedCashBalance = opening + cashSalesTotal - cashExpensesTotal;
    const totalSales = cashSalesTotal + cardSalesTotal + instapaySalesTotal + vodafoneSalesTotal + otherSalesTotal;

    return {
      opening,
      cashSalesTotal,
      cardSalesTotal,
      instapaySalesTotal,
      vodafoneSalesTotal,
      otherSalesTotal,
      totalSales,
      cashRefundsTotal,
      cashExpensesTotal,
      expectedCashBalance,
      deliveryOrdersCount,
      deliveryFeesTotal,
    };
  }, [activeSession, sales, expenses]);

  // Reset limit when query changes
  useEffect(() => {
    setVisibleInvoicesLimit(10);
  }, [searchQuery]);

  // How many characters an invoice number search is allowed to be "off by"
  // (typos or a missing character) before we give up and refuse to guess.
  const FUZZY_INVOICE_MAX_DISTANCE = 2;

  const invoiceSearchResult = useMemo(() => {
    if (!sales) return { list: [], fuzzy: false };
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

    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase().trim();
      if (restrictedSalesScope) {
        // Cashier must type/scan the exact invoice number - no browsing by
        // customer name/phone, which would otherwise list multiple invoices.
        const exact = list.filter(s => s.saleNumber.toLowerCase() === q);
        if (exact.length > 0) return { list: exact, fuzzy: false };

        // Allow for a small typo (1-2 characters off/missing). If more than
        // one invoice is that close, it's too ambiguous to guess - refuse
        // both rather than risk opening the wrong customer's invoice.
        const close = list.filter(s => levenshteinDistance(s.saleNumber.toLowerCase(), q) <= FUZZY_INVOICE_MAX_DISTANCE);
        return close.length === 1 ? { list: close, fuzzy: true } : { list: [], fuzzy: false };
      } else {
        list = list.filter(s =>
          s.saleNumber.toLowerCase().includes(q) ||
          (customers?.find(c => c.id === s.customerId)?.name || '').toLowerCase().includes(q) ||
          (customers?.find(c => c.id === s.customerId)?.phone || '').includes(q)
        );
      }
    }
    return { list, fuzzy: false };
  }, [sales, debouncedSearchQuery, customers, currentEmployee, restrictedSalesScope]);

  // The batch above only covers today. If the cashier typed an exact invoice
  // number that isn't in it, the invoice may just be older - fall back to an
  // unbounded lookup by that exact number (backend still scopes it to this
  // cashier's own sales, no fuzzy/browse matching for restricted roles).
  const trimmedInvoiceQuery = debouncedSearchQuery.trim();
  const needsOlderInvoiceLookup = restrictedSalesScope && !!trimmedInvoiceQuery && invoiceSearchResult.list.length === 0;
  const { data: olderInvoicePage, isFetching: searchingOlderInvoice } = useSales(
    { page: 0, size: 1, search: trimmedInvoiceQuery, employee: currentEmployee.id },
    { enabled: needsOlderInvoiceLookup }
  );

  const filteredSalesInPOS = useMemo(() => {
    if (!needsOlderInvoiceLookup) return invoiceSearchResult.list;
    return olderInvoicePage?.content ?? [];
  }, [invoiceSearchResult, needsOlderInvoiceLookup, olderInvoicePage]);

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

  // Auto-fill the delivery address from the selected customer's saved address —
  // only when the field is still empty, so it never overwrites a manual edit.
  useEffect(() => {
    if (isDelivery && !deliveryAddress && selectedCustomer?.address) {
      setDeliveryAddress(selectedCustomer.address);
    }
  }, [isDelivery, selectedCustomer]);

  // Filter customers by typed query
  const customerSuggestions = useMemo(() => {
    if (!customers) return [];
    const q = custSearchQuery.trim().toLowerCase();
    if (!q || q.includes('(')) return [];
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
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
        customerAddress: cust?.address,
        cashierName: currentEmployee.fullName || currentEmployee.username || 'Cashier',
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
  };

  const printThermal = (receipt: any) => {
    // Defensive check: ensure required fields exist
    if (!receipt || !receipt.saleNumber) {
      addNotification('WARNINGS', 'خطأ في الفاتورة', 'البيانات غير مكتملة للطباعة الحرارية.');
      return;
    }
    const cust = customers?.find((c) => c.id === receipt.customerId);
    try {
      printThermalReceipt(
        saleToInvoiceData({
          sale: receipt,
          customerName: cust?.name || 'Walk-in Customer',
          customerPhone: cust?.phone,
          customerAddress: cust?.address,
          cashierName: currentEmployee.fullName || currentEmployee.username || 'Cashier',
          branchName: 'Hadaeq El Ahram',
          resolveName: resolveInvoiceItemName,
        })
      );
    } catch (e) {
      console.error('Print thermal error:', e);
      addNotification('WARNINGS', 'فشل الطباعة الحرارية', e instanceof Error ? e.message : 'خطأ غير معروف');
    }
    // Reset receipt after attempt
    setActiveReceipt(null);
  };

  const receiptPreviewHtml = useMemo(() => {
    if (!activeReceipt) return '';
    const cust = customers?.find((c) => c.id === activeReceipt.customerId);
    return buildAmazonPetInvoiceHtml(
      saleToInvoiceData({
        sale: activeReceipt,
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone,
        customerAddress: cust?.address,
        cashierName: currentEmployee.fullName || currentEmployee.username || 'Cashier',
        branchName: 'Hadaeq El Ahram',
        resolveName: resolveInvoiceItemName,
      })
    );
  }, [activeReceipt, customers, currentEmployee, variants, products, services]);

  const copyReceiptAsImage = async () => {
    if (!activeReceipt || !receiptPreviewHtml || isCopyingReceiptImage) return;
    setIsCopyingReceiptImage(true);
    let renderFrame: HTMLIFrameElement | null = null;
    try {
      const { default: html2canvas } = await import('html2canvas');

      // Render the branded invoice HTML off-screen at a fixed A4 width so the
      // captured image looks the same regardless of the visible preview's size.
      renderFrame = document.createElement('iframe');
      renderFrame.style.position = 'fixed';
      renderFrame.style.top = '0';
      renderFrame.style.left = '-10000px';
      renderFrame.style.width = '800px';
      renderFrame.style.height = '1131px';
      renderFrame.style.border = 'none';
      document.body.appendChild(renderFrame);

      await new Promise<void>((resolve, reject) => {
        if (!renderFrame) return reject(new Error('تعذر تجهيز معاينة الفاتورة'));
        renderFrame.onload = () => resolve();
        renderFrame.srcdoc = receiptPreviewHtml;
      });

      const frameDoc = renderFrame.contentDocument;
      if (!frameDoc?.body) throw new Error('تعذر تجهيز معاينة الفاتورة');

      const canvas = await html2canvas(frameDoc.body, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
      });

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('تعذر إنشاء صورة الفاتورة');

      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        addNotification('FINANCE', 'تم نسخ صورة الفاتورة', `يمكنك الآن لصقها في واتساب أو أي تطبيق آخر — فاتورة ${activeReceipt.saleNumber}.`);
      } catch (clipboardErr) {
        // Clipboard image-write can be blocked by browser/OS permissions — fall back to a direct download.
        console.error('Clipboard write failed, falling back to download:', clipboardErr);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `فاتورة-${activeReceipt.saleNumber}.png`;
        link.click();
        URL.revokeObjectURL(url);
        addNotification('WARNINGS', 'تعذر النسخ للحافظة', 'تم تنزيل صورة الفاتورة بدلاً من ذلك.');
      }
    } catch (e) {
      console.error('Copy receipt image error:', e);
      addNotification('WARNINGS', 'فشل نسخ صورة الفاتورة', e instanceof Error ? e.message : 'خطأ غير معروف');
    } finally {
      if (renderFrame) document.body.removeChild(renderFrame);
      setIsCopyingReceiptImage(false);
    }
  };

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

    if (isDelivery && !deliveryAddress.trim()) {
      addNotification('WARNINGS', 'عنوان التوصيل مطلوب', 'أدخل عنوان التوصيل قبل إتمام طلب الدليفري.');
      return;
    }

    if (isSplitPayment) {
      const [first, second] = splitPayments;
      const sum = (first?.amount || 0) + (second?.amount || 0);
      if (Math.abs(sum - totals.total) > 0.01) {
        addNotification('WARNINGS', 'الدفع المقسم غير مكتمل', `مجموع طرق الدفع (${formatMoney(sum)}) لا يساوي إجمالي الفاتورة (${formatMoney(totals.total)}).`);
        return;
      }
      if (!first?.method || !second?.method || first.method === second.method) {
        addNotification('WARNINGS', 'طرق دفع غير صالحة', 'اختر طريقتي دفع مختلفتين للدفع المقسم.');
        return;
      }
    }

    const resolvedManagerPassword = managerPassword || belowMinManagerPassword || undefined;
    const saleData = {
      idempotencyKey: checkoutIdempotencyKeyRef.current,
      posSessionId: activeSession!.id,
      totalAmount: totals.total,
      tax: totals.tax,
      discount: totals.discount,
      paymentMethod,
      ...(isSplitPayment ? { payments: splitPayments } : {}),
      employeeId: currentEmployee.id,
      customerId: customerId || undefined,
      delivery: isDelivery,
      deliveryFee: isDelivery ? totals.deliveryFee : 0,
      deliveryAddress: isDelivery ? deliveryAddress.trim() : undefined,
      loyaltyRedeem: totals.loyaltyRedeemed,
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
        if (canPrintThermal || canPrintA4) {
          // Delay to ensure iframe is ready
          setTimeout(() => {
            try {
              printThermal(receipt);
            } catch (e) {
              console.error('Print receipt error:', e);
              addNotification('WARNINGS', 'فشل طباعة الفاتورة', e instanceof Error ? e.message : 'خطأ غير معروف');
            }
          }, 300);
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
      setLoyaltyRedeemAmount(0);
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
    if (!activeSession) {
      addNotification('WARNINGS', 'تنبيه', 'لا توجد وردية مفتوحة حالياً لإغلاقها.');
      setShowCloseShiftModal(false);
      return;
    }
    const cashCounted = parseFloat(countedCash) || 0;
    const safeExpected = shiftReport?.expectedCashBalance ?? cashCounted;

    try {
      await endSession(
        activeSession.id,
        cashCounted,
        safeExpected,
        cashCounted,
        currentEmployee.id
      );
      setShowCloseShiftModal(false);
      setCountedCash('');
      addNotification('WARNINGS', 'نجاح إغلاق الوردية', 'تم تسليم الجرد وإغلاق الوردية بنجاح.');

      if (logoutAfterCloseShift) {
        setLogoutAfterCloseShift(false);
        logout();
      }
    } catch (err: any) {
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
        email: newCustEmail,
        address: newCustAddress.trim() || undefined
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
          setLoyaltyRedeemAmount(0);
        }
        setShowAddCustomerModal(false);
        setNewCustName('');
        setNewCustPhone('');
        setNewCustEmail('');
        setNewCustAddress('');
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
                logout();
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
                  selectedCategory === 'INVOICES'
                    ? (restrictedSalesScope
                        ? 'اكتب أو امسح رقم الفاتورة المراد إرجاعها هنا...'
                        : 'ابحث برقم الفاتورة أو اسم العميل...')
                    : scanArmed
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
                  boxShadow: scanArmed && selectedCategory !== 'INVOICES' ? '0 0 0 2px rgba(34, 197, 94, 0.35)' : undefined,
                  border: selectedCategory === 'INVOICES' && restrictedSalesScope ? '1.5px solid var(--color-primary)' : undefined,
                  backgroundColor: selectedCategory === 'INVOICES' && restrictedSalesScope ? 'var(--color-primary-light, rgba(59,130,246,0.05))' : undefined,
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
              {restrictedSalesScope && !searchQuery.trim() ? (
                <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', backgroundColor: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)' }}>
                  <Search size={32} color="var(--color-primary)" style={{ marginBottom: 8, opacity: 0.8 }} />
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    برجاء كتابة أو مسح رقم الفاتورة
                  </div>
                  <div style={{ fontSize: '10px', marginTop: 4 }}>
                    أدخل رقم الفاتورة المراد إرجاعها في حقل البحث أعلى الشاشة لإظهار بياناتها.
                  </div>
                </div>
              ) : needsOlderInvoiceLookup && searchingOlderInvoice ? (
                <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', backgroundColor: 'var(--color-surface)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)' }}>
                  <Search size={32} color="var(--color-primary)" style={{ marginBottom: 8, opacity: 0.8 }} />
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    بيدور على الفاتورة...
                  </div>
                </div>
              ) : debouncedSearchQuery.trim() && filteredSalesInPOS.length === 0 ? (
                <div style={{ padding: 'var(--spacing-6)', textAlign: 'center', backgroundColor: 'var(--color-surface)', border: '1px dashed var(--color-danger)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)' }}>
                  <Search size={32} color="var(--color-danger)" style={{ marginBottom: 8, opacity: 0.8 }} />
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                    رقم الفاتورة اللي كتبته غلط أو ناقص
                  </div>
                  {restrictedSalesScope ? (
                    <div style={{ fontSize: '10px', marginTop: 4 }}>
                      تأكد إنك كتبت الرقم زي ما هو مطبوع بالظبط. البحث بيشمل فواتيرك انت بس (أي تاريخ) — لو الفاتورة عملها كاشير تاني، اطلب من المدير يفتحها من شاشة "الفواتير".
                    </div>
                  ) : (
                    <div style={{ fontSize: '10px', marginTop: 4 }}>
                      تأكد من رقم الفاتورة وحاول تاني.
                    </div>
                  )}
                </div>
              ) : filteredSalesInPOS.slice(0, visibleInvoicesLimit).map((s) => {
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
                        {invoiceSearchResult.fuzzy && (
                          <Badge variant="warning">أقرب رقم مطابق — تأكد منه</Badge>
                        )}
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
          style={{ flex: 1, minHeight: '160px', overflowY: 'auto', padding: 'var(--spacing-4)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}
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
          gap: 'var(--spacing-3)',
          flexShrink: 0,
          maxHeight: '55%',
          overflowY: 'auto'
        }}>
          {/* Loyalty program status */}
          {loyaltySettings?.enabled && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px', borderRadius: '6px',
              backgroundColor: loyaltySettings.programOpen ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.15)',
            }}>
              <span style={{
                fontSize: '11px', fontWeight: 700,
                color: loyaltySettings.programOpen ? '#065f46' : '#374151',
              }}>
                برنامج الولاء: {loyaltySettings.programOpen ? 'مفتوح (يكسب العملاء نقاط)' : 'مغلق (لا كسب حالياً)'}
              </span>
              {canManageLoyalty && (
                <button
                  type="button"
                  onClick={() => toggleLoyaltyProgram(!loyaltySettings.programOpen)}
                  disabled={togglingLoyaltyProgram}
                  className="btn-secondary"
                  style={{ fontSize: '10px', padding: '3px 8px' }}
                >
                  {loyaltySettings.programOpen ? 'إغلاق البرنامج' : 'فتح البرنامج'}
                </button>
              )}
            </div>
          )}

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
                      setLoyaltyRedeemAmount(0);
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
                      setLoyaltyRedeemAmount(0);
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

              {/* Loyalty Balance Banner */}
              {selectedCustomer && loyaltySettings?.enabled && (
                <div style={{
                  marginTop: '6px',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  direction: 'rtl',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#065f46' }}>
                    رصيد الولاء
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>
                    {formatMoney(loyaltyBalance)}
                  </span>
                </div>
              )}

              {/* Suggestion Dropdown List */}
              {showCustSuggestions && custSearchQuery && customerSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  style={{
                    position: 'absolute',
                    top: '100%',
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
                    marginTop: '4px'
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
                          setLoyaltyRedeemAmount(0);
                          setCustSearchQuery('');
                          setShowCustSuggestions(false);
                          return;
                        }
                        setCustomerId(cust.id);
                        setLoyaltyPercent(Number(cust.discount) || 0);
                        setLoyaltyRedeemAmount(0);
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
                    top: '100%',
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
                    marginTop: '4px',
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

          {/* Use Loyalty balance as payment */}
          {selectedCustomer && loyaltySettings?.enabled && loyaltyBalance > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', gap: 'var(--spacing-2)', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
                  استخدام الولاء
                </span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={loyaltyRedeemAmount || ''}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    setLoyaltyRedeemAmount(Number.isFinite(raw) ? raw : 0);
                  }}
                  placeholder="0.00"
                  style={{ padding: '4px var(--spacing-2)', maxWidth: '100px' }}
                />
                <button
                  type="button"
                  onClick={() => setLoyaltyRedeemAmount(loyaltyBalance)}
                  className="btn-secondary"
                  style={{ fontSize: '10px', padding: '4px 8px', whiteSpace: 'nowrap' }}
                >
                  استخدام الحد الأقصى
                </button>
              </div>
              {totals.loyaltyRedeemed > 0 && (
                <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  سيتم خصم {formatMoney(totals.loyaltyRedeemed)} من رصيد الولاء (المتاح: {formatMoney(loyaltyBalance)})
                </div>
              )}
            </div>
          )}

          {/* Delivery order toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed var(--color-border)', paddingTop: 'var(--spacing-2)' }}>
            <button
              onClick={() => setIsDelivery(!isDelivery)}
              className="btn-secondary"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', padding: '8px',
                borderColor: isDelivery ? 'var(--color-primary)' : 'var(--color-border)',
                backgroundColor: isDelivery ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: isDelivery ? 'var(--color-primary)' : 'var(--color-text-primary)',
              }}
            >
              <Truck size={16} /> طلب دليفري{isDelivery ? ' ✓' : ''}
            </button>
            {isDelivery && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2)' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>رسوم التوصيل</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={deliveryFee === 0 ? '' : deliveryFee}
                  onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  style={{ padding: '4px var(--spacing-2)' }}
                />
              </div>
            )}
            {isDelivery && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Input
                  label="عنوان التوصيل*"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="مثال: القاهرة، مدينة نصر، شارع مصطفى النحاس"
                  style={!deliveryAddress.trim() ? { borderColor: 'var(--color-danger)' } : undefined}
                />
                {!deliveryAddress.trim() && (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
                    مطلوب إدخال عنوان التوصيل ليظهر في الفاتورة
                  </span>
                )}
              </div>
            )}
          </div>

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
            {isDelivery && totals.deliveryFee > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>رسوم التوصيل</span>
                <span>{formatMoney(totals.deliveryFee)}</span>
              </div>
            )}
            {totals.loyaltyRedeemed > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669' }}>
                <span>ولاء مستخدم</span>
                <span>{formatMoney(-totals.loyaltyRedeemed)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-lg)', fontWeight: 'bold', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: '4px', marginTop: '4px' }}>
              <span>المجموع الكلي</span>
              <span>{formatMoney(totals.total)}</span>
            </div>
          </div>

          {/* Payment Methods */}
          <button
            onClick={() => setSplitPaymentEnabled(!isSplitPayment)}
            className="btn-secondary"
            style={{
              width: '100%',
              marginBottom: 'var(--spacing-2)',
              padding: '6px',
              fontSize: 'var(--font-size-xs)',
              borderColor: isSplitPayment ? 'var(--color-primary)' : 'var(--color-border)',
              color: isSplitPayment ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            }}
          >
            {isSplitPayment ? '✕ إلغاء الدفع المقسم' : '➗ دفع مقسم (كاش + طريقة تانية)'}
          </button>

          {!isSplitPayment ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-4)' }}>
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
                onClick={() => setPaymentMethod('INSTAPAY')}
                className="btn-secondary"
                style={{
                  borderColor: paymentMethod === 'INSTAPAY' ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: paymentMethod === 'INSTAPAY' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  color: paymentMethod === 'INSTAPAY' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px'
                }}
              >
                <Smartphone size={16} /> إنستاباي
              </button>
              <button
                onClick={() => setPaymentMethod('VODAFONE_CASH')}
                className="btn-secondary"
                style={{
                  borderColor: paymentMethod === 'VODAFONE_CASH' ? 'var(--color-primary)' : 'var(--color-border)',
                  backgroundColor: paymentMethod === 'VODAFONE_CASH' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                  color: paymentMethod === 'VODAFONE_CASH' ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px'
                }}
              >
                <Smartphone size={16} /> فودافون كاش
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', marginBottom: 'var(--spacing-4)' }}>
              {([0, 1] as const).map((i) => {
                const line = splitPayments[i];
                return (
                  <div key={i} style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={line?.method ?? 'CASH'}
                      onChange={(e) => setSplitPaymentLine(i, { method: e.target.value as any })}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      <option value="CASH">نقدي</option>
                      <option value="CARD">بطاقة</option>
                      <option value="INSTAPAY">إنستاباي</option>
                      <option value="VODAFONE_CASH">فودافون كاش</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line?.amount || ''}
                      onChange={(e) => setSplitPaymentLine(i, { amount: parseFloat(e.target.value) || 0 })}
                      placeholder="المبلغ"
                      style={{
                        flex: 1, padding: '8px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)', backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)',
                      }}
                    />
                  </div>
                );
              })}
              {(() => {
                const remaining = totals.total - ((splitPayments[0]?.amount || 0) + (splitPayments[1]?.amount || 0));
                const settled = Math.abs(remaining) <= 0.01;
                return (
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', padding: '6px 10px',
                    borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', fontWeight: 'bold',
                    backgroundColor: settled ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                    color: settled ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    <span>المتبقي</span>
                    <span>{formatMoney(remaining)}</span>
                  </div>
                );
              })()}
            </div>
          )}

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
            {canPrintThermal && (
              <Button onClick={() => printThermal(activeReceipt)} variant="primary" style={{ flex: 1 }}>
                <Printer size={14} /> طباعة إيصال حراري (80mm)
              </Button>
            )}
            {canPrintA4 && (
              <Button onClick={() => printReceipt(activeReceipt)} variant="secondary" style={{ flex: 1 }}>
                <Printer size={14} /> فاتورة A4
              </Button>
            )}
            <Button onClick={() => setActiveReceipt(null)} variant="ghost" style={{ flex: 1 }}>
              إغلاق
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
                <button
                  onClick={copyReceiptAsImage}
                  disabled={isCopyingReceiptImage}
                  className="btn-secondary"
                  style={{ padding: '4px 6px', fontSize: '10px', opacity: isCopyingReceiptImage ? 0.6 : 1 }}
                  title="نسخ صورة الفاتورة للحافظة (لصقها في واتساب مثلاً)"
                >
                  {isCopyingReceiptImage ? '⏳ جاري النسخ...' : '📋 نسخ صورة'}
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
        title={restrictedSalesScope ? "إغلاق وتسليم الوردية" : "تقرير تسوية وإغلاق الوردية"}
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowCloseShiftModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleCloseShift} disabled={!countedCash} variant="danger">تأكيد وإغلاق الوردية الآن</Button>
          </div>
        }
        maxWidth={restrictedSalesScope ? "520px" : "780px"}
      >
        {shiftReport && (() => {
          const shiftSales = (sales || []).filter(
            s => s.posSessionId === activeSession.id && s.status !== 'REFUNDED'
          );
          const payMethodLabel = (method: string) => {
            if (method === 'CASH') return 'كاش';
            if (method === 'CARD') return 'فيزا';
            if (method === 'INSTAPAY') return 'إنستا باي';
            if (method === 'VODAFONE_CASH') return 'فودافون كاش';
            return method;
          };
          const payMethodBadgeColor = (method: string): string => {
            if (method === 'CASH') return '#16a34a';
            if (method === 'CARD') return '#2563eb';
            if (method === 'INSTAPAY') return '#7c3aed';
            if (method === 'VODAFONE_CASH') return '#dc2626';
            return 'var(--color-text-secondary)';
          };
          const cashCounted = parseFloat(countedCash) || 0;
          const diff = cashCounted - shiftReport.expectedCashBalance;
          const rowStyle: React.CSSProperties = {
            display: 'grid',
            gridTemplateColumns: '1fr 1.8fr 1fr 1fr',
            gap: '0',
            alignItems: 'center',
          };

          // ── BLIND CLOSING FOR CASHIER ROLE ──
          if (restrictedSalesScope) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', direction: 'rtl', textAlign: 'right' }}>
                <div style={{
                  padding: 'var(--spacing-3)',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: '1.6',
                  color: 'var(--color-text-secondary)'
                }}>
                  <strong style={{ color: 'var(--color-primary)', display: 'block', marginBottom: 4, fontSize: 'var(--font-size-sm)' }}>
                    🔒 جرد وتسليم الوردية:
                  </strong>
                  قم بعدّ جميع النقدية (المبلغ الكاش) الموجودة بالدرج أدناه، وأدخل الناتج بصرامة. سيتم تسجيل القيمة سرياً وإرسال التقرير للإدارة للمطابقة.
                </div>

                <div style={{ border: '1.5px solid var(--color-primary)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-4)', backgroundColor: 'var(--color-primary-light, rgba(59,130,246,0.05))' }}>
                  <Input
                    label="💵 أدخل المبلغ النقدي الكلي المعدود في درج الكاشير (ج.م) *"
                    value={countedCash}
                    onChange={(e) => setCountedCash(e.target.value)}
                    placeholder="0.00"
                    type="number"
                    autoFocus
                  />
                </div>
              </div>
            );
          }

          // ── FULL REPORT FOR MANAGERS & OWNERS ──
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-4)', direction: 'rtl', textAlign: 'right' }}>

              {/* ── SECTION 1: Invoices Table ── */}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)', paddingBottom: '4px', marginBottom: '8px' }}>
                  📋 فواتير الوردية ({shiftSales.length} فاتورة)
                </div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', fontSize: 'var(--font-size-xs)' }}>
                  {/* Table header */}
                  <div style={{ ...rowStyle, backgroundColor: 'var(--color-surface)', fontWeight: 'bold', padding: '8px 12px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                    <span>رقم الفاتورة</span>
                    <span>الوقت والتاريخ</span>
                    <span style={{ textAlign: 'center' }}>طريقة الدفع</span>
                    <span style={{ textAlign: 'left' }}>القيمة</span>
                  </div>
                  {/* Table rows */}
                  {shiftSales.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      لا توجد فواتير في هذه الوردية
                    </div>
                  ) : (
                    <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                      {shiftSales.map((s, idx) => (
                        <div key={s.id} style={{ ...rowStyle, padding: '7px 12px', borderBottom: idx < shiftSales.length - 1 ? '1px solid var(--color-border)' : 'none', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--color-bg)' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>{s.saleNumber}</span>
                          <span style={{ color: 'var(--color-text-secondary)' }}>
                            {new Date(s.date).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {' — '}
                            {new Date(s.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 'bold', color: '#fff', backgroundColor: payMethodBadgeColor(s.paymentMethod) }}>
                              {payMethodLabel(s.paymentMethod)}
                            </span>
                          </span>
                          <span style={{ textAlign: 'left', fontWeight: 'bold' }}>{formatMoney(s.totalAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── SECTION 2: Payment Method Summary ── */}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)', paddingBottom: '4px', marginBottom: '8px' }}>
                  💳 ملخص المبيعات حسب وسيلة الدفع
                </div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', fontSize: 'var(--font-size-xs)' }}>
                  {[
                    { label: 'إجمالي مبيعات الكاش', value: shiftReport.cashSalesTotal, color: '#16a34a', icon: '💵' },
                    { label: 'إجمالي مبيعات إنستا باي', value: shiftReport.instapaySalesTotal, color: '#7c3aed', icon: '📲' },
                    { label: 'إجمالي مبيعات الفيزا', value: shiftReport.cardSalesTotal, color: '#2563eb', icon: '💳' },
                    { label: 'إجمالي مبيعات فودافون كاش', value: shiftReport.vodafoneSalesTotal, color: '#dc2626', icon: '📱' },
                  ].map((row, idx, arr) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: idx < arr.length - 1 ? '1px solid var(--color-border)' : 'none', backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--color-bg)' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{row.icon} {row.label}</span>
                      <span style={{ fontWeight: 'bold', color: row.value > 0 ? row.color : 'var(--color-text-secondary)' }}>{formatMoney(row.value)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg)' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>🚚 طلبات التوصيل ({shiftReport.deliveryOrdersCount})</span>
                    <span style={{ fontWeight: 'bold', color: shiftReport.deliveryFeesTotal > 0 ? '#8B5CF6' : 'var(--color-text-secondary)' }}>{formatMoney(shiftReport.deliveryFeesTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: 'var(--color-primary)', color: '#fff', fontWeight: 'bold' }}>
                    <span>🏆 إجمالي المبيعات الكلي</span>
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{formatMoney(shiftReport.totalSales)}</span>
                  </div>
                </div>
              </div>

              {/* ── SECTION 3: Cash Drawer Reconciliation ── */}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)', borderBottom: '2px solid var(--color-primary)', paddingBottom: '4px', marginBottom: '8px' }}>
                  🏦 تسوية الخزينة (جرد درج الكاشير)
                </div>
                <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', fontSize: 'var(--font-size-xs)' }}>
                  {/* Actual cash input — expected amount hidden intentionally */}
                  <div style={{ padding: '12px', borderBottom: '1px solid var(--color-border)' }}>
                    <Input
                      label="💵 قم بعد النقدية في الدرج وأدخل المبلغ الفعلي (ج.م) *"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                      placeholder="0.00"
                      type="number"
                    />
                  </div>

                  {/* Difference row — shown only after cashier enters amount */}
                  {countedCash && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', fontWeight: 'bold', backgroundColor: diff === 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)', color: diff === 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      <span>{diff === 0 ? '✅ الفرق (متطابق)' : diff > 0 ? '⬆️ الفرق (زيادة)' : '⬇️ الفرق (عجز)'}</span>
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>
                        {diff === 0 ? formatMoney(0) : diff > 0 ? `+ ${formatMoney(diff)}` : `- ${formatMoney(Math.abs(diff))}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── SECTION 4: Closing Confirmation Statement ── */}
              {countedCash && (
                <div style={{
                  padding: 'var(--spacing-3)',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${diff === 0 ? 'var(--color-success)' : 'var(--color-danger)'}`,
                  backgroundColor: diff === 0 ? 'var(--color-success-bg, #dcfce7)' : 'var(--color-danger-bg, #fee2e2)',
                  color: diff === 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  textAlign: 'center',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'bold',
                  lineHeight: '1.8',
                }}>
                  قام الكاشير <strong>({currentEmployee.fullName || currentEmployee.username})</strong> بإغلاق الوردية على مبلغ فعلي قدره <strong>{formatMoney(cashCounted)}</strong>
                  {diff === 0
                    ? ' — الوردية متطابقة تماماً ✅'
                    : diff > 0
                      ? ` — الوردية تحتوي على زيادة (علاوة) بقيمة ${formatMoney(diff)} ⬆️`
                      : ` — الوردية تحتوي على عجز بقيمة ${formatMoney(Math.abs(diff))} ⬇️`
                  }
                </div>
              )}
            </div>
          );
        })()}
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

          <Input
            label="العنوان (اختياري)"
            value={newCustAddress}
            onChange={(e) => setNewCustAddress(e.target.value)}
            placeholder="مثال: القاهرة، مدينة نصر"
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
                      const breakdown = result?.refundBreakdown;
                      if (breakdown && breakdown.length > 1) {
                        const methodLabel: Record<string, string> = {
                          CASH: 'كاش', CARD: 'فيزا', INSTAPAY: 'إنستاباي', VODAFONE_CASH: 'فودافون كاش', MOBILE: 'موبايل',
                        };
                        const parts = breakdown
                          .filter((b) => Math.abs(b.amount) > 0.005)
                          .map((b) => `${formatMoney(b.amount)} ${methodLabel[b.method] || b.method}`)
                          .join(' + ');
                        addNotification('FINANCE', 'تفاصيل الإرجاع', `تم إرجاع: ${parts}`);
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
