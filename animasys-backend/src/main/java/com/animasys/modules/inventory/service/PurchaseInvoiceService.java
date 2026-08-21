package com.animasys.modules.inventory.service;

import com.animasys.core.audit.AuditLog;
import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.security.SecurityUtils;
import com.animasys.core.util.BusinessTimeZone;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.finance.domain.PurchaseInvoiceInstallment;
import com.animasys.modules.finance.service.AccountsPayableService;
import com.animasys.modules.inventory.dto.CreateProductRequest;
import com.animasys.modules.inventory.dto.PurchaseInvoiceCreateResult;
import com.animasys.modules.inventory.dto.PurchaseInvoiceLineReceiptWarning;
import com.animasys.modules.inventory.dto.PurchaseReturnLineRequest;
import com.animasys.modules.inventory.dto.PurchaseReturnRequest;
import com.animasys.modules.inventory.dto.PurchaseReturnResult;
import com.animasys.modules.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class PurchaseInvoiceService {

    private final PurchaseInvoiceRepository invoiceRepository;
    private final SupplierRepository supplierRepository;
    private final EmployeeRepository employeeRepository;
    private final TenantRepository tenantRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final CategoryRepository categoryRepository;
    private final FifoCostingService fifoCostingService;
    private final InventoryIntegrityService inventoryIntegrityService;
    private final SkuCatalogService skuCatalogService;
    private final CatalogPersistenceService catalogPersistenceService;
    private final AccountsPayableService accountsPayableService;
    private final ProductService productService;
    private final AuditLogRepository auditLogRepository;

    public PurchaseInvoiceCreateResult createInvoice(PurchaseInvoice dto, String employeeId, String tenantId) {
        validateInvoiceDateNotInFuture(dto.getInvoiceDate());

        String rawFingerprint = (dto.getSupplierName() + "_" + dto.getInvoiceNumber() + "_" + dto.getInvoiceDate() + "_" + dto.getGrandTotal())
                .replaceAll("\\s+", "").toLowerCase();

        Optional<PurchaseInvoice> existing = invoiceRepository.findByFingerprint(rawFingerprint);
        if (existing.isPresent()) {
            throw new BusinessRuleException("هذه الفاتورة تم استيرادها مسبقاً! البصمة مطابقة للفاتورة رقم: " + dto.getInvoiceNumber());
        }

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود"));

        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessRuleException("لا يمكن تحديد الشركة الحالية.");
        }
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("الشركة غير موجودة"));

        Supplier supplier = resolveSupplier(dto, tenant);

        String invoiceId = "pi-" + UUID.randomUUID().toString().substring(0, 8);
        PurchaseInvoice invoice = PurchaseInvoice.builder()
                .id(invoiceId)
                .invoiceNumber(dto.getInvoiceNumber())
                .invoiceDate(dto.getInvoiceDate())
                .supplier(supplier)
                .supplierName(dto.getSupplierName())
                .currency(dto.getCurrency())
                .vat(dto.getVat() != null ? dto.getVat() : BigDecimal.ZERO)
                .discount(dto.getDiscount() != null ? dto.getDiscount() : BigDecimal.ZERO)
                .shipping(dto.getShipping() != null ? dto.getShipping() : BigDecimal.ZERO)
                .netTotal(dto.getNetTotal())
                .grandTotal(dto.getGrandTotal())
                .uploadedAt(Instant.now())
                .uploadedBy(employee)
                .imageUrl(dto.getImageUrl())
                .status("COMPLETED")
                // No forced deadline when the caller doesn't specify one — an unset
                // due date means "open", payable any time (see AccountsPayableService).
                .dueDate(dto.getDueDate())
                .paymentType(dto.getPaymentType() != null ? dto.getPaymentType() : "LUMP_SUM")
                .paymentStatus(dto.getPaymentStatus() != null ? dto.getPaymentStatus() : "UNPAID")
                .paidAmount(dto.getPaidAmount() != null ? dto.getPaidAmount() : BigDecimal.ZERO)
                .fingerprint(rawFingerprint)
                .items(new ArrayList<>())
                .installments(new ArrayList<>())
                .build();

        if ("INSTALLMENTS".equals(invoice.getPaymentType()) && dto.getInstallments() != null && !dto.getInstallments().isEmpty()) {
            int num = 1;
            for (PurchaseInvoiceInstallment instDto : dto.getInstallments()) {
                PurchaseInvoiceInstallment inst = PurchaseInvoiceInstallment.builder()
                        .id("inst-" + UUID.randomUUID().toString().substring(0, 8))
                        .purchaseInvoice(invoice)
                        .installmentNumber(instDto.getInstallmentNumber() > 0 ? instDto.getInstallmentNumber() : num)
                        .dueDate(instDto.getDueDate())
                        .amount(instDto.getAmount())
                        .paidAmount(BigDecimal.ZERO)
                        .status("PENDING")
                        .notes(instDto.getNotes())
                        .build();
                invoice.getInstallments().add(inst);
                num++;
            }
        } else {
            invoice.getInstallments().add(accountsPayableService.createDefaultInstallment(invoice));
        }

        if (dto.getItems() != null) {
            for (PurchaseInvoiceItem itemDto : dto.getItems()) {
                PurchaseInvoiceItem item = PurchaseInvoiceItem.builder()
                        .id("pii-" + UUID.randomUUID().toString().substring(0, 8))
                        .purchaseInvoice(invoice)
                        .productName(itemDto.getProductName())
                        .sku(itemDto.getSku())
                        .cost(itemDto.getCost())
                        .price(itemDto.getPrice())
                        .quantity(itemDto.getQuantity())
                        .confidenceName(itemDto.getConfidenceName())
                        .confidenceQty(itemDto.getConfidenceQty())
                        .confidenceCost(itemDto.getConfidenceCost())
                        .confidencePrice(itemDto.getConfidencePrice())
                        .expiryDate(itemDto.getExpiryDate())
                        .build();
                invoice.getItems().add(item);
            }
        }

        PurchaseInvoice saved = invoiceRepository.save(invoice);

        List<PurchaseInvoiceLineReceiptWarning> warnings =
                receiveStockFromInvoice(saved, employeeId, tenant.getId());
        inventoryIntegrityService.reconcileTenant(tenant.getId());

        return PurchaseInvoiceCreateResult.builder()
                .invoice(saved)
                .stockReceiptWarnings(warnings)
                .build();
    }

    /** Backward-compatible overload. */
    public PurchaseInvoiceCreateResult createInvoice(PurchaseInvoice dto, String employeeId) {
        return createInvoice(dto, employeeId, null);
    }

    private List<PurchaseInvoiceLineReceiptWarning> receiveStockFromInvoice(
            PurchaseInvoice invoice, String employeeId, String tenantId) {
        List<PurchaseInvoiceLineReceiptWarning> warnings = new ArrayList<>();
        if (invoice.getItems() == null) {
            return warnings;
        }

        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);

        Instant purchaseInstant = Instant.now();
        if (invoice.getInvoiceDate() != null && !invoice.getInvoiceDate().isBlank()) {
            try {
                purchaseInstant = LocalDate.parse(invoice.getInvoiceDate().substring(0, Math.min(10, invoice.getInvoiceDate().length())))
                        .atStartOfDay(BusinessTimeZone.ZONE).toInstant();
            } catch (Exception ignored) {
                purchaseInstant = Instant.now();
            }
        }

        final String currentTenantId = tenantId;
        String supplierId = invoice.getSupplier() != null ? invoice.getSupplier().getId() : null;
        int lineIndex = 0;

        for (PurchaseInvoiceItem item : invoice.getItems()) {
            lineIndex++;
            int effectiveQty = item.getQuantity() != null ? item.getQuantity() : 0;
            if (effectiveQty <= 0) {
                continue;
            }

            int conversionFactor = (item.getConversionFactor() != null && item.getConversionFactor() > 0) ? item.getConversionFactor() : 1;
            int finalQuantity = effectiveQty * conversionFactor;

            BigDecimal unitCost = item.getCost() != null ? item.getCost() : BigDecimal.ZERO;
            if (conversionFactor > 1 && unitCost.compareTo(BigDecimal.ZERO) > 0) {
                unitCost = unitCost.divide(BigDecimal.valueOf(conversionFactor), 4, java.math.RoundingMode.HALF_UP);
            }
            final BigDecimal finalUnitCost = unitCost;

            String sku = item.getSku() != null ? item.getSku().trim() : "";
            if (sku.isBlank()) {
                sku = String.format("AP-%06d", 100000 + lineIndex + 1);
                item.setSku(sku);
            }

            Optional<Product> productOpt = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenantId);
            ProductVariant variant;
            if (productOpt.isPresent()) {
                variant = skuCatalogService.findCanonicalVariant(productOpt.get())
                        .orElseGet(() -> skuCatalogService.updateOrCreateSingleVariant(
                                productOpt.get(),
                                item.getProductName(),
                                item.getPrice(),
                                finalUnitCost
                        ));
            } else if (item.getProductName() != null && !item.getProductName().isBlank()) {
                // Unknown SKU but a product name was typed in — this is a brand-new
                // product entered straight from the purchase invoice line, not a typo.
                // Create it on the fly (same path the Products screen uses) instead of
                // skipping the line, so the user never has to leave this screen.
                Map<String, Object> productMap = new HashMap<>();
                productMap.put("sku", sku);
                productMap.put("name", item.getProductName());
                if (supplierId != null) {
                    productMap.put("supplierId", supplierId);
                }
                Map<String, Object> variantMap = new HashMap<>();
                variantMap.put("price", item.getPrice());
                variantMap.put("cost", finalUnitCost);

                CreateProductRequest newProductReq = new CreateProductRequest();
                newProductReq.setProduct(productMap);
                newProductReq.setVariant(variantMap);

                Product created;
                try {
                    Map<String, Object> createdResult = productService.createProductFromRequest(currentTenantId, newProductReq);
                    String resolvedSku = String.valueOf(createdResult.get("sku"));
                    item.setSku(resolvedSku);
                    created = productRepository.findBySkuIgnoreCaseAndTenantId(resolvedSku, currentTenantId)
                            .orElseThrow(() -> new IllegalStateException("تعذر العثور على المنتج بعد إنشائه"));
                } catch (Exception ex) {
                    String detail = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
                    warnings.add(lineWarning(lineIndex, item, "PRODUCT_CREATE_FAILED",
                            "السطر " + lineIndex + " (SKU: " + sku + "): فشل إنشاء المنتج الجديد تلقائيًا — " + detail));
                    continue;
                }
                variant = skuCatalogService.findCanonicalVariant(created)
                        .orElseGet(() -> skuCatalogService.updateOrCreateSingleVariant(
                                created,
                                item.getProductName(),
                                item.getPrice(),
                                finalUnitCost
                        ));
            } else {
                warnings.add(lineWarning(lineIndex, item, "SKU_NOT_FOUND",
                        "السطر " + lineIndex + " (SKU: " + sku + "): الرمز غير مسجل ومفيش اسم منتج لإنشائه تلقائيًا."));
                continue;
            }

            if (item.getPrice() != null && item.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                variant.setPrice(item.getPrice());
            }
            variant = catalogPersistenceService.saveVariant(variant);

            String batchNumber = (item.getLotNumber() != null && !item.getLotNumber().isBlank()) 
                    ? item.getLotNumber().trim() 
                    : ("B-" + invoice.getInvoiceNumber().replaceAll("\\s+", "") + "-" + String.format("%03d", lineIndex));

            String warehouseId = (invoice.getTargetWarehouseId() != null && !invoice.getTargetWarehouseId().isBlank())
                    ? invoice.getTargetWarehouseId()
                    : StockService.DEFAULT_SALES_WAREHOUSE;

            try {
                fifoCostingService.createPurchaseBatch(
                        tenantId,
                        warehouseId,
                        variant.getId(),
                        supplierId,
                        invoice.getId(),
                        batchNumber,
                        finalUnitCost,
                        finalQuantity,
                        item.getExpiryDate(),
                        purchaseInstant,
                        employeeId
                );
            } catch (Exception ex) {
                String detail = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
                warnings.add(lineWarning(lineIndex, item, "RECEIPT_FAILED",
                        "السطر " + lineIndex + " (SKU: " + sku + "): فشل إنشاء دفعة المخزون — " + detail));
            }
        }

        return warnings;
    }

    private void validateInvoiceDateNotInFuture(String invoiceDate) {
        if (invoiceDate == null || invoiceDate.isBlank()) {
            return;
        }
        try {
            LocalDate parsed = LocalDate.parse(invoiceDate.substring(0, Math.min(10, invoiceDate.length())));
            if (parsed.isAfter(LocalDate.now())) {
                throw new BusinessRuleException(
                        "تاريخ فاتورة الشراء (" + parsed + ") في المستقبل — لا يمكن تسجيل فاتورة مورد بتاريخ لم يأتِ بعد. تأكد من التاريخ المدخل.");
            }
        } catch (java.time.format.DateTimeParseException ignored) {
            // Unparseable date strings are left to existing downstream handling.
        }
    }

    private static PurchaseInvoiceLineReceiptWarning lineWarning(
            int lineIndex, PurchaseInvoiceItem item, String code, String messageAr) {
        return PurchaseInvoiceLineReceiptWarning.builder()
                .lineIndex(lineIndex)
                .purchaseInvoiceItemId(item.getId())
                .sku(item.getSku())
                .productName(item.getProductName())
                .code(code)
                .messageAr(messageAr)
                .build();
    }

    private Supplier resolveSupplier(PurchaseInvoice dto, Tenant tenant) {
        Supplier supplier = null;
        if (dto.getSupplier() != null && dto.getSupplier().getId() != null) {
            supplier = supplierRepository.findById(dto.getSupplier().getId()).orElse(null);
        }

        if (supplier == null) {
            Optional<Supplier> existingSup = supplierRepository.findByNameIgnoreCaseAndTenantId(dto.getSupplierName(), tenant.getId());
            if (existingSup.isPresent()) {
                supplier = existingSup.get();
            } else {
                supplier = Supplier.builder()
                        .id("sup-" + UUID.randomUUID().toString().substring(0, 8))
                        .tenant(tenant)
                        .name(dto.getSupplierName())
                        .supplierCode("SUP-" + String.format("%04d", (int) (Math.random() * 10000)))
                        .phone(dto.getSupplier() != null ? dto.getSupplier().getPhone() : null)
                        .address(dto.getSupplier() != null ? dto.getSupplier().getAddress() : null)
                        .taxNumber(dto.getSupplier() != null ? dto.getSupplier().getTaxNumber() : null)
                        .build();
                supplier = supplierRepository.save(supplier);
            }
        } else if (dto.getSupplier() != null) {
            boolean updated = false;
            if (dto.getSupplier().getPhone() != null && supplier.getPhone() == null) {
                supplier.setPhone(dto.getSupplier().getPhone());
                updated = true;
            }
            if (dto.getSupplier().getAddress() != null && supplier.getAddress() == null) {
                supplier.setAddress(dto.getSupplier().getAddress());
                updated = true;
            }
            if (dto.getSupplier().getTaxNumber() != null && supplier.getTaxNumber() == null) {
                supplier.setTaxNumber(dto.getSupplier().getTaxNumber());
                updated = true;
            }
            if (updated) {
                supplier = supplierRepository.save(supplier);
            }
        }
        return supplier;
    }

    public PurchaseReturnResult returnInvoice(String tenantId, String employeeId, String invoiceId, PurchaseReturnRequest request) {
        if (invoiceId == null || invoiceId.isBlank()) {
            throw new BusinessRuleException("معرّف فاتورة الشراء مطلوب للإرجاع.");
        }
        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود: " + employeeId));

        PurchaseInvoice invoice = invoiceRepository.findByIdAndUploadedByTenantId(invoiceId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("فاتورة الشراء غير موجودة: " + invoiceId));

        if ("RETURNED".equalsIgnoreCase(invoice.getStatus())) {
            throw new BusinessRuleException("هذه الفاتورة مرتجعة بالكامل بالفعل.");
        }
        if (!"COMPLETED".equalsIgnoreCase(invoice.getStatus()) && !"PARTIALLY_RETURNED".equalsIgnoreCase(invoice.getStatus())) {
            throw new BusinessRuleException("لا يمكن إرجاع فاتورة بحالة: " + invoice.getStatus());
        }

        boolean hasItems = invoice.getItems() != null && !invoice.getItems().isEmpty();
        BigDecimal totalReturnedValue;
        List<PurchaseReturnLineRequest> processed = new ArrayList<>();

        if (!hasItems) {
            // Lump-sum invoice (entered as a total value, no product breakdown) — nothing
            // was received into stock for it, so just credit the balance directly.
            BigDecimal remaining = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;
            BigDecimal amount = (request != null && request.getAmount() != null) ? request.getAmount() : remaining;
            if (amount.compareTo(BigDecimal.ZERO) <= 0) {
                throw new BusinessRuleException("قيمة الإرجاع يجب أن تكون أكبر من صفر.");
            }
            if (amount.compareTo(remaining) > 0) {
                throw new BusinessRuleException(
                        "قيمة الإرجاع (" + amount + ") تتجاوز المتبقي من الفاتورة (" + remaining + ").");
            }
            totalReturnedValue = amount;
        } else {
            Map<String, Integer> returnQtyByItemId = new LinkedHashMap<>();
            List<PurchaseReturnLineRequest> lines = request != null ? request.getLines() : null;
            if (lines == null || lines.isEmpty()) {
                for (PurchaseInvoiceItem item : invoice.getItems()) {
                    int returnable = returnableQuantity(item);
                    if (returnable > 0) {
                        returnQtyByItemId.put(item.getId(), returnable);
                    }
                }
            } else {
                for (PurchaseReturnLineRequest line : lines) {
                    if (line.getPurchaseInvoiceItemId() == null || line.getPurchaseInvoiceItemId().isBlank()) {
                        throw new BusinessRuleException("معرّف بند الفاتورة مطلوب للإرجاع الجزئي.");
                    }
                    if (line.getQuantity() == null || line.getQuantity() <= 0) {
                        throw new BusinessRuleException("كمية الإرجاع يجب أن تكون أكبر من صفر.");
                    }
                    returnQtyByItemId.merge(line.getPurchaseInvoiceItemId(), line.getQuantity(), Integer::sum);
                }
            }

            if (returnQtyByItemId.isEmpty()) {
                throw new BusinessRuleException("لا توجد كميات قابلة للإرجاع في هذه الفاتورة.");
            }

            BigDecimal itemsReturnedValue = BigDecimal.ZERO;

            for (Map.Entry<String, Integer> entry : returnQtyByItemId.entrySet()) {
                String itemId = entry.getKey();
                int qty = entry.getValue();
                PurchaseInvoiceItem item = invoice.getItems().stream()
                        .filter(i -> itemId.equals(i.getId()))
                        .findFirst()
                        .orElseThrow(() -> new BusinessRuleException("بند غير موجود في الفاتورة: " + itemId));

                int returnable = returnableQuantity(item);
                if (qty > returnable) {
                    throw new BusinessRuleException(
                            "كمية الإرجاع للصنف '" + item.getProductName() + "' تتجاوز المتاح (" + returnable + ").");
                }

                String sku = item.getSku() != null ? item.getSku().trim() : "";
                Product product = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenantId)
                        .orElseThrow(() -> new BusinessRuleException(
                                "لا يمكن إرجاع الصنف '" + item.getProductName() + "' — المنتج غير مسجل بالكتالوج (SKU: " + sku + ")."));
                ProductVariant variant = skuCatalogService.findCanonicalVariant(product)
                        .orElseThrow(() -> new BusinessRuleException("لا يمكن تحديد نسخة المنتج للصنف: " + item.getProductName()));

                int conversionFactor = (item.getConversionFactor() != null && item.getConversionFactor() > 0)
                        ? item.getConversionFactor() : 1;
                int batchQty = qty * conversionFactor;

                if (item.getCost() == null) {
                    throw new BusinessRuleException(
                            "لا يمكن إرجاع الصنف '" + item.getProductName() + "' — سعر التكلفة غير مسجل لهذا البند.");
                }

                fifoCostingService.processSupplierReturn(tenantId, invoice.getId(), variant.getId(), batchQty, employeeId);

                BigDecimal lineValue = item.getCost().multiply(BigDecimal.valueOf(qty));
                itemsReturnedValue = itemsReturnedValue.add(lineValue);

                item.setQuantityReturned((item.getQuantityReturned() != null ? item.getQuantityReturned() : 0) + qty);
                processed.add(PurchaseReturnLineRequest.builder().purchaseInvoiceItemId(itemId).quantity(qty).build());
            }

            totalReturnedValue = itemsReturnedValue;
        }

        BigDecimal excessCredit = accountsPayableService.applyReturnCredit(invoice, totalReturnedValue);

        boolean fullReturn = isFullyReturned(invoice);
        invoice.setStatus(fullReturn ? "RETURNED" : "PARTIALLY_RETURNED");

        PurchaseInvoice saved = invoiceRepository.save(invoice);

        auditLogRepository.save(AuditLog.builder()
                .id(UUID.randomUUID().toString())
                .employee(employee)
                .action(fullReturn ? "PURCHASE_RETURN" : "PARTIAL_PURCHASE_RETURN")
                .affectedEntity("PurchaseInvoice")
                .entityId(saved.getId())
                .newState((fullReturn ? "إرجاع كامل لفاتورة " : "إرجاع جزئي لفاتورة ") + saved.getInvoiceNumber()
                        + " بقيمة " + totalReturnedValue)
                .timestamp(Instant.now())
                .build());

        return PurchaseReturnResult.builder()
                .invoice(saved)
                .returnedAmount(totalReturnedValue)
                .excessCredit(excessCredit)
                .fullReturn(fullReturn)
                .linesProcessed(processed)
                .build();
    }

    private int returnableQuantity(PurchaseInvoiceItem item) {
        int qty = item.getQuantity() != null ? item.getQuantity() : 0;
        int returned = item.getQuantityReturned() != null ? item.getQuantityReturned() : 0;
        return Math.max(0, qty - returned);
    }

    private boolean isFullyReturned(PurchaseInvoice invoice) {
        if (invoice.getItems() == null || invoice.getItems().isEmpty()) {
            BigDecimal remaining = invoice.getGrandTotal() != null ? invoice.getGrandTotal() : BigDecimal.ZERO;
            return remaining.compareTo(BigDecimal.ZERO) <= 0;
        }
        for (PurchaseInvoiceItem item : invoice.getItems()) {
            if (returnableQuantity(item) > 0) {
                return false;
            }
        }
        return true;
    }

    public List<PurchaseInvoice> getAllInvoices() {
        return invoiceRepository.findByUploadedByTenantId(SecurityUtils.requireTenantId());
    }

    public List<PurchaseInvoice> getAllInvoicesByTenant(String tenantId) {
        return invoiceRepository.findByUploadedByTenantId(tenantId);
    }

    public PurchaseInvoice getInvoiceById(String tenantId, String id) {
        return invoiceRepository.findByIdAndUploadedByTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("فاتورة الشراء غير موجودة"));
    }

}
