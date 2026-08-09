package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.InventoryLedgerTransaction;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogPageResponse;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogSearchCriteria;
import com.animasys.modules.inventory.dto.AdjustStockRequest;
import com.animasys.modules.inventory.dto.InventoryBatchResponseDTO;
import com.animasys.modules.inventory.dto.LowStockAlertDTO;
import com.animasys.modules.inventory.dto.StockCountRequest;
import com.animasys.modules.inventory.dto.StockMovementResponseDTO;
import com.animasys.modules.inventory.dto.TransferStockRequest;
import com.animasys.modules.inventory.dto.UpdateVariantPricingRequest;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.CatalogQueryService;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.InventoryInsightsService;
import com.animasys.modules.inventory.service.InventoryIntegrityService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.inventory.service.TransferService;
import com.animasys.modules.inventory.service.ProductService;
import com.animasys.modules.inventory.barcode.BarcodeImageService;
import com.animasys.modules.inventory.barcode.DirectPrintService;
import com.animasys.modules.inventory.domain.TemplateStyle;
import com.animasys.modules.inventory.domain.TenantBarcodeSettings;
import com.animasys.modules.inventory.dto.BulkPrintRequestItem;
import com.animasys.modules.inventory.dto.BarcodeSettingsRequest;
import com.animasys.modules.inventory.dto.DirectPrintRequest;
import com.animasys.modules.iam.domain.Employee;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final StockService stockService;
    private final TransferService transferService;
    private final FifoCostingService fifoCostingService;
    private final ProductVariantRepository variantRepository;
    private final WarehouseRepository warehouseRepository;
    private final InventoryBatchRepository inventoryBatchRepository;
    private final InventoryIntegrityService inventoryIntegrityService;
    private final InventoryInsightsService inventoryInsightsService;
    private final CatalogQueryService catalogQueryService;
    private final EntityManager entityManager;
    private final ProductService productService;
    private final BarcodeImageService barcodeImageService;
    private final DirectPrintService directPrintService;

    @GetMapping("/warehouses")
    @PreAuthorize("@authz.has('inventory.view')")
    public ResponseEntity<ApiResponseWrapper<List<Warehouse>>> getAllWarehouses() {
        String tenantId = SecurityUtils.requireTenantId();
        List<Warehouse> warehouses = warehouseRepository.findByTenantId(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(warehouses, "تم استرجاع قائمة المستودعات"));
    }

    /** Unified batch list — backed by {@code inventory_batches} only. */
    @GetMapping("/batches")
    @PreAuthorize("@authz.has('inventory.batch_management')")
    public ResponseEntity<ApiResponseWrapper<List<InventoryBatchResponseDTO>>> getAllBatches() {
        String tenantId = SecurityUtils.requireTenantId();
        List<InventoryBatch> batches = inventoryBatchRepository
                .findByTenantIdAndStatusAndRemainingQuantityGreaterThanOrderByPurchaseDateAsc(
                        tenantId, InventoryBatch.BatchStatus.ACTIVE, 0);
        List<InventoryBatchResponseDTO> dtos = batches.stream().map(this::toBatchDto).toList();
        return ResponseEntity.ok(ApiResponseWrapper.success(dtos, "تم استرجاع قائمة الدفعات"));
    }

    @GetMapping("/variants")
    @PreAuthorize("@authz.has('inventory.view')")
    public ResponseEntity<ApiResponseWrapper<CatalogPageResponse>> getVariants(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) String supplier,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String barcode,
            @RequestParam(required = false) String sku,
            @RequestParam(required = false) Boolean lowStock
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        CatalogPageResponse pageResult = catalogQueryService.search(tenantId, CatalogSearchCriteria.builder()
                .page(page)
                .size(size)
                .sort(sort)
                .search(search)
                .category(category)
                .brand(brand)
                .supplier(supplier)
                .status(status)
                .barcode(barcode)
                .sku(sku)
                .lowStock(lowStock)
                .build());
        return ResponseEntity.ok(ApiResponseWrapper.success(pageResult, "Inventory levels retrieved"));
    }

    @GetMapping("/movements")
    @PreAuthorize("@authz.has('inventory.view_stock_history')")
    public ResponseEntity<ApiResponseWrapper<List<StockMovementResponseDTO>>> getAllMovements() {
        String tenantId = SecurityUtils.requireTenantId();
        List<StockMovementResponseDTO> movements = fifoCostingService.getTenantLedger(tenantId).stream()
                .map(this::toMovementDto)
                .toList();
        return ResponseEntity.ok(ApiResponseWrapper.success(movements, "Stock movement history retrieved"));
    }

    @GetMapping("/low-stock")
    @PreAuthorize("@authz.has('inventory.view')")
    public ResponseEntity<ApiResponseWrapper<List<LowStockAlertDTO>>> getLowStockAlerts() {
        String tenantId = SecurityUtils.requireTenantId();
        List<LowStockAlertDTO> alerts = inventoryInsightsService.getLowStockAlerts(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(alerts, "Low stock alerts retrieved"));
    }

    @GetMapping("/expiring")
    @PreAuthorize("@authz.has('inventory.expiry_management')")
    public ResponseEntity<ApiResponseWrapper<List<InventoryBatchResponseDTO>>> getExpiringBatches(
            @RequestParam(defaultValue = "90") int withinDays
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        List<InventoryBatchResponseDTO> batches = inventoryInsightsService.getExpiringBatches(tenantId, withinDays);
        return ResponseEntity.ok(ApiResponseWrapper.success(batches, "Expiring batches retrieved"));
    }

    @PutMapping("/variants/{id}/pricing")
    @PreAuthorize("@authz.has('products.change_prices')")
    public ResponseEntity<ApiResponseWrapper<ProductVariant>> updateVariantPricing(
            @PathVariable String id,
            @Valid @RequestBody UpdateVariantPricingRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        ProductVariant updated = stockService.updateVariantPricing(
                tenantId, id, request.getPrice(), request.getCost(), request.getWholesalePrice());
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث سعر المنتج في النظام بنجاح"));
    }

    @PostMapping("/adjust")
    @PreAuthorize("@authz.has('inventory.stock_adjustment')")
    public ResponseEntity<ApiResponseWrapper<ProductVariant>> adjustStock(@Valid @RequestBody AdjustStockRequest request) {
        String employeeId = SecurityUtils.requireEmployeeId();
        String tenantId = SecurityUtils.requireTenantId();
        String warehouseId = request.getWarehouseId() != null ? request.getWarehouseId() : StockService.DEFAULT_SALES_WAREHOUSE;

        ProductVariant variant = variantRepository.findById(request.getVariantId())
                .orElseThrow(() -> new com.animasys.core.exception.ResourceNotFoundException("Product Variant not found"));

        if (!tenantId.equals(variant.getTenantId())) {
            throw new com.animasys.core.exception.BusinessRuleException("Unauthorized variant access");
        }

        if (request.getDiff() > 0) {
            BigDecimal unitCost = variant.getCost() != null ? variant.getCost() : BigDecimal.ZERO;
            fifoCostingService.createOpeningBatch(
                    tenantId,
                    warehouseId,
                    variant.getId(),
                    unitCost,
                    request.getDiff(),
                    null,
                    "ADJ-" + UUID.randomUUID().toString().substring(0, 8),
                    employeeId
            );
        } else if (request.getDiff() < 0) {
            fifoCostingService.deductBatchesForAdjustment(
                    tenantId,
                    warehouseId,
                    variant.getId(),
                    -request.getDiff(),
                    request.getType() != null ? request.getType() : "COUNT_DISCREPANCY",
                    employeeId
            );
        }

        ProductVariant refreshed = variantRepository.findById(variant.getId()).orElse(variant);
        return ResponseEntity.ok(ApiResponseWrapper.success(refreshed, "Stock adjustment completed successfully"));
    }

    @PostMapping("/count")
    @PreAuthorize("@authz.has('inventory.inventory_count')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> applyPhysicalCount(
            @Valid @RequestBody StockCountRequest request
    ) {
        String employeeId = SecurityUtils.requireEmployeeId();
        String tenantId = SecurityUtils.requireTenantId();
        String warehouseId = request.getWarehouseId() != null
                ? request.getWarehouseId()
                : StockService.DEFAULT_SALES_WAREHOUSE;

        ProductVariant variant = variantRepository.findById(request.getVariantId())
                .orElseThrow(() -> new com.animasys.core.exception.ResourceNotFoundException("Product Variant not found"));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new com.animasys.core.exception.BusinessRuleException("Unauthorized variant access");
        }

        int systemQty = fifoCostingService.getAvailableBatchQuantity(tenantId, variant.getId());
        int countedQty = request.getCountedQuantity();
        int diff = countedQty - systemQty;
        String reason = request.getReason() != null && !request.getReason().isBlank()
                ? request.getReason()
                : "COUNT_DISCREPANCY";

        if (diff > 0) {
            BigDecimal unitCost = variant.getCost() != null ? variant.getCost() : BigDecimal.ZERO;
            fifoCostingService.createOpeningBatch(
                    tenantId,
                    warehouseId,
                    variant.getId(),
                    unitCost,
                    diff,
                    null,
                    "COUNT-" + UUID.randomUUID().toString().substring(0, 8),
                    employeeId
            );
        } else if (diff < 0) {
            fifoCostingService.deductBatchesForAdjustment(
                    tenantId,
                    warehouseId,
                    variant.getId(),
                    -diff,
                    reason,
                    employeeId
            );
        }

        ProductVariant refreshed = variantRepository.findById(variant.getId()).orElse(variant);
        Map<String, Object> result = Map.of(
                "variant", refreshed,
                "systemQuantity", systemQty,
                "countedQuantity", countedQty,
                "difference", diff
        );
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "Physical stock count applied successfully"));
    }

    @PostMapping("/transfer")
    @PreAuthorize("@authz.has('inventory.warehouse_transfer')")
    public ResponseEntity<ApiResponseWrapper<Void>> transferStock(@Valid @RequestBody TransferStockRequest request) {
        String employeeId = SecurityUtils.requireEmployeeId();
        transferService.transferStock(
                request.getVariantId(),
                request.getSourceWarehouseId(),
                request.getTargetWarehouseId(),
                request.getQuantity(),
                employeeId
        );
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم تحويل المخزون بين المخازن بنجاح"));
    }

    @PostMapping("/reconcile")
    @PreAuthorize("@authz.has('inventory.stock_adjustment')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> reconcileInventory() {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> report = inventoryIntegrityService.reconcileTenant(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(report, "تمت مزامنة المخزون مع دفعات FIFO"));
    }

    @DeleteMapping("/batches/{id}")
    @PreAuthorize("@authz.has('inventory.batch_management')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteBatch(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        InventoryBatch batch = inventoryBatchRepository.findById(id)
                .orElseThrow(() -> new com.animasys.core.exception.ResourceNotFoundException("الشحنة غير موجودة"));

        if (!tenantId.equals(batch.getTenantId())) {
            throw new com.animasys.core.exception.BusinessRuleException("غير مصرح بحذف هذه الشحنة");
        }

        // Check if there are sales allocations referencing this batch
        Number countSales = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM sale_item_batch_allocations WHERE inventory_batch_id = :batchId")
                .setParameter("batchId", id)
                .getSingleResult();
        if (countSales.intValue() > 0) {
            throw new com.animasys.core.exception.BusinessRuleException("لا يمكن حذف هذه الشحنة لأنها مرتبطة بعمليات بيع سابقة");
        }

        // Check if there are stock transfer items referencing this batch
        Number countTransfers = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM stock_transfer_items WHERE inventory_batch_id = :batchId")
                .setParameter("batchId", id)
                .getSingleResult();
        if (countTransfers.intValue() > 0) {
            throw new com.animasys.core.exception.BusinessRuleException("لا يمكن حذف هذه الشحنة لأنها مرتبطة بعمليات تحويل مخزني سابقة");
        }

        String variantId = batch.getProductVariant() != null ? batch.getProductVariant().getId() : null;

        inventoryBatchRepository.delete(batch);
        inventoryBatchRepository.flush();

        if (variantId != null) {
            stockService.ensureMirrored(variantId);
        }

        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف الشحنة بنجاح"));
    }

    private InventoryBatchResponseDTO toBatchDto(InventoryBatch batch) {
        return InventoryBatchResponseDTO.builder()
                .id(batch.getId())
                .productVariantId(batch.getProductVariant() != null ? batch.getProductVariant().getId() : null)
                .batchNumber(batch.getBatchNumber())
                .expiryDate(batch.getExpiryDate())
                .quantity(batch.getRemainingQuantity())
                .initialQuantity(batch.getInitialQuantity())
                .unitCost(batch.getUnitCost())
                .purchaseDate(batch.getPurchaseDate())
                .status(batch.getStatus() != null ? batch.getStatus().name() : null)
                .purchaseInvoiceId(batch.getPurchaseInvoice() != null ? batch.getPurchaseInvoice().getId() : null)
                .supplierId(batch.getSupplier() != null ? batch.getSupplier().getId() : null)
                .build();
    }

    private StockMovementResponseDTO toMovementDto(InventoryLedgerTransaction tx) {
        String variantId = tx.getProductVariant() != null ? tx.getProductVariant().getId() : "";
        return StockMovementResponseDTO.builder()
                .id(tx.getId())
                .warehouseId(tx.getWarehouseId())
                .productVariantId(variantId)
                .quantity(tx.getQuantityChange())
                .type(mapLedgerToMovementType(tx.getTransactionType()))
                .timestamp(tx.getCreatedAt())
                .employeeId(tx.getEmployeeId())
                .detail(tx.getTransactionType() != null ? tx.getTransactionType().name() : null)
                .build();
    }

    private String mapLedgerToMovementType(InventoryLedgerTransaction.TransactionType type) {
        if (type == null) {
            return "ADJUSTMENT";
        }
        return switch (type) {
            case PURCHASE_RECEIPT, OPENING_ADJUSTMENT -> "PURCHASE";
            case SALE_DEDUCTION -> "SALE";
            case TRANSFER_IN, TRANSFER_OUT -> "TRANSFER";
            default -> "ADJUSTMENT";
        };
    }

    @PostMapping("/variants/{id}/barcode/generate")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> generateBarcode(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "CODE_128") String format,
            @RequestParam(required = false, defaultValue = "false") boolean force
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee employee = SecurityUtils.requireEmployee();
        Map<String, Object> result = productService.generateBarcodeForVariant(tenantId, id, format, force, employee);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم توليد الباركود بنجاح"));
    }

    @PutMapping("/variants/{id}/barcode/custom")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> updateCustomBarcode(
            @PathVariable String id,
            @RequestBody Map<String, String> body
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee employee = SecurityUtils.requireEmployee();
        String barcode = body.get("barcode");
        String format = body.getOrDefault("format", "CODE_128");
        Map<String, Object> result = productService.updateCustomBarcode(tenantId, id, barcode, format, employee);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم تحديث الباركود المخصص بنجاح"));
    }

    @DeleteMapping("/variants/{id}/barcode")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<Void>> clearBarcode(
            @PathVariable String id
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        Employee employee = SecurityUtils.requireEmployee();
        productService.clearBarcode(tenantId, id, employee);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف الباركود بنجاح"));
    }

    @GetMapping("/variants/{id}/barcode")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<Map<String, Object>>> getBarcode(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "300") int width,
            @RequestParam(required = false, defaultValue = "100") int height
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> result = productService.getBarcodeData(tenantId, id, width, height);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم استرجاع الباركود"));
    }

    @GetMapping("/variants/{id}/barcode/image")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<?> getBarcodeImage(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "300") @Min(50) @Max(2000) int width,
            @RequestParam(required = false, defaultValue = "100") @Min(50) @Max(2000) int height,
            @RequestParam(required = false, defaultValue = "PNG") String format
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        Map<String, Object> barcodeData = productService.getBarcodeData(tenantId, id, width, height);
        String code = (String) barcodeData.get("barcode");
        String formatName = (String) barcodeData.get("barcodeFormat");

        if ("SVG".equalsIgnoreCase(format)) {
            String svg = barcodeImageService.generateSVG(formatName, code, width, height);
            return ResponseEntity.ok()
                    .header("Content-Type", "image/svg+xml")
                    .body(svg);
        } else {
            byte[] png = barcodeImageService.generatePNG(formatName, code, width, height);
            return ResponseEntity.ok()
                    .header("Content-Type", "image/png")
                    .body(png);
        }
    }

    @PostMapping(value = "/variants/barcodes/pdf", produces = "application/pdf")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<byte[]> printPdf(
            @RequestBody List<BulkPrintRequestItem> items,
            @RequestParam(required = false) TemplateStyle style
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        byte[] pdfBytes = productService.bulkPrintBarcodePdf(tenantId, items, style);
        return ResponseEntity.ok()
                .header("Content-Disposition", "attachment; filename=\"labels.pdf\"")
                .header("Content-Type", "application/pdf")
                .body(pdfBytes);
    }

    @PostMapping(value = "/variants/barcodes/zpl", produces = "text/plain")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<String> printZpl(
            @Valid @RequestBody List<BulkPrintRequestItem> items,
            @RequestParam(required = false) TemplateStyle style
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        String zpl = productService.bulkPrintBarcodeZpl(tenantId, items, style);
        return ResponseEntity.ok()
                .header("Content-Type", "text/plain")
                .body(zpl);
    }

    /**
     * Returns the list of printer names visible to the JVM / OS.
     * Used by the frontend to populate the printer-selection dropdown.
     */
    @GetMapping("/system/printers")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<List<String>>> listPrinters() {
        List<String> printers = directPrintService.listPrinters();
        return ResponseEntity.ok(ApiResponseWrapper.success(printers, "تم استرجاع قائمة الطابعات"));
    }

    /**
     * Generates ZPL for the given items and sends it directly to the named
     * OS printer (USB, network, or shared) without requiring a file download.
     */
    @PostMapping("/variants/barcodes/print-direct")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<Void>> printDirect(
            @Valid @RequestBody DirectPrintRequest request
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        TemplateStyle style = null;
        if (request.getStyle() != null && !request.getStyle().isBlank()) {
            try { style = TemplateStyle.valueOf(request.getStyle()); } catch (Exception ignored) {}
        }
        String zpl = productService.bulkPrintBarcodeZpl(tenantId, request.getItems(), style);
        if (zpl == null || zpl.isBlank()) {
            throw new com.animasys.core.exception.BusinessRuleException(
                    "لا يوجد محتوى للطباعة — تأكد أن المنتجات المحددة لديها باركود صالح");
        }
        directPrintService.printRaw(request.getPrinterName(), zpl);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم إرسال الطباعة للطابعة بنجاح"));
    }

    @GetMapping("/barcode-settings")
    @PreAuthorize("@authz.has('products.print_barcode')")
    public ResponseEntity<ApiResponseWrapper<TenantBarcodeSettings>> getBarcodeSettings() {
        String tenantId = SecurityUtils.requireTenantId();
        TenantBarcodeSettings settings = productService.getBarcodeSettings(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم استرجاع الإعدادات"));
    }

    @PutMapping("/barcode-settings")
    @PreAuthorize("@authz.has('settings.edit')")
    public ResponseEntity<ApiResponseWrapper<TenantBarcodeSettings>> updateBarcodeSettings(
            @Valid @RequestBody BarcodeSettingsRequest dto
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        TenantBarcodeSettings settings = productService.updateBarcodeSettings(tenantId, dto);
        return ResponseEntity.ok(ApiResponseWrapper.success(settings, "تم تحديث الإعدادات بنجاح"));
    }
}
