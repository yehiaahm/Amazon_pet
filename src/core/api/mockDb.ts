import { 
  Product, ProductVariant, Warehouse, Batch, 
  StockMovement, Customer, Pet, Service, 
  Appointment, Expense, DailyClosing, POSSession, 
  Sale, KPIMetrics, AIAdvisorInsight 
} from '../../types/erp';

// In-Memory Database
class MockDatabase {
  tenants = [{ id: 't-1', name: 'بيت الحيوانات الأليفة', subdomain: 'petcare', active: true }];
  branches = [{ id: 'b-1', tenantId: 't-1', name: 'فرع وسط المدينة', address: 'شارع التجزئة 123', phone: '+123456789' }];
  
  warehouses: Warehouse[] = [
    { id: 'w-1', branchId: 'b-1', name: 'المستودع الرئيسي الخلفي', code: 'WH-MAIN' },
    { id: 'w-2', branchId: 'b-1', name: 'رفوف نقطة البيع الأمامية', code: 'WH-SHELF' }
  ];

  employees = [
    { id: 'e-1', username: 'owner_yahia', fullName: 'يحيى (المالك)', email: 'owner@animasys.com', role: 'OWNER', branchId: 'b-1', active: true },
    { id: 'e-2', username: 'cashier_alice', fullName: 'أليس (الكاشير)', email: 'alice@animasys.com', role: 'CASHIER', branchId: 'b-1', active: true },
    { id: 'e-3', username: 'groomer_bob', fullName: 'بوب (الحلاق)', email: 'bob@animasys.com', role: 'GROOMER', branchId: 'b-1', active: true }
  ];

  categories = [
    { id: 'cat-1', name: 'أغذية الحيوانات الأليفة' },
    { id: 'cat-2', name: 'مستلزمات الحيوانات الأليفة' },
    { id: 'cat-3', name: 'أدوية الحيوانات الأليفة' }
  ];

  brands = [
    { id: 'br-1', name: 'Royal Canin' },
    { id: 'br-2', name: 'Purina Pro Plan' },
    { id: 'br-3', name: 'Kong' },
    { id: 'br-4', name: 'Bravecto' }
  ];

  units = [
    { id: 'u-1', name: 'كيلوجرام', code: 'kg' },
    { id: 'u-2', name: 'قطعة', code: 'pcs' },
    { id: 'u-3', name: 'زجاجة', code: 'btl' }
  ];

  products: Product[] = [
    { id: 'p-1', sku: 'RC-DOG-ADULT-10', name: 'Adult Medium Dry Dog Food', categoryId: 'cat-1', brandId: 'br-1', unitId: 'u-1', minStockLimit: 10 },
    { id: 'p-2', sku: 'PP-CAT-KITTEN-2', name: 'Kitten Dry Cat Food', categoryId: 'cat-1', brandId: 'br-2', unitId: 'u-1', minStockLimit: 15 },
    { id: 'p-3', sku: 'KG-TOY-DOG-CLASSIC', name: 'Classic Rubber Chew Toy', categoryId: 'cat-2', brandId: 'br-3', unitId: 'u-2', minStockLimit: 5 },
    { id: 'p-4', sku: 'BV-MED-DOG-LARGE', name: 'Flea & Tick Chewable Tablets', categoryId: 'cat-3', brandId: 'br-4', unitId: 'u-2', minStockLimit: 8 }
  ];

  variants: ProductVariant[] = [
    { id: 'v-1', productId: 'p-1', name: 'كيس 10 كجم', price: 65.00, cost: 35.00, stockQuantity: 24 },
    { id: 'v-2', productId: 'p-1', name: 'كيس 2 كجم', price: 18.00, cost: 10.00, stockQuantity: 12 },
    { id: 'v-3', productId: 'p-2', name: 'كيس 2 كجم', price: 22.00, cost: 12.00, stockQuantity: 4 }, // تنبيه: مخزون منخفض!
    { id: 'v-4', productId: 'p-3', name: 'لون أحمر كبير', price: 15.00, cost: 6.50, stockQuantity: 18 },
    { id: 'v-5', productId: 'p-4', name: 'كلاب كبيرة (20-40 كجم)', price: 42.00, cost: 24.00, stockQuantity: 3 } // تنبيه: مخزون منخفض!
  ];

  batches: Batch[] = [
    { id: 'bth-1', productVariantId: 'v-5', batchNumber: 'BAT-2026-092', expiryDate: '2026-09-30', quantity: 3 } // تحذير: تنتهي الصلاحية خلال 3 أشهر
  ];

  stockMovements: StockMovement[] = [];
  stockAdjustments: any[] = [];
  transfers: any[] = [];

  customers: Customer[] = [
    { id: 'c-1', name: 'سارة كريم', phone: '555-0192', email: 'sara@example.com' },
    { id: 'c-2', name: 'محمد الأحمد', phone: '555-4819', email: 'mohammad@example.com' },
    { id: 'c-3', name: 'لينا حسن', phone: '555-1939', email: 'lina@example.com' }
  ];

  pets: Pet[] = [
    { id: 'pet-1', customerId: 'c-1', name: 'ماكس', species: 'DOG', breed: 'جيرمن شيفرد', age: 4 },
    { id: 'pet-2', customerId: 'c-2', name: 'لونا', species: 'CAT', breed: 'سيامي', age: 2 },
    { id: 'pet-3', customerId: 'c-3', name: 'آس', species: 'DOG', breed: 'جريت دان', age: 5 }
  ];

  services: Service[] = [
    { id: 'srv-1', name: 'حمام واستحمام كامل', price: 60.00, durationMinutes: 90 },
    { id: 'srv-2', name: 'غسيل ونشيف الفروة', price: 35.00, durationMinutes: 45 },
    { id: 'srv-3', name: 'قص أظافر وتنظيف أذنين', price: 15.00, durationMinutes: 20 }
  ];

  appointments: Appointment[] = [];
  expenses: Expense[] = [];
  dailyClosings: DailyClosing[] = [];
  posSessions: POSSession[] = [];
  sales: Sale[] = [];
  auditLogs: any[] = [];

  constructor() {
    this.seedHistoricalData();
  }

  private seedHistoricalData() {
    // Generate 3 months of history
    // Current date is 2026-07-06
    const startDate = new Date('2026-04-01');
    const endDate = new Date('2026-07-05');
    
    let saleNumber = 1000;
    
    // Core Seed Data: loop over days to create transactions
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      
      // Seed Expenses (Rent on 1st, Salaries on 28th, Utilities weekly)
      if (d.getDate() === 1) {
        this.expenses.push({
          id: `exp-rent-${dateStr}`,
          branchId: 'b-1',
          category: 'RENT',
          amount: 1500.00,
          date: dateStr,
          description: 'إيجار المحل الشهري',
          paidFrom: 'BANK'
        });
      }
      if (d.getDate() === 28) {
        this.expenses.push({
          id: `exp-sal-${dateStr}`,
          branchId: 'b-1',
          category: 'SALARY',
          amount: 3200.00,
          date: dateStr,
          description: 'صرف رواتب الموظفين',
          paidFrom: 'BANK'
        });
      }
      if (d.getDay() === 1) { // Every Monday
        this.expenses.push({
          id: `exp-ut-${dateStr}`,
          branchId: 'b-1',
          category: 'UTILITIES',
          amount: 180.00,
          date: dateStr,
          description: 'فاتورة الكهرباء والمياه',
          paidFrom: 'BANK'
        });
      }

      // POS Shift Sessions
      const sessionId = `sess-${dateStr}`;
      this.posSessions.push({
        id: sessionId,
        branchId: 'b-1',
        openedById: 'e-2',
        openedAt: `${dateStr}T09:00:00Z`,
        closedAt: `${dateStr}T18:00:00Z`,
        openingBalance: 150.00,
        closingBalance: 0, // calculated below
        status: 'CLOSED'
      });

      // Sales for the day (between 3 and 8 sales per day)
      const salesCount = Math.floor(Math.random() * 5) + 3;
      let dayCashSales = 0;
      let daySalesTotal = 0;
      let dayCogsTotal = 0;

      for (let s = 0; s < salesCount; s++) {
        saleNumber++;
        const saleItems = [];
        let saleTotal = 0;
        let saleCost = 0;
        
        // Products sold
        const productsCount = Math.floor(Math.random() * 3) + 1;
        for (let pi = 0; pi < productsCount; pi++) {
          const randomVariant = this.variants[Math.floor(Math.random() * this.variants.length)];
          const qty = Math.floor(Math.random() * 2) + 1;
          const totalVal = randomVariant.price * qty;
          saleTotal += totalVal;
          saleCost += randomVariant.cost * qty;
          
          saleItems.push({
            id: `item-${saleNumber}-${pi}`,
            type: 'PRODUCT' as const,
            itemId: randomVariant.id,
            name: `${this.products.find(p => p.id === randomVariant.productId)?.name} - ${randomVariant.name}`,
            quantity: qty,
            price: randomVariant.price,
            cost: randomVariant.cost
          });

          // Stock movement
          this.stockMovements.push({
            id: `mov-${saleNumber}-${pi}`,
            warehouseId: 'w-2',
            productVariantId: randomVariant.id,
            quantity: -qty,
            type: 'SALE',
            timestamp: `${dateStr}T${10 + s}:${15 * pi}:00Z`,
            employeeId: 'e-2'
          });
        }

        // Service booking sold (grooming, nail clip)
        if (Math.random() > 0.4) {
          const randomService = this.services[Math.floor(Math.random() * this.services.length)];
          saleTotal += randomService.price;
          // Grooming cost is purely staff labor (let's say standard 30% overhead)
          const svcCost = randomService.price * 0.3;
          saleCost += svcCost;

          saleItems.push({
            id: `item-${saleNumber}-srv`,
            type: 'SERVICE' as const,
            itemId: randomService.id,
            name: randomService.name,
            quantity: 1,
            price: randomService.price,
            cost: svcCost
          });

          // Appointment booking
          const randomPet = this.pets[Math.floor(Math.random() * this.pets.length)];
          this.appointments.push({
            id: `apt-${saleNumber}`,
            petId: randomPet.id,
            serviceId: randomService.id,
            employeeId: 'e-3',
            dateTime: `${dateStr}T11:00:00Z`,
            status: 'COMPLETED',
            notes: 'حيوان أليف لطيف، إجراء اعتيادي.'
          });
        }

        const paymentMethod = ['CASH', 'CARD', 'MOBILE'][Math.floor(Math.random() * 3)] as 'CASH' | 'CARD' | 'MOBILE';
        if (paymentMethod === 'CASH') {
          dayCashSales += saleTotal;
        }

        daySalesTotal += saleTotal;
        dayCogsTotal += saleCost;

        this.sales.push({
          id: `sale-${saleNumber}`,
          saleNumber: `INV-${saleNumber}`,
          posSessionId: sessionId,
          totalAmount: parseFloat(saleTotal.toFixed(2)),
          tax: parseFloat((saleTotal * 0.1).toFixed(2)),
          discount: 0,
          paymentMethod,
          employeeId: 'e-2',
          customerId: `c-${Math.floor(Math.random() * 3) + 1}`,
          date: `${dateStr}T12:00:00Z`,
          status: 'COMPLETED',
          items: saleItems
        });
      }

      // Close session calculation
      const closingSess = this.posSessions.find(s => s.id === sessionId);
      if (closingSess) {
        closingSess.closingBalance = 150.00 + dayCashSales;
      }

      // Daily Closing Ledger
      this.dailyClosings.push({
        id: `close-${dateStr}`,
        branchId: 'b-1',
        cashboxId: 'cb-1',
        openingBalance: 150.00,
        closingBalance: 150.00 + dayCashSales,
        systemExpected: 150.00 + dayCashSales,
        physicalActual: 150.00 + dayCashSales + (Math.random() > 0.95 ? (Math.random() > 0.5 ? 5 : -5) : 0), // small variations occasionally
        difference: 0,
        closedById: 'e-2',
        date: dateStr
      });
      // Adjust difference
      const lastClosing = this.dailyClosings[this.dailyClosings.length - 1];
      lastClosing.difference = lastClosing.physicalActual - lastClosing.systemExpected;
    }

    this.auditLogs = [
      { id: 'al-init-1', timestamp: '2026-07-05T09:05:00Z', employeeName: 'أليس (الكاشير)', action: 'LOGIN', message: 'قام الكاشير أليس بتسجيل الدخول وبدء وردية الكاشير بعهدة افتتاحية $150.00' },
      { id: 'al-init-2', timestamp: '2026-07-05T14:22:15Z', employeeName: 'يحيى (المالك)', action: 'ADJUSTMENT', message: 'قام المالك يحيى بتعديل جرد طعام كلاب رويال كانين (10kg) بقيمة +10 سلع' },
      { id: 'al-init-3', timestamp: '2026-07-04T17:55:00Z', employeeName: 'أليس (الكاشير)', action: 'REFUND', message: 'قام الكاشير أليس بإرجاع وإلغاء الفاتورة INV-984 بقيمة $65.00 وإرجاع البضائع للمستودع' }
    ];
  }

  // API Methods
  getKPIMetrics(): KPIMetrics {
    const totalSales = this.sales.reduce((acc, s) => acc + s.totalAmount, 0);
    const totalCOGS = this.sales.reduce((acc, s) => {
      return acc + s.items.reduce((sum, item) => sum + (item.cost * item.quantity), 0);
    }, 0);
    const totalExpenses = this.expenses.reduce((acc, e) => acc + e.amount, 0);

    const grossProfit = totalSales - totalCOGS;
    const netProfit = grossProfit - totalExpenses;
    const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

    const averageBasket = this.sales.length > 0 ? totalSales / this.sales.length : 0;
    
    // Inventory calculation
    const currentInventoryVal = this.variants.reduce((acc, v) => acc + (v.stockQuantity * v.cost), 0);
    const inventoryTurnover = currentInventoryVal > 0 ? totalCOGS / currentInventoryVal : 0;

    // Fast moving variants
    const variantSalesMap: Record<string, { name: string; count: number }> = {};
    this.sales.forEach(s => {
      s.items.forEach(item => {
        if (item.type === 'PRODUCT') {
          if (!variantSalesMap[item.itemId]) {
            variantSalesMap[item.itemId] = { name: item.name, count: 0 };
          }
          variantSalesMap[item.itemId].count += item.quantity;
        }
      });
    });

    const sortedVariants = Object.entries(variantSalesMap)
      .map(([id, info]) => ({ variantId: id, name: info.name, salesCount: info.count }))
      .sort((a, b) => b.salesCount - a.salesCount);

    const fastMovingItems = sortedVariants.slice(0, 3);
    const slowMovingItems = sortedVariants.slice(-3).reverse();

    // Dead Stock (stock > 0 and 0 sales in last 30 days)
    const deadStockCount = this.variants.filter(v => v.stockQuantity > 20).length; // Mock placeholder

    return {
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2)),
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      cogs: parseFloat(totalCOGS.toFixed(2)),
      inventoryTurnover: parseFloat(inventoryTurnover.toFixed(2)),
      averageBasket: parseFloat(averageBasket.toFixed(2)),
      clv: 350.00, // Static CRM estimation
      repeatCustomerRate: 64.5,
      deadStockCount,
      fastMovingItems,
      slowMovingItems,
      cashFlow: parseFloat((netProfit * 0.95).toFixed(2)), // cash collection adjustment
      burnRate: parseFloat((totalExpenses / 3).toFixed(2)) // monthly average overhead
    };
  }

  getAIInsights(): AIAdvisorInsight {
    const kpis = this.getKPIMetrics();
    const isProfitable = kpis.netProfit > 0;
    const margin = kpis.profitMargin;

    return {
      businessSummary: `يُشير مستشار أنيماسيز إلى هامش ربح إجمالي صحي بنسبة ${(margin + 5).toFixed(1)}٪ خلال آخر 90 يومًا. الأداء الصافي ${isProfitable ? 'مربح' : 'خسارة'} بصافي ربح يبلغ $${kpis.netProfit.toLocaleString()}. تحقق خدمات الجروومينغ هوامش إجمالية استثنائية بنسبة 70٪، مما يجعلها المحرك المالي الأساسي للمحل، في حين تُقيّد تكلفة البضاعة المباعة المرتفعة للأغذية المستوردة هوامش التجزئة عند 46٪.`,
      topOpportunities: [
        {
          title: 'تحسين استغلال طاقة الموظفين',
          description: 'تُظهر جداول الجروومينغ انخفاضًا بنسبة 42٪ أيام الثلاثاء. نوصي بتقديم خصم 15٪ لخدمات الاستحمام أيام الثلاثاء لتحقيق توازن في عبء العمل اليومي.',
          priority: 'HIGH'
        },
        {
          title: 'البيع التكميلي خلال زيارات الجروومينغ',
          description: 'فقط 18٪ من مواعيد الجروومينغ تشمل شراء منتج تجزئة. تجميع ألعاب المضغ مع خدمات الجروومينغ يمكنه رفع متوسط قيمة السلة بمقدار $8.',
          priority: 'MEDIUM'
        }
      ],
      criticalAlerts: [
        {
          title: 'انتهاء صلاحية Flea & Tick Chewable Tablets',
          description: '3 علب من أقراص Bravecto (الدفعة BAT-2026-092) تنتهي صلاحيتها في 2026-09-30. معدل المبيعات اليومي الحالي يشير إلى أن علبة واحدة ستبقى غير مباعة، مما يؤدي إلى خسارة $24.',
          severity: 'WARNING'
        },
        {
          title: 'تنبيه نقص مخزون: Kitten Dry Cat Food',
          description: 'Kitten Dry Cat Food (كيس 2 كجم) تبقى منه 4 أكياس فقط (الحد الأدنى 15). يجب تنفيذ طلب الإعادة فورًا.',
          severity: 'CRITICAL'
        }
      ],
      recommendations: [
        {
          title: 'طلب إعادة تخزين Kitten Dry Cat Food',
          action: 'اطلب 30 كيسًا من موزع Purina (تكلفة الموردين: $360.00 إجمالي).',
          impact: 'يمنع خسارة إيرادات تجزئة متوقعة بقيمة $220.00 الأسبوع القادم.'
        },
        {
          title: 'تخفيض سعر Flea & Tick Chewable Tablets قارة الانتهاء',
          action: 'طبّق خصم ترويجي 20٪ على الدفعة BAT-2026-092 من أقراص Bravecto لتسريع البيع.',
          impact: 'استرداد $19.20 من تكلفة المنتج وتصفية المخزون.'
        }
      ],
      forecastText: 'من المتوقع نمو المبيعات بنسبة 5.4٪ الشهر القادم بسبب الارتفاع الموسمي في طلبات الجروومينغ. ومن المتوقع أن تظل المصاريف مستقرة، مما يدفع هوامش الربح الصافي إلى 14.8٪.'
    };
  }

  refundSale(saleId: string, employeeId: string) {
    const sale = this.sales.find(s => s.id === saleId);
    if (!sale) return;
    if (sale.status === 'REFUNDED') return;

    sale.status = 'REFUNDED';

    sale.items.forEach(item => {
      if (item.type === 'PRODUCT') {
        const variant = this.variants.find(v => v.id === item.itemId);
        if (variant) {
          variant.stockQuantity += item.quantity;
          this.stockMovements.push({
            id: `mov-ref-${Date.now()}-${item.itemId}`,
            warehouseId: 'w-2',
            productVariantId: item.itemId,
            quantity: item.quantity,
            type: 'ADJUSTMENT',
            timestamp: new Date().toISOString(),
            employeeId
          });
        }
      }
    });

    const emp = this.employees.find(e => e.id === employeeId);
    const empName = emp ? (emp.role === 'OWNER' ? 'يحيى (المالك)' : emp.role === 'CASHIER' ? 'أليس (الكاشير)' : 'بوب (الحلاق)') : 'موظف';
    const auditMsg = `قام ${empName} بإرجاع وإلغاء الفاتورة ${sale.saleNumber} بالكامل بقيمة $${sale.totalAmount.toFixed(2)} وإرجاع البضائع للمستودع`;
    
    this.auditLogs.unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      employeeName: empName,
      action: 'REFUND',
      message: auditMsg
    });
  }
}

export const mockDb = new MockDatabase();
