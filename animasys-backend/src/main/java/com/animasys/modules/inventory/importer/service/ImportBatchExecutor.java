package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.inventory.domain.InventoryAdjustment;
import com.animasys.modules.inventory.domain.InventoryAdjustmentItem;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.dto.CreateProductRequest;
import com.animasys.modules.inventory.importer.domain.DuplicateResolution;
import com.animasys.modules.inventory.importer.domain.ImportMode;
import com.animasys.modules.inventory.importer.domain.ImportRowStatus;
import com.animasys.modules.inventory.importer.domain.ImportSessionItem;
import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.repository.InventoryAdjustmentItemRepository;
import com.animasys.modules.inventory.repository.InventoryAdjustmentRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.ProductService;
import com.animasys.modules.inventory.service.SkuCatalogService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Persists one commit batch (default 100 rows), each row in its own REQUIRES_NEW
 * transaction, so one row failing (duplicate name, bad SKU, whatever) only fails that
 * row — the rest of the batch still commits. Reuses {@link ProductService#createProductFromRequest}
 * (the same upsert-by-SKU logic the manual "Add Product" form uses) so import never
 * diverges from normal product creation/update behavior.
 *
 * <p>Handles two independent import modes (see {@link ImportMode}): ADD_STOCK treats the
 * Excel quantity as stock to add on top of whatever exists; INVENTORY_COUNT treats it as
 * the actual counted quantity and reconciles current stock to match it.</p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ImportBatchExecutor {

    private final ProductService productService;
    private final ProductRepository productRepository;
    private final ProductVariantRepository productVariantRepository;
    private final FifoCostingService fifoCostingService;
    private final SkuCatalogService skuCatalogService;
    private final ImportSessionItemRepository importSessionItemRepository;
    private final InventoryAdjustmentRepository inventoryAdjustmentRepository;
    private final InventoryAdjustmentItemRepository inventoryAdjustmentItemRepository;
    private final ImportWarehouseResolver importWarehouseResolver;
    private final ObjectMapper objectMapper;

    // Self-injected proxy so processSingleItem's own @Transactional(REQUIRES_NEW) actually
    // applies — a direct this.processSingleItem(...) call would bypass Spring's AOP proxy
    // and run in the same transaction as the caller, defeating the per-row isolation below.
    @Autowired
    @Lazy
    private ImportBatchExecutor self;

    /**
     * One row failing (duplicate name, bad SKU, whatever) must not take the other 99 rows
     * in this commit batch down with it — each row commits or rolls back independently.
     */
    public BatchOutcome processBatch(List<String> itemIds, String tenantId, String employeeId,
                                      String sessionId, ImportMode mode) {
        List<ImportSessionItem> items = importSessionItemRepository.findAllById(itemIds);
        int imported = 0, updated = 0, skipped = 0, failed = 0;

        for (ImportSessionItem item : items) {
            try {
                ImportRowStatus outcome = self.processSingleItem(tenantId, employeeId, sessionId, mode, item);
                switch (outcome) {
                    case IMPORTED -> imported++;
                    case UPDATED -> updated++;
                    case SKIPPED -> skipped++;
                    default -> failed++;
                }
            } catch (Exception ex) {
                log.warn("Import row {} failed: {}", item.getId(), ex.getMessage());
                item.setStatus(ImportRowStatus.FAILED);
                item.setResultMessage(ex.getMessage() != null ? ex.getMessage() : "فشل استيراد هذا الصف");
                importSessionItemRepository.save(item);
                failed++;
            }
        }
        return new BatchOutcome(imported, updated, skipped, failed);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public ImportRowStatus processSingleItem(String tenantId, String employeeId, String sessionId,
                                              ImportMode mode, ImportSessionItem item) {
        if (mode == ImportMode.INVENTORY_COUNT) {
            return processInventoryCountItem(tenantId, employeeId, sessionId, item);
        }

        Map<ImportField, String> mapped = MappedDataCodec.fromStringKeyed(readJsonMap(item.getMappedData()));

        if (item.getStatus() == ImportRowStatus.ERROR) {
            item.setStatus(ImportRowStatus.FAILED);
            item.setResultMessage("لم يتم الاستيراد بسبب أخطاء في التحقق من صحة البيانات");
            importSessionItemRepository.save(item);
            return ImportRowStatus.FAILED;
        }

        if (item.getStatus() == ImportRowStatus.NEW) {
            createOrUpdate(tenantId, employeeId, mapped, item, null, false);
            importSessionItemRepository.save(item);
            return ImportRowStatus.IMPORTED;
        }

        if (item.getStatus() == ImportRowStatus.DUPLICATE) {
            DuplicateResolution resolution = item.getResolution() != null ? item.getResolution() : DuplicateResolution.SKIP;
            ImportRowStatus outcome;
            switch (resolution) {
                case SKIP -> {
                    item.setStatus(ImportRowStatus.SKIPPED);
                    item.setResultMessage("تم التخطي حسب اختيار المستخدم");
                    outcome = ImportRowStatus.SKIPPED;
                }
                case CREATE_NEW -> {
                    createOrUpdate(tenantId, employeeId, mapped, item, null, true);
                    outcome = ImportRowStatus.IMPORTED;
                }
                case UPDATE_EXISTING -> {
                    Product existing = productRepository.findById(item.getDuplicateProductId())
                            .orElseThrow(() -> new BusinessRuleException("المنتج المطابق لم يعد موجودًا"));
                    createOrUpdate(tenantId, employeeId, mapped, item, existing.getSku(), false);
                    item.setStatus(ImportRowStatus.UPDATED);
                    outcome = ImportRowStatus.UPDATED;
                }
                default -> outcome = ImportRowStatus.FAILED;
            }
            importSessionItemRepository.save(item);
            return outcome;
        }

        item.setStatus(ImportRowStatus.FAILED);
        item.setResultMessage("حالة صف غير معروفة: " + item.getStatus());
        importSessionItemRepository.save(item);
        return ImportRowStatus.FAILED;
    }

    /**
     * Reconciles one row in INVENTORY_COUNT mode: the mapped quantity is the counted quantity,
     * not a delta. Re-reads current stock live (not the mapping-time preview snapshot) so a
     * sale or purchase that happened between preview and commit is respected rather than
     * silently clobbered, then adjusts batches to land exactly on the counted quantity and
     * writes an {@link InventoryAdjustment} audit record for the change (even when it is zero).
     */
    private ImportRowStatus processInventoryCountItem(String tenantId, String employeeId, String sessionId,
                                                        ImportSessionItem item) {
        if (item.getStatus() == ImportRowStatus.ERROR) {
            item.setStatus(ImportRowStatus.FAILED);
            item.setResultMessage("لم يتم الاستيراد بسبب أخطاء في التحقق من صحة البيانات");
            importSessionItemRepository.save(item);
            return ImportRowStatus.FAILED;
        }
        if (item.getStatus() != ImportRowStatus.COUNT_MATCHED) {
            item.setStatus(ImportRowStatus.FAILED);
            item.setResultMessage("حالة صف غير معروفة: " + item.getStatus());
            importSessionItemRepository.save(item);
            return ImportRowStatus.FAILED;
        }

        String variantId = item.getResolvedVariantId();
        String warehouseId = item.getResolvedWarehouseId();
        ProductVariant variant = productVariantRepository.findById(variantId).orElse(null);
        if (variant == null || !tenantId.equals(variant.getTenantId())) {
            item.setStatus(ImportRowStatus.FAILED);
            item.setResultMessage("المنتج لم يعد موجودًا في النظام");
            importSessionItemRepository.save(item);
            return ImportRowStatus.FAILED;
        }

        int liveSystemQty = fifoCostingService.getAvailableBatchQuantity(tenantId, warehouseId, variantId);
        int countedQty = item.getCountedQuantity() != null ? item.getCountedQuantity() : 0;
        int diff = countedQty - liveSystemQty;

        if (diff > 0) {
            BigDecimal unitCost = variant.getCost() != null ? variant.getCost() : BigDecimal.ZERO;
            fifoCostingService.createOpeningBatch(
                    tenantId, warehouseId, variantId, unitCost, diff, null,
                    "RECON-" + item.getId(), employeeId);
        } else if (diff < 0) {
            fifoCostingService.deductBatchesForAdjustment(
                    tenantId, warehouseId, variantId, -diff, "COUNT_DISCREPANCY", employeeId);
        }

        recordAdjustmentAudit(tenantId, employeeId, sessionId, item, variant, warehouseId, liveSystemQty, countedQty, diff);

        item.setStatus(ImportRowStatus.UPDATED);
        item.setSystemQuantity(liveSystemQty);
        item.setAdjustmentQuantity(diff);
        item.setResultMessage("تمت تسوية المخزون: من " + liveSystemQty + " إلى " + countedQty
                + " (فرق " + (diff > 0 ? "+" + diff : diff) + ")");
        importSessionItemRepository.save(item);
        return ImportRowStatus.UPDATED;
    }

    private void recordAdjustmentAudit(String tenantId, String employeeId, String sessionId, ImportSessionItem item,
                                        ProductVariant variant, String warehouseId, int systemQty, int countedQty, int diff) {
        BigDecimal unitCost = variant.getCost() != null ? variant.getCost() : BigDecimal.ZERO;
        Instant now = Instant.now();
        InventoryAdjustment adjustment = InventoryAdjustment.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .warehouseId(warehouseId)
                .adjustmentNumber("RECON-" + item.getId())
                .reason(InventoryAdjustment.AdjustmentReason.COUNT_DISCREPANCY)
                .status(InventoryAdjustment.AdjustmentStatus.APPROVED)
                .requestedById(employeeId)
                .approvedById(employeeId)
                .notes("جرد مخزون عبر استيراد Excel — " + variant.getName())
                .source(InventoryAdjustment.AdjustmentSource.IMPORT)
                .importSessionId(sessionId)
                .importSessionItemId(item.getId())
                .createdAt(now)
                .approvedAt(now)
                .build();
        inventoryAdjustmentRepository.save(adjustment);

        InventoryAdjustmentItem adjustmentItem = InventoryAdjustmentItem.builder()
                .id(UUID.randomUUID().toString())
                .inventoryAdjustment(adjustment)
                .productVariant(variant)
                .systemQuantity(systemQty)
                .countedQuantity(countedQty)
                .quantityDifference(diff)
                .unitCost(unitCost)
                .totalVarianceCost(unitCost.multiply(BigDecimal.valueOf(diff)))
                .build();
        inventoryAdjustmentItemRepository.save(adjustmentItem);
    }

    private void createOrUpdate(String tenantId, String employeeId, Map<ImportField, String> mapped,
                                 ImportSessionItem item, String skuOverride, boolean forceNewSku) {
        String sku = skuOverride != null ? skuOverride : text(mapped, ImportField.SKU);
        if (sku.isEmpty()) {
            // Barcode-only rows are common in real supplier templates — derive a SKU from
            // the barcode. Rows with neither get the next code in the tenant's AP-000001
            // sequence, so codes stay short and orderly rather than random.
            String barcode = text(mapped, ImportField.BARCODE);
            sku = !barcode.isEmpty() ? "AP-" + barcode : skuCatalogService.nextSequentialSku();
        }
        if (forceNewSku) {
            sku = sku + "-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        }

        CreateProductRequest request = buildRequest(mapped, sku, forceNewSku);
        Map<String, Object> result = productService.createProductFromRequest(tenantId, request);
        String variantId = String.valueOf(result.get("variantId"));
        // createProductFromRequest may have routed a same-name row onto an existing product
        // under its OWN sku instead of the one generated above — use the real one for the batch label.
        String resolvedSku = result.get("sku") != null ? String.valueOf(result.get("sku")) : sku;

        addStock(tenantId, employeeId, mapped, variantId, resolvedSku);

        item.setStatus(ImportRowStatus.IMPORTED); // overwritten to UPDATED by the caller for the update-existing path
        item.setResultMessage(forceNewSku ? "تم إنشاء منتج جديد بكود: " + resolvedSku : "تمت المعالجة بنجاح");
    }

    private CreateProductRequest buildRequest(Map<ImportField, String> mapped, String sku, boolean forceNewSku) {
        CreateProductRequest request = new CreateProductRequest();
        Map<String, Object> product = new HashMap<>();
        product.put("sku", sku);
        product.put("name", text(mapped, ImportField.PRODUCT_NAME));
        // forceNewSku means the user already saw this flagged as a duplicate and explicitly
        // chose "create as new" — the same-name guard in createProductFromRequest must defer to that.
        product.put("allowDuplicateName", forceNewSku);
        product.put("categoryName", text(mapped, ImportField.CATEGORY));
        product.put("brandName", text(mapped, ImportField.BRAND));
        product.put("supplierName", text(mapped, ImportField.SUPPLIER));
        Integer minStock = parseInt(text(mapped, ImportField.MINIMUM_STOCK));
        if (minStock != null) {
            product.put("minStockLimit", minStock);
        }
        request.setProduct(product);

        Map<String, Object> variant = new HashMap<>();
        variant.put("name", text(mapped, ImportField.VARIANT));
        variant.put("price", parseDecimal(text(mapped, ImportField.SELLING_PRICE)));
        variant.put("cost", parseDecimal(text(mapped, ImportField.COST_PRICE)));
        variant.put("barcode", text(mapped, ImportField.BARCODE));
        variant.put("initialStock", 0); // stock is added separately against the resolved warehouse
        request.setVariant(variant);

        return request;
    }

    private void addStock(String tenantId, String employeeId, Map<ImportField, String> mapped, String variantId, String sku) {
        Integer quantity = parseInt(text(mapped, ImportField.QUANTITY));
        if (quantity == null || quantity <= 0) {
            return;
        }
        String warehouseId = importWarehouseResolver.resolve(tenantId, text(mapped, ImportField.WAREHOUSE));
        BigDecimal cost = parseDecimal(text(mapped, ImportField.COST_PRICE));
        String batchNumber = text(mapped, ImportField.BATCH_NUMBER);
        if (batchNumber.isEmpty()) {
            batchNumber = "IMPORT-" + sku + "-" + System.currentTimeMillis();
        }
        LocalDate expiry = null;
        String expiryRaw = text(mapped, ImportField.EXPIRY_DATE);
        if (!expiryRaw.isEmpty()) {
            expiry = ImportRowValidator.parseDate(expiryRaw);
        }
        fifoCostingService.createOpeningBatch(tenantId, warehouseId, variantId, cost, quantity, expiry, batchNumber, employeeId);
    }

    private String text(Map<ImportField, String> mapped, ImportField field) {
        String v = mapped.get(field);
        return v == null ? "" : v.trim();
    }

    private Integer parseInt(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return (int) Double.parseDouble(raw.replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal parseDecimal(String raw) {
        if (raw == null || raw.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(raw.trim().replace(",", ""));
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private Map<String, String> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }

    public record BatchOutcome(int imported, int updated, int skipped, int failed) {
    }
}
