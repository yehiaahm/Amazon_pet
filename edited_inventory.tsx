import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  useProducts, useVariants, useBatches, 
  useUpdateStock, useWarehouses, useStockMovements,
  useImportHistory, useStartImportSession, useUploadImportChunk,
  useFinalizeImportSession, useUndoImportSession, useSuppliers,
  usePurchaseInvoices, usePayPurchaseInvoice
} from '../../core/hooks/useERPData';
import { api } from '../../core/api/endpoints';
import { useUIStore } from '../../core/stores/uiStore';
import { 
  PlusCircle, Calendar, ArrowRightLeft, 
  History, Layers, Download, Upload, Undo, Camera, Eye,
  Brain, DollarSign
} from 'lucide-react';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import DataTable from '../../components/ui/DataTable';

// Levenshtein helper functions
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: b.length + 1 }, () => 
    Array(a.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1, // deletion
        matrix[j][i - 1] + 1, // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  return matrix[b.length][a.length];
};

const getSimilarity = (a: string, b: string): number => {
  const distance = getLevenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
};

// Column Mapping Auto-Detect Dictionary
const AUTO_MAP_DICTIONARY: Record<string, string[]> = {
  sku: [
    'sku', 'code', 'كود', 'رقم المنتج', 'الباركود', 'barcode', 'item code',
    'كود السلعة', 'كود_السلعة', 'product code', 'item_code', 'part number',
    'part_number', 'partno', 'رقم', 'كود المنتج', 'رمز', 'رمز المنتج',
    'id', 'item id', 'رقم الصنف', 'كود الصنف', 'ref', 'reference'
  ],
  productName: [
    'product', 'name', 'الاسم', 'اسم المنتج', 'اسم السلعة', 'اسم',
    'product name', 'item name', 'item_name', 'product_name', 'description',
    'وصف', 'وصف المنتج', 'المنتج', 'السلعة', 'البضاعة', 'العنصر',
    'الصنف', 'اسم الصنف', 'البند', 'اسم البند', 'اسم البضاعة'
  ],
  variantName: [
    'variant', 'size', 'الصنف', 'الحجم', 'الوزن', 'المقاس',
    'variant name', 'نوع', 'النوع', 'درجة', 'الدرجة'
  ],
  cost: [
    'cost', 'سعر الشراء', 'التكلفة', 'سعر التكلفة', 'شراء', 'سعر_الشراء',
    'purchase price', 'buy price', 'cost price', 'unit cost', 'سعر الوحدة',
    'تكلفة', 'سعر الشراء للوحدة', 'سعرالشراء', 'شراء_الوحدة'
  ],
  price: [
    'price', 'selling price', 'سعر البيع', 'السعر', 'بيع', 'سعر_البيع',
    'sale price', 'retail price', 'unit price', 'سعر التجزئة', 'سعرالبيع',
    'بيع_الوحدة', 'سعر المبيع', 'ثمن البيع'
  ],
  stock: [
    'stock', 'qty', 'الكمية', 'المخزون', 'الرصيد', 'كمية الجرد',
    'quantity', 'on hand', 'available', 'balance', 'units', 'الكميه',
    'رصيد', 'الجرد', 'كمية', 'مخزون', 'عدد'
  ],
  categoryName: [
    'category', 'الفئة', 'القسم', 'التصنيف',
    'cat', 'group', 'مجموعة', 'department', 'type', 'نوع المنتج'
  ],
  brand: [
    'brand', 'الماركة', 'الشركة', 'براند',
    'manufacturer', 'make', 'ماركة', 'علامة', 'علامة تجارية'
  ],
  supplier: [
    'supplier', 'vendor', 'المورد', 'مورد',
    'distributor', 'source', 'الموزع', 'جهة الشراء'
  ]
};

const runLocalFallbackMapping = (headers: string[]) => {
  const detectedMappings: Record<string, string> = {
    sku: '', productName: '', variantName: '', cost: '', price: '', stock: '', categoryName: '', brand: '', supplier: ''
  };
  const detectedConfidences: Record<string, number> = {
    sku: 0, productName: 0, variantName: 0, cost: 0, price: 0, stock: 0, categoryName: 0, brand: 0, supplier: 0
  };

  const normalize = (str: any): string => {
    if (str === null || str === undefined) return '';
    const s = String(str);
    return s.toLowerCase().trim()
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ـ]/g, '')
      .replace(/\s+/g, '').replace(/[^a-zA-Z0-9\u0627-\u064a]/g, '');
  };

  Object.keys(AUTO_MAP_DICTIONARY).forEach(field => {
    let bestHeader = '';
    let bestScore = 0;

    headers.forEach(h => {
      const normH = normalize(h);
      AUTO_MAP_DICTIONARY[field].forEach(syn => {
        const normSyn = normalize(syn);
        if (normH === normSyn) {
          if (bestScore < 0.99) {
            bestHeader = h;
            bestScore = 0.99;
          }
        } else if (normH.includes(normSyn) || normSyn.includes(normH)) {
          if (bestScore < 0.85) {
            bestHeader = h;
            bestScore = 0.85;
          }
        }
      });

      const sim = getSimilarity(normH, normalize(field));
      if (sim > 0.60 && sim > bestScore) {
        bestHeader = h;
        bestScore = sim;
      }
    });

    if (bestHeader) {
      detectedMappings[field] = bestHeader;
      detectedConfidences[field] = bestScore;
    }
  });

  return { mappings: detectedMappings, confidences: detectedConfidences };
};

// طبقة ثالثة: تحليل البيانات الفعلية لكل عمود (ليس فقط العنوان)
const runDataDrivenMapping = (
  headers: string[],
  rows: any[]
): { mappings: Record<string, string>; confidences: Record<string, number> } => {
  const detectedMappings: Record<string, string> = {
    sku: '', productName: '', variantName: '', cost: '', price: '', stock: '', categoryName: '', brand: '', supplier: ''
  };
  const detectedConfidences: Record<string, number> = {
    sku: 0, productName: 0, variantName: 0, cost: 0, price: 0, stock: 0, categoryName: 0, brand: 0, supplier: 0
  };

  const sampleRows = rows.slice(0, Math.min(rows.length, 20));

  const colStats = headers.map(h => {
    const values = sampleRows.map(r => r[h]).filter(v => v !== '' && v !== null && v !== undefined);
    if (values.length === 0) return { header: h, numericRatio: 0, avgLen: 0, uniqueRatio: 0, isIntLike: false, avgNumVal: 0, hasDecimals: false };

    const numericVals = values.map(v => parseFloat(String(v).replace(/,/g, ''))).filter(n => !isNaN(n));
    const numericRatio = numericVals.length / values.length;
    const avgLen = values.reduce((a, v) => a + String(v).length, 0) / values.length;
    const uniqueRatio = new Set(values.map(v => String(v).toLowerCase())).size / values.length;
    const isIntLike = numericVals.every(n => Number.isInteger(n) || Math.abs(n - Math.round(n)) < 0.001);
    const avgNumVal = numericVals.length > 0 ? numericVals.reduce((a, b) => a + b, 0) / numericVals.length : 0;
    const hasDecimals = numericVals.some(n => !Number.isInteger(n));
    const isAlphaNum = values.some(v => /^[A-Za-z0-9\-_.]+$/.test(String(v)));
    const isArabicText = values.some(v => /[\u0600-\u06FF]/.test(String(v)));

    return { header: h, numericRatio, avgLen, uniqueRatio, isIntLike, avgNumVal, hasDecimals, isAlphaNum, isArabicText };
  });

  // Score each column for each field type
  const scores: Record<string, Record<string, number>> = {};
  headers.forEach(h => { scores[h] = {}; });

  colStats.forEach(stat => {
    const { header: h, numericRatio, avgLen, uniqueRatio, isIntLike, avgNumVal, hasDecimals, isAlphaNum, isArabicText } = stat;

    // productName: mostly text, long-ish strings, high uniqueness, Arabic or English words
    scores[h]['productName'] =
      (numericRatio < 0.1 ? 0.4 : 0) +
      (avgLen > 5 && avgLen < 80 ? 0.3 : 0) +
      (uniqueRatio > 0.7 ? 0.2 : 0) +
      (isArabicText ? 0.1 : 0);

    // sku: short alphanumeric, high uniqueness, could be pure numbers or mixed
    scores[h]['sku'] =
      (uniqueRatio > 0.85 ? 0.35 : uniqueRatio > 0.5 ? 0.15 : 0) +
      (avgLen > 1 && avgLen < 20 ? 0.25 : 0) +
      (isAlphaNum ? 0.2 : 0) +
      (numericRatio > 0.8 && isIntLike && avgNumVal > 100000 ? 0.2 : 0); // barcode-like large integers

    // stock: integer numbers, small-ish values (0-10000), low uniqueness
    scores[h]['stock'] =
      (numericRatio > 0.8 ? 0.3 : 0) +
      (isIntLike ? 0.3 : 0) +
      (avgNumVal >= 0 && avgNumVal < 5000 ? 0.2 : 0) +
      (uniqueRatio < 0.5 ? 0.1 : 0) +
      (hasDecimals ? -0.3 : 0);

    // cost/price: decimal numbers, medium-ish values, higher values than qty
    const priceScore =
      (numericRatio > 0.8 ? 0.35 : 0) +
      (hasDecimals ? 0.2 : 0) +
      (avgNumVal > 0.5 && avgNumVal < 100000 ? 0.2 : 0) +
      (uniqueRatio > 0.3 ? 0.1 : 0);
    scores[h]['price'] = priceScore;
    scores[h]['cost'] = priceScore;

    // categoryName: text, low uniqueness (repeated categories), short-medium strings
    scores[h]['categoryName'] =
      (numericRatio < 0.1 ? 0.3 : 0) +
      (uniqueRatio < 0.4 ? 0.4 : 0) +
      (avgLen > 2 && avgLen < 30 ? 0.2 : 0);

    // brand: text, low uniqueness, short strings
    scores[h]['brand'] =
      (numericRatio < 0.1 ? 0.2 : 0) +
      (uniqueRatio < 0.5 ? 0.3 : 0) +
      (avgLen > 2 && avgLen < 25 ? 0.2 : 0);

    // supplier: text, very low uniqueness
    scores[h]['supplier'] =
      (numericRatio < 0.1 ? 0.2 : 0) +
      (uniqueRatio < 0.3 ? 0.5 : 0) +
      (avgLen > 2 && avgLen < 40 ? 0.2 : 0);

    scores[h]['variantName'] =
      (numericRatio < 0.5 ? 0.2 : 0) +
      (avgLen > 1 && avgLen < 20 ? 0.2 : 0) +
      (uniqueRatio < 0.5 ? 0.2 : 0);
  });

  // Assign best column per field (greedy, avoid reuse for critical fields)
  const usedHeaders = new Set<string>();
  const fieldPriority = ['productName', 'sku', 'stock', 'price', 'cost', 'categoryName', 'brand', 'supplier', 'variantName'];

// MISSING LINE 251
// MISSING LINE 252
// MISSING LINE 253
// MISSING LINE 254
// MISSING LINE 255
// MISSING LINE 256
// MISSING LINE 257
// MISSING LINE 258
// MISSING LINE 259
// MISSING LINE 260
// MISSING LINE 261
// MISSING LINE 262
// MISSING LINE 263
// MISSING LINE 264
// MISSING LINE 265
// MISSING LINE 266
// MISSING LINE 267
// MISSING LINE 268
// MISSING LINE 269
// MISSING LINE 270
// MISSING LINE 271
// MISSING LINE 272
// MISSING LINE 273
// MISSING LINE 274
// MISSING LINE 275
// MISSING LINE 276
// MISSING LINE 277
// MISSING LINE 278
// MISSING LINE 279
      detectedMappings['price'] = '';
      detectedConfidences['price'] = 0;
    }
  }

  return { mappings: detectedMappings, confidences: detectedConfidences };
};

// دمج نتائج الثلاث طبقات وأخذ الأعلى ثقة
const mergeMapping = (
  heuristic: { mappings: Record<string, string>; confidences: Record<string, number> },
  dataDriven: { mappings: Record<string, string>; confidences: Record<string, number> },
  ai: { mappings: Record<string, string>; confidences: Record<string, number> } | null
): { mappings: Record<string, string>; confidences: Record<string, number> } => {
  const finalMappings: Record<string, string> = {};
  const finalConfidences: Record<string, number> = {};
  const allFields = Object.keys(heuristic.mappings);

  allFields.forEach(field => {
    const candidates: { header: string; conf: number; source: string }[] = [];

    if (heuristic.mappings[field]) candidates.push({ header: heuristic.mappings[field], conf: heuristic.confidences[field] || 0, source: 'heuristic' });
    if (dataDriven.mappings[field]) candidates.push({ header: dataDriven.mappings[field], conf: dataDriven.confidences[field] || 0, source: 'data' });
    if (ai?.mappings[field]) candidates.push({ header: ai.mappings[field], conf: ai.confidences[field] || 0, source: 'ai' });

    if (candidates.length === 0) {
      finalMappings[field] = '';
      finalConfidences[field] = 0;
      return;
    }

    // If heuristic and data-driven agree on same header => boost confidence
    const heuristicHeader = heuristic.mappings[field];
    const dataHeader = dataDriven.mappings[field];
    const aiHeader = ai?.mappings[field];

    if (heuristicHeader && heuristicHeader === dataHeader) {
      finalMappings[field] = heuristicHeader;
      finalConfidences[field] = Math.min(0.98, (heuristic.confidences[field] || 0) + 0.15);
    } else if (aiHeader && (aiHeader === heuristicHeader || aiHeader === dataHeader)) {
      finalMappings[field] = aiHeader;
      finalConfidences[field] = Math.min(0.99, (ai?.confidences[field] || 0) + 0.1);
    } else {
      // Take highest confidence among all
      const best = candidates.reduce((a, b) => b.conf > a.conf ? b : a);
      finalMappings[field] = best.header;
      finalConfidences[field] = best.conf;
    }
  });

  return { mappings: finalMappings, confidences: finalConfidences };
};

export const Inventory: React.FC = () => {
  const currentEmployee = useUIStore(s => s.currentEmployee)!;
  
  // Custom queries & mutations
  const { data: products, isLoading: loadingProds } = useProducts();
  const { data: variants, isLoading: loadingVars } = useVariants();
  const { data: batches } = useBatches();
  const { data: warehouses } = useWarehouses();
// MISSING LINE 341
// MISSING LINE 342
// MISSING LINE 343
// MISSING LINE 344
// MISSING LINE 345
// MISSING LINE 346
// MISSING LINE 347
// MISSING LINE 348
// MISSING LINE 349
// MISSING LINE 350
// MISSING LINE 351
// MISSING LINE 352
// MISSING LINE 353
// MISSING LINE 354
// MISSING LINE 355
// MISSING LINE 356
// MISSING LINE 357
// MISSING LINE 358
// MISSING LINE 359
// MISSING LINE 360
// MISSING LINE 361
// MISSING LINE 362
// MISSING LINE 363
// MISSING LINE 364
// MISSING LINE 365
// MISSING LINE 366
// MISSING LINE 367
// MISSING LINE 368
// MISSING LINE 369
// MISSING LINE 370
// MISSING LINE 371
// MISSING LINE 372
// MISSING LINE 373
// MISSING LINE 374
// MISSING LINE 375
// MISSING LINE 376
// MISSING LINE 377
// MISSING LINE 378
// MISSING LINE 379
// MISSING LINE 380
// MISSING LINE 381
// MISSING LINE 382
// MISSING LINE 383
// MISSING LINE 384
// MISSING LINE 385
// MISSING LINE 386
// MISSING LINE 387
// MISSING LINE 388
// MISSING LINE 389
// MISSING LINE 390
// MISSING LINE 391
// MISSING LINE 392
// MISSING LINE 393
// MISSING LINE 394
// MISSING LINE 395
// MISSING LINE 396
// MISSING LINE 397
// MISSING LINE 398
// MISSING LINE 399
// MISSING LINE 400
// MISSING LINE 401
// MISSING LINE 402
// MISSING LINE 403
// MISSING LINE 404
// MISSING LINE 405
// MISSING LINE 406
// MISSING LINE 407
// MISSING LINE 408
// MISSING LINE 409
// MISSING LINE 410
// MISSING LINE 411
// MISSING LINE 412
// MISSING LINE 413
// MISSING LINE 414
// MISSING LINE 415
// MISSING LINE 416
// MISSING LINE 417
// MISSING LINE 418
// MISSING LINE 419
// MISSING LINE 420
// MISSING LINE 421
// MISSING LINE 422
// MISSING LINE 423
// MISSING LINE 424
// MISSING LINE 425
// MISSING LINE 426
// MISSING LINE 427
// MISSING LINE 428
// MISSING LINE 429
  // Importer states
  const [showImportModal, setShowImportModal] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [fileMeta, setFileMeta] = useState({ name: '', size: 0, hash: '' });
  
  // Mapping setup
  const [mappings, setMappings] = useState<Record<string, string>>({
    sku: '', productName: '', variantName: '', cost: '', price: '', stock: '', categoryName: '', brand: '', supplier: ''
  });
  
  const [mappingConfidences, setMappingConfidences] = useState<Record<string, number>>({
    sku: 0, productName: 0, variantName: 0, cost: 0, price: 0, stock: 0, categoryName: 0, brand: 0, supplier: 0
  });
  
  // Profiles
  const [savedProfiles, setSavedProfiles] = useState<Record<string, typeof mappings>>({});
  const [profileName, setProfileName] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('');

  // Validation
  const [validatedData, setValidatedData] = useState<any[]>([]);
  const [validationFilter, setValidationFilter] = useState<'ALL' | 'READY' | 'WARNING' | 'ERROR'>('ALL');
  
  // Import Execution
// MISSING LINE 456
// MISSING LINE 457
// MISSING LINE 458
// MISSING LINE 459
// MISSING LINE 460
// MISSING LINE 461
// MISSING LINE 462
// MISSING LINE 463
// MISSING LINE 464
// MISSING LINE 465
// MISSING LINE 466
// MISSING LINE 467
// MISSING LINE 468
// MISSING LINE 469
// MISSING LINE 470
// MISSING LINE 471
// MISSING LINE 472
// MISSING LINE 473
// MISSING LINE 474
// MISSING LINE 475
// MISSING LINE 476
// MISSING LINE 477
// MISSING LINE 478
// MISSING LINE 479
// MISSING LINE 480
// MISSING LINE 481
// MISSING LINE 482
// MISSING LINE 483
// MISSING LINE 484
// MISSING LINE 485
// MISSING LINE 486
// MISSING LINE 487
// MISSING LINE 488
// MISSING LINE 489
// MISSING LINE 490
// MISSING LINE 491
// MISSING LINE 492
// MISSING LINE 493
// MISSING LINE 494
// MISSING LINE 495
// MISSING LINE 496
// MISSING LINE 497
// MISSING LINE 498
// MISSING LINE 499
// MISSING LINE 500
// MISSING LINE 501
// MISSING LINE 502
// MISSING LINE 503
// MISSING LINE 504
// MISSING LINE 505
// MISSING LINE 506
// MISSING LINE 507
// MISSING LINE 508
// MISSING LINE 509
// MISSING LINE 510
// MISSING LINE 511
// MISSING LINE 512
// MISSING LINE 513
// MISSING LINE 514
// MISSING LINE 515
// MISSING LINE 516
// MISSING LINE 517
// MISSING LINE 518
// MISSING LINE 519
// MISSING LINE 520
// MISSING LINE 521
// MISSING LINE 522
// MISSING LINE 523
// MISSING LINE 524
// MISSING LINE 525
// MISSING LINE 526
// MISSING LINE 527
// MISSING LINE 528
// MISSING LINE 529
// MISSING LINE 530
// MISSING LINE 531
// MISSING LINE 532
// MISSING LINE 533
// MISSING LINE 534
// MISSING LINE 535
// MISSING LINE 536
// MISSING LINE 537
// MISSING LINE 538
// MISSING LINE 539
// MISSING LINE 540
// MISSING LINE 541
// MISSING LINE 542
// MISSING LINE 543
// MISSING LINE 544
// MISSING LINE 545
// MISSING LINE 546
// MISSING LINE 547
// MISSING LINE 548
// MISSING LINE 549
// MISSING LINE 550
// MISSING LINE 551
// MISSING LINE 552
// MISSING LINE 553
// MISSING LINE 554
// MISSING LINE 555
// MISSING LINE 556
// MISSING LINE 557
// MISSING LINE 558
// MISSING LINE 559
// MISSING LINE 560
// MISSING LINE 561
// MISSING LINE 562
// MISSING LINE 563
// MISSING LINE 564
// MISSING LINE 565
// MISSING LINE 566
// MISSING LINE 567
// MISSING LINE 568
// MISSING LINE 569
// MISSING LINE 570
// MISSING LINE 571
// MISSING LINE 572
// MISSING LINE 573
// MISSING LINE 574
  const handleOcrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Error handling for non-supported files
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
      if (!validTypes.includes(file.type) && !file.name.endsWith('.pdf')) {
        alert('الصورة غير مناسبة للاستخراج. يُرجى إعادة التصوير أو رفع نسخة أوضح بصيغة (JPG, PNG, WEBP, PDF).');
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const dataUrl = evt.target?.result as string;
        setCapturedImage(dataUrl);
        triggerAIOcr(dataUrl, file.type, file.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerAIOcr = async (imageBase64: string, mimeType: string, fileName?: string) => {
    setOcrStep(1);
    setOcrProgressMsg('📷 جاري قراءة وتجهيز الفاتورة للتجزئة...');
    setExtractedInvoice(null);
    setOcrError(null);
    
    const delayLocal = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    await delayLocal(1000);
    setOcrStep(2);
    setOcrProgressMsg('🔍 جاري استخراج النصوص والمصطلحات البرمجية (OCR)...');
    
    await delayLocal(1200);
    setOcrStep(3);
    setOcrProgressMsg('🧠 جاري فحص بنية الفاتورة والتعرف على المنتجات والأسعار والكميات...');
    
    await delayLocal(1200);
    setOcrStep(4);
    setOcrProgressMsg('✅ جاري مطابقة المورد وتدقيق بصمة الفاتورة لمنع التكرار...');
    
    try {
      let hint = 'feed';
      if (fileName) {
        const lowerName = fileName.toLowerCase();
        if (lowerName.includes('accessory') || lowerName.includes('toy') || lowerName.includes('العاب') || lowerName.includes('اكسسوار')) {
          hint = 'accessories';
        } else if (lowerName.includes('med') || lowerName.includes('pharmacy') || lowerName.includes('دواء') || lowerName.includes('صيدلية')) {
          hint = 'meds';
        }
      } else {
        if (selectedSampleOCR === 'TOYS') hint = 'accessories';
        if (selectedSampleOCR === 'MEDS') hint = 'meds';
      }
      
      const parsedInvoice = await api.analyzeInvoiceImage(imageBase64, mimeType, hint);
      
      if (parsedInvoice.error) {
        throw new Error(parsedInvoice.error);
      }

      const markupSetting = parseFloat(localStorage.getItem('ai_default_markup') || '35');
      
      parsedInvoice.items.forEach((item: any) => {
        if (!item.price || item.price <= 0 || item.price <= item.cost) {
          item.price = Number((item.cost * (1 + markupSetting / 100)).toFixed(2));
          if (!item.confidence) item.confidence = {};
          item.confidence.price = 0.70;
        }
      });
      
      await delayLocal(800);
      setOcrStep(5);
      setOcrProgressMsg('📦 الفاتورة جاهزة للمراجعة وتأكيد الاستيراد!');
      
      setExtractedInvoice(parsedInvoice);
// MISSING LINE 651
// MISSING LINE 652
// MISSING LINE 653
// MISSING LINE 654
// MISSING LINE 655
// MISSING LINE 656
// MISSING LINE 657
// MISSING LINE 658
// MISSING LINE 659
            initialMatches[idx] = 'NEW';
          }
        } else {
          initialMatches[idx] = 'NEW';
        }
      });
      setSelectedMatches(initialMatches);
      
    } catch (err: any) {
      setOcrStep(0);
      setOcrProgressMsg('');
      setOcrError('الصورة غير مناسبة للاستخراج. يُرجى إعادة التصوير أو رفع نسخة أوضح.');
      alert(err.message || 'الصورة غير مناسبة للاستخراج. يُرجى إعادة التصوير أو رفع نسخة أوضح.');
    }
  };

  const handleSavePurchaseInvoice = async () => {
    if (!extractedInvoice) return;
    setImporting(true);
    
    try {
      const employeeId = currentEmployee.id;
      
      const finalItems = extractedInvoice.items.map((item: any, idx: number) => {
        const matchSelection = selectedMatches[idx] || 'NEW';
        
        let finalSku = item.sku;
        let finalName = item.productName;
        
        if (matchSelection !== 'NEW') {
          const matchedVar = variants?.find(v => v.id === matchSelection);
          const matchedProd = products?.find(p => p.id === matchedVar?.productId);
          if (matchedProd) {
            finalSku = matchedProd.sku;
            finalName = matchedProd.name;
          }
        }
        
        return {
          productName: finalName,
          sku: finalSku,
          cost: item.cost,
          price: item.price,
          quantity: item.quantity,
          confidenceName: item.confidence?.productName || 0.90,
          confidenceQty: item.confidence?.quantity || 0.90,
          confidenceCost: item.confidence?.cost || 0.90,
          confidencePrice: item.confidence?.price || 0.90
        };
      });
      
      const purchaseInvoicePayload = {
        invoiceNumber: extractedInvoice.invoiceNumber || `INV-${Date.now()}`,
        invoiceDate: extractedInvoice.invoiceDate || new Date().toISOString().split('T')[0],
        dueDate: extractedInvoice.dueDate || extractedInvoice.invoiceDate || new Date().toISOString().split('T')[0],
        supplierName: extractedInvoice.supplierName,
        supplierPhone: extractedInvoice.phone,
        supplierAddress: extractedInvoice.address,
        supplierTaxNumber: extractedInvoice.taxNumber,
        currency: extractedInvoice.currency || 'EGP',
        vat: extractedInvoice.vat || 0,
        discount: extractedInvoice.discount || 0,
        shipping: extractedInvoice.shipping || 0,
        netTotal: extractedInvoice.netTotal,
        grandTotal: extractedInvoice.grandTotal,
        imageUrl: capturedImage || '',
        items: finalItems
      };
      
      await api.createPurchaseInvoice(purchaseInvoicePayload, employeeId);
      
      const freshInvoices = await api.getPurchaseInvoices();
      setPurchaseInvoices(freshInvoices);
      
      alert('تم حفظ فاتورة الشراء بنجاح وتحديث أرصدة المنتجات في المستودعات!');
      setShowImportModal(false);
      setExtractedInvoice(null);
      setCapturedImage(null);
    } catch (err: any) {
      alert(err.message || 'فشلت عملية حفظ الفاتورة');
    } finally {
      setImporting(false);
    }
  };

  const handleAdjustStock = () => {
// MISSING LINE 746
// MISSING LINE 747
// MISSING LINE 748
// MISSING LINE 749
      variantId: selectedVariant.id,
      diff,
      type: adjustReason as any,
      employeeId: currentEmployee.id
    }, {
      onSuccess: () => {
        setSelectedVariant(null);
        setAdjustQty('');
      }
    });
  };

  const handleTransferStock = () => {
    const qty = parseInt(transferQty) || 0;
    if (qty <= 0) return;
    
    adjustStock({ variantId: 'v-1', diff: -qty, type: 'TRANSFER', employeeId: currentEmployee.id });
    adjustStock({ variantId: 'v-2', diff: qty, type: 'TRANSFER', employeeId: currentEmployee.id });

    setShowTransferModal(false);
    setTransferQty('');
  };

  // Helper: compute SHA256 checksum in browser
  const computeSHA256 = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  // Templates Downloader
  const downloadTemplate = (type: 'pet' | 'pharmacy' | 'accessories') => {
    let headers = ['كود_السلعة', 'الاسم', 'الصنف', 'سعر_الشراء', 'سعر_البيع', 'الكمية', 'القسم', 'الماركة', 'المورد'];
    let data: string[][] = [];
    if (type === 'pet') {
      data = [
        ['RC-DOG-MEDIUM-10', 'طعام كلاب رويال كانين', 'كيس 10 كجم', '45.00', '85.00', '20', 'Pet Food', 'Royal Canin', 'Royal Egypt'],
        ['PUR-CAT-KITTEN-2', 'طعام قطط بيورينا', 'كيس 2 كجم', '12.00', '22.00', '15', 'Pet Food', 'Purina', 'Purina Egypt']
      ];
    } else if (type === 'pharmacy') {
      data = [
        ['MED-FLEA-DOG', 'حبوب براسيكتو للقراد', 'كلب كبير 20-40 كجم', '24.00', '42.00', '10', 'Pet Meds', 'Bravecto', 'Meds Distributor'],
        ['MED-SHAMP-CAT', 'شامبو علاج الحشرات', 'زجاجة 250 مل', '8.00', '15.00', '8', 'Supplies', 'Kong', 'Grooming Depot']
      ];
    } else {
      data = [
        ['TOY-KONG-BALL', 'كرة ألعاب كونج للكلاب', 'أحمر كبير', '6.50', '15.00', '30', 'Toys', 'Kong', 'Toys Distributor']
      ];
    }
    const csvContent = "\uFEFF" + [headers.join(','), ...data.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `template_${type}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Drag & Drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processUploadedFile(e.target.files[0]);
    }
  };

  // Parser: parse file using SheetJS
  const processUploadedFile = async (file: File) => {
    const delayLocal = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const hash = await computeSHA256(file);
    setFileMeta({ name: file.name, size: file.size, hash });

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // ============================================================
        // STEP 0: قراءة الملف كمصفوفة خام (2D) لاكتشاف صف العناوين الحقيقي
        // ============================================================
        const rawMatrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,      // raw 2D array — row[0] = first sheet row
          defval: '',
          blankrows: false
        });

        if (rawMatrix.length < 2) {
          alert("الملف المرفوع فارغ أو لا يحتوي على صفوف بيانات صالحة.");
          setAiAnalyzing(false);
          setAiStep(0);
          return;
        }

        // اكتشاف صف العناوين: الصف الذي يحتوي على أكبر عدد من الخلايا النصية غير الفارغة
        // (في الغالب أول 10 صفوف)
        let headerRowIdx = 0;
        let bestTextCount = 0;
        const scanLimit = Math.min(10, rawMatrix.length - 1);

        for (let r = 0; r <= scanLimit; r++) {
          const row = rawMatrix[r];
          const textCells = row.filter(cell => {
            const s = String(cell ?? '').trim();
            // يحسب كنص إذا لم يكن رقماً خالصاً وليس فارغاً
            return s !== '' && isNaN(Number(s));
          });
          if (textCells.length > bestTextCount) {
            bestTextCount = textCells.length;
            headerRowIdx = r;
          }
        }

        // استخراج العناوين من الصف المكتشف — تنظيف وإزالة الفراغات
        const rawHeaders = rawMatrix[headerRowIdx].map((h: any, idx: number) => {
          const cleaned = String(h ?? '').trim();
          // إذا كانت الخلية فارغة → أعطها اسماً وصفياً بناءً على رقم العمود
          return cleaned !== '' ? cleaned : `عمود_${idx + 1}`;
        });

        // فلترة الأعمدة التي كلها فارغة تماماً عبر كل الصفوف
        const dataRows = rawMatrix.slice(headerRowIdx + 1).filter(row =>
          row.some(cell => String(cell ?? '').trim() !== '')
        );
        const validColIndices = rawHeaders.reduce<number[]>((acc, _, colIdx) => {
          const hasData = dataRows.some(row => String(row[colIdx] ?? '').trim() !== '');
          if (hasData) acc.push(colIdx);
          return acc;
        }, []);

        const headers = validColIndices.map(i => rawHeaders[i]);

        // بناء مصفوفة JSON نظيفة
        const json: any[] = dataRows.map(row => {
          const obj: any = {};
          validColIndices.forEach((colIdx, i) => {
            obj[headers[i]] = row[colIdx] ?? '';
          });
          return obj;
        }).filter(obj => Object.values(obj).some(v => String(v).trim() !== ''));

        if (json.length === 0) {
          alert("الملف المرفوع فارغ أو لا يحتوي على صفوف بيانات صالحة.");
          setAiAnalyzing(false);
          setAiStep(0);
          return;
        }

        // Build sample data: first 5 rows per column for AI and data-driven analysis
        const sampleRows = json.slice(0, 5);

        // Start AI Analysis Animation
        setAiAnalyzing(true);
        setAiStep(1);
        await delayLocal(400);

        setParsedHeaders(headers);
        setRawRows(json);


        // ======================================================
        // LAYER 1: طبقة 1 - الكشف بالتحليل الدلالي للبيانات
        // ======================================================
        setAiStep(2);
        await delayLocal(300);
        const dataResult = runDataDrivenMapping(headers, json);

        // ======================================================
        // LAYER 2: طبقة 2 - الكشف بمطابقة أسماء الأعمدة (قاموس المفردات)
        // ======================================================
        setAiStep(3);
        await delayLocal(300);
        const heuristicResult = runLocalFallbackMapping(headers);

        // ======================================================
        // LAYER 3: طبقة 3 - طلب الذكاء الاصطناعي مع تضمين نماذج من البيانات
        // ======================================================
        setAiStep(4);
        let aiResult: { mappings: Record<string, string>; confidences: Record<string, number> } | null = null;

        // Build a rich sample table for the AI (headers + 5 sample rows)
        const sampleTable = headers.map(h => ({
          column: h,
          samples: sampleRows.map(r => String(r[h] ?? '').slice(0, 40)).filter(v => v !== '')
        }));

        const prompt = `You are an expert data migration assistant for an inventory management system.
Your task: map Excel columns to system fields based on BOTH the column name AND the actual sample data values.

System fields to map:
- sku: product barcode, code, or unique identifier
- productName: the product's full name or description  
- variantName: size, weight, flavor, or variant descriptor
- cost: purchase/buy price (what shop paid)
- price: selling/retail price (what customer pays)
- stock: current quantity in inventory
- categoryName: product category or department
- brand: product brand or manufacturer name
- supplier: supplier or vendor name

Excel columns with sample data:
${JSON.stringify(sampleTable, null, 2)}

Rules:
1. Match by COLUMN NAME first, then verify against the sample VALUES
2. If column name is ambiguous, the sample values are decisive
3. Numeric integer values 0-9999 with column containing words like كمية/qty/stock → stock
4. Decimal numeric values, or column with سعر/price → cost or price
5. Long Arabic/English strings that look like product descriptions → productName
6. Short alphanumeric IDs, barcodes (often 8-13 digits) → sku
7. Repeated short strings (few unique values) → categoryName or brand
8. Map each system field to at most ONE Excel column. Use "" if no clear match.

Respond ONLY with a raw JSON object (no markdown, no code blocks):
{
  "mapping": {"sku": "ColName", "productName": "ColName", "variantName": "", "cost": "ColName", "price": "ColName", "stock": "ColName", "categoryName": "", "brand": "", "supplier": ""},
  "confidence": {"sku": 0.95, "productName": 0.98, "variantName": 0.0, "cost": 0.90, "price": 0.92, "stock": 0.95, "categoryName": 0.0, "brand": 0.0, "supplier": 0.0}
}`;

        try {
          const aiResponse = await api.askAIAdvisor(prompt);
          // Strip any markdown formatting that might wrap the JSON
          let cleanJson = aiResponse
            .replace(/```json/gi, '').replace(/```/g, '')
            .replace(/^[^{]*/s, '').replace(/[^}]*$/s, '')
            .trim();
          // Make sure it starts with { and ends with }
          const startIdx = cleanJson.indexOf('{');
          const endIdx = cleanJson.lastIndexOf('}');
          if (startIdx !== -1 && endIdx !== -1) {
            cleanJson = cleanJson.slice(startIdx, endIdx + 1);
          }
          const parsed = JSON.parse(cleanJson);
          if (parsed && parsed.mapping) {
            aiResult = {
              mappings: parsed.mapping,
              confidences: parsed.confidence || {}
            };
          }
        } catch (err) {
          console.warn('فشل طلب الذكاء الاصطناعي ، سيتم الاعتماد على التحليل المحلي:', err);
        }

        // ======================================================
        // دمج النتائج من الثلاث طبقات وأخذ الأعلى ثقة
        // ======================================================
        setAiStep(5);
        await delayLocal(300);

        const finalResult = mergeMapping(heuristicResult, dataResult, aiResult);

        // Apply final merged mappings
        setMappings(prev => ({
          ...prev,
          ...finalResult.mappings
        }));

        const filledConfidences: Record<string, number> = {};
        Object.keys(finalResult.mappings).forEach(field => {
          filledConfidences[field] = finalResult.confidences[field] ?? 0.0;
        });
        setMappingConfidences(filledConfidences);

        setAiAnalyzing(false);
        setAiStep(0);

        // Auto-open mapping config only if critical fields still not detected
        const criticalMissing = !finalResult.mappings.productName && !finalResult.mappings.sku;
        if (criticalMissing) {
          setShowMappingConfig(true);
        }
      } catch (err) {
        console.error("Failed to parse excel file:", err);
        alert("فشل في قراءة ملف الإكسل. يرجى التأكد من أن الملف سليم وغير تالف وبصيغة صحيحة (xlsx أو csv).");
        setAiAnalyzing(false);
        setAiStep(0);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Trigger mapping profiles
  const saveMappingProfile = () => {
    if (!profileName.trim()) return;
    const updated = { ...savedProfiles, [profileName]: mappings };
    setSavedProfiles(updated);
    localStorage.setItem('animasys_import_profiles', JSON.stringify(updated));
    setSelectedProfile(profileName);
    setProfileName('');
  };

  const loadMappingProfile = (name: string) => {
    if (savedProfiles[name]) {
      setMappings(savedProfiles[name]);
      setSelectedProfile(name);
    }
  };

  // Live validator
  useEffect(() => {
    if (rawRows.length === 0) return;

    // Check if critical mappings are missing
    const skuMapped = !!mappings.sku;
    const nameMapped = !!mappings.productName;
    const priceMapped = !!mappings.price;
    const costMapped = !!mappings.cost;
    const stockMapped = !!mappings.stock;

    const validated = rawRows.map((row, idx) => {
      const mappedRow: any = {};
      Object.keys(mappings).forEach(field => {
        const fileCol = mappings[field];
        mappedRow[field] = fileCol ? row[fileCol] : undefined;
      });

      // Validations
      const errors: string[] = [];
      const warnings: string[] = [];

      // --- Critical mapping checks first ---
      if (!nameMapped && !skuMapped) {
        errors.push('عمود "اسم المنتج" و"كود السلعة" غير مربوطَيْن — افتح قسم ربط الأعمدة وحدد العمود الصحيح');
      } else if (!nameMapped) {
        errors.push('عمود "اسم المنتج" غير مربوط — افتح ربط الأعمدة لتحديده');
      } else if (!skuMapped) {
        warnings.push('عمود "كود السلعة" غير مربوط — سيتم توليد كود تلقائي');
      }

      const sku = cleanStringVal(mappedRow.sku);
      const name = cleanStringVal(mappedRow.productName);
      const price = parseSmartNumber(mappedRow.price);
      const cost = parseSmartNumber(mappedRow.cost);
      const stock = parseSmartNumber(mappedRow.stock);

      // Only validate values if the columns are mapped
      if (nameMapped && skuMapped && !sku && !name) {
        errors.push('كود الباركود واسم المنتج فارغين في هذا الصف');
      }
      if (nameMapped && !name && name !== undefined) {
        // name column is mapped but value is empty
        warnings.push('اسم المنتج فارغ في هذا الصف');
      }
      if (priceMapped && mappedRow.price !== undefined && (isNaN(price) || price < 0)) {
        errors.push('سعر البيع لا يمكن أن يكون سالباً');
      }
      if (costMapped && mappedRow.cost !== undefined && (isNaN(cost) || cost < 0)) {
        errors.push('سعر التكلفة لا يمكن أن يكون سالباً');
      }
      if (stockMapped && mappedRow.stock !== undefined && (isNaN(stock) || stock < 0)) {
        errors.push('الكمية الحالية لا يمكن أن تكون سالبة');
      }
      if (priceMapped && costMapped && price > 0 && cost > 0 && price < cost) {
        warnings.push('سعر البيع أقل من سعر الشراء (التكلفة)');
      }
      if (!cleanStringVal(mappedRow.categoryName)) {
        warnings.push('الفئة فارغة (سيتم وضعها في فئة افتراضية)');
      }

      return {
        rowNumber: idx + 1,
        sku: skuMapped ? (sku || 'توليد تلقائي') : 'توليد تلقائي',
        productName: nameMapped ? (name || 'فارغ') : 'عمود غير مربوط',
        variantName: mappedRow.variantName || 'Standard',
        cost: isNaN(cost) ? 0 : cost,
        price: isNaN(price) ? 0 : price,
        stock: isNaN(stock) ? 0 : stock,
        categoryName: mappedRow.categoryName || 'Pet Food',
        brand: mappedRow.brand || '',
        supplier: mappedRow.supplier || '',
        status: errors.length > 0 ? 'ERROR' : (warnings.length > 0 ? 'WARNING' : 'READY'),
        message: [...errors, ...warnings].join(' | ')
      };
    });

    setValidatedData(validated);
  }, [rawRows, mappings]);

  const cleanStringVal = (val: any): string => {
    if (!val) return '';
    return val.toString().trim().replaceAll("[\\p{C}]", "");
  };

  const parseSmartNumber = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    // Handle formatting (e.g. 1,250 or ١٢٥٠)
    let cleaned = val.toString().replace(/,/g, '');
    // Arabic digits conversion
    const arabicDigits = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    for (let i = 0; i < 10; i++) {
      cleaned = cleaned.replace(new RegExp(arabicDigits[i], 'g'), i);
    }
    return parseFloat(cleaned);
  };

  // Filtered preview data
  const previewSummary = {
    total: validatedData.length,
    ready: validatedData.filter(r => r.status === 'READY').length,
    warnings: validatedData.filter(r => r.status === 'WARNING').length,
    errors: validatedData.filter(r => r.status === 'ERROR').length
  };

  const filteredPreviewData = validatedData.filter(row => {
    if (validationFilter === 'ALL') return true;
    return row.status === validationFilter;
  });

// MISSING LINE 1181
// MISSING LINE 1182
// MISSING LINE 1183
// MISSING LINE 1184
// MISSING LINE 1185
// MISSING LINE 1186
// MISSING LINE 1187
// MISSING LINE 1188
// MISSING LINE 1189
// MISSING LINE 1190
// MISSING LINE 1191
// MISSING LINE 1192
// MISSING LINE 1193
// MISSING LINE 1194
// MISSING LINE 1195
// MISSING LINE 1196
// MISSING LINE 1197
// MISSING LINE 1198
// MISSING LINE 1199
// MISSING LINE 1200
// MISSING LINE 1201
// MISSING LINE 1202
// MISSING LINE 1203
// MISSING LINE 1204
// MISSING LINE 1205
// MISSING LINE 1206
// MISSING LINE 1207
// MISSING LINE 1208
// MISSING LINE 1209
// MISSING LINE 1210
// MISSING LINE 1211
// MISSING LINE 1212
// MISSING LINE 1213
// MISSING LINE 1214
// MISSING LINE 1215
// MISSING LINE 1216
// MISSING LINE 1217
// MISSING LINE 1218
// MISSING LINE 1219
// MISSING LINE 1220
// MISSING LINE 1221
// MISSING LINE 1222
// MISSING LINE 1223
// MISSING LINE 1224
// MISSING LINE 1225
// MISSING LINE 1226
// MISSING LINE 1227
// MISSING LINE 1228
// MISSING LINE 1229
// MISSING LINE 1230
// MISSING LINE 1231
// MISSING LINE 1232
// MISSING LINE 1233
// MISSING LINE 1234
// MISSING LINE 1235
// MISSING LINE 1236
// MISSING LINE 1237
// MISSING LINE 1238
// MISSING LINE 1239
// MISSING LINE 1240
// MISSING LINE 1241
// MISSING LINE 1242
// MISSING LINE 1243
// MISSING LINE 1244
// MISSING LINE 1245
// MISSING LINE 1246
// MISSING LINE 1247
// MISSING LINE 1248
// MISSING LINE 1249
// MISSING LINE 1250
// MISSING LINE 1251
// MISSING LINE 1252
// MISSING LINE 1253
// MISSING LINE 1254
// MISSING LINE 1255
// MISSING LINE 1256
// MISSING LINE 1257
// MISSING LINE 1258
// MISSING LINE 1259
      }

      return updatedRow;
    });

    setRawRows(updatedRows);
    alert('تم تطبيق التصحيح التلقائي بالذكاء الاصطناعي بنجاح! تم تصحيح الأكواد الفارغة، الأسماء المفقودة، والقيم السالبة وسعر البيع أقل من التكلفة.');
  };

  // Run Bulk Import using Chunk Uploads
  const handleStartImport = async () => {
    if (validatedData.length === 0) return;
    const errorsCount = validatedData.filter(r => r.status === 'ERROR').length;
    const itemsToImport = validatedData.filter(r => r.status !== 'ERROR');

    if (errorsCount > 0) {
      const confirmIgnore = confirm(`يوجد ${errorsCount} صف يحتوي على أخطاء غير قابلة للاستيراد. هل تريد استبعاد هذه الصفوف واستيراد باقي الصفوف السليمة فقط (${itemsToImport.length} صف)؟`);
      if (!confirmIgnore) {
        return;
      }
    }

    setImporting(true);
    setImportProgress(0);

    try {
      // 1. Start Session
      const session = await startSession({
        fileName: fileMeta.name,
        fileSize: fileMeta.size,
        fileHash: fileMeta.hash,
        duplicateStrategy,
        targetType: 'PRODUCTS',
        uploadedBy: currentEmployee.id
      });

      // Filter only valid/warning items to import
      const itemsToImport = validatedData.filter(r => r.status !== 'ERROR');
      const chunkSize = 500;
      const totalChunks = Math.ceil(itemsToImport.length / chunkSize);

      // 2. Sequentially Upload Chunks
      for (let i = 0; i < totalChunks; i++) {
        const startIdx = i * chunkSize;
        const chunkItems = itemsToImport.slice(startIdx, startIdx + chunkSize).map(item => ({
          sku: item.sku === 'توليد تلقائي' ? '' : item.sku,
          productName: item.productName,
          variantName: item.variantName,
          cost: item.cost,
          price: item.price,
          stock: item.stock,
          categoryName: item.categoryName,
          brand: item.brand,
          supplier: item.supplier
        }));

        await uploadChunk({
          sessionId: session.id,
          items: chunkItems,
          chunkIndex: i,
          dryRun,
          employeeId: currentEmployee.id
        });

        setImportProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      // 3. Finalize Import Session
      await finalizeSession(session.id);

      setShowImportModal(false);
      // Reset importer states
      setRawRows([]);
      setParsedHeaders([]);
      setValidatedData([]);
    } catch (err: any) {
      alert(err.message || 'فشلت عملية الاستيراد');
    } finally {
      setImporting(false);
    }
  };
// MISSING LINE 1341
// MISSING LINE 1342
// MISSING LINE 1343
// MISSING LINE 1344
// MISSING LINE 1345
// MISSING LINE 1346
// MISSING LINE 1347
// MISSING LINE 1348
// MISSING LINE 1349
// MISSING LINE 1350
// MISSING LINE 1351
// MISSING LINE 1352
// MISSING LINE 1353
// MISSING LINE 1354
// MISSING LINE 1355
// MISSING LINE 1356
// MISSING LINE 1357
// MISSING LINE 1358
// MISSING LINE 1359
// MISSING LINE 1360
// MISSING LINE 1361
// MISSING LINE 1362
// MISSING LINE 1363
// MISSING LINE 1364
// MISSING LINE 1365
// MISSING LINE 1366
// MISSING LINE 1367
// MISSING LINE 1368
// MISSING LINE 1369
// MISSING LINE 1370
// MISSING LINE 1371
// MISSING LINE 1372
// MISSING LINE 1373
// MISSING LINE 1374
// MISSING LINE 1375
// MISSING LINE 1376
// MISSING LINE 1377
// MISSING LINE 1378
// MISSING LINE 1379
          </Button>
        </div>
      ),
      key: 'actions'
    }
  ];

  const batchColumns = [
    { header: 'رقم الشحنة (Batch)', accessor: 'batchNumber' as const, key: 'batchNumber' },
    { 
      header: 'اسم المنتج', 
      accessor: (row: any) => {
        const variant = variants?.find(v => v.id === row.productVariantId);
        const prod = products?.find(p => p.id === variant?.productId);
        return `${prod?.name || ''} - ${variant?.name || ''}`;
      },
      key: 'productName'
    },
    { header: 'كمية الشحنة', accessor: 'quantity' as const, key: 'quantity' },
    { header: 'تاريخ الانتهاء', accessor: 'expiryDate' as const, key: 'expiryDate', sortable: true },
    {
      header: 'تنبيه الأمان والانتهاء',
      accessor: (row: any) => {
        const daysLeft = Math.floor((new Date(row.expiryDate).getTime() - new Date('2026-07-06').getTime()) / (1000 * 60 * 60 * 24));
        const isExpiring = daysLeft < 90;
        return (
          <Badge variant={isExpiring ? 'danger' : 'success'}>
            {isExpiring ? `تنتهي خلال ${daysLeft} يوم` : 'آمن ومستقر'}
          </Badge>
        );
      },
      key: 'warning'
    }
  ];

  const movementsColumns = [
    { header: 'تاريخ الحركة', accessor: 'timestamp' as const, key: 'timestamp', sortable: true },
    { 
      header: 'موقع التخزين', 
      accessor: (row: any) => {
        const wh = warehouses?.find(w => w.id === row.warehouseId);
        return wh?.name === 'Retail Shelves WH' ? 'رفوف العرض الأمامية' : 'المخزن الخلفي الرئيسي';
      },
      key: 'warehouse'
    },
    { 
      header: 'رمز الصنف (SKU)', 
      accessor: (row: any) => {
        const variant = variants?.find(v => v.id === row.productVariantId);
        return products?.find(p => p.id === variant?.productId)?.sku || '';
      },
// MISSING LINE 1431
// MISSING LINE 1432
// MISSING LINE 1433
// MISSING LINE 1434
// MISSING LINE 1435
// MISSING LINE 1436
// MISSING LINE 1437
// MISSING LINE 1438
// MISSING LINE 1439
// MISSING LINE 1440
// MISSING LINE 1441
// MISSING LINE 1442
// MISSING LINE 1443
// MISSING LINE 1444
// MISSING LINE 1445
// MISSING LINE 1446
// MISSING LINE 1447
// MISSING LINE 1448
// MISSING LINE 1449
      header: 'حجم الملف', 
      accessor: (row: any) => `${(row.fileSize / 1024).toFixed(1)} KB`,
      key: 'fileSize' 
    },
    { header: 'إجمالي الصفوف', accessor: 'totalRows' as const, key: 'totalRows' },
    { 
      header: 'النتائج (ناجح/تحذير/خطأ)', 
      accessor: (row: any) => (
        <div style={{ display: 'flex', gap: '6px' }}>
          <Badge variant="success">{row.successRows}</Badge>
          <Badge variant="warning">{row.warningRows}</Badge>
          <Badge variant="danger">{row.errorRows}</Badge>
        </div>
      ),
      key: 'results' 
    },
    {
      header: 'الحالة',
      accessor: (row: any) => (
        <Badge variant={
          row.status === 'COMPLETED' ? 'success' : 
          row.status === 'UNDONE' ? 'gray' : 'danger'
        }>
          {row.status === 'COMPLETED' ? 'مكتمل' : 
           row.status === 'UNDONE' ? 'تم التراجع' : 'PROCESSING'}
        </Badge>
      ),
      key: 'status'
    },
    {
      header: 'إجراءات تراجع التدقيق',
      accessor: (row: any) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {row.status === 'COMPLETED' && (
            <Button onClick={() => handleUndoImport(row.id)} variant="danger" size="sm">
              <Undo size={14} /> تراجع عكسي
            </Button>
          )}
        </div>
      ),
      key: 'actions'
    }
  ];

  const handleRunAdvisorHeuristics = () => {
    setAiRunning(true);
    setAdvisorStep(1);
    
    // Simulate AI reasoning timeline
    setTimeout(() => setAdvisorStep(2), 600);
    setTimeout(() => setAdvisorStep(3), 1200);
    setTimeout(() => {
      setAiRunning(false);
      setAdvisorStep(4);
    }, 1800);
  };

  const handleConfirmPayment = async () => {
    if (!payingInvoice || !payAmount) return;
    const amountNum = parseFloat(payAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('يرجى إدخال مبلغ صحيح للسداد');
      return;
    }
    
    try {
      await payInvoice({ id: payingInvoice.id, amount: amountNum });
      setShowPayModal(false);
      setPayingInvoice(null);
      setPayAmount('');
    } catch (err: any) {
      alert(err.message || 'فشلت عملية سداد الدفعة');
    }
  };

  return (
    <div className="workspace">
      <PageHeader 
        title="رقابة جرد ومخزون الفرع" 
        subtitle="إدارة وتتبع السلع، تواريخ الصلاحية، وحركات التحويل المخزني"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowImportModal(true)} variant="secondary" size="sm">
              <Upload size={14} /> استيراد ملف جرد (Excel/CSV)
            </Button>
            <Button onClick={() => setShowTransferModal(true)} variant="secondary" size="sm">
              <ArrowRightLeft size={14} /> تحويل كميات (مخزن / رفوف)
            </Button>
            <Button variant="primary" size="sm">
              <PlusCircle size={14} /> إضافة كود SKU جديد
            </Button>
          </div>
        }
      />

      {/* Sub-tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', gap: 'var(--spacing-2)', paddingBottom: '4px' }}>
        <button
          onClick={() => setActiveSubTab('STOCK')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'STOCK' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'STOCK' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'STOCK' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Layers size={16} /> أرصدة المخزون والمنتجات الحالية
        </button>
        <button
          onClick={() => setActiveSubTab('BATCHES')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'BATCHES' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'BATCHES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'BATCHES' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Calendar size={16} /> الشحنات وتواريخ الانتهاء
        </button>
        <button
          onClick={() => setActiveSubTab('MOVEMENTS')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'MOVEMENTS' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'MOVEMENTS' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'MOVEMENTS' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <History size={16} /> لوج حركات المخزن
        </button>
        <button
          onClick={() => setActiveSubTab('IMPORTS')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'IMPORTS' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'IMPORTS' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'IMPORTS' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <History size={16} /> سجل عمليات الاستيراد
        </button>
        <button
          onClick={() => setActiveSubTab('PURCHASES')}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-sm)',
            padding: '6px 16px',
            borderBottom: activeSubTab === 'PURCHASES' ? '2px solid var(--color-primary)' : 'none',
            color: activeSubTab === 'PURCHASES' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
            fontWeight: activeSubTab === 'PURCHASES' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          <Download size={16} /> فواتير الشراء المستوردة (AI OCR)
        </button>
      </div>

      {/* Grid Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeSubTab === 'STOCK' && (
          <DataTable
            data={variantsTableData}
            columns={stockColumns}
            rowKey="id"
            searchField="name"
            searchPlaceholder="ابحث باسم المنتج أو الـ SKU..."
          />
        )}
        
        {activeSubTab === 'BATCHES' && (
          <DataTable
            data={batches || []}
            columns={batchColumns}
            rowKey="id"
            searchField="batchNumber"
            searchPlaceholder="ابحث برقم الشحنة..."
          />
        )}

        {activeSubTab === 'MOVEMENTS' && (
          <DataTable
            data={[...(movements || [])].reverse()}
            columns={movementsColumns}
            rowKey="id"
          />
        )}

        {activeSubTab === 'IMPORTS' && (
          <DataTable
            data={importHistory || []}
            columns={importHistoryColumns}
            rowKey="id"
          />
        )}

        {activeSubTab === 'PURCHASES' && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* AI Advisor Promotional Card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.08) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backdropFilter: 'blur(10px)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ backgroundColor: 'var(--color-primary)', color: '#fff', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Brain size={22} />
                </div>
                <div>
                  <h4 style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', margin: 0, color: 'var(--color-primary)' }}>🧠 مستشار الجدولة والدفع الذكي بـ AI (أولوية دفع الفواتير)</h4>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>مساعد ذكي يحلل علاقات الموردين وخطورة انقطاع التوريد ليقسم ميزانيتك كدفعات مجزأة مع أولوية السداد العاجل.</p>
                </div>
              </div>
              <Button onClick={() => { setShowAiAdvisor(true); handleRunAdvisorHeuristics(); }} variant="primary" size="sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Brain size={14} /> تشغيل مستشار الدفع بالـ AI
              </Button>
            </div>

            <DataTable
              data={purchaseInvoices || []}
              columns={[
                { header: 'تاريخ الفاتورة', accessor: 'invoiceDate' as const, key: 'invoiceDate', sortable: true },
                { header: 'رقم الفاتورة', accessor: 'invoiceNumber' as const, key: 'invoiceNumber', sortable: true },
                { header: 'اسم المورد', accessor: 'supplierName' as const, key: 'supplierName', sortable: true },
                { 
                  header: 'تاريخ الاستحقاق', 
                  accessor: (row: any) => {
                    const dueDate = row.dueDate || row.invoiceDate;
                    const now = new Date();
                    const diff = new Date(dueDate).getTime() - now.getTime();
                    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                    
                    if (row.paymentStatus === 'PAID') return new Date(dueDate).toLocaleDateString('ar-EG');
                    
                    if (days < 0) {
                      return <span style={{ color: 'var(--color-error)', fontWeight: 'bold' }}>⚠️ متأخرة ({new Date(dueDate).toLocaleDateString('ar-EG')})</span>;
                    }
                    if (days === 0) {
                      return <span style={{ color: 'var(--color-error)', fontWeight: 'bold' }}>🚨 مستحقة اليوم!</span>;
                    }
                    if (days <= 5) {
                      return <span style={{ color: 'var(--color-warning)', fontWeight: 'bold' }}>⚠️ مستحقة خلال {days} أيام (تحذير الأسبوع القادم)</span>;
                    }
                    return new Date(dueDate).toLocaleDateString('ar-EG');
                  }, 
                  key: 'dueDate', 
                  sortable: true 
                },
                { 
                  header: 'حالة السداد', 
                  accessor: (row: any) => (
                    <Badge variant={row.paymentStatus === 'PAID' ? 'success' : row.paymentStatus === 'PARTIALLY_PAID' ? 'warning' : 'danger'}>
                      {row.paymentStatus === 'PAID' ? 'مدفوعة بالكامل' : row.paymentStatus === 'PARTIALLY_PAID' ? `مدفوعة جزئياً` : 'غير مدفوعة'}
                    </Badge>
                  ), 
                  key: 'paymentStatus', 
                  sortable: true 
                },
                { 
                  header: 'المدفوع / المتبقي', 
                  accessor: (row: any) => {
                    const paid = row.paidAmount || 0;
                    const rem = row.grandTotal - paid;
                    return `${paid.toFixed(2)} / ${rem.toFixed(2)} ${row.currency}`;
                  }, 
                  key: 'paymentBalances' 
                },
                { header: 'الإجمالي الكلي', accessor: (row: any) => `${row.grandTotal.toFixed(2)} ${row.currency}`, key: 'grandTotal', sortable: true },
                {
                  header: 'الإجراءات',
                  accessor: (row: any) => (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Button onClick={() => setSelectedPurchaseInvoice(row)} variant="secondary" size="sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Eye size={12} /> التفاصيل
                      </Button>
                      {row.paymentStatus !== 'PAID' && (
                        <Button 
                          onClick={() => { setPayingInvoice(row); setPayAmount(String(row.grandTotal - (row.paidAmount || 0))); setShowPayModal(true); }} 
                          variant="primary" 
                          size="sm" 
                          style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
                        >
                          <DollarSign size={12} /> سداد دفعة
                        </Button>
                      )}
                    </div>
                  ),
                  key: 'actions'
                }
              ]}
              rowKey="id"
              searchField="supplierName"
              searchPlaceholder="ابحث باسم المورد..."
            />
          </div>
        )}
      </div>

      {/* 1. STOCK ADJUSTMENT DIALOG */}
      <Modal
        isOpen={selectedVariant !== null}
        onClose={() => setSelectedVariant(null)}
        title="تعديل كمية جرد المخزون"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setSelectedVariant(null)} variant="secondary">إلغاء</Button>
            <Button onClick={handleAdjustStock} variant="primary">حفظ وتعديل الرصيد</Button>
          </div>
        }
      >
        {selectedVariant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: 'var(--font-size-xs)', padding: 'var(--spacing-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg)' }}>
              <div>المنتج: <strong>{selectedVariant.name}</strong></div>
              <div>الصنف: {selectedVariant.variant}</div>
              <div>الكمية الحالية المتوفرة: {selectedVariant.stock} وحدة</div>
            </div>

            <Input
              label="فارق تعديل الكمية (مثال: +10 لزيادة الجرد، -5 للخصم)"
              value={adjustQty}
              onChange={(e) => setAdjustQty(e.target.value)}
              placeholder="0"
            />

            <Select
              label="سبب تعديل المخزون"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              options={[
                { value: 'ADJUSTMENT', label: 'تعديل جرد يدوي ومطابقة الدرج' },
                { value: 'PURCHASE', label: 'شحنة واردة من الموردين' },
                { value: 'SALE', label: 'مرتجع مبيعات من عميل' }
              ]}
            />
          </div>
        )}
      </Modal>

      {/* 2. WAREHOUSE TRANSFER MODAL */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="تحويل كميات المنتجات (المخزن والرفوف)"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button onClick={() => setShowTransferModal(false)} variant="secondary">إلغاء</Button>
            <Button onClick={handleTransferStock} variant="primary">تأكيد ونقل المخزون</Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            نقل المنتجات بين المخازن الخلفية ورفوف العرض الأمامية لنقاط البيع.
          </div>

          <Select
            label="الموقع المصدر (من)"
            value="w-1"
            options={[{ value: 'w-1', label: 'المخزن الخلفي الرئيسي (WH-MAIN)' }]}
          />
          <Select
            label="الموقع المستهدف (إلى)"
            value="w-2"
            options={[{ value: 'w-2', label: 'رفوف العرض بنقاط البيع (WH-SHELF)' }]}
          />
          
          <Select
            label="اختر المنتج المراد نقله"
            value="v-1"
            options={[
              { value: 'v-1', label: 'طعام كلاب رويال كانين (10kg) - الكمية المتاحة: 24' },
              { value: 'v-2', label: 'طعام كلاب رويال كانين (2kg) - الكمية المتاحة: 12' }
            ]}
          />

          <Input
            label="الكمية المراد نقلها"
            value={transferQty}
            onChange={(e) => setTransferQty(e.target.value)}
            placeholder="0"
          />
        </div>
      </Modal>

      {/* 3. EXCEL/CSV BULK IMPORTER MODAL */}
      <Modal
        isOpen={showImportModal}
        onClose={() => !importing && setShowImportModal(false)}
        title="استيراد وتغذية المخزون للفرع"
        footer={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button disabled={importing} onClick={() => { stopCamera(); setShowImportModal(false); }} variant="secondary">إلغاء</Button>
            {importTab === 'EXCEL' ? (
              validatedData.length > 0 && (
                <Button disabled={importing} onClick={handleStartImport} variant="primary">
                  {importing ? `جاري الاستيراد (${importProgress}%)` : 'بدء معالجة والاستيراد للسيستم'}
                </Button>
              )
            ) : (
              extractedInvoice && (
                <Button disabled={importing} onClick={handleSavePurchaseInvoice} variant="primary">
                  {importing ? 'جاري الاستيراد وحفظ الفاتورة...' : 'تأكيد وحفظ فاتورة الشراء للسيستم'}
                </Button>
              )
            )}
          </div>
        }
        maxWidth="950px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)', maxHeight: '75vh', overflowY: 'auto', paddingRight: '4px' }}>
          
          {/* Tabs for switching between Excel and AI Scan */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: '4px' }}>
            <button
              onClick={() => { stopCamera(); setImportTab('EXCEL'); }}
              className="btn-ghost"
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '8px 24px',
                borderBottom: importTab === 'EXCEL' ? '2px solid var(--color-primary)' : 'none',
                color: importTab === 'EXCEL' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: importTab === 'EXCEL' ? 'bold' : 'normal'
              }}
            >
              📊 استيراد ملف Excel / CSV
            </button>
            <button
              onClick={() => { setImportTab('OCR'); }}
              className="btn-ghost"
              style={{
                fontSize: 'var(--font-size-sm)',
                padding: '8px 24px',
                borderBottom: importTab === 'OCR' ? '2px solid var(--color-primary)' : 'none',
                color: importTab === 'OCR' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: importTab === 'OCR' ? 'bold' : 'normal'
              }}
            >
              🧠 تحليل الفاتورة الورقية بالذكاء الاصطناعي (AI Scanner)
            </button>
          </div>

          {importTab === 'EXCEL' ? (
            <>
              {/* Preset templates downloads */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--color-bg)', padding: 'var(--spacing-2)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)' }}>تنزيل نموذج ملف الاستيراد الجاهز:</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Button onClick={() => downloadTemplate('pet')} variant="secondary" size="sm">
                    <Download size={10} /> نموذج محل الحيوانات
                  </Button>
                  <Button onClick={() => downloadTemplate('pharmacy')} variant="secondary" size="sm">
                    <Download size={10} /> نموذج الصيدلية
                  </Button>
                  <Button onClick={() => downloadTemplate('accessories')} variant="secondary" size="sm">
                    <Download size={10} /> نموذج الإكسسوارات
                  </Button>
                </div>
              </div>

              {aiAnalyzing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--spacing-8) var(--spacing-4)', gap: 'var(--spacing-4)', textAlign: 'center', minHeight: '320px' }}>
                  <div className="radar-scanner" style={{ position: 'relative', width: '120px', height: '120px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.02) 70%)', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                    <div style={{ position: 'absolute', width: '80px', height: '80px', borderRadius: '50%', border: '2px solid var(--color-primary)' }} />
                    <div style={{ position: 'absolute', width: '110px', height: '110px', borderRadius: '50%', border: '1px dashed var(--color-primary)', opacity: 0.3 }} />
                    <span style={{ fontSize: '2.5rem' }}>🧠</span>
                  </div>
                  <div style={{ fontWeight: '600', fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>🔍 جاري تحليل الملف تلقائياً بـ 3 طبقات ذكاء...</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px', width: '380px', margin: '0 auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg)', padding: 'var(--spacing-3) var(--spacing-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', direction: 'rtl' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 1 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 1 ? '✅' : '⏳'} قراءة الملف واستخراج هيكل الأعمدة...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 2 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 2 ? '✅' : aiStep === 2 ? '🔄' : '⏳'} <strong>طبقة 1:</strong> تحليل قيم البيانات الفعلية لكل عمود...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 3 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 3 ? '✅' : aiStep === 3 ? '🔄' : '⏳'} <strong>طبقة 2:</strong> مطابقة أسماء الأعمدة بقاموس المفردات...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 4 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 4 ? '✅' : aiStep === 4 ? '🔄' : '⏳'} <strong>طبقة 3:</strong> الذكاء الاصطناعي يحلل النماذج والأمثلة...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 5 ? 'var(--color-success)' : 'inherit' }}>{aiStep >= 5 ? '✅' : '⏳'} دمج النتائج وتطبيق أعلى درجة ثقة...</div>
                  </div>
                </div>
              ) : rawRows.length === 0 ? (
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  style={{ border: dragActive ? '2px solid var(--color-primary)' : '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-2)', cursor: 'pointer' }}
                  onClick={() => document.getElementById('import-file-input')?.click()}
                >
                  <Upload size={32} style={{ color: 'var(--color-text-secondary)' }} />
                  <div style={{ fontWeight: '500' }}>اسحب ملف Excel أو CSV وأفلته هنا</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>أو انقر لتصفح ملفات جهازك</div>
                  <input id="import-file-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} style={{ display: 'none' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', padding: 'var(--spacing-2)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                    <div>اسم الملف: <strong>{fileMeta.name}</strong></div>
                    <div>الحجم: {(fileMeta.size / 1024).toFixed(1)} KB</div>
                    <Button onClick={() => { setRawRows([]); setValidatedData([]); }} variant="secondary" size="sm">تغيير الملف</Button>
                  </div>
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div 
                      onClick={() => setShowMappingConfig(!showMappingConfig)} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '12px var(--spacing-3)', 
                        backgroundColor: 'var(--color-bg)', 
                        cursor: 'pointer',
                        borderBottom: showMappingConfig ? '1px solid var(--color-border)' : 'none',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)' }}>✨ مطابقة أعمدة الملف بالـ AI</span>
                        {(!mappings.productName && !mappings.sku) ? (
                          <Badge variant="danger">⚠️ أعمدة حيوية غير مربوطة — يجب الربط يدوياً</Badge>
                        ) : (!mappings.productName || !mappings.sku) ? (
                          <Badge variant="warning">تحقق من ربط الأعمدة</Badge>
                        ) : (
                          <Badge variant="success">تم التعرف على الأعمدة وتطابقها تلقائياً</Badge>
                        )}
                      </div>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: (!mappings.productName && !mappings.sku) ? 'var(--color-danger)' : 'var(--color-primary)', fontWeight: 'bold' }}>
                        {showMappingConfig ? 'إخفاء تفاصيل التخطيط ▲' : ((!mappings.productName && !mappings.sku) ? '⚠️ افتح ربط الأعمدة وحدد الأعمدة الصحيحة ▼' : 'تعديل وتخصيص ربط الأعمدة يدوياً ▼')}
                      </span>
                    </div>

                    {showMappingConfig && (
                      <div style={{ padding: 'var(--spacing-3)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ flex: 1 }}>
                            <Select label="استخدام ملف ربط محفوظ مسبقاً" value={selectedProfile} onChange={(e) => loadMappingProfile(e.target.value)} options={[{ value: '', label: '-- اختر ملف الربط --' }, ...Object.keys(savedProfiles).map(name => ({ value: name, label: name }))]} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                            <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="اسم ملف الربط الجديد..." />
                            <Button onClick={saveMappingProfile} variant="secondary">حفظ التخطيط</Button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--spacing-3)', backgroundColor: 'var(--color-surface)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1fr', gap: '12px', fontSize: 'var(--font-size-xs)', fontWeight: 'bold', color: 'var(--color-text-secondary)', paddingBottom: '4px', borderBottom: '1px solid var(--color-border)' }}>
                            <span>حقل النظام (Database Field)</span>
                            <span>العمود المربوط بملف الإكسل (Mapped Excel Column)</span>
                            <span>مستوى الثقة (AI Confidence)</span>
                          </div>

                          {Object.keys(mappings).map(field => {
                            const fieldLabel = 
                              field === 'sku' ? 'كود السلعة (Barcode/SKU)' : 
                              field === 'productName' ? 'اسم المنتج' : 
                              field === 'variantName' ? 'اسم الصنف/الوزن/الحجم' : 
                              field === 'cost' ? 'سعر التكلفة (الشراء)' : 
                              field === 'price' ? 'سعر البيع' : 
                              field === 'stock' ? 'الكمية الحالية' : 
                              field === 'categoryName' ? 'الفئة (Category)' : 
                              field === 'brand' ? 'الماركة (Brand)' : 'المورد (Supplier)';

                            const conf = mappingConfidences[field] || 0.0;
                            const scorePct = Math.round(conf * 100);

                            let badgeVariant: 'success' | 'warning' | 'gray' = 'gray';
                            let badgeText = 'مطابقة يدوية';
                            
                            if (mappings[field]) {
                              if (conf >= 0.95) {
                                badgeVariant = 'success';
                                badgeText = `مطابقة مؤكدة (${scorePct}%)`;
                              } else if (conf >= 0.80) {
                                badgeVariant = 'warning';
                                badgeText = `اقتراح ذكي (${scorePct}%)`;
                              } else {
                                badgeVariant = 'gray';
                                badgeText = `يحتاج مراجعة (${scorePct}%)`;
                              }
                            }

                            return (
                              <div key={field} style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1.2fr 1.5fr 1fr', 
                                alignItems: 'center', 
                                gap: '12px', 
                                padding: '6px 8px', 
                                backgroundColor: 'var(--color-surface)', 
                                borderRadius: 'var(--radius-md)', 
                                border: conf >= 0.80 && conf < 0.95 ? '1px dashed var(--color-warning)' : '1px solid var(--color-border)',
                                transition: 'all 0.2s'
                              }}>
                                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>{fieldLabel}</span>
                                <Select 
                                  value={mappings[field]} 
                                  onChange={(e) => {
                                    setMappings({ ...mappings, [field]: e.target.value });
                                    setMappingConfidences({ ...mappingConfidences, [field]: e.target.value ? 1.0 : 0.0 }); // Manual override is 100% confident
                                  }} 
                                  options={[{ value: '', label: '-- غير مربوط --' }, ...parsedHeaders.map(h => ({ value: h, label: h }))]} 
                                  containerStyle={{ margin: 0 }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                  <Badge variant={badgeVariant}>{badgeText}</Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', border: '1px solid var(--color-border)', padding: 'var(--spacing-3)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ flex: 1 }}>
                      <Select label="استراتيجية الأكواد المكررة (Duplicate SKU)" value={duplicateStrategy} onChange={(e) => setDuplicateStrategy(e.target.value as any)} options={[{ value: 'SKIP', label: 'تخطي السطر (Skip) وعدم إدخاله' }, { value: 'UPDATE', label: 'تحديث بيانات المنتج والكمية (Update)' }, { value: 'REPLACE', label: 'حذف القديم وإعادة الإنشاء (Replace)' }]} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingTop: '16px' }}>
                      <input type="checkbox" id="dry-run-checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
                      <label htmlFor="dry-run-checkbox" style={{ fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>تفعيل وضع التحقق فقط (Dry Run)</label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--spacing-2)', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setValidationFilter('ALL')} className={validationFilter === 'ALL' ? 'btn-primary-xs' : 'btn-secondary-xs'} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}>الكل ({previewSummary.total})</button>
                      <button onClick={() => setValidationFilter('READY')} className={validationFilter === 'READY' ? 'btn-primary-xs' : 'btn-secondary-xs'} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}>جاهز ({previewSummary.ready})</button>
                      <button onClick={() => setValidationFilter('WARNING')} className={validationFilter === 'WARNING' ? 'btn-primary-xs' : 'btn-secondary-xs'} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}>تحذيرات ({previewSummary.warnings})</button>
                      <button onClick={() => setValidationFilter('ERROR')} className={validationFilter === 'ERROR' ? 'btn-primary-xs' : 'btn-secondary-xs'} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px' }}>أخطاء ({previewSummary.errors})</button>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {previewSummary.errors + previewSummary.warnings > 0 && (
                        <>
                          <Button onClick={handleAIAutoFix} variant="primary" size="sm">✨ تصحيح الأخطاء بالـ AI</Button>
                          <Button onClick={downloadErrorReport} variant="secondary" size="sm">تنزيل تقرير الأخطاء (.csv)</Button>
                        </>
                      )}
                    </div>
                  </div>
                  {importing && (
                    <div style={{ width: '100%', backgroundColor: 'var(--color-border)', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${importProgress}%`, height: '100%', backgroundColor: 'var(--color-primary)' }} />
                    </div>
                  )}
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', fontSize: 'var(--font-size-xs)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ padding: '6px' }}>السطر</th>
                          <th style={{ padding: '6px' }}>الـ SKU</th>
                          <th style={{ padding: '6px' }}>اسم المنتج</th>
                          <th style={{ padding: '6px' }}>التكلفة</th>
                          <th style={{ padding: '6px' }}>سعر البيع</th>
                          <th style={{ padding: '6px' }}>الكمية</th>
                          <th style={{ padding: '6px' }}>الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPreviewData.slice(0, 10).map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border)' }}>
                            <td style={{ padding: '6px' }}>{row.rowNumber}</td>
                            <td style={{ padding: '6px' }}>{row.sku}</td>
                            <td style={{ padding: '6px' }}>{row.productName}</td>
                            <td style={{ padding: '6px' }}>${row.cost}</td>
                            <td style={{ padding: '6px' }}>${row.price}</td>
                            <td style={{ padding: '6px' }}>{row.stock}</td>
                            <td style={{ padding: '6px' }}>
                              <span style={{ padding: '2px 6px', borderRadius: '3px', backgroundColor: row.status === 'ERROR' ? '#fde8e8' : row.status === 'WARNING' ? '#fdf6b2' : '#def7ec', color: row.status === 'ERROR' ? '#9b1c1c' : row.status === 'WARNING' ? '#723b13' : '#03543f', fontWeight: 'bold' }}>
                                {row.status === 'ERROR' ? 'خطأ' : row.status === 'WARNING' ? 'تحذير' : 'جاهز'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            // ==========================================
            // AI OCR INVOICE SCANNER UI
            // ==========================================
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
              
              <style>{`
                .focus-corner { position: absolute; width: 20px; height: 20px; border: 3px solid var(--color-primary); }
                .tl { top: 12px; left: 12px; border-right: none; border-bottom: none; }
                .tr { top: 12px; right: 12px; border-left: none; border-bottom: none; }
                .bl { bottom: 12px; left: 12px; border-right: none; border-top: none; }
                .br { bottom: 12px; right: 12px; border-left: none; border-top: none; }
// MISSING LINE 2151
// MISSING LINE 2152
// MISSING LINE 2153
// MISSING LINE 2154
// MISSING LINE 2155
// MISSING LINE 2156
// MISSING LINE 2157
// MISSING LINE 2158
// MISSING LINE 2159
// MISSING LINE 2160
// MISSING LINE 2161
// MISSING LINE 2162
// MISSING LINE 2163
// MISSING LINE 2164
// MISSING LINE 2165
// MISSING LINE 2166
// MISSING LINE 2167
// MISSING LINE 2168
// MISSING LINE 2169
// MISSING LINE 2170
// MISSING LINE 2171
// MISSING LINE 2172
// MISSING LINE 2173
// MISSING LINE 2174
// MISSING LINE 2175
// MISSING LINE 2176
// MISSING LINE 2177
// MISSING LINE 2178
// MISSING LINE 2179
                          { value: 'MEDS', label: 'فاتورة صيدلية بيطرية وأدوية (الشركة المصرية)' }
                        ]}
                      />
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    {/* File Upload Selector */}
                    <div 
                      style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', minHeight: '160px' }}
                      onClick={() => document.getElementById('ocr-file-input')?.click()}
                    >
                      <Upload size={28} style={{ color: 'var(--color-text-secondary)' }} />
                      <div style={{ fontWeight: '500', fontSize: 'var(--font-size-sm)' }}>رفع ملف الفاتورة أو الـ PDF</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>يدعم JPG, PNG, WEBP, PDF</div>
                      <input id="ocr-file-input" type="file" accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={handleOcrFileChange} style={{ display: 'none' }} />
                    </div>

                    {/* Camera Trigger */}
                    <div 
                      style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-6)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', minHeight: '160px' }}
                      onClick={startCamera}
                    >
                      <Camera size={28} style={{ color: 'var(--color-primary)' }} />
                      <div style={{ fontWeight: '500', fontSize: 'var(--font-size-sm)' }}>تصوير مباشر بالكاميرا</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>استخدم كاميرا اللابتوب أو الموبايل</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live Webcam Stream Capture Mode */}
              {cameraActive && (
                <div style={{ position: 'relative', width: '100%', maxWidth: '500px', margin: '0 auto', borderRadius: '12px', overflow: 'hidden', border: '3px solid var(--color-border)', backgroundColor: '#000' }}>
                  <video id="ocr-webcam-stream" style={{ width: '100%', height: 'auto', display: 'block' }} playsInline muted />
                  
                  {/* Camera Focus HUD Corners */}
                  <div className="focus-corner tl" />
                  <div className="focus-corner tr" />
                  <div className="focus-corner bl" />
                  <div className="focus-corner br" />

                  {/* Actions overlay */}
                  <div style={{ position: 'absolute', bottom: '16px', left: '0', width: '100%', display: 'flex', justifyContent: 'center', gap: '12px', zIndex: 20 }}>
                    <Button onClick={capturePhoto} variant="primary">📸 التقاط الفاتورة</Button>
                    <Button onClick={stopCamera} variant="secondary">إلغاء</Button>
                  </div>
                </div>
              )}

              {/* Progress HUD with laser scanning effect during analysis */}
              {ocrStep > 0 && ocrStep < 5 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--spacing-6)', gap: 'var(--spacing-4)' }}>
                  
                  {/* Laser Scan Image Display */}
                  {capturedImage && (
                    <div style={{ position: 'relative', width: '220px', height: '280px', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--color-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      <img src={capturedImage} alt="Captured invoice" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div className="laser-scan-line" />
                    </div>
                  )}

                  <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>
                    {ocrProgressMsg}
                  </div>

                  {/* Progressive indicator */}
                  <div style={{ display: 'flex', gap: '4px', width: '240px' }}>
                    {[1, 2, 3, 4].map(stepNum => (
                      <div 
                        key={stepNum} 
                        style={{ 
                          flex: 1, 
                          height: '8px', 
                          borderRadius: '4px', 
                          backgroundColor: ocrStep >= stepNum ? 'var(--color-primary)' : 'var(--color-border)',
                          transition: 'background-color 0.3s ease'
                        }} 
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* OCR Parsing Error handling */}
              {ocrError && (
                <div style={{ backgroundColor: '#fde8e8', color: '#9b1c1c', border: '1px solid #f8b4b4', padding: '12px', borderRadius: '8px', textAlign: 'center', fontSize: 'var(--font-size-xs)' }}>
                  ⚠️ {ocrError}
                  <div style={{ marginTop: '8px' }}>
                    <Button onClick={() => { setOcrStep(0); setOcrError(null); }} size="sm" variant="secondary">إعادة المحاولة</Button>
                  </div>
                </div>
              )}

              {/* Extracted Invoice verification grid */}
              {ocrStep === 5 && extractedInvoice && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* Supplier & Finance detail Panel */}
                  <div style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 'bold', fontSize: 'var(--font-size-xs)' }}>بيانات المورد المستخرجة:</div>
                      {suppliers?.find(s => s.name.toLowerCase() === extractedInvoice.supplierName.toLowerCase()) ? (
                        <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>✅ مورد مطابق ومسجل: {extractedInvoice.supplierName}</span>
                      ) : (
                        <span style={{ color: 'var(--color-warning)', fontSize: 'var(--font-size-xs)', fontWeight: 'bold' }}>⚠️ مورد جديد سيتم إنشاؤه تلقائياً: {extractedInvoice.supplierName}</span>
                      )}
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', fontSize: 'var(--font-size-xs)' }}>
                      <div>اسم المورد: <input value={extractedInvoice.supplierName} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, supplierName: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '130px' }} /></div>
                      <div>رقم الفاتورة: <input value={extractedInvoice.invoiceNumber} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, invoiceNumber: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '130px' }} /></div>
                      <div>التاريخ: <input value={extractedInvoice.invoiceDate} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, invoiceDate: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '130px' }} /></div>
                      <div>تاريخ الاستحقاق: <input type="date" value={extractedInvoice.dueDate || extractedInvoice.invoiceDate} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, dueDate: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '130px' }} /></div>
                      <div>رقم الهاتف: <input value={extractedInvoice.phone || ''} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, phone: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '130px' }} /></div>
                      <div>الرقم الضريبي: <input value={extractedInvoice.taxNumber || ''} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, taxNumber: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '130px' }} /></div>
                      <div>العملة المستخرجة: <input value={extractedInvoice.currency || 'EGP'} onChange={(e) => setExtractedInvoice({ ...extractedInvoice, currency: e.target.value })} style={{ border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: '4px', width: '70px' }} /></div>
                    </div>
                    
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px', fontSize: 'var(--font-size-xs)', textAlign: 'center' }}>
                      <div>الصافي: <strong>{extractedInvoice.netTotal} {extractedInvoice.currency}</strong></div>
                      <div>الضريبة (VAT): <strong>{extractedInvoice.vat} {extractedInvoice.currency}</strong></div>
                      <div>الخصم: <strong>{extractedInvoice.discount} {extractedInvoice.currency}</strong></div>
                      <div>الشحن: <strong>{extractedInvoice.shipping} {extractedInvoice.currency}</strong></div>
                      <div style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>الإجمالي: <strong>{extractedInvoice.grandTotal} {extractedInvoice.currency}</strong></div>
                    </div>
                  </div>

                  {/* Summary verification statistics */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', backgroundColor: 'rgba(99,102,241,0.05)', borderRadius: '6px', fontSize: 'var(--font-size-xs)' }}>
                    <div>
                      المستخرج: <strong>{extractedInvoice.items.length} منتجات</strong> | 
                      مطابق: <strong>{extractedInvoice.items.filter((_it: any, idx: number) => selectedMatches[idx] !== 'NEW').length}</strong> | 
                      جديد: <strong>{extractedInvoice.items.filter((_it: any, idx: number) => selectedMatches[idx] === 'NEW').length}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} /> &gt;95%
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} /> 80-95%
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} /> &lt;80%
                    </div>
                  </div>

                  {/* Verification Items Table */}
                  <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflowX: 'auto', fontSize: 'var(--font-size-xs)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ padding: '8px' }}>اسم المنتج المستخرج</th>
                          <th style={{ padding: '8px' }}>كود السلعة / Barcode</th>
                          <th style={{ padding: '8px' }}>سعر الشراء (التكلفة)</th>
                          <th style={{ padding: '8px' }}>سعر البيع</th>
                          <th style={{ padding: '8px' }}>الكمية</th>
                          <th style={{ padding: '8px' }}>مطابقة الكتالوج</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extractedInvoice.items.map((item: any, idx: number) => {
                          const sims = matchProductSimilarity(item.productName, item.sku);
                          
                          const getConfColor = (score?: number) => {
                            if (score === undefined) return '#10b981';
                            if (score >= 0.95) return '#10b981';
                            if (score >= 0.80) return '#f59e0b';
                            return '#ef4444';
                          };

                          const cellStyle = (field: string) => ({
                            border: `1px solid ${getConfColor(item.confidence?.[field])}`,
                            backgroundColor: `${getConfColor(item.confidence?.[field])}0b`,
                            borderRadius: '4px',
                            padding: '4px 6px',
// MISSING LINE 2351
// MISSING LINE 2352
// MISSING LINE 2353
// MISSING LINE 2354
// MISSING LINE 2355
// MISSING LINE 2356
// MISSING LINE 2357
// MISSING LINE 2358
// MISSING LINE 2359
// MISSING LINE 2360
// MISSING LINE 2361
// MISSING LINE 2362
// MISSING LINE 2363
// MISSING LINE 2364
// MISSING LINE 2365
// MISSING LINE 2366
// MISSING LINE 2367
// MISSING LINE 2368
// MISSING LINE 2369
// MISSING LINE 2370
// MISSING LINE 2371
// MISSING LINE 2372
// MISSING LINE 2373
// MISSING LINE 2374
// MISSING LINE 2375
// MISSING LINE 2376
// MISSING LINE 2377
// MISSING LINE 2378
// MISSING LINE 2379
// MISSING LINE 2380
// MISSING LINE 2381
// MISSING LINE 2382
// MISSING LINE 2383
// MISSING LINE 2384
// MISSING LINE 2385
// MISSING LINE 2386
// MISSING LINE 2387
// MISSING LINE 2388
// MISSING LINE 2389
// MISSING LINE 2390
// MISSING LINE 2391
// MISSING LINE 2392
// MISSING LINE 2393
// MISSING LINE 2394
// MISSING LINE 2395
// MISSING LINE 2396
// MISSING LINE 2397
// MISSING LINE 2398
// MISSING LINE 2399
// MISSING LINE 2400
// MISSING LINE 2401
// MISSING LINE 2402
// MISSING LINE 2403
// MISSING LINE 2404
// MISSING LINE 2405
// MISSING LINE 2406
// MISSING LINE 2407
// MISSING LINE 2408
// MISSING LINE 2409
// MISSING LINE 2410
// MISSING LINE 2411
// MISSING LINE 2412
// MISSING LINE 2413
// MISSING LINE 2414
// MISSING LINE 2415
// MISSING LINE 2416
// MISSING LINE 2417
// MISSING LINE 2418
// MISSING LINE 2419
// MISSING LINE 2420
// MISSING LINE 2421
// MISSING LINE 2422
// MISSING LINE 2423
// MISSING LINE 2424
// MISSING LINE 2425
// MISSING LINE 2426
// MISSING LINE 2427
// MISSING LINE 2428
// MISSING LINE 2429
// MISSING LINE 2430
// MISSING LINE 2431
// MISSING LINE 2432
// MISSING LINE 2433
// MISSING LINE 2434
// MISSING LINE 2435
// MISSING LINE 2436
// MISSING LINE 2437
// MISSING LINE 2438
// MISSING LINE 2439
// MISSING LINE 2440
// MISSING LINE 2441
// MISSING LINE 2442
// MISSING LINE 2443
// MISSING LINE 2444
// MISSING LINE 2445
// MISSING LINE 2446
// MISSING LINE 2447
// MISSING LINE 2448
// MISSING LINE 2449
// MISSING LINE 2450
// MISSING LINE 2451
// MISSING LINE 2452
// MISSING LINE 2453
// MISSING LINE 2454
// MISSING LINE 2455
// MISSING LINE 2456
// MISSING LINE 2457
// MISSING LINE 2458
// MISSING LINE 2459
// MISSING LINE 2460
// MISSING LINE 2461
// MISSING LINE 2462
// MISSING LINE 2463
// MISSING LINE 2464
// MISSING LINE 2465
// MISSING LINE 2466
// MISSING LINE 2467
// MISSING LINE 2468
// MISSING LINE 2469
// MISSING LINE 2470
// MISSING LINE 2471
// MISSING LINE 2472
// MISSING LINE 2473
// MISSING LINE 2474
// MISSING LINE 2475
// MISSING LINE 2476
// MISSING LINE 2477
// MISSING LINE 2478
// MISSING LINE 2479
// MISSING LINE 2480
// MISSING LINE 2481
// MISSING LINE 2482
// MISSING LINE 2483
// MISSING LINE 2484
// MISSING LINE 2485
// MISSING LINE 2486
// MISSING LINE 2487
// MISSING LINE 2488
// MISSING LINE 2489
// MISSING LINE 2490
// MISSING LINE 2491
// MISSING LINE 2492
// MISSING LINE 2493
// MISSING LINE 2494
// MISSING LINE 2495
// MISSING LINE 2496
// MISSING LINE 2497
// MISSING LINE 2498
// MISSING LINE 2499
// MISSING LINE 2500
// MISSING LINE 2501
// MISSING LINE 2502
// MISSING LINE 2503
// MISSING LINE 2504
// MISSING LINE 2505
// MISSING LINE 2506
// MISSING LINE 2507
// MISSING LINE 2508
// MISSING LINE 2509
// MISSING LINE 2510
// MISSING LINE 2511
// MISSING LINE 2512
// MISSING LINE 2513
// MISSING LINE 2514
// MISSING LINE 2515
// MISSING LINE 2516
// MISSING LINE 2517
// MISSING LINE 2518
// MISSING LINE 2519
// MISSING LINE 2520
// MISSING LINE 2521
// MISSING LINE 2522
// MISSING LINE 2523
// MISSING LINE 2524
// MISSING LINE 2525
// MISSING LINE 2526
// MISSING LINE 2527
// MISSING LINE 2528
// MISSING LINE 2529
// MISSING LINE 2530
// MISSING LINE 2531
// MISSING LINE 2532
// MISSING LINE 2533
// MISSING LINE 2534
// MISSING LINE 2535
// MISSING LINE 2536
// MISSING LINE 2537
// MISSING LINE 2538
// MISSING LINE 2539
// MISSING LINE 2540
// MISSING LINE 2541
// MISSING LINE 2542
// MISSING LINE 2543
// MISSING LINE 2544
// MISSING LINE 2545
// MISSING LINE 2546
// MISSING LINE 2547
// MISSING LINE 2548
// MISSING LINE 2549
// MISSING LINE 2550
// MISSING LINE 2551
// MISSING LINE 2552
// MISSING LINE 2553
// MISSING LINE 2554
// MISSING LINE 2555
// MISSING LINE 2556
// MISSING LINE 2557
// MISSING LINE 2558
// MISSING LINE 2559
// MISSING LINE 2560
// MISSING LINE 2561
// MISSING LINE 2562
// MISSING LINE 2563
// MISSING LINE 2564
// MISSING LINE 2565
// MISSING LINE 2566
// MISSING LINE 2567
// MISSING LINE 2568
// MISSING LINE 2569
// MISSING LINE 2570
// MISSING LINE 2571
// MISSING LINE 2572
// MISSING LINE 2573
// MISSING LINE 2574
// MISSING LINE 2575
// MISSING LINE 2576
// MISSING LINE 2577
// MISSING LINE 2578
// MISSING LINE 2579
// MISSING LINE 2580
// MISSING LINE 2581
// MISSING LINE 2582
// MISSING LINE 2583
// MISSING LINE 2584
// MISSING LINE 2585
// MISSING LINE 2586
// MISSING LINE 2587
// MISSING LINE 2588
// MISSING LINE 2589
// MISSING LINE 2590
// MISSING LINE 2591
// MISSING LINE 2592
// MISSING LINE 2593
// MISSING LINE 2594
// MISSING LINE 2595
// MISSING LINE 2596
// MISSING LINE 2597
// MISSING LINE 2598
// MISSING LINE 2599
// MISSING LINE 2600
// MISSING LINE 2601
// MISSING LINE 2602
// MISSING LINE 2603
// MISSING LINE 2604
// MISSING LINE 2605
// MISSING LINE 2606
// MISSING LINE 2607
// MISSING LINE 2608
// MISSING LINE 2609
// MISSING LINE 2610
// MISSING LINE 2611
// MISSING LINE 2612
// MISSING LINE 2613
// MISSING LINE 2614
// MISSING LINE 2615
// MISSING LINE 2616
// MISSING LINE 2617
// MISSING LINE 2618
// MISSING LINE 2619
// MISSING LINE 2620
// MISSING LINE 2621
// MISSING LINE 2622
// MISSING LINE 2623
// MISSING LINE 2624
// MISSING LINE 2625
// MISSING LINE 2626
// MISSING LINE 2627
// MISSING LINE 2628
// MISSING LINE 2629
// MISSING LINE 2630
// MISSING LINE 2631
// MISSING LINE 2632
// MISSING LINE 2633
// MISSING LINE 2634
// MISSING LINE 2635
// MISSING LINE 2636
// MISSING LINE 2637
// MISSING LINE 2638
// MISSING LINE 2639
// MISSING LINE 2640
// MISSING LINE 2641
// MISSING LINE 2642
// MISSING LINE 2643
// MISSING LINE 2644
// MISSING LINE 2645
// MISSING LINE 2646
// MISSING LINE 2647
// MISSING LINE 2648
// MISSING LINE 2649
// MISSING LINE 2650
// MISSING LINE 2651
// MISSING LINE 2652
// MISSING LINE 2653
// MISSING LINE 2654
// MISSING LINE 2655
// MISSING LINE 2656
// MISSING LINE 2657
// MISSING LINE 2658
// MISSING LINE 2659
// MISSING LINE 2660
// MISSING LINE 2661
// MISSING LINE 2662
// MISSING LINE 2663
// MISSING LINE 2664
// MISSING LINE 2665
// MISSING LINE 2666
// MISSING LINE 2667
// MISSING LINE 2668
// MISSING LINE 2669
// MISSING LINE 2670
// MISSING LINE 2671
// MISSING LINE 2672
// MISSING LINE 2673
// MISSING LINE 2674
