import { mockDb } from './mockDb';
import { 
  Product, ProductVariant, Warehouse, StockMovement, 
  Customer, Pet, Service, Appointment, Expense, 
  DailyClosing, POSSession, Sale, KPIMetrics, AIAdvisorInsight 
} from '../../types/erp';

// Simulated delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch helpers for Spring Boot integration
const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

const getBackendUrl = () => localStorage.getItem('BACKEND_URL') || 'http://localhost:8080/api';

async function ensureAuthenticated() {
  const isReal = localStorage.getItem('USE_REAL_BACKEND') === 'true';
  if (!isReal) return;
  if (localStorage.getItem('token')) return;
  try {
    const res = await fetch(`${getBackendUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin' })
    });
    const json = await res.json();
    if (json.success && json.data.token) {
      localStorage.setItem('token', json.data.token);
    }
  } catch (err) {
    console.error("Failed to authenticate with Spring Boot backend", err);
  }
}

export const api = {
  // PRODUCTS & STOCK
  async getProducts(): Promise<Product[]> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/inventory/variants`, { headers: getHeaders() });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const productsMap: Record<string, Product> = {};
          json.data.forEach((v: any) => {
            if (v.product) {
              productsMap[v.product.id] = {
                id: v.product.id,
                sku: v.product.sku,
                name: v.product.name,
                categoryId: v.product.category?.id || 'cat-1',
                brandId: v.product.brand?.id || 'brand-1',
                unitId: v.product.unit?.id || 'unit-1',
                minStockLimit: v.product.minStockLimit
              };
            }
          });
          return Object.values(productsMap);
        }
      } catch (err) {
        console.error("Error fetching products from backend", err);
      }
    }
    await delay(200);
    return [...mockDb.products];
  },

  async getVariants(): Promise<ProductVariant[]> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/inventory/variants`, { headers: getHeaders() });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data.map((v: any) => ({
            id: v.id,
            productId: v.product?.id || 'p-1',
            name: v.name,
            price: v.price,
            cost: v.cost,
            stockQuantity: v.stockQuantity
          }));
        }
      } catch (err) {
        console.error("Error fetching variants from backend", err);
      }
    }
    await delay(150);
    return [...mockDb.variants];
  },

  async getBatches(): Promise<any[]> {
    await delay(100);
    return [...mockDb.batches];
  },

  async getWarehouses(): Promise<Warehouse[]> {
    await delay(100);
    return [...mockDb.warehouses];
  },

  async getStockMovements(): Promise<StockMovement[]> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/inventory/movements`, { headers: getHeaders() });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          return json.data.map((m: any) => ({
            id: m.id,
            warehouseId: m.warehouse?.id || 'wh-shelf',
            productVariantId: m.productVariant?.id || 'v-1',
            quantity: m.quantity,
            type: m.type,
            timestamp: m.timestamp,
            employeeId: m.employee?.id || 'e-1'
          }));
        }
      } catch (err) {
        console.error("Error fetching movements from backend", err);
      }
    }
    await delay(250);
    return [...mockDb.stockMovements];
  },

  async addProduct(product: Omit<Product, 'id'>, variant: Omit<ProductVariant, 'id' | 'productId' | 'stockQuantity'>): Promise<Product> {
    await delay(300);
    const newProdId = `p-${mockDb.products.length + 1}`;
    const newVarId = `v-${mockDb.variants.length + 1}`;
    
    const newProduct: Product = { id: newProdId, ...product };
    const newVariant: ProductVariant = { 
      id: newVarId, 
      productId: newProdId, 
      name: variant.name, 
      price: variant.price, 
      cost: variant.cost, 
      stockQuantity: 0 
    };

    mockDb.products.push(newProduct);
    mockDb.variants.push(newVariant);
    return newProduct;
  },

  async updateStock(variantId: string, diff: number, type: StockMovement['type'], employeeId: string): Promise<ProductVariant> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/inventory/adjust`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ variantId, warehouseId: 'wh-shelf', diff, type, employeeId })
        });
        const json = await res.json();
        if (json.success && json.data) {
          return {
            id: json.data.id,
            productId: json.data.product?.id || 'p-1',
            name: json.data.name,
            price: json.data.price,
            cost: json.data.cost,
            stockQuantity: json.data.stockQuantity
          };
        }
      } catch (err) {
        console.error("Error executing backend stock adjustment", err);
      }
    }
    await delay(200);
    const variant = mockDb.variants.find(v => v.id === variantId);
    if (!variant) throw new Error('Variant not found');
    
    variant.stockQuantity += diff;
    
    mockDb.stockMovements.push({
      id: `mov-manual-${Date.now()}`,
      warehouseId: 'w-2', // Front Shelf default
      productVariantId: variantId,
      quantity: diff,
      type,
      timestamp: new Date().toISOString(),
      employeeId
    });

    return { ...variant };
  },

  async transferStock(sourceWhId: string, targetWhId: string, variantId: string, quantity: number, employeeId: string): Promise<boolean> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/inventory/transfer`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ variantId, sourceWarehouseId: sourceWhId, targetWarehouseId: targetWhId, quantity, employeeId })
        });
        const json = await res.json();
        return json.success;
      } catch (err) {
        console.error("Error executing backend transfer", err);
      }
    }
    await delay(300);
    const variant = mockDb.variants.find(v => v.id === variantId);
    if (!variant) throw new Error('Variant not found');

    // Deduct source warehouse
    mockDb.stockMovements.push({
      id: `mov-trf-src-${Date.now()}`,
      warehouseId: sourceWhId,
      productVariantId: variantId,
      quantity: -quantity,
      type: 'TRANSFER',
      timestamp: new Date().toISOString(),
      employeeId
    });

    // Add target warehouse
    mockDb.stockMovements.push({
      id: `mov-trf-tgt-${Date.now()}`,
      warehouseId: targetWhId,
      productVariantId: variantId,
      quantity: quantity,
      type: 'TRANSFER',
      timestamp: new Date().toISOString(),
      employeeId
    });

    return true;
  },

  // POS SESSIONS & SALES
  async getPOSSessions(): Promise<POSSession[]> {
    await delay(150);
    return [...mockDb.posSessions];
  },

  async openPOSSession(openedById: string, openingBalance: number): Promise<POSSession> {
    await delay(250);
    const newSession: POSSession = {
      id: `sess-${Date.now()}`,
      branchId: 'b-1',
      openedById,
      openedAt: new Date().toISOString(),
      openingBalance,
      status: 'OPEN'
    };
    mockDb.posSessions.push(newSession);
    return newSession;
  },

  async closePOSSession(sessionId: string, closingBalance: number, expectedBalance: number, physicalBalance: number, closedById: string): Promise<POSSession> {
    await delay(300);
    const session = mockDb.posSessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    session.closingBalance = closingBalance;
    session.closedAt = new Date().toISOString();
    session.status = 'CLOSED';

    // Log Daily Closing Ledger
    mockDb.dailyClosings.push({
      id: `close-pos-${Date.now()}`,
      branchId: 'b-1',
      cashboxId: 'cb-1',
      openingBalance: session.openingBalance,
      closingBalance,
      systemExpected: expectedBalance,
      physicalActual: physicalBalance,
      difference: physicalBalance - expectedBalance,
      closedById,
      date: new Date().toISOString().split('T')[0]
    });

    return { ...session };
  },

  async getSales(): Promise<Sale[]> {
    await delay(200);
    return [...mockDb.sales];
  },

  async createSale(sale: Omit<Sale, 'id' | 'saleNumber' | 'date'>): Promise<Sale> {
    await delay(300);
    const newSaleNum = `INV-${mockDb.sales.length + 1001}`;
    const newSale: Sale = {
      id: `sale-${Date.now()}`,
      saleNumber: newSaleNum,
      date: new Date().toISOString(),
      ...sale
    };

    // Process Stock deductions
    sale.items.forEach(item => {
      if (item.type === 'PRODUCT') {
        const variant = mockDb.variants.find(v => v.id === item.itemId);
        if (variant) {
          variant.stockQuantity -= item.quantity;
          
          mockDb.stockMovements.push({
            id: `mov-sale-${Date.now()}-${item.itemId}`,
            warehouseId: 'w-2', // Front Shelf POS
            productVariantId: item.itemId,
            quantity: -item.quantity,
            type: 'SALE',
            timestamp: new Date().toISOString(),
            employeeId: sale.employeeId
          });
        }
      } else if (item.type === 'SERVICE') {
        // Log Appointment completion if service sold in POS directly
        mockDb.appointments.push({
          id: `apt-sale-${Date.now()}`,
          petId: 'pet-1', // Default mock
          serviceId: item.itemId,
          employeeId: 'e-3', // Groomer Bob
          dateTime: new Date().toISOString(),
          status: 'COMPLETED',
          notes: 'Walk-in client service checkout.'
        });
      }
    });

    mockDb.sales.push(newSale);
    return newSale;
  },

  // SERVICES & APPOINTMENTS
  async getServices(): Promise<Service[]> {
    await delay(100);
    return [...mockDb.services];
  },

  async getAppointments(): Promise<Appointment[]> {
    await delay(200);
    return [...mockDb.appointments];
  },

  async createAppointment(appointment: Omit<Appointment, 'id' | 'status'>): Promise<Appointment> {
    await delay(250);
    const newApt: Appointment = {
      id: `apt-${Date.now()}`,
      status: 'SCHEDULED',
      ...appointment
    };
    mockDb.appointments.push(newApt);
    return newApt;
  },

  async updateAppointmentStatus(appointmentId: string, status: Appointment['status']): Promise<Appointment> {
    await delay(200);
    const apt = mockDb.appointments.find(a => a.id === appointmentId);
    if (!apt) throw new Error('Appointment not found');
    apt.status = status;
    return { ...apt };
  },

  // CRM
  async getCustomers(): Promise<Customer[]> {
    await delay(150);
    return [...mockDb.customers];
  },

  async getPets(): Promise<Pet[]> {
    await delay(150);
    return [...mockDb.pets];
  },

  async addCustomer(customer: Omit<Customer, 'id'>, pet?: Omit<Pet, 'id' | 'customerId'>): Promise<Customer> {
    await delay(250);
    const newCustId = `c-${mockDb.customers.length + 1}`;
    const newCust: Customer = { id: newCustId, ...customer };
    mockDb.customers.push(newCust);

    if (pet) {
      const newPetId = `pet-${mockDb.pets.length + 1}`;
      mockDb.pets.push({ id: newPetId, customerId: newCustId, ...pet });
    }

    return newCust;
  },

  // FINANCE
  async getExpenses(): Promise<Expense[]> {
    await delay(200);
    return [...mockDb.expenses];
  },

  async addExpense(expense: Omit<Expense, 'id' | 'date'>): Promise<Expense> {
    await delay(250);
    const newExp: Expense = {
      id: `exp-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      ...expense
    };
    mockDb.expenses.push(newExp);
    return newExp;
  },

  async getDailyClosings(): Promise<DailyClosing[]> {
    await delay(200);
    return [...mockDb.dailyClosings];
  },

  // ANALYTICS & AI ADVISOR
  async getKPIMetrics(): Promise<KPIMetrics> {
    await delay(200);
    return mockDb.getKPIMetrics();
  },

  async getAIInsights(): Promise<AIAdvisorInsight> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/ai/insights?tenantId=t-1`, { headers: getHeaders() });
        const json = await res.json();
        if (json.success) {
          return {
            businessSummary: json.data,
            criticalAlerts: [
              { title: 'تنبيه نقص مخزون: Kitten Dry Cat Food', description: 'Kitten Dry Cat Food (كيس 2 كجم) تبقى منه 4 أكياس فقط (الحد الأدنى 15). يُوصى بإعادة الطلب فورًا.', severity: 'CRITICAL' },
              { title: 'اقتراب تاريخ انتهاء صلاحية دفعة', description: 'دفعة من Bravecto الأقراص تنتهي صلاحيتها خلال أقل من 90 يومًا.', severity: 'WARNING' }
            ],
            topOpportunities: [
              { title: 'حملة حجوزات الجروومينغ', description: 'استهدف عملاء الجروومينغ المتكررين بحملات خصم في منتصف الأسبوع للاستفادة من نسبة استغلال الموظفين 68٪.', priority: 'HIGH' },
              { title: 'إعادة تخزين Kitten Dry Cat Food', description: 'إعادة طلب متغيرات Royal Canin لغذاء الكلاب.', priority: 'HIGH' }
            ],
            recommendations: [
              { title: 'تعديل جداول الموظفين', action: 'تخصيص ورديات الحلاقين لساعات الطلب المرتفع يوم السبت.', impact: '+$320/أسبوع' },
              { title: 'تفاوض مع الموردين', action: 'إعادة التفاوض على تكاليف توريد بيورينا.', impact: '+$180/شهر' }
            ],
            forecastText: 'من المتوقع نمو المبيعات بنسبة 5.4٪ الشهر القادم بسبب ارتفاع طلبات الجروومينغ.'
          };
        }
      } catch (err) {
        console.error("Error executing backend AI insights", err);
      }
    }
    await delay(400);
    return mockDb.getAIInsights();
  },

  async askAIAdvisor(query: string): Promise<string> {
    if (localStorage.getItem('USE_REAL_BACKEND') === 'true') {
      await ensureAuthenticated();
      try {
        const res = await fetch(`${getBackendUrl()}/ai/ask`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ tenantId: 't-1', query })
        });
        const json = await res.json();
        if (json.success) {
          return json.data;
        }
      } catch (err) {
        console.error("Error asking backend AI", err);
      }
    }
    return new Promise(resolve => {
      setTimeout(() => {
        let reply = 'آسف، لم أفهم سؤالك. جرّب السؤال عن “أعلى خدمة هامشًا” أو “إعادة طلب غذاء القطط” أو “التوقعات”.';
        const normalized = query.toLowerCase();
        if (normalized.includes('هامش') || normalized.includes('أعلى') || normalized.includes('margin') || normalized.includes('highest')) {
          reply = 'يُشير التحليل إلى أن أعلى خدمة هامشًا هي “Nail Trimming & Ear Cleaning” بهامش إجمالي 85٪ (السعر: $15.00، تكلفة العمالة التقديرية: $2.25). بينما تمثّل “Full Grooming & Bath” 68٪ من إجمالي حجم خدمات الجروومينغ وتولد أكبر قيمة نقدية صافية بمبلغ $60.00 لكل وحدة (70٪ هامش).';
        } else if (normalized.includes('إعادة') || normalized.includes('قطط') || normalized.includes('restock') || normalized.includes('cat food')) {
          reply = 'Kitten Dry Cat Food تبقى منه 4 أكياس فقط (الحد الأدنى 15). أوصي بطلب 30 كيسًا من موزع Purina (التكلفة الإجمالية: $360.00) لتجنب نفاد المخزون قبل يوم الأربعاء. سيحافظ هذا على $220.00 من مبيعات التجزئة المتوقعة.';
        } else if (normalized.includes('توقع') || normalized.includes('نمو') || normalized.includes('forecast') || normalized.includes('grow')) {
          reply = 'من المتوقع نمو المبيعات بنسبة 5.4٪ الشهر القادم بسبب الارتفاع الموسمي في طلبات الجروومينغ في يوليو. ومن المتوقع أن تظل المصاريف مستقرة عند $4,880.00، مما يدفع هوامش الربح الصافي إلى 14.8٪.';
        } else if (normalized.includes('إيميل') || normalized.includes('مسودة') || normalized.includes('رسالة') || normalized.includes('email') || normalized.includes('draft')) {
          reply = 'الموضوع: أمر شراء - Kitten Dry Cat Food\n\nحضرة فريق مبيعات Purina الكرام،\n\nيُرجى الاطلاع على أمر الشراء التالي لفرع أنيماسيز وسط المدينة:\n- الصنف: Kitten Dry Cat Food (كيس 2 كجم)\n- الكمية: 30 كيس\n- موعد التسليم المطلوب: قبل الخميس 9 يوليو.\n\nيُرجى تأكيد توفر المخزون وإرسال الفاتورة المبدئية إلى billing@animasys.com.\n\nمع خالص التحية،\nيحيى\nمدير المتجر';
        }
        resolve(reply);
      }, 800);
    });
  },

  async refundSale(saleId: string, employeeId: string): Promise<void> {
    await delay(300);
    mockDb.refundSale(saleId, employeeId);
  },

  async getAuditLogs(): Promise<any[]> {
    await delay(150);
    return [...mockDb.auditLogs];
  }
};
