package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.StockMovement;
import com.animasys.modules.inventory.dto.AdjustStockRequest;
import com.animasys.modules.inventory.dto.TransferStockRequest;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.StockMovementRepository;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.inventory.service.TransferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/inventory")
@RequiredArgsConstructor
public class InventoryController {

    private final StockService stockService;
    private final TransferService transferService;
    private final ProductVariantRepository variantRepository;
    private final StockMovementRepository movementRepository;

    @GetMapping("/variants")
    public ResponseEntity<ApiResponseWrapper<List<ProductVariant>>> getAllVariants() {
        List<ProductVariant> variants = variantRepository.findAll();
        return ResponseEntity.ok(ApiResponseWrapper.success(variants, "Inventory levels retrieved"));
    }

    @GetMapping("/movements")
    public ResponseEntity<ApiResponseWrapper<List<StockMovement>>> getAllMovements() {
        List<StockMovement> movements = movementRepository.findAll();
        return ResponseEntity.ok(ApiResponseWrapper.success(movements, "Stock movement history retrieved"));
    }

    @PostMapping("/adjust")
    public ResponseEntity<ApiResponseWrapper<ProductVariant>> adjustStock(@Valid @RequestBody AdjustStockRequest request) {
        ProductVariant variant = stockService.adjustStock(
                request.getVariantId(),
                request.getWarehouseId(),
                request.getDiff(),
                request.getType(),
                request.getEmployeeId()
        );
        return ResponseEntity.ok(ApiResponseWrapper.success(variant, "Stock adjustment completed successfully"));
    }

    @PostMapping("/transfer")
    public ResponseEntity<ApiResponseWrapper<Void>> transferStock(@Valid @RequestBody TransferStockRequest request) {
        transferService.transferStock(
                request.getVariantId(),
                request.getSourceWarehouseId(),
                request.getTargetWarehouseId(),
                request.getQuantity(),
                request.getEmployeeId()
        );
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "Stock transfer logged successfully"));
    }
}
