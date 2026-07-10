package com.animasys.modules.inventory.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class TransferService {
    private final StockMovementRepository movementRepository;
    private final WarehouseRepository warehouseRepository;
    private final ProductVariantRepository variantRepository;
    private final EmployeeRepository employeeRepository;

    public void transferStock(String variantId, String sourceWarehouseId, String targetWarehouseId, int qty, String employeeId) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Product Variant not found: " + variantId));

        Warehouse sourceWh = warehouseRepository.findById(sourceWarehouseId)
                .orElseThrow(() -> new ResourceNotFoundException("Source warehouse not found: " + sourceWarehouseId));

        Warehouse targetWh = warehouseRepository.findById(targetWarehouseId)
                .orElseThrow(() -> new ResourceNotFoundException("Target warehouse not found: " + targetWarehouseId));

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee profile not found: " + employeeId));

        // Register out movement from source
        StockMovement outMove = StockMovement.builder()
                .id(UUID.randomUUID().toString())
                .warehouse(sourceWh)
                .productVariant(variant)
                .quantity(-qty)
                .type("TRANSFER")
                .timestamp(Instant.now())
                .employee(employee)
                .build();
        movementRepository.save(outMove);

        // Register in movement to target
        StockMovement inMove = StockMovement.builder()
                .id(UUID.randomUUID().toString())
                .warehouse(targetWh)
                .productVariant(variant)
                .quantity(qty)
                .type("TRANSFER")
                .timestamp(Instant.now())
                .employee(employee)
                .build();
        movementRepository.save(inMove);
    }
}
