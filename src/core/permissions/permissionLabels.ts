/**
 * Comprehensive Arabic translations dictionary for RBAC Modules, Roles, and Permission Codes.
 */

export const MODULE_TRANSLATIONS: Record<string, string> = {
  'Dashboard': 'لوحة التحكم الإستراتيجية',
  'Products': 'إدارة المنتجات والأصناف',
  'Inventory': 'المخزون وحركات المستودعات',
  'Sales': 'المبيعات ونقطة البيع (POS)',
  'Customers': 'سجل العملاء وإدارة الحسابات',
  'Pets': 'سجل الحيوانات الأليفة',
  'Grooming': 'خدمات العناية والتجميل (Grooming)',
  'Boarding': 'خدمات الإيواء والفندقة',
  'Purchases': 'المشتريات وفواتير الموردين',
  'Finance': 'الإدارة المالية والمصاريف',
  'Reports': 'التقارير والإحصائيات',
  'Employees': 'إدارة الموظفين وحسابات العمل',
  'Roles': 'الأدوار وصلاحيات الوصول',
  'Settings': 'إعدادات النظام العامة',
  'AI': 'الذكاء الاصطناعي والمستشار',
};

export const ROLE_TRANSLATIONS: Record<string, { name: string; description: string }> = {
  'OWNER': {
    name: 'المالك / المدير العام',
    description: 'صلاحيات كاملة وغير محدودة لجميع أجزاء وخيارات النظام',
  },
  'MANAGER': {
    name: 'مدير الفرع / التشغيل',
    description: 'إدارة وإشراف كامل على العمليات والموظفين والمخزون باستثناء تصفير النظام',
  },
  'CASHIER': {
    name: 'الكاشير / المبيعات',
    description: 'إجراء عمليات البيع والتحصيل وإغلاق الوردية والاطلاع على العملاء والمخزون',
  },
  'GROOMER': {
    name: 'أخصائي التجميل والعناية',
    description: 'إدارة حجز ومواعيد جلسات النظافة والتجميل والتعامل مع ملفات الحيوانات',
  },
};

export const PERMISSION_TRANSLATIONS: Record<string, { name: string; description?: string }> = {
  // Dashboard
  'dashboard.view': { name: 'عرض لوحة التحكم الرئيسية' },
  'dashboard.financial_kpis': { name: 'عرض المؤشرات المالية والمبيعات (KPIs)' },
  'dashboard.charts': { name: 'عرض المخططات الرسم البياني للإحصائيات' },
  'dashboard.alerts': { name: 'عرض التنبيهات وإشعارات النظام' },

  // Products
  'products.view': { name: 'عرض قائمة المنتجات والأصناف' },
  'products.add': { name: 'إضافة منتجات وأصناف جديدة' },
  'products.edit': { name: 'تعديل بيانات وأسعار المنتجات' },
  'products.delete': { name: 'حذف منتج من القائمة' },
  'products.change_prices': { name: 'تعديل أسعار البيع والشراء' },
  'products.print_barcode': { name: 'طباعة الباركود والملصقات (QR)' },
  'products.manage_categories': { name: 'إدارة وتصنيف أقسام المنتجات' },
  'products.manage_brands': { name: 'إدارة العلامات التجارية (ماركات)' },
  'products.manage_suppliers': { name: 'إدارة سجلات الموردين والشركات' },

  // Inventory
  'inventory.view': { name: 'عرض حالة وقوائم المخزون والمستودعات' },
  'inventory.receive_stock': { name: 'استلام وإدخال بضائع للمخزن' },
  'inventory.stock_adjustment': { name: 'تعديل وتسوية كميات المخزون' },
  'inventory.inventory_count': { name: 'إجراء الجرد الدوري للمخازن' },
  'inventory.batch_management': { name: 'إدارة الدفعات والباتشات (Batches)' },
  'inventory.expiry_management': { name: 'متابعة وتنبيهات تواريخ الانتهاء' },
  'inventory.warehouse_transfer': { name: 'تحويل بضائع بين المستودعات' },
  'inventory.view_stock_history': { name: 'عرض سجل وتاريخ حركات المخزون' },

  // Sales (POS)
  'sales.open_shift': { name: 'فتح وردية كاشير جديدة' },
  'sales.close_shift': { name: 'إغلاق الوردية وتسليم الدرج' },
  'sales.create_sale': { name: 'إجراء عملية بيع إصدار فاتورة (POS)' },
  'sales.apply_discount': { name: 'تطبيق خصم على الفاتورة' },
  'sales.override_price': { name: 'تعديل سعر البيع يدويًا' },
  'sales.refund_sale': { name: 'إرجاع واسترداد فاتورة مبيعات' },
  'sales.void_invoice': { name: 'إلغاء وتفريغ فاتورة بيع' },
  'sales.reprint_invoice': { name: 'إعادة طباعة الفواتير السابقة' },
  'sales.print_thermal_receipt': { name: 'طباعة الفاتورة الحرارية (Thermal)' },
  'sales.print_a4_invoice': { name: 'طباعة الفاتورة الكبيرة (A4)' },

  // Customers
  'customers.view': { name: 'عرض سجل العوالم وقائمة العملاء' },
  'customers.add': { name: 'إضافة عميل جديد' },
  'customers.edit': { name: 'تعديل بيانات العملاء والتواصل' },
  'customers.delete': { name: 'حذف حساب عميل' },
  'customers.ban': { name: 'حظر / إلغاء حظر عميل' },
  'customers.manage_loyalty': { name: 'إدارة النقاط وبرنامج الولاء' },
  'customers.view_purchase_history': { name: 'عرض سجل مشتريات العميل' },

  // Pets
  'pets.view': { name: 'عرض سجل وحسابات الحيوانات الأليفة' },
  'pets.add': { name: 'إضافة ملف حيوان أليف جديد' },
  'pets.edit': { name: 'تعديل السجل الطبي والتاريخ للحيوان' },
  'pets.delete': { name: 'حذف ملف حيوان أليف' },

  // Grooming
  'grooming.view_appointments': { name: 'عرض جدول مواعيد خدمات العناية والتجميل' },
  'grooming.create_appointment': { name: 'حجز موعد خدمة جديد' },
  'grooming.edit_appointment': { name: 'تعديل بيانات وتوقيت موعد الخدمة' },
  'grooming.cancel_appointment': { name: 'إلغاء حجز موعد الخدمة' },
  'grooming.complete_appointment': { name: 'إكمال وإنهاء حجز الخدمة' },

  // Boarding
  'boarding.view_reservations': { name: 'عرض جدول وقوائم حجوزات الإيواء' },
  'boarding.create_reservation': { name: 'إنشاء حجز إيواء وفندقة جديد' },
  'boarding.edit_reservation': { name: 'تعديل بيانات حجز الإيواء' },
  'boarding.cancel_reservation': { name: 'إلغاء حجز إيواء' },

  // Purchases
  'purchases.view': { name: 'عرض سجل فواتير المشتريات' },
  'purchases.create_invoice': { name: 'تسجيل فاتورة شراء جديدة' },
  'purchases.edit': { name: 'تعديل بيانات فاتورة شراء' },
  'purchases.return': { name: 'إرجاع بضائع للمورد (مرتجع مشتريات)' },
  'purchases.ocr_import': { name: 'قراءة واستيراد الفواتير بالذكاء الاصطناعي (OCR)' },

  // Finance
  'finance.view_expenses': { name: 'عرض سجل قائمة المصاريف' },
  'finance.add_expense': { name: 'تسجيل مصروف جديد' },
  'finance.edit_expense': { name: 'تعديل بيانات مصروف' },
  'finance.delete_expense': { name: 'حذف سجل مصروف' },
  'finance.view_profit': { name: 'عرض صافي الأرباح والأداء المالي' },
  'finance.view_reports': { name: 'عرض التقارير وإغلاقات الصندوق اليومية' },

  // Reports
  'reports.view': { name: 'عرض التقرير العامة للنظام' },
  'reports.export_excel': { name: 'تصدير البيانات والتقارير إلى ملف Excel' },
  'reports.export_pdf': { name: 'تصدير التقرير إلى ملف PDF' },
  'reports.print': { name: 'طباعة التقارير المباشرة' },

  // Employees
  'employees.view': { name: 'عرض قائمة وحسابات الموظفين' },
  'employees.add': { name: 'إضافة حساب موظف جديد' },
  'employees.edit': { name: 'تعديل بيانات ودور الموظف' },
  'employees.delete': { name: 'حذف حساب موظف' },

  // Roles
  'roles.view': { name: 'عرض جدول الأدوار والصلاحيات' },
  'roles.create': { name: 'إنشاء دور / وظيفية جديدة' },
  'roles.edit': { name: 'تعديل مسمى ووصف الدور' },
  'roles.delete': { name: 'حذف دور وظيفي' },
  'roles.assign_permissions': { name: 'تعيين وتعديل صلاحيات الوصول للأدوار' },

  // Settings
  'settings.view': { name: 'عرض شاشة إعدادات النظام' },
  'settings.edit': { name: 'تعديل إعدادات وبيانات المحل' },
  'settings.backup': { name: 'إنشاء نسخة احتياطية للنظام' },
  'settings.restore': { name: 'استعادة نسخة احتياطية' },
  'settings.factory_reset': { name: 'تصفير البيانات (ضبط المصنع)' },

  // AI
  'ai.use_assistant': { name: 'استخدام المساعد الذكي التفاعلي' },
  'ai.insights': { name: 'عرض التوصيات والتحليلات الذكية' },
  'ai.ocr_analysis': { name: 'تحليل صور المستندات بالذكاء الاصطناعي' },
};

export function translateModuleName(moduleName: string): string {
  if (!moduleName) return '';
  return MODULE_TRANSLATIONS[moduleName] || moduleName;
}

export function translatePermissionName(code: string, originalName?: string): string {
  if (PERMISSION_TRANSLATIONS[code]?.name) {
    return PERMISSION_TRANSLATIONS[code].name;
  }
  return originalName || code;
}

export function translateRole(code: string, originalName: string, originalDesc?: string): { name: string; description: string } {
  const upperCode = (code || '').toUpperCase();
  if (ROLE_TRANSLATIONS[upperCode]) {
    return ROLE_TRANSLATIONS[upperCode];
  }
  return {
    name: originalName || code,
    description: originalDesc || '',
  };
}
