-- Update Roles and Permissions to rich Arabic names and descriptions

UPDATE permissions SET name = 'عرض لوحة التحكم الرئيسية', module = 'Dashboard' WHERE code = 'dashboard.view';
UPDATE permissions SET name = 'عرض المؤشرات المالية والمبيعات (KPIs)', module = 'Dashboard' WHERE code = 'dashboard.financial_kpis';
UPDATE permissions SET name = 'عرض المخططات الرسم البياني للإحصائيات', module = 'Dashboard' WHERE code = 'dashboard.charts';
UPDATE permissions SET name = 'عرض التنبيهات وإشعارات النظام', module = 'Dashboard' WHERE code = 'dashboard.alerts';

UPDATE permissions SET name = 'عرض قائمة المنتجات والأصناف', module = 'Products' WHERE code = 'products.view';
UPDATE permissions SET name = 'إضافة منتجات وأصناف جديدة', module = 'Products' WHERE code = 'products.add';
UPDATE permissions SET name = 'تعديل بيانات وأسعار المنتجات', module = 'Products' WHERE code = 'products.edit';
UPDATE permissions SET name = 'حذف منتج من القائمة', module = 'Products' WHERE code = 'products.delete';
UPDATE permissions SET name = 'تعديل أسعار البيع والشراء', module = 'Products' WHERE code = 'products.change_prices';
UPDATE permissions SET name = 'طباعة الباركود والملصقات (QR)', module = 'Products' WHERE code = 'products.print_barcode';
UPDATE permissions SET name = 'إدارة وتصنيف أقسام المنتجات', module = 'Products' WHERE code = 'products.manage_categories';
UPDATE permissions SET name = 'إدارة العلامات التجارية (ماركات)', module = 'Products' WHERE code = 'products.manage_brands';
UPDATE permissions SET name = 'إدارة سجلات الموردين والشركات', module = 'Products' WHERE code = 'products.manage_suppliers';

UPDATE permissions SET name = 'عرض حالة وقوائم المخزون والمستودعات', module = 'Inventory' WHERE code = 'inventory.view';
UPDATE permissions SET name = 'استلام وإدخال بضائع للمخزن', module = 'Inventory' WHERE code = 'inventory.receive_stock';
UPDATE permissions SET name = 'تعديل وتسوية كميات المخزون', module = 'Inventory' WHERE code = 'inventory.stock_adjustment';
UPDATE permissions SET name = 'إجراء الجرد الدوري للمخازن', module = 'Inventory' WHERE code = 'inventory.inventory_count';
UPDATE permissions SET name = 'إدارة الدفعات والباتشات (Batches)', module = 'Inventory' WHERE code = 'inventory.batch_management';
UPDATE permissions SET name = 'متابعة وتنبيهات تواريخ الانتهاء', module = 'Inventory' WHERE code = 'inventory.expiry_management';
UPDATE permissions SET name = 'تحويل بضائع بين المستودعات', module = 'Inventory' WHERE code = 'inventory.warehouse_transfer';
UPDATE permissions SET name = 'عرض سجل وتاريخ حركات المخزون', module = 'Inventory' WHERE code = 'inventory.view_stock_history';

UPDATE permissions SET name = 'فتح وردية كاشير جديدة', module = 'Sales' WHERE code = 'sales.open_shift';
UPDATE permissions SET name = 'إغلاق الوردية وتسليم الدرج', module = 'Sales' WHERE code = 'sales.close_shift';
UPDATE permissions SET name = 'إجراء عملية بيع إصدار فاتورة (POS)', module = 'Sales' WHERE code = 'sales.create_sale';
UPDATE permissions SET name = 'تطبيق خصم على الفاتورة', module = 'Sales' WHERE code = 'sales.apply_discount';
UPDATE permissions SET name = 'تعديل سعر البيع يدويًا', module = 'Sales' WHERE code = 'sales.override_price';
UPDATE permissions SET name = 'إرجاع واسترداد فاتورة مبيعات', module = 'Sales' WHERE code = 'sales.refund_sale';
UPDATE permissions SET name = 'إلغاء وتفريغ فاتورة بيع', module = 'Sales' WHERE code = 'sales.void_invoice';
UPDATE permissions SET name = 'إعادة طباعة الفواتير السابقة', module = 'Sales' WHERE code = 'sales.reprint_invoice';
UPDATE permissions SET name = 'طباعة الفاتورة الحرارية (Thermal)', module = 'Sales' WHERE code = 'sales.print_thermal_receipt';
UPDATE permissions SET name = 'طباعة الفاتورة الكبيرة (A4)', module = 'Sales' WHERE code = 'sales.print_a4_invoice';

UPDATE permissions SET name = 'عرض سجل العوالم وقائمة العملاء', module = 'Customers' WHERE code = 'customers.view';
UPDATE permissions SET name = 'إضافة عميل جديد', module = 'Customers' WHERE code = 'customers.add';
UPDATE permissions SET name = 'تعديل بيانات العملاء والتواصل', module = 'Customers' WHERE code = 'customers.edit';
UPDATE permissions SET name = 'حذف حساب عميل', module = 'Customers' WHERE code = 'customers.delete';
UPDATE permissions SET name = 'حظر / إلغاء حظر عميل', module = 'Customers' WHERE code = 'customers.ban';
UPDATE permissions SET name = 'إدارة النقاط وبرنامج الولاء', module = 'Customers' WHERE code = 'customers.manage_loyalty';
UPDATE permissions SET name = 'عرض سجل مشتريات العميل', module = 'Customers' WHERE code = 'customers.view_purchase_history';

UPDATE permissions SET name = 'عرض سجل وحسابات الحيوانات الأليفة', module = 'Pets' WHERE code = 'pets.view';
UPDATE permissions SET name = 'إضافة ملف حيوان أليف جديد', module = 'Pets' WHERE code = 'pets.add';
UPDATE permissions SET name = 'تعديل السجل الطبي والتاريخ للحيوان', module = 'Pets' WHERE code = 'pets.edit';
UPDATE permissions SET name = 'حذف ملف حيوان أليف', module = 'Pets' WHERE code = 'pets.delete';

UPDATE permissions SET name = 'عرض جدول مواعيد خدمات العناية والتجميل', module = 'Grooming' WHERE code = 'grooming.view_appointments';
UPDATE permissions SET name = 'حجز موعد خدمة جديد', module = 'Grooming' WHERE code = 'grooming.create_appointment';
UPDATE permissions SET name = 'تعديل بيانات وتوقيت موعد الخدمة', module = 'Grooming' WHERE code = 'grooming.edit_appointment';
UPDATE permissions SET name = 'إلغاء حجز موعد الخدمة', module = 'Grooming' WHERE code = 'grooming.cancel_appointment';
UPDATE permissions SET name = 'إكمال وإنهاء حجز الخدمة', module = 'Grooming' WHERE code = 'grooming.complete_appointment';

UPDATE permissions SET name = 'عرض جدول وقوائم حجوزات الإيواء', module = 'Boarding' WHERE code = 'boarding.view_reservations';
UPDATE permissions SET name = 'إنشاء حجز إيواء وفندقة جديد', module = 'Boarding' WHERE code = 'boarding.create_reservation';
UPDATE permissions SET name = 'تعديل بيانات حجز الإيواء', module = 'Boarding' WHERE code = 'boarding.edit_reservation';
UPDATE permissions SET name = 'إلغاء حجز إيواء', module = 'Boarding' WHERE code = 'boarding.cancel_reservation';

UPDATE permissions SET name = 'عرض سجل فواتير المشتريات', module = 'Purchases' WHERE code = 'purchases.view';
UPDATE permissions SET name = 'تسجيل فاتورة شراء جديدة', module = 'Purchases' WHERE code = 'purchases.create_invoice';
UPDATE permissions SET name = 'تعديل بيانات فاتورة شراء', module = 'Purchases' WHERE code = 'purchases.edit';
UPDATE permissions SET name = 'إرجاع بضائع للمورد (مرتجع مشتريات)', module = 'Purchases' WHERE code = 'purchases.return';
UPDATE permissions SET name = 'قراءة واستيراد الفواتير بالذكاء الاصطناعي (OCR)', module = 'Purchases' WHERE code = 'purchases.ocr_import';

UPDATE permissions SET name = 'عرض سجل قائمة المصاريف', module = 'Finance' WHERE code = 'finance.view_expenses';
UPDATE permissions SET name = 'تسجيل مصروف جديد', module = 'Finance' WHERE code = 'finance.add_expense';
UPDATE permissions SET name = 'تعديل بيانات مصروف', module = 'Finance' WHERE code = 'finance.edit_expense';
UPDATE permissions SET name = 'حذف سجل مصروف', module = 'Finance' WHERE code = 'finance.delete_expense';
UPDATE permissions SET name = 'عرض صافي الأرباح والأداء المالي', module = 'Finance' WHERE code = 'finance.view_profit';
UPDATE permissions SET name = 'عرض التقارير وإغلاقات الصندوق اليومية', module = 'Finance' WHERE code = 'finance.view_reports';

UPDATE permissions SET name = 'عرض التقرير العامة للنظام', module = 'Reports' WHERE code = 'reports.view';
UPDATE permissions SET name = 'تصدير البيانات والتقارير إلى ملف Excel', module = 'Reports' WHERE code = 'reports.export_excel';
UPDATE permissions SET name = 'تصدير التقرير إلى ملف PDF', module = 'Reports' WHERE code = 'reports.export_pdf';
UPDATE permissions SET name = 'طباعة التقارير المباشرة', module = 'Reports' WHERE code = 'reports.print';

UPDATE permissions SET name = 'عرض قائمة وحسابات الموظفين', module = 'Employees' WHERE code = 'employees.view';
UPDATE permissions SET name = 'إضافة حساب موظف جديد', module = 'Employees' WHERE code = 'employees.add';
UPDATE permissions SET name = 'تعديل بيانات ودور الموظف', module = 'Employees' WHERE code = 'employees.edit';
UPDATE permissions SET name = 'حذف حساب موظف', module = 'Employees' WHERE code = 'employees.delete';

UPDATE permissions SET name = 'عرض جدول الأدوار والصلاحيات', module = 'Roles' WHERE code = 'roles.view';
UPDATE permissions SET name = 'إنشاء دور / وظيفية جديدة', module = 'Roles' WHERE code = 'roles.create';
UPDATE permissions SET name = 'تعديل مسمى ووصف الدور', module = 'Roles' WHERE code = 'roles.edit';
UPDATE permissions SET name = 'حذف دور وظيفي', module = 'Roles' WHERE code = 'roles.delete';
UPDATE permissions SET name = 'تعيين وتعديل صلاحيات الوصول للأدوار', module = 'Roles' WHERE code = 'roles.assign_permissions';

UPDATE permissions SET name = 'عرض شاشة إعدادات النظام', module = 'Settings' WHERE code = 'settings.view';
UPDATE permissions SET name = 'تعديل إعدادات وبيانات المحل', module = 'Settings' WHERE code = 'settings.edit';
UPDATE permissions SET name = 'إنشاء نسخة احتياطية للنظام', module = 'Settings' WHERE code = 'settings.backup';
UPDATE permissions SET name = 'استعادة نسخة احتياطية', module = 'Settings' WHERE code = 'settings.restore';
UPDATE permissions SET name = 'تصفير البيانات (ضبط المصنع)', module = 'Settings' WHERE code = 'settings.factory_reset';

UPDATE permissions SET name = 'استخدام المساعد الذكي التفاعلي', module = 'AI' WHERE code = 'ai.use_assistant';
UPDATE permissions SET name = 'عرض التوصيات والتحليلات الذكية', module = 'AI' WHERE code = 'ai.insights';
UPDATE permissions SET name = 'تحليل صور المستندات بالذكاء الاصطناعي', module = 'AI' WHERE code = 'ai.ocr_analysis';

-- Translate system roles
UPDATE roles SET name = 'المالك / المدير العام', description = 'صلاحيات كاملة وإدارة جميع أجزاء النظام' WHERE code = 'OWNER';
UPDATE roles SET name = 'مدير الفرع', description = 'إدارة العمليات والموظفين والمخزون والمالية' WHERE code = 'MANAGER';
UPDATE roles SET name = 'الكاشير / المبيعات', description = 'عمليات نقطة البيع POS والتحصيل وإدارة الدرج' WHERE code = 'CASHIER';
UPDATE roles SET name = 'أخصائي التجميل والعناية', description = 'إدارة مواعيد وحجوزات الخدمات والحيوانات' WHERE code = 'GROOMER';
