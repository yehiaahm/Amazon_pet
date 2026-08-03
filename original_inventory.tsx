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
  sku: ['sku', 'code', 'كود', 'رقم المنتج', 'الباركود', 'barcode', 'item code', 'كود السلعة', 'كود_السلعة'],
  productName: ['product', 'name', 'الاسم', 'اسم المنتج', 'سم المنتج', 'العنصر', 'اسم السلعة', 'اسم'],
  variantName: ['variant', 'size', 'الصنف', 'الحجم', 'الوزن', 'المقاس'],
  cost: ['cost', 'سعر الشراء', 'التكلفة', 'سعر التكلفة', 'شراء', 'سعر_الشراء'],
  price: ['price', 'selling price', 'سعر البيع', 'السعر', 'بيع', 'سعر_البيع'],
  stock: ['stock', 'qty', 'الكمية', 'المخزون', 'الرصيد', 'كمية الجرد'],
  categoryName: ['category', 'الفئة', 'القسم', 'التصنيف'],
  brand: ['brand', 'الماركة', 'الشركة', 'براند'],
  supplier: ['supplier', 'vendor', 'المورد', 'الشركة', 'مورد']
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
      .replace(/\s+/g, '').replace(/[^a-zA-Z0-9ا-ي]/g, '');
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

export const Inventory: React.FC = () => {
  const currentEmployee = useUIStore(s => s.currentEmployee)!;
  
  // Custom queries & mutations
  const { data: products, isLoading: loadingProds } = useProducts();
  const { data: variants, isLoading: loadingVars } = useVariants();
  const { data: batches } = useBatches();
  const { data: warehouses } = useWarehouses();
  const { data: movements } = useStockMovements();
  const { data: suppliers } = useSuppliers();
  const { mutate: adjustStock } = useUpdateStock();

  // Import hooks
  const { data: importHistory } = useImportHistory();
  const { mutateAsync: startSession } = useStartImportSession();
  const { mutateAsync: uploadChunk } = useUploadImportChunk();
  const { mutateAsync: finalizeSession } = useFinalizeImportSession();
  const { mutateAsync: undoSession } = useUndoImportSession();

  // Local state
  const [activeSubTab, setActiveSubTab] = useState<'STOCK' | 'BATCHES' | 'MOVEMENTS' | 'IMPORTS' | 'PURCHASES'>('STOCK');
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('ADJUSTMENT');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferQty, setTransferQty] = useState('');
// MISSING LINE 146
// MISSING LINE 147
// MISSING LINE 148
// MISSING LINE 149
// MISSING LINE 150
// MISSING LINE 151
// MISSING LINE 152
// MISSING LINE 153
// MISSING LINE 154
// MISSING LINE 155
// MISSING LINE 156
// MISSING LINE 157
// MISSING LINE 158
// MISSING LINE 159
// MISSING LINE 160
// MISSING LINE 161
// MISSING LINE 162
// MISSING LINE 163
// MISSING LINE 164
// MISSING LINE 165
// MISSING LINE 166
// MISSING LINE 167
// MISSING LINE 168
// MISSING LINE 169
// MISSING LINE 170
// MISSING LINE 171
// MISSING LINE 172
// MISSING LINE 173
// MISSING LINE 174
// MISSING LINE 175
// MISSING LINE 176
// MISSING LINE 177
// MISSING LINE 178
// MISSING LINE 179
// MISSING LINE 180
// MISSING LINE 181
// MISSING LINE 182
// MISSING LINE 183
// MISSING LINE 184
// MISSING LINE 185
// MISSING LINE 186
// MISSING LINE 187
// MISSING LINE 188
// MISSING LINE 189
// MISSING LINE 190
// MISSING LINE 191
// MISSING LINE 192
// MISSING LINE 193
// MISSING LINE 194
// MISSING LINE 195
// MISSING LINE 196
// MISSING LINE 197
// MISSING LINE 198
// MISSING LINE 199
              `فاتورة المورد ${pi.supplierName} رقم ${pi.invoiceNumber} بقيمة ${pi.grandTotal} ${pi.currency} مستحقة السداد اليوم!`
            );
          }
        } else if (diffDays <= 5 && diffDays > 0) {
          // Due in 5 days (upcoming next week)
          const expectedTitle = `مستحق قريباً: ${pi.supplierName}`;
          if (!notifications.some(n => n.title === expectedTitle)) {
            addNotification(
              'TASKS',
              expectedTitle,
              `تحصيل مستحق خلال ${diffDays} أيام: فاتورة المورد ${pi.supplierName} بقيمة ${pi.grandTotal} ${pi.currency} مستحقة الأسبوع القادم.`
            );
          }
        }
      }
    });
  }, [purchaseInvoices, notifications, addNotification]);
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
  const [duplicateStrategy, setDuplicateStrategy] = useState<'SKIP' | 'UPDATE' | 'REPLACE'>('UPDATE');
  const [dryRun, setDryRun] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [showMappingConfig, setShowMappingConfig] = useState(false);

  // Load Saved Mapping Profiles on start
  useEffect(() => {
    const saved = localStorage.getItem('animasys_import_profiles');
    if (saved) {
      setSavedProfiles(JSON.parse(saved));
    }
  }, []);

  if (loadingProds || loadingVars) {
    return <div className="workspace"><div className="skeleton" style={{ height: '40px' }} /></div>;
  }

  // Map variants to full display objects
  const variantsTableData = variants?.map(v => {
    const prod = products?.find(p => p.id === v.productId);
    return {
      id: v.id,
      sku: prod?.sku || '',
      name: prod?.name || '',
      variant: v.name,
      price: v.price,
      cost: v.cost,
      stock: v.stockQuantity,
      limit: prod?.minStockLimit || 10,
      margin: v.price > 0 ? (((v.price - v.cost) / v.price) * 100).toFixed(0) + '%' : '0%'
    };
  }) || [];

  const matchProductSimilarity = (ocrName: string, ocrSku: string) => {
    if (!products) return [];
    const clean = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '').trim();
    const cleanOcr = clean(ocrName);
    
    return products.map(p => {
      if (ocrSku && p.sku && clean(ocrSku) === clean(p.sku)) {
        return { product: p, score: 1.0 };
      }
      
      const cleanDb = clean(p.name);
      let intersection = 0;
      const ocrChars = cleanOcr.split('');
      const dbChars = cleanDb.split('');
      
      ocrChars.forEach(c => {
        if (dbChars.includes(c)) intersection++;
      });
      
      const score = ocrChars.length + dbChars.length > 0 
        ? (2 * intersection) / (ocrChars.length + dbChars.length) 
        : 0;
      return { product: p, score: parseFloat(score.toFixed(2)) };
    }).sort((a, b) => b.score - a.score);
  };

  const startCamera = async () => {
    setCapturedImage(null);
    setExtractedInvoice(null);
    setOcrError(null);
    setCameraActive(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      const videoElement = document.getElementById('ocr-webcam-stream') as HTMLVideoElement;
      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play();
      }
    } catch (err) {
// MISSING LINE 321
// MISSING LINE 322
// MISSING LINE 323
// MISSING LINE 324
// MISSING LINE 325
// MISSING LINE 326
// MISSING LINE 327
// MISSING LINE 328
// MISSING LINE 329
// MISSING LINE 330
// MISSING LINE 331
// MISSING LINE 332
// MISSING LINE 333
// MISSING LINE 334
// MISSING LINE 335
// MISSING LINE 336
// MISSING LINE 337
// MISSING LINE 338
// MISSING LINE 339
// MISSING LINE 340
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
// MISSING LINE 430
// MISSING LINE 431
// MISSING LINE 432
// MISSING LINE 433
// MISSING LINE 434
// MISSING LINE 435
// MISSING LINE 436
// MISSING LINE 437
// MISSING LINE 438
// MISSING LINE 439
// MISSING LINE 440
// MISSING LINE 441
// MISSING LINE 442
// MISSING LINE 443
// MISSING LINE 444
// MISSING LINE 445
// MISSING LINE 446
// MISSING LINE 447
// MISSING LINE 448
// MISSING LINE 449
// MISSING LINE 450
// MISSING LINE 451
// MISSING LINE 452
// MISSING LINE 453
// MISSING LINE 454
// MISSING LINE 455
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
// MISSING LINE 575
// MISSING LINE 576
// MISSING LINE 577
// MISSING LINE 578
// MISSING LINE 579
// MISSING LINE 580
// MISSING LINE 581
// MISSING LINE 582
// MISSING LINE 583
// MISSING LINE 584
// MISSING LINE 585
// MISSING LINE 586
// MISSING LINE 587
// MISSING LINE 588
// MISSING LINE 589
// MISSING LINE 590
// MISSING LINE 591
// MISSING LINE 592
// MISSING LINE 593
// MISSING LINE 594
// MISSING LINE 595
// MISSING LINE 596
// MISSING LINE 597
// MISSING LINE 598
// MISSING LINE 599
// MISSING LINE 600
// MISSING LINE 601
// MISSING LINE 602
// MISSING LINE 603
// MISSING LINE 604
// MISSING LINE 605
// MISSING LINE 606
// MISSING LINE 607
// MISSING LINE 608
// MISSING LINE 609
// MISSING LINE 610
// MISSING LINE 611
// MISSING LINE 612
// MISSING LINE 613
// MISSING LINE 614
// MISSING LINE 615
// MISSING LINE 616
// MISSING LINE 617
// MISSING LINE 618
// MISSING LINE 619
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
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (json.length === 0) {
          alert("الملف المرفوع فارغ أو لا يحتوي على صفوف بيانات صالحة.");
          setAiAnalyzing(false);
          setAiStep(0);
          return;
        }

        const headers = Object.keys(json[0]);
        
        // Start AI Analysis Animation
        setAiAnalyzing(true);
        setAiStep(1); // ⏳ قراءة هيكل الملف واستخراج الأعمدة...
        await delayLocal(500);
        
        setAiStep(2); // ⏳ تحليل دلالات ومفردات العناوين بالـ AI...
        setParsedHeaders(headers);
        setRawRows(json);

        const prompt = `You are an expert data migration assistant. 
Map these actual Excel headers from a pet shop inventory file to the standard system fields:
- sku (Barcode/SKU/كود السلعة)
- productName (اسم المنتج)
- variantName (اسم الصنف/الوزن/الحجم)
- cost (سعر التكلفة)
- price (سعر البيع)
- stock (الكمية الحالية)
- categoryName (القسم/الفئة)
- brand (الماركة/البراند)
- supplier (المورد)

Actual Excel headers: ${JSON.stringify(headers)}

Respond ONLY with a raw JSON object (no markdown formatting, no code blocks, just raw JSON) containing two objects: "mapping" (where keys are standard system fields and values are matching Excel headers) and "confidence" (where keys are standard fields and values are matching scores between 0 and 1). If no match is found for a field, map it to empty string "" and confidence 0.0. Example:
{
  "mapping": {"sku": "كود المنتج", "productName": "الاسم", "variantName": "", "cost": "", "price": "", "stock": "", "categoryName": "", "brand": "", "supplier": ""},
  "confidence": {"sku": 0.99, "productName": 0.98, "variantName": 0.0, "cost": 0.0, "price": 0.0, "stock": 0.0, "categoryName": 0.0, "brand": 0.0, "supplier": 0.0}
}`;

        let mappedResult: { mappings: Record<string, string>; confidences: Record<string, number> } | null = null;
        try {
          const aiResponse = await api.askAIAdvisor(prompt);
          setAiStep(3); // ⏳ فحص قيم البيانات وتحديد أنواعها...
          await delayLocal(400);

          const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          
          if (parsed && parsed.mapping) {
            mappedResult = {
              mappings: parsed.mapping,
              confidences: parsed.confidence || {}
            };
          }
        } catch (err) {
          console.error("AI Mapping failed or timed out, using fallback heuristics:", err);
        }

        setAiStep(4); // ⏳ توليد نموذج الربط التلقائي والتحقق...
        await delayLocal(400);

        if (!mappedResult) {
          // Fallback to local heuristic matching
          mappedResult = runLocalFallbackMapping(headers);
        }

        // Apply mappings and confidences
        setMappings(prev => ({
          ...prev,
          ...mappedResult!.mappings
        }));
        
        const filledConfidences: Record<string, number> = {};
        Object.keys(mappedResult.mappings).forEach(field => {
          filledConfidences[field] = mappedResult!.confidences[field] ?? 0.0;
        });
        setMappingConfidences(filledConfidences);

        setAiStep(5); // ✅ تم التطابق والمراجعة
        await delayLocal(400);

        setAiAnalyzing(false);
        setAiStep(0);
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

    const validated = rawRows.map((row, idx) => {
      const mappedRow: any = {};
      Object.keys(mappings).forEach(field => {
        const fileCol = mappings[field];
        mappedRow[field] = fileCol ? row[fileCol] : undefined;
      });

      // Validations
      const errors: string[] = [];
      const warnings: string[] = [];

      const sku = cleanStringVal(mappedRow.sku);
      const name = cleanStringVal(mappedRow.productName);
      const price = parseSmartNumber(mappedRow.price);
      const cost = parseSmartNumber(mappedRow.cost);
      const stock = parseSmartNumber(mappedRow.stock);

      if (!sku && !name) {
        errors.push('كود الباركود واسم المنتج فارغين معاً');
      }
      if (mappedRow.price !== undefined && (isNaN(price) || price < 0)) {
        errors.push('سعر البيع لا يمكن أن يكون سالباً');
      }
      if (mappedRow.cost !== undefined && (isNaN(cost) || cost < 0)) {
        errors.push('سعر التكلفة لا يمكن أن يكون سالباً');
      }
      if (mappedRow.stock !== undefined && (isNaN(stock) || stock < 0)) {
        errors.push('الكمية الحالية لا يمكن أن تكون سالبة');
      }
      if (price < cost) {
        warnings.push('سعر البيع أقل من سعر الشراء (التكلفة)');
      }
      if (!cleanStringVal(mappedRow.categoryName)) {
        warnings.push('الفئة فارغة (سيتم وضعها في فئة افتراضية)');
      }

      return {
        rowNumber: idx + 1,
        sku: sku || 'توليد تلقائي',
        productName: name || 'مفقود',
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

  // Download error report
  const downloadErrorReport = () => {
    const errorRows = validatedData.filter(r => r.status === 'ERROR' || r.status === 'WARNING');
    if (errorRows.length === 0) return;

    let csvContent = "\uFEFFالسطر,الكود (SKU),اسم المنتج,الحالة,تفاصيل الأخطاء\n";
    errorRows.forEach(r => {
      csvContent += `${r.rowNumber},"${r.sku}","${r.productName}",${r.status},"${r.message}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `import_errors_${fileMeta.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAIAutoFix = () => {
    if (!mappings.productName && !mappings.sku) {
      alert('برجاء ربط عمود "اسم المنتج" أو "كود السلعة" أولاً قبل تشغيل التصحيح التلقائي بالـ AI.');
      return;
    }

    const updatedRows = rawRows.map((row, idx) => {
      const updatedRow = { ...row };

      const skuCol = mappings.sku;
      const nameCol = mappings.productName;
      const costCol = mappings.cost;
      const priceCol = mappings.price;
      const stockCol = mappings.stock;

      // 1. SKU empty -> generate
      if (skuCol) {
        if (!row[skuCol] || row[skuCol].toString().trim() === '') {
          updatedRow[skuCol] = `ANS-AUTO-${1000 + idx}`;
        }
      }

      // 2. Name empty -> generate
      if (nameCol) {
        if (!row[nameCol] || row[nameCol].toString().trim() === '') {
          updatedRow[nameCol] = `منتج جرد تلقائي رقم ${idx + 1}`;
        }
      }

      // 3. Cost negative -> fix
      if (costCol) {
        const val = parseSmartNumber(row[costCol]);
        if (isNaN(val) || val < 0) {
          updatedRow[costCol] = Math.abs(isNaN(val) ? 0 : val);
        }
      }

      // 4. Price negative or less than cost -> fix
      if (priceCol) {
        let p = parseSmartNumber(row[priceCol]);
        if (isNaN(p) || p < 0) {
          p = Math.abs(isNaN(p) ? 0 : p);
        }
        
        if (costCol) {
          const c = parseSmartNumber(updatedRow[costCol] || row[costCol]);
          if (p < c) {
            p = Number((c * 1.25).toFixed(2));
          }
        }
        updatedRow[priceCol] = p;
      }

      // 5. Stock negative -> fix
      if (stockCol) {
        const val = parseSmartNumber(row[stockCol]);
        if (isNaN(val) || val < 0) {
          updatedRow[stockCol] = Math.abs(isNaN(val) ? 0 : val);
        }
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

// MISSING LINE 941
// MISSING LINE 942
// MISSING LINE 943
// MISSING LINE 944
// MISSING LINE 945
// MISSING LINE 946
// MISSING LINE 947
// MISSING LINE 948
// MISSING LINE 949
// MISSING LINE 950
// MISSING LINE 951
// MISSING LINE 952
// MISSING LINE 953
// MISSING LINE 954
// MISSING LINE 955
// MISSING LINE 956
// MISSING LINE 957
// MISSING LINE 958
// MISSING LINE 959
// MISSING LINE 960
// MISSING LINE 961
// MISSING LINE 962
// MISSING LINE 963
// MISSING LINE 964
// MISSING LINE 965
// MISSING LINE 966
// MISSING LINE 967
// MISSING LINE 968
// MISSING LINE 969
// MISSING LINE 970
// MISSING LINE 971
// MISSING LINE 972
// MISSING LINE 973
// MISSING LINE 974
// MISSING LINE 975
// MISSING LINE 976
// MISSING LINE 977
// MISSING LINE 978
// MISSING LINE 979
// MISSING LINE 980
// MISSING LINE 981
// MISSING LINE 982
// MISSING LINE 983
// MISSING LINE 984
// MISSING LINE 985
// MISSING LINE 986
// MISSING LINE 987
// MISSING LINE 988
// MISSING LINE 989
// MISSING LINE 990
// MISSING LINE 991
// MISSING LINE 992
// MISSING LINE 993
// MISSING LINE 994
// MISSING LINE 995
// MISSING LINE 996
// MISSING LINE 997
// MISSING LINE 998
// MISSING LINE 999
// MISSING LINE 1000
// MISSING LINE 1001
// MISSING LINE 1002
// MISSING LINE 1003
// MISSING LINE 1004
// MISSING LINE 1005
// MISSING LINE 1006
// MISSING LINE 1007
// MISSING LINE 1008
// MISSING LINE 1009
// MISSING LINE 1010
// MISSING LINE 1011
// MISSING LINE 1012
// MISSING LINE 1013
// MISSING LINE 1014
// MISSING LINE 1015
// MISSING LINE 1016
// MISSING LINE 1017
// MISSING LINE 1018
// MISSING LINE 1019
// MISSING LINE 1020
// MISSING LINE 1021
// MISSING LINE 1022
// MISSING LINE 1023
// MISSING LINE 1024
// MISSING LINE 1025
// MISSING LINE 1026
// MISSING LINE 1027
// MISSING LINE 1028
// MISSING LINE 1029
// MISSING LINE 1030
// MISSING LINE 1031
// MISSING LINE 1032
// MISSING LINE 1033
// MISSING LINE 1034
// MISSING LINE 1035
// MISSING LINE 1036
// MISSING LINE 1037
// MISSING LINE 1038
// MISSING LINE 1039
// MISSING LINE 1040
// MISSING LINE 1041
// MISSING LINE 1042
// MISSING LINE 1043
// MISSING LINE 1044
// MISSING LINE 1045
// MISSING LINE 1046
// MISSING LINE 1047
// MISSING LINE 1048
// MISSING LINE 1049
// MISSING LINE 1050
// MISSING LINE 1051
// MISSING LINE 1052
// MISSING LINE 1053
// MISSING LINE 1054
// MISSING LINE 1055
// MISSING LINE 1056
// MISSING LINE 1057
// MISSING LINE 1058
// MISSING LINE 1059
// MISSING LINE 1060
// MISSING LINE 1061
// MISSING LINE 1062
// MISSING LINE 1063
// MISSING LINE 1064
// MISSING LINE 1065
// MISSING LINE 1066
// MISSING LINE 1067
// MISSING LINE 1068
// MISSING LINE 1069
// MISSING LINE 1070
// MISSING LINE 1071
// MISSING LINE 1072
// MISSING LINE 1073
// MISSING LINE 1074
// MISSING LINE 1075
// MISSING LINE 1076
// MISSING LINE 1077
// MISSING LINE 1078
// MISSING LINE 1079
// MISSING LINE 1080
// MISSING LINE 1081
// MISSING LINE 1082
// MISSING LINE 1083
// MISSING LINE 1084
// MISSING LINE 1085
// MISSING LINE 1086
// MISSING LINE 1087
// MISSING LINE 1088
// MISSING LINE 1089
// MISSING LINE 1090
// MISSING LINE 1091
// MISSING LINE 1092
// MISSING LINE 1093
// MISSING LINE 1094
// MISSING LINE 1095
// MISSING LINE 1096
// MISSING LINE 1097
// MISSING LINE 1098
// MISSING LINE 1099
// MISSING LINE 1100
// MISSING LINE 1101
// MISSING LINE 1102
// MISSING LINE 1103
// MISSING LINE 1104
// MISSING LINE 1105
// MISSING LINE 1106
// MISSING LINE 1107
// MISSING LINE 1108
// MISSING LINE 1109
// MISSING LINE 1110
// MISSING LINE 1111
// MISSING LINE 1112
// MISSING LINE 1113
// MISSING LINE 1114
// MISSING LINE 1115
// MISSING LINE 1116
// MISSING LINE 1117
// MISSING LINE 1118
// MISSING LINE 1119
// MISSING LINE 1120
// MISSING LINE 1121
// MISSING LINE 1122
// MISSING LINE 1123
// MISSING LINE 1124
// MISSING LINE 1125
// MISSING LINE 1126
// MISSING LINE 1127
// MISSING LINE 1128
// MISSING LINE 1129
// MISSING LINE 1130
// MISSING LINE 1131
// MISSING LINE 1132
// MISSING LINE 1133
// MISSING LINE 1134
// MISSING LINE 1135
// MISSING LINE 1136
// MISSING LINE 1137
// MISSING LINE 1138
// MISSING LINE 1139
// MISSING LINE 1140
// MISSING LINE 1141
// MISSING LINE 1142
// MISSING LINE 1143
// MISSING LINE 1144
// MISSING LINE 1145
// MISSING LINE 1146
// MISSING LINE 1147
// MISSING LINE 1148
// MISSING LINE 1149
// MISSING LINE 1150
// MISSING LINE 1151
// MISSING LINE 1152
// MISSING LINE 1153
// MISSING LINE 1154
// MISSING LINE 1155
// MISSING LINE 1156
// MISSING LINE 1157
// MISSING LINE 1158
// MISSING LINE 1159
// MISSING LINE 1160
// MISSING LINE 1161
// MISSING LINE 1162
// MISSING LINE 1163
// MISSING LINE 1164
// MISSING LINE 1165
// MISSING LINE 1166
// MISSING LINE 1167
// MISSING LINE 1168
// MISSING LINE 1169
// MISSING LINE 1170
// MISSING LINE 1171
// MISSING LINE 1172
// MISSING LINE 1173
// MISSING LINE 1174
// MISSING LINE 1175
// MISSING LINE 1176
// MISSING LINE 1177
// MISSING LINE 1178
// MISSING LINE 1179
// MISSING LINE 1180
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
// MISSING LINE 1260
// MISSING LINE 1261
// MISSING LINE 1262
// MISSING LINE 1263
// MISSING LINE 1264
// MISSING LINE 1265
// MISSING LINE 1266
// MISSING LINE 1267
// MISSING LINE 1268
// MISSING LINE 1269
// MISSING LINE 1270
// MISSING LINE 1271
// MISSING LINE 1272
// MISSING LINE 1273
// MISSING LINE 1274
// MISSING LINE 1275
// MISSING LINE 1276
// MISSING LINE 1277
// MISSING LINE 1278
// MISSING LINE 1279
// MISSING LINE 1280
// MISSING LINE 1281
// MISSING LINE 1282
// MISSING LINE 1283
// MISSING LINE 1284
// MISSING LINE 1285
// MISSING LINE 1286
// MISSING LINE 1287
// MISSING LINE 1288
// MISSING LINE 1289
// MISSING LINE 1290
// MISSING LINE 1291
// MISSING LINE 1292
// MISSING LINE 1293
// MISSING LINE 1294
// MISSING LINE 1295
// MISSING LINE 1296
// MISSING LINE 1297
// MISSING LINE 1298
// MISSING LINE 1299
// MISSING LINE 1300
// MISSING LINE 1301
// MISSING LINE 1302
// MISSING LINE 1303
// MISSING LINE 1304
// MISSING LINE 1305
// MISSING LINE 1306
// MISSING LINE 1307
// MISSING LINE 1308
// MISSING LINE 1309
// MISSING LINE 1310
// MISSING LINE 1311
// MISSING LINE 1312
// MISSING LINE 1313
// MISSING LINE 1314
// MISSING LINE 1315
// MISSING LINE 1316
// MISSING LINE 1317
// MISSING LINE 1318
// MISSING LINE 1319
// MISSING LINE 1320
// MISSING LINE 1321
// MISSING LINE 1322
// MISSING LINE 1323
// MISSING LINE 1324
// MISSING LINE 1325
// MISSING LINE 1326
// MISSING LINE 1327
// MISSING LINE 1328
// MISSING LINE 1329
// MISSING LINE 1330
// MISSING LINE 1331
// MISSING LINE 1332
// MISSING LINE 1333
// MISSING LINE 1334
// MISSING LINE 1335
// MISSING LINE 1336
// MISSING LINE 1337
// MISSING LINE 1338
// MISSING LINE 1339
// MISSING LINE 1340
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
// MISSING LINE 1380
// MISSING LINE 1381
// MISSING LINE 1382
// MISSING LINE 1383
// MISSING LINE 1384
// MISSING LINE 1385
// MISSING LINE 1386
// MISSING LINE 1387
// MISSING LINE 1388
// MISSING LINE 1389
// MISSING LINE 1390
// MISSING LINE 1391
// MISSING LINE 1392
// MISSING LINE 1393
// MISSING LINE 1394
// MISSING LINE 1395
// MISSING LINE 1396
// MISSING LINE 1397
// MISSING LINE 1398
// MISSING LINE 1399
// MISSING LINE 1400
// MISSING LINE 1401
// MISSING LINE 1402
// MISSING LINE 1403
// MISSING LINE 1404
// MISSING LINE 1405
// MISSING LINE 1406
// MISSING LINE 1407
// MISSING LINE 1408
// MISSING LINE 1409
// MISSING LINE 1410
// MISSING LINE 1411
// MISSING LINE 1412
// MISSING LINE 1413
// MISSING LINE 1414
// MISSING LINE 1415
// MISSING LINE 1416
// MISSING LINE 1417
// MISSING LINE 1418
// MISSING LINE 1419
// MISSING LINE 1420
// MISSING LINE 1421
// MISSING LINE 1422
// MISSING LINE 1423
// MISSING LINE 1424
// MISSING LINE 1425
// MISSING LINE 1426
// MISSING LINE 1427
// MISSING LINE 1428
// MISSING LINE 1429
// MISSING LINE 1430
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
// MISSING LINE 1450
// MISSING LINE 1451
// MISSING LINE 1452
// MISSING LINE 1453
// MISSING LINE 1454
// MISSING LINE 1455
// MISSING LINE 1456
// MISSING LINE 1457
// MISSING LINE 1458
// MISSING LINE 1459
// MISSING LINE 1460
// MISSING LINE 1461
// MISSING LINE 1462
// MISSING LINE 1463
// MISSING LINE 1464
// MISSING LINE 1465
// MISSING LINE 1466
// MISSING LINE 1467
// MISSING LINE 1468
// MISSING LINE 1469
// MISSING LINE 1470
// MISSING LINE 1471
// MISSING LINE 1472
// MISSING LINE 1473
// MISSING LINE 1474
// MISSING LINE 1475
// MISSING LINE 1476
// MISSING LINE 1477
// MISSING LINE 1478
// MISSING LINE 1479
// MISSING LINE 1480
// MISSING LINE 1481
// MISSING LINE 1482
// MISSING LINE 1483
// MISSING LINE 1484
// MISSING LINE 1485
// MISSING LINE 1486
// MISSING LINE 1487
// MISSING LINE 1488
// MISSING LINE 1489
// MISSING LINE 1490
// MISSING LINE 1491
// MISSING LINE 1492
// MISSING LINE 1493
// MISSING LINE 1494
// MISSING LINE 1495
// MISSING LINE 1496
// MISSING LINE 1497
// MISSING LINE 1498
// MISSING LINE 1499
// MISSING LINE 1500
// MISSING LINE 1501
// MISSING LINE 1502
// MISSING LINE 1503
// MISSING LINE 1504
// MISSING LINE 1505
// MISSING LINE 1506
// MISSING LINE 1507
// MISSING LINE 1508
// MISSING LINE 1509
// MISSING LINE 1510
// MISSING LINE 1511
// MISSING LINE 1512
// MISSING LINE 1513
// MISSING LINE 1514
// MISSING LINE 1515
// MISSING LINE 1516
// MISSING LINE 1517
// MISSING LINE 1518
// MISSING LINE 1519
// MISSING LINE 1520
// MISSING LINE 1521
// MISSING LINE 1522
// MISSING LINE 1523
// MISSING LINE 1524
// MISSING LINE 1525
// MISSING LINE 1526
// MISSING LINE 1527
// MISSING LINE 1528
// MISSING LINE 1529
// MISSING LINE 1530
// MISSING LINE 1531
// MISSING LINE 1532
// MISSING LINE 1533
// MISSING LINE 1534
// MISSING LINE 1535
// MISSING LINE 1536
// MISSING LINE 1537
// MISSING LINE 1538
// MISSING LINE 1539
// MISSING LINE 1540
// MISSING LINE 1541
// MISSING LINE 1542
// MISSING LINE 1543
// MISSING LINE 1544
// MISSING LINE 1545
// MISSING LINE 1546
// MISSING LINE 1547
// MISSING LINE 1548
// MISSING LINE 1549
// MISSING LINE 1550
// MISSING LINE 1551
// MISSING LINE 1552
// MISSING LINE 1553
// MISSING LINE 1554
// MISSING LINE 1555
// MISSING LINE 1556
// MISSING LINE 1557
// MISSING LINE 1558
// MISSING LINE 1559
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
                  <div style={{ fontWeight: '600', fontSize: 'var(--font-size-base)', color: 'var(--color-primary)' }}>جاري تحليل الملف وتطابق الحقول بالذكاء الاصطناعي...</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px', width: '340px', margin: '0 auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg)', padding: 'var(--spacing-3) var(--spacing-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', direction: 'rtl' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 1 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 1 ? '✅' : '⏳'} قراءة هيكل الملف واستخراج الأعمدة...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 2 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 2 ? '✅' : '⏳'} تحليل دلالات ومفردات العناوين بالـ AI...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 3 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 3 ? '✅' : '⏳'} فحص قيم البيانات وتحديد أنواعها...</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: aiStep >= 4 ? 'var(--color-success)' : 'inherit' }}>{aiStep > 4 ? '✅' : '⏳'} توليد نموذج الربط التلقائي والتحقق...</div>
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
                        <Badge variant="success">تم التعرف على الأعمدة وتطابقها تلقائياً</Badge>
                      </div>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', fontWeight: 'bold' }}>
                        {showMappingConfig ? 'إخفاء تفاصيل التخطيط ▲' : 'تعديل وتخصيص ربط الأعمدة يدوياً ▼'}
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
// MISSING LINE 1781
// MISSING LINE 1782
// MISSING LINE 1783
// MISSING LINE 1784
// MISSING LINE 1785
// MISSING LINE 1786
// MISSING LINE 1787
// MISSING LINE 1788
// MISSING LINE 1789
// MISSING LINE 1790
// MISSING LINE 1791
// MISSING LINE 1792
// MISSING LINE 1793
// MISSING LINE 1794
// MISSING LINE 1795
// MISSING LINE 1796
// MISSING LINE 1797
// MISSING LINE 1798
// MISSING LINE 1799
// MISSING LINE 1800
// MISSING LINE 1801
// MISSING LINE 1802
// MISSING LINE 1803
// MISSING LINE 1804
// MISSING LINE 1805
// MISSING LINE 1806
// MISSING LINE 1807
// MISSING LINE 1808
// MISSING LINE 1809
// MISSING LINE 1810
// MISSING LINE 1811
// MISSING LINE 1812
// MISSING LINE 1813
// MISSING LINE 1814
// MISSING LINE 1815
// MISSING LINE 1816
// MISSING LINE 1817
// MISSING LINE 1818
// MISSING LINE 1819
// MISSING LINE 1820
// MISSING LINE 1821
// MISSING LINE 1822
// MISSING LINE 1823
// MISSING LINE 1824
// MISSING LINE 1825
// MISSING LINE 1826
// MISSING LINE 1827
// MISSING LINE 1828
// MISSING LINE 1829
// MISSING LINE 1830
// MISSING LINE 1831
// MISSING LINE 1832
// MISSING LINE 1833
// MISSING LINE 1834
// MISSING LINE 1835
// MISSING LINE 1836
// MISSING LINE 1837
// MISSING LINE 1838
// MISSING LINE 1839
// MISSING LINE 1840
// MISSING LINE 1841
// MISSING LINE 1842
// MISSING LINE 1843
// MISSING LINE 1844
// MISSING LINE 1845
// MISSING LINE 1846
// MISSING LINE 1847
// MISSING LINE 1848
// MISSING LINE 1849
// MISSING LINE 1850
// MISSING LINE 1851
// MISSING LINE 1852
// MISSING LINE 1853
// MISSING LINE 1854
// MISSING LINE 1855
// MISSING LINE 1856
// MISSING LINE 1857
// MISSING LINE 1858
// MISSING LINE 1859
// MISSING LINE 1860
// MISSING LINE 1861
// MISSING LINE 1862
// MISSING LINE 1863
// MISSING LINE 1864
// MISSING LINE 1865
// MISSING LINE 1866
// MISSING LINE 1867
// MISSING LINE 1868
// MISSING LINE 1869
// MISSING LINE 1870
// MISSING LINE 1871
// MISSING LINE 1872
// MISSING LINE 1873
// MISSING LINE 1874
// MISSING LINE 1875
// MISSING LINE 1876
// MISSING LINE 1877
// MISSING LINE 1878
// MISSING LINE 1879
// MISSING LINE 1880
// MISSING LINE 1881
// MISSING LINE 1882
// MISSING LINE 1883
// MISSING LINE 1884
// MISSING LINE 1885
// MISSING LINE 1886
// MISSING LINE 1887
// MISSING LINE 1888
// MISSING LINE 1889
// MISSING LINE 1890
// MISSING LINE 1891
// MISSING LINE 1892
// MISSING LINE 1893
// MISSING LINE 1894
// MISSING LINE 1895
// MISSING LINE 1896
// MISSING LINE 1897
// MISSING LINE 1898
// MISSING LINE 1899
// MISSING LINE 1900
// MISSING LINE 1901
// MISSING LINE 1902
// MISSING LINE 1903
// MISSING LINE 1904
// MISSING LINE 1905
// MISSING LINE 1906
// MISSING LINE 1907
// MISSING LINE 1908
// MISSING LINE 1909
// MISSING LINE 1910
// MISSING LINE 1911
// MISSING LINE 1912
// MISSING LINE 1913
// MISSING LINE 1914
// MISSING LINE 1915
// MISSING LINE 1916
// MISSING LINE 1917
// MISSING LINE 1918
// MISSING LINE 1919
// MISSING LINE 1920
// MISSING LINE 1921
// MISSING LINE 1922
// MISSING LINE 1923
// MISSING LINE 1924
// MISSING LINE 1925
// MISSING LINE 1926
// MISSING LINE 1927
// MISSING LINE 1928
// MISSING LINE 1929
// MISSING LINE 1930
// MISSING LINE 1931
// MISSING LINE 1932
// MISSING LINE 1933
// MISSING LINE 1934
// MISSING LINE 1935
// MISSING LINE 1936
// MISSING LINE 1937
// MISSING LINE 1938
// MISSING LINE 1939
// MISSING LINE 1940
// MISSING LINE 1941
// MISSING LINE 1942
// MISSING LINE 1943
// MISSING LINE 1944
// MISSING LINE 1945
// MISSING LINE 1946
// MISSING LINE 1947
// MISSING LINE 1948
// MISSING LINE 1949
// MISSING LINE 1950
// MISSING LINE 1951
// MISSING LINE 1952
// MISSING LINE 1953
// MISSING LINE 1954
// MISSING LINE 1955
// MISSING LINE 1956
// MISSING LINE 1957
// MISSING LINE 1958
// MISSING LINE 1959
// MISSING LINE 1960
// MISSING LINE 1961
// MISSING LINE 1962
// MISSING LINE 1963
// MISSING LINE 1964
// MISSING LINE 1965
// MISSING LINE 1966
// MISSING LINE 1967
// MISSING LINE 1968
// MISSING LINE 1969
// MISSING LINE 1970
// MISSING LINE 1971
// MISSING LINE 1972
// MISSING LINE 1973
// MISSING LINE 1974
// MISSING LINE 1975
// MISSING LINE 1976
// MISSING LINE 1977
// MISSING LINE 1978
// MISSING LINE 1979
// MISSING LINE 1980
// MISSING LINE 1981
// MISSING LINE 1982
// MISSING LINE 1983
// MISSING LINE 1984
// MISSING LINE 1985
// MISSING LINE 1986
// MISSING LINE 1987
// MISSING LINE 1988
// MISSING LINE 1989
// MISSING LINE 1990
// MISSING LINE 1991
// MISSING LINE 1992
// MISSING LINE 1993
// MISSING LINE 1994
// MISSING LINE 1995
// MISSING LINE 1996
// MISSING LINE 1997
// MISSING LINE 1998
// MISSING LINE 1999
// MISSING LINE 2000
// MISSING LINE 2001
// MISSING LINE 2002
// MISSING LINE 2003
// MISSING LINE 2004
// MISSING LINE 2005
// MISSING LINE 2006
// MISSING LINE 2007
// MISSING LINE 2008
// MISSING LINE 2009
// MISSING LINE 2010
// MISSING LINE 2011
// MISSING LINE 2012
// MISSING LINE 2013
// MISSING LINE 2014
// MISSING LINE 2015
// MISSING LINE 2016
// MISSING LINE 2017
// MISSING LINE 2018
// MISSING LINE 2019
// MISSING LINE 2020
// MISSING LINE 2021
// MISSING LINE 2022
// MISSING LINE 2023
// MISSING LINE 2024
// MISSING LINE 2025
// MISSING LINE 2026
// MISSING LINE 2027
// MISSING LINE 2028
// MISSING LINE 2029
// MISSING LINE 2030
// MISSING LINE 2031
// MISSING LINE 2032
// MISSING LINE 2033
// MISSING LINE 2034
// MISSING LINE 2035
// MISSING LINE 2036
// MISSING LINE 2037
// MISSING LINE 2038
// MISSING LINE 2039
// MISSING LINE 2040
// MISSING LINE 2041
// MISSING LINE 2042
// MISSING LINE 2043
// MISSING LINE 2044
// MISSING LINE 2045
// MISSING LINE 2046
// MISSING LINE 2047
// MISSING LINE 2048
// MISSING LINE 2049
// MISSING LINE 2050
// MISSING LINE 2051
// MISSING LINE 2052
// MISSING LINE 2053
// MISSING LINE 2054
// MISSING LINE 2055
// MISSING LINE 2056
// MISSING LINE 2057
// MISSING LINE 2058
// MISSING LINE 2059
// MISSING LINE 2060
// MISSING LINE 2061
// MISSING LINE 2062
// MISSING LINE 2063
// MISSING LINE 2064
// MISSING LINE 2065
// MISSING LINE 2066
// MISSING LINE 2067
// MISSING LINE 2068
// MISSING LINE 2069
// MISSING LINE 2070
// MISSING LINE 2071
// MISSING LINE 2072
// MISSING LINE 2073
// MISSING LINE 2074
// MISSING LINE 2075
// MISSING LINE 2076
// MISSING LINE 2077
// MISSING LINE 2078
// MISSING LINE 2079
// MISSING LINE 2080
// MISSING LINE 2081
// MISSING LINE 2082
// MISSING LINE 2083
// MISSING LINE 2084
// MISSING LINE 2085
// MISSING LINE 2086
// MISSING LINE 2087
// MISSING LINE 2088
// MISSING LINE 2089
// MISSING LINE 2090
// MISSING LINE 2091
// MISSING LINE 2092
// MISSING LINE 2093
// MISSING LINE 2094
// MISSING LINE 2095
// MISSING LINE 2096
// MISSING LINE 2097
// MISSING LINE 2098
// MISSING LINE 2099
// MISSING LINE 2100
// MISSING LINE 2101
// MISSING LINE 2102
// MISSING LINE 2103
// MISSING LINE 2104
// MISSING LINE 2105
// MISSING LINE 2106
// MISSING LINE 2107
// MISSING LINE 2108
// MISSING LINE 2109
// MISSING LINE 2110
// MISSING LINE 2111
// MISSING LINE 2112
// MISSING LINE 2113
// MISSING LINE 2114
// MISSING LINE 2115
// MISSING LINE 2116
// MISSING LINE 2117
// MISSING LINE 2118
// MISSING LINE 2119
// MISSING LINE 2120
// MISSING LINE 2121
// MISSING LINE 2122
// MISSING LINE 2123
// MISSING LINE 2124
// MISSING LINE 2125
// MISSING LINE 2126
// MISSING LINE 2127
// MISSING LINE 2128
// MISSING LINE 2129
// MISSING LINE 2130
// MISSING LINE 2131
// MISSING LINE 2132
// MISSING LINE 2133
// MISSING LINE 2134
// MISSING LINE 2135
// MISSING LINE 2136
// MISSING LINE 2137
// MISSING LINE 2138
// MISSING LINE 2139
// MISSING LINE 2140
// MISSING LINE 2141
// MISSING LINE 2142
// MISSING LINE 2143
// MISSING LINE 2144
// MISSING LINE 2145
// MISSING LINE 2146
// MISSING LINE 2147
// MISSING LINE 2148
// MISSING LINE 2149
// MISSING LINE 2150
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
// MISSING LINE 2180
// MISSING LINE 2181
// MISSING LINE 2182
// MISSING LINE 2183
// MISSING LINE 2184
// MISSING LINE 2185
// MISSING LINE 2186
// MISSING LINE 2187
// MISSING LINE 2188
// MISSING LINE 2189
// MISSING LINE 2190
// MISSING LINE 2191
// MISSING LINE 2192
// MISSING LINE 2193
// MISSING LINE 2194
// MISSING LINE 2195
// MISSING LINE 2196
// MISSING LINE 2197
// MISSING LINE 2198
// MISSING LINE 2199
// MISSING LINE 2200
// MISSING LINE 2201
// MISSING LINE 2202
// MISSING LINE 2203
// MISSING LINE 2204
// MISSING LINE 2205
// MISSING LINE 2206
// MISSING LINE 2207
// MISSING LINE 2208
// MISSING LINE 2209
// MISSING LINE 2210
// MISSING LINE 2211
// MISSING LINE 2212
// MISSING LINE 2213
// MISSING LINE 2214
// MISSING LINE 2215
// MISSING LINE 2216
// MISSING LINE 2217
// MISSING LINE 2218
// MISSING LINE 2219
// MISSING LINE 2220
// MISSING LINE 2221
// MISSING LINE 2222
// MISSING LINE 2223
// MISSING LINE 2224
// MISSING LINE 2225
// MISSING LINE 2226
// MISSING LINE 2227
// MISSING LINE 2228
// MISSING LINE 2229
// MISSING LINE 2230
// MISSING LINE 2231
// MISSING LINE 2232
// MISSING LINE 2233
// MISSING LINE 2234
// MISSING LINE 2235
// MISSING LINE 2236
// MISSING LINE 2237
// MISSING LINE 2238
// MISSING LINE 2239
// MISSING LINE 2240
// MISSING LINE 2241
// MISSING LINE 2242
// MISSING LINE 2243
// MISSING LINE 2244
// MISSING LINE 2245
// MISSING LINE 2246
// MISSING LINE 2247
// MISSING LINE 2248
// MISSING LINE 2249
// MISSING LINE 2250
// MISSING LINE 2251
// MISSING LINE 2252
// MISSING LINE 2253
// MISSING LINE 2254
// MISSING LINE 2255
// MISSING LINE 2256
// MISSING LINE 2257
// MISSING LINE 2258
// MISSING LINE 2259
// MISSING LINE 2260
// MISSING LINE 2261
// MISSING LINE 2262
// MISSING LINE 2263
// MISSING LINE 2264
// MISSING LINE 2265
// MISSING LINE 2266
// MISSING LINE 2267
// MISSING LINE 2268
// MISSING LINE 2269
// MISSING LINE 2270
// MISSING LINE 2271
// MISSING LINE 2272
// MISSING LINE 2273
// MISSING LINE 2274
// MISSING LINE 2275
// MISSING LINE 2276
// MISSING LINE 2277
// MISSING LINE 2278
// MISSING LINE 2279
// MISSING LINE 2280
// MISSING LINE 2281
// MISSING LINE 2282
// MISSING LINE 2283
// MISSING LINE 2284
// MISSING LINE 2285
// MISSING LINE 2286
// MISSING LINE 2287
// MISSING LINE 2288
// MISSING LINE 2289
// MISSING LINE 2290
// MISSING LINE 2291
// MISSING LINE 2292
// MISSING LINE 2293
// MISSING LINE 2294
// MISSING LINE 2295
// MISSING LINE 2296
// MISSING LINE 2297
// MISSING LINE 2298
// MISSING LINE 2299
// MISSING LINE 2300
// MISSING LINE 2301
// MISSING LINE 2302
// MISSING LINE 2303
// MISSING LINE 2304
// MISSING LINE 2305
// MISSING LINE 2306
// MISSING LINE 2307
// MISSING LINE 2308
// MISSING LINE 2309
// MISSING LINE 2310
// MISSING LINE 2311
// MISSING LINE 2312
// MISSING LINE 2313
// MISSING LINE 2314
// MISSING LINE 2315
// MISSING LINE 2316
// MISSING LINE 2317
// MISSING LINE 2318
// MISSING LINE 2319
// MISSING LINE 2320
// MISSING LINE 2321
// MISSING LINE 2322
// MISSING LINE 2323
