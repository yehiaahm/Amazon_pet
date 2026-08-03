package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.dto.BulkImportItem;
import com.animasys.modules.inventory.dto.ChunkImportRequest;
import com.animasys.modules.inventory.dto.StartImportRequest;
import com.animasys.modules.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class ImportService {

    private final ImportSessionRepository sessionRepository;
    private final ImportSessionItemRepository itemRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final SupplierRepository supplierRepository;
    private final WarehouseRepository warehouseRepository;
    private final EmployeeRepository employeeRepository;
    private final TenantRepository tenantRepository;
    private final FifoCostingService fifoCostingService;
    private final InventoryIntegrityService inventoryIntegrityService;
    private final CatalogPersistenceService catalogPersistenceService;
    private final SkuCatalogService skuCatalogService;
    private final EntityManager entityManager;

    public ImportSession startSession(StartImportRequest request) {
        // 1. Check duplicate file hash
        if (sessionRepository.existsByFileHashAndStatus(request.getFileHash(), "COMPLETED")) {
            throw new BusinessRuleException("هذا الملف تم استيراده بالكامل مسبقاً! كود البصمة متطابق.");
        }

        Employee employee = employeeRepository.findById(request.getUploadedBy())
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود"));

        ImportSession session = ImportSession.builder()
                .id(UUID.randomUUID().toString())
                .fileName(request.getFileName())
                .fileSize(request.getFileSize())
                .fileHash(request.getFileHash())
                .status("PROCESSING")
                .uploadedBy(employee)
                .uploadedAt(Instant.now())
                .duplicateStrategy(request.getDuplicateStrategy())
                .targetType(request.getTargetType())
                .totalRows(0)
                .successRows(0)
                .warningRows(0)
                .errorRows(0)
                .lastProcessedRow(0)
                .build();

        return sessionRepository.save(session);
    }

    public void processChunk(String sessionId, ChunkImportRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        ImportSession session = requireSessionForTenant(sessionId, tenantId);

        Employee employee = employeeRepository.findById(request.getEmployeeId())
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود"));
        if (employee.getTenant() == null || !tenantId.equals(employee.getTenant().getId())) {
            throw new ResourceNotFoundException("الموظف غير موجود");
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("شركة الموظف غير موجودة"));

        boolean dryRun = Boolean.TRUE.equals(request.getDryRun());

        int rowNum = session.getLastProcessedRow();

        for (BulkImportItem item : request.getItems()) {
            rowNum++;
            String status = "SUCCESS";
            String errorMsg = null;
            String affectedId = null;

            try {
                String rawSku = cleanString(item.getSku());
                String productName = cleanString(item.getProductName());
                String variantName = cleanString(item.getVariantName());
                String categoryName = cleanString(item.getCategoryName());
                String brandName = cleanString(item.getBrand());
                String supplierName = cleanString(item.getSupplier());

                // 1. Basic validation
                if ((rawSku == null || rawSku.isEmpty()) && (productName == null || productName.isEmpty())) {
                    throw new IllegalArgumentException("كود المنتج واسم المنتج فارغين معاً");
                }

                if (item.getPrice() != null && item.getPrice().compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalArgumentException("سعر البيع لا يمكن أن يكون سالباً");
                }

                if (item.getCost() != null && item.getCost().compareTo(BigDecimal.ZERO) < 0) {
                    throw new IllegalArgumentException("سعر الشراء (التكلفة) لا يمكن أن يكون سالباً");
                }

                // Price logic warning
                if (item.getPrice() != null && item.getCost() != null && item.getPrice().compareTo(item.getCost()) < 0) {
                    status = "WARNING";
                    errorMsg = "سعر البيع أقل من سعر الشراء (التكلفة)";
                }

                String strategy = effectiveDuplicateStrategy(session);
                Optional<Product> existingProduct = resolveExistingProduct(rawSku, productName, tenant.getId());

                String sku = rawSku;
                if (sku == null || sku.isEmpty()) {
                    if (existingProduct.isPresent()) {
                        sku = existingProduct.get().getSku();
                    } else {
                        sku = "ANS" + String.format("%06d", (int) (Math.random() * 1000000));
                    }
                } else {
                    sku = sku.trim();
                }

                if (existingProduct.isEmpty()) {
                    existingProduct = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenant.getId());
                }

                if (existingProduct.isPresent()) {
                    if ("SKIP".equalsIgnoreCase(strategy)) {
                        status = "WARNING";
                        errorMsg = "تم تخطي السطر لوجود كود منتج مكرر SKU: " + sku;
                        session.setWarningRows(session.getWarningRows() + 1);
                        logSessionItem(session, rowNum, status, errorMsg, existingProduct.get().getId());
                        continue;
                    }
                    if ("REPLACE".equalsIgnoreCase(strategy)) {
                        if (!dryRun) {
                            Product prod = existingProduct.get();
                            for (ProductVariant v : variantRepository.findByProductId(prod.getId())) {
                                int batchQty = fifoCostingService.getAvailableBatchQuantity(tenant.getId(), v.getId());
                                if (batchQty > 0) {
                                    fifoCostingService.deductBatchesForAdjustment(
                                            tenant.getId(),
                                            StockService.DEFAULT_SALES_WAREHOUSE,
                                            v.getId(),
                                            batchQty,
                                            "IMPORT_REPLACE",
                                            employee.getId()
                                    );
                                }
                                variantRepository.delete(v);
                            }
                            variantRepository.flush();
                            productRepository.delete(prod);
                            productRepository.flush();
                        }
                    } else {
                        // UPDATE (default): refresh price/cost/stock on existing SKU — never insert duplicate product
                        if (!dryRun) {
                            affectedId = applyImportUpdate(
                                    session,
                                    existingProduct.get(),
                                    productName,
                                    variantName,
                                    brandName,
                                    supplierName,
                                    item,
                                    tenant,
                                    employee,
                                    sku,
                                    rowNum
                            );
                        }
                        logSessionItem(session, rowNum, status, errorMsg, affectedId,
                                item.getStock() != null && item.getStock() > 0 ? item.getStock() : 0);
                        session.setSuccessRows(session.getSuccessRows() + 1);
                        continue;
                    }
                }

                // 3. Create brand / supplier / category
                if (!dryRun) {
                    Category category = findOrCreateCategory(categoryName != null ? categoryName : "Pet Food", tenant);
                    Brand brand = brandName != null && !brandName.isEmpty() ? findOrCreateBrand(brandName, tenant) : null;
                    Supplier supplier = supplierName != null && !supplierName.isEmpty() ? findOrCreateSupplier(supplierName, tenant) : null;

                    // Recreate product
                    Product newProd = Product.builder()
                            .id("p-" + UUID.randomUUID().toString().substring(0, 8))
                            .tenant(tenant)
                            .sku(sku)
                            .name(productName)
                            .category(category)
                            .brand(brand)
                            .supplier(supplier)
                            .minStockLimit(item.getMinStockLimit() != null ? item.getMinStockLimit() : 10)
                            .build();

                    ProductVariant newVar = skuCatalogService.upsertVariantForSku(
                            tenant.getId(),
                            newProd,
                            variantName,
                            item.getPrice() != null ? item.getPrice() : BigDecimal.ZERO,
                            item.getCost() != null ? item.getCost() : BigDecimal.ZERO
                    );
                    newVar = catalogPersistenceService.saveVariant(newVar);

                    affectedId = newVar.getId();
                    int delta = item.getStock() != null ? item.getStock() : 0;

                    if (delta > 0) {
                        BigDecimal unitCost = item.getCost() != null ? item.getCost() : BigDecimal.ZERO;
                        fifoCostingService.createOpeningBatch(
                                tenant.getId(),
                                StockService.DEFAULT_SALES_WAREHOUSE,
                                newVar.getId(),
                                unitCost,
                                delta,
                                item.getExpiryDate(),
                                importBatchNumber(session, sku, rowNum),
                                employee.getId()
                        );
                    }

                    if ("WARNING".equals(status)) {
                        session.setWarningRows(session.getWarningRows() + 1);
                    } else {
                        session.setSuccessRows(session.getSuccessRows() + 1);
                    }
                    logSessionItem(session, rowNum, status, errorMsg, affectedId, delta);
                    continue;
                }

                if ("WARNING".equals(status)) {
                    session.setWarningRows(session.getWarningRows() + 1);
                } else {
                    session.setSuccessRows(session.getSuccessRows() + 1);
                }
                logSessionItem(session, rowNum, status, errorMsg, affectedId);

            } catch (Exception e) {
                status = "ERROR";
                errorMsg = e.getMessage() != null ? e.getMessage() : "خطأ غير معروف أثناء المعالجة";
                session.setErrorRows(session.getErrorRows() + 1);
                logSessionItem(session, rowNum, status, errorMsg, null);
            }
        }

        session.setTotalRows(session.getTotalRows() + request.getItems().size());
        session.setLastProcessedRow(rowNum);
        sessionRepository.save(session);

        if (!dryRun && employee.getTenant() != null) {
            inventoryIntegrityService.reconcileTenant(employee.getTenant().getId());
        }
    }

    public ImportSession finalizeSession(String sessionId) {
        String tenantId = SecurityUtils.requireTenantId();
        ImportSession session = requireSessionForTenant(sessionId, tenantId);

        session.setStatus("COMPLETED");
        session.setCompletedAt(Instant.now());
        return sessionRepository.save(session);
    }

    public void undoSession(String sessionId, String employeeId) {
        String tenantId = SecurityUtils.requireTenantId();
        ImportSession session = requireSessionForTenant(sessionId, tenantId);

        if ("UNDONE".equalsIgnoreCase(session.getStatus())) {
            throw new BusinessRuleException("تم التراجع عن هذه الجلسة مسبقاً!");
        }

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود"));
        if (employee.getTenant() == null || !tenantId.equals(employee.getTenant().getId())) {
            throw new ResourceNotFoundException("الموظف غير موجود");
        }

        List<ImportSessionItem> items = itemRepository.findBySessionId(sessionId);

        for (ImportSessionItem item : items) {
            if ("SUCCESS".equalsIgnoreCase(item.getStatus()) && item.getAffectedEntityId() != null) {
                Optional<ProductVariant> variantOpt = variantRepository.findById(item.getAffectedEntityId());
                if (variantOpt.isPresent()) {
                    ProductVariant v = variantOpt.get();
                    int delta = item.getStockDelta();
                    if (delta > 0) {
                        int available = fifoCostingService.getAvailableBatchQuantity(tenantId, v.getId());
                        int toDeduct = Math.min(delta, available);
                        if (toDeduct > 0) {
                            fifoCostingService.deductBatchesForAdjustment(
                                    tenantId,
                                    StockService.DEFAULT_SALES_WAREHOUSE,
                                    v.getId(),
                                    toDeduct,
                                    "IMPORT_UNDO",
                                    employeeId
                            );
                        }
                    }

                    // Keep the product/variant in the catalog with 0 stock to preserve database integrity.
                    // Trying to delete them would violate foreign key constraints (e.g., from the import batches or ledger logs).
                }
            }
        }

        session.setStatus("UNDONE");
        session.setCompletedAt(Instant.now());
        sessionRepository.save(session);
    }

    public void deleteSessionAndProducts(String sessionId, String employeeId) {
        String tenantId = SecurityUtils.requireTenantId();
        ImportSession session = requireSessionForTenant(sessionId, tenantId);

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود"));
        if (employee.getTenant() == null || !tenantId.equals(employee.getTenant().getId())) {
            throw new ResourceNotFoundException("الموظف غير موجود");
        }

        List<ImportSessionItem> items = itemRepository.findBySessionId(sessionId);

        for (ImportSessionItem item : items) {
            if (item.getAffectedEntityId() != null) {
                Optional<ProductVariant> variantOpt = variantRepository.findById(item.getAffectedEntityId());
                if (variantOpt.isPresent()) {
                    ProductVariant v = variantOpt.get();
                    
                    // Skip deleting if the variant is referenced in active sales allocations or transfers
                    if (isVariantReferenced(v.getId())) {
                        continue;
                    }
                    
                    Product p = v.getProduct();
                    
                    // Delete the variant (cascades to warehouse stock, batches, movements, ledger)
                    variantRepository.delete(v);
                    
                    if (p != null) {
                        variantRepository.flush();
                        List<ProductVariant> remaining = variantRepository.findByProductId(p.getId());
                        if (remaining.isEmpty() || (remaining.size() == 1 && remaining.get(0).getId().equals(v.getId()))) {
                            productRepository.delete(p);
                        }
                    }
                }
            }
        }

        itemRepository.deleteAll(items);
        itemRepository.flush();

        sessionRepository.delete(session);
    }

    private boolean isVariantReferenced(String variantId) {
        // Check if there are sales allocations
        Number countSales = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM sale_item_batch_allocations WHERE inventory_batch_id IN " +
                "(SELECT id FROM inventory_batches WHERE product_variant_id = :variantId)")
                .setParameter("variantId", variantId)
                .getSingleResult();
        if (countSales.intValue() > 0) return true;

        // Check if there are stock transfer items
        Number countTransfers = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM stock_transfer_items WHERE product_variant_id = :variantId")
                .setParameter("variantId", variantId)
                .getSingleResult();
        if (countTransfers.intValue() > 0) return true;

        return false;
    }

    public List<ImportSession> getHistory() {
        String tenantId = SecurityUtils.requireTenantId();
        return sessionRepository.findByUploadedByTenantId(tenantId);
    }

    private ImportSession requireSessionForTenant(String sessionId, String tenantId) {
        ImportSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("جلسة الاستيراد غير موجودة"));
        if (session.getUploadedBy() == null
                || session.getUploadedBy().getTenant() == null
                || !tenantId.equals(session.getUploadedBy().getTenant().getId())) {
            throw new ResourceNotFoundException("جلسة الاستيراد غير موجودة");
        }
        return session;
    }

    // Helper methods
    private String effectiveDuplicateStrategy(ImportSession session) {
        String strategy = session.getDuplicateStrategy();
        if (strategy == null || strategy.isBlank()) {
            return "UPDATE";
        }
        return strategy.trim();
    }

    private Optional<Product> resolveExistingProduct(String rawSku, String productName, String tenantId) {
        if (rawSku != null && !rawSku.isEmpty()) {
            Optional<Product> bySku = productRepository.findBySkuIgnoreCaseAndTenantId(rawSku, tenantId);
            if (bySku.isPresent()) {
                return bySku;
            }
        }
        if (productName != null && !productName.isEmpty()) {
            List<Product> byName = productRepository.findByNameIgnoreCaseAndTenantId(productName, tenantId);
            if (byName.size() == 1) {
                return Optional.of(byName.get(0));
            }
        }
        return Optional.empty();
    }

    private String applyImportUpdate(
            ImportSession session,
            Product prod,
            String productName,
            String variantName,
            String brandName,
            String supplierName,
            BulkImportItem item,
            Tenant tenant,
            Employee employee,
            String sku,
            int rowNum
    ) {
        prod.setName(productName != null ? productName : prod.getName());
        if (brandName != null && !brandName.isEmpty()) {
            prod.setBrand(findOrCreateBrand(brandName, tenant));
        }
        if (supplierName != null && !supplierName.isEmpty()) {
            prod.setSupplier(findOrCreateSupplier(supplierName, tenant));
        }
        productRepository.saveAndFlush(prod);

        ProductVariant targetVar = skuCatalogService.updateOrCreateSingleVariant(
                prod,
                variantName,
                item.getPrice(),
                item.getCost()
        );
        targetVar = catalogPersistenceService.saveVariant(targetVar);

        if (item.getStock() != null && item.getStock() > 0) {
            BigDecimal unitCost = item.getCost() != null ? item.getCost() : BigDecimal.ZERO;
            fifoCostingService.createOpeningBatch(
                    tenant.getId(),
                    StockService.DEFAULT_SALES_WAREHOUSE,
                    targetVar.getId(),
                    unitCost,
                    item.getStock(),
                    item.getExpiryDate(),
                    importBatchNumber(session, sku, rowNum),
                    employee.getId()
            );
        }
        return targetVar.getId();
    }

    private String importBatchNumber(ImportSession session, String sku, int rowNum) {
        String sessionPart = session.getId() != null
                ? session.getId().replace("-", "").substring(0, Math.min(8, session.getId().replace("-", "").length()))
                : UUID.randomUUID().toString().substring(0, 8);
        return "IMP-" + sku + "-" + sessionPart + "-" + rowNum;
    }

    private String cleanString(String val) {
        if (val == null) return null;
        // Trim whitespace and remove invisible characters
        String cleaned = val.trim().replaceAll("[\\p{C}]", "");
        return cleaned.isEmpty() ? null : cleaned;
    }

    private void logSessionItem(ImportSession session, int rowNum, String status, String errorMsg, String affectedId) {
        logSessionItem(session, rowNum, status, errorMsg, affectedId, 0);
    }

    private void logSessionItem(ImportSession session, int rowNum, String status, String errorMsg, String affectedId, int stockDelta) {
        ImportSessionItem sessionItem = ImportSessionItem.builder()
                .id(UUID.randomUUID().toString())
                .session(session)
                .rowNumber(rowNum)
                .status(status)
                .errorMessage(errorMsg)
                .affectedEntityId(affectedId)
                .stockDelta(stockDelta)
                .build();
        itemRepository.save(sessionItem);
    }

    private Category findOrCreateCategory(String name, Tenant tenant) {
        return categoryRepository.findByNameIgnoreCaseAndTenantId(name, tenant.getId())
                .orElseGet(() -> {
                    Category cat = Category.builder()
                            .id("cat-" + UUID.randomUUID().toString().substring(0, 8))
                            .tenant(tenant)
                            .name(name)
                            .build();
                    return categoryRepository.save(cat);
                });
    }

    private Brand findOrCreateBrand(String name, Tenant tenant) {
        return brandRepository.findByNameIgnoreCaseAndTenantId(name, tenant.getId())
                .orElseGet(() -> {
                    Brand brand = Brand.builder()
                            .id("br-" + UUID.randomUUID().toString().substring(0, 8))
                            .tenant(tenant)
                            .name(name)
                            .build();
                    return brandRepository.save(brand);
                });
    }

    private Supplier findOrCreateSupplier(String name, Tenant tenant) {
        return supplierRepository.findByNameIgnoreCaseAndTenantId(name, tenant.getId())
                .orElseGet(() -> {
                    Supplier supplier = Supplier.builder()
                            .id("sup-" + UUID.randomUUID().toString().substring(0, 8))
                            .tenant(tenant)
                            .name(name)
                            .supplierCode("SUP-" + String.format("%04d", (int)(Math.random() * 10000)))
                            .build();
                    return supplierRepository.save(supplier);
                });
    }
}
