package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.domain.InventoryDeductionStrategy;
import com.animasys.modules.inventory.domain.InventoryLedgerTransaction;
import com.animasys.modules.inventory.dto.CreatePurchaseBatchRequestDTO;
import com.animasys.modules.inventory.dto.InventoryValuationReportDTO;
import com.animasys.modules.inventory.service.FifoCostingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/inventory/fifo")
@RequiredArgsConstructor
public class FifoCostingController {

    private final FifoCostingService fifoCostingService;
    private final TenantRepository tenantRepository;

    @PostMapping("/batches")
    @PreAuthorize("@authz.has('inventory.receive_stock')")
    public ResponseEntity<ApiResponseWrapper<InventoryBatch>> createPurchaseBatch(
            @Valid @RequestBody CreatePurchaseBatchRequestDTO request
    ) {
        String employeeId = SecurityUtils.requireEmployeeId();
        String tenantId = SecurityUtils.requireTenantId();

        InventoryBatch batch = fifoCostingService.createPurchaseBatch(
                tenantId,
                request.getWarehouseId(),
                request.getProductVariantId(),
                request.getSupplierId(),
                request.getPurchaseInvoiceId(),
                request.getBatchNumber(),
                request.getUnitCost(),
                request.getQuantity(),
                request.getExpiryDate(),
                java.time.Instant.now(),
                employeeId
        );

        return ResponseEntity.ok(ApiResponseWrapper.success(batch, "Purchase batch cost layer created successfully"));
    }

    @GetMapping("/batches/active/{productVariantId}")
    @PreAuthorize("@authz.has('inventory.view_stock_history')")
    public ResponseEntity<ApiResponseWrapper<List<InventoryBatch>>> getActiveBatches(
            @PathVariable String productVariantId
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        List<InventoryBatch> activeBatches = fifoCostingService.getActiveBatches(tenantId, productVariantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(activeBatches, "Active FIFO batches retrieved successfully"));
    }

    @GetMapping("/valuation")
    @PreAuthorize("@authz.has('inventory.view_stock_history')")
    public ResponseEntity<ApiResponseWrapper<InventoryValuationReportDTO>> getInventoryValuation() {
        String tenantId = SecurityUtils.requireTenantId();
        InventoryValuationReportDTO report = fifoCostingService.buildValuationReport(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(report, "Inventory valuation calculated successfully"));
    }

    @GetMapping("/ledger/{productVariantId}")
    @PreAuthorize("@authz.has('inventory.view_stock_history')")
    public ResponseEntity<ApiResponseWrapper<List<InventoryLedgerTransaction>>> getInventoryLedger(
            @PathVariable String productVariantId
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        List<InventoryLedgerTransaction> ledger = fifoCostingService.getInventoryLedger(tenantId, productVariantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(ledger, "Inventory audit ledger retrieved successfully"));
    }

    @PostMapping("/write-off")
    @PreAuthorize("@authz.has('inventory.stock_adjustment')")
    public ResponseEntity<ApiResponseWrapper<Void>> processWriteOff(
            @RequestParam String inventoryBatchId,
            @RequestParam String warehouseId,
            @RequestParam int quantity,
            @RequestParam String reason
    ) {
        String employeeId = SecurityUtils.requireEmployeeId();
        String tenantId = SecurityUtils.requireTenantId();

        fifoCostingService.processInventoryWriteOff(tenantId, warehouseId, inventoryBatchId, quantity, reason, employeeId);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "Inventory write-off logged successfully"));
    }

    @GetMapping("/strategy")
    @PreAuthorize("@authz.has('settings.view')")
    public ResponseEntity<ApiResponseWrapper<Map<String, String>>> getDeductionStrategy() {
        String tenantId = SecurityUtils.requireTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new com.animasys.core.exception.ResourceNotFoundException("Tenant not found"));
        String strategy = tenant.getInventoryDeductionStrategy() != null
                ? tenant.getInventoryDeductionStrategy()
                : InventoryDeductionStrategy.FIFO.name();
        return ResponseEntity.ok(ApiResponseWrapper.success(Map.of("strategy", strategy), "Strategy retrieved"));
    }

    @PutMapping("/strategy")
    @PreAuthorize("@authz.has('settings.edit')")
    public ResponseEntity<ApiResponseWrapper<Map<String, String>>> updateDeductionStrategy(
            @RequestBody Map<String, String> body
    ) {
        String tenantId = SecurityUtils.requireTenantId();
        String raw = body.get("strategy");
        if (raw == null || raw.isBlank()) {
            throw new com.animasys.core.exception.BusinessRuleException("strategy is required (FIFO or FEFO)");
        }
        InventoryDeductionStrategy strategy;
        try {
            strategy = InventoryDeductionStrategy.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new com.animasys.core.exception.BusinessRuleException("Unsupported strategy: " + raw);
        }
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new com.animasys.core.exception.ResourceNotFoundException("Tenant not found"));
        tenant.setInventoryDeductionStrategy(strategy.name());
        tenantRepository.save(tenant);
        return ResponseEntity.ok(ApiResponseWrapper.success(Map.of("strategy", strategy.name()), "Strategy updated"));
    }
}
