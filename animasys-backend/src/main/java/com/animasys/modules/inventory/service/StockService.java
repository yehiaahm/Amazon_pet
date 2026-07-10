package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
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
public class StockService {
    private final ProductVariantRepository variantRepository;
    private final StockMovementRepository movementRepository;
    private final WarehouseRepository warehouseRepository;
    private final EmployeeRepository employeeRepository;

    public ProductVariant adjustStock(String variantId, String warehouseId, int diff, String type, String employeeId) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Product Variant not found: " + variantId));

        Warehouse warehouse = warehouseRepository.findById(warehouseId)
                .orElseThrow(() -> new ResourceNotFoundException("Warehouse location not found: " + warehouseId));

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee profile not found: " + employeeId));

        int newQty = variant.getStockQuantity() + diff;
        if (newQty < 0) {
            throw new BusinessRuleException("Insufficient stock for variant '" + variant.getName() + "'. Available: " + variant.getStockQuantity());
        }

        variant.setStockQuantity(newQty);
        variantRepository.save(variant);

        StockMovement movement = StockMovement.builder()
                .id(UUID.randomUUID().toString())
                .warehouse(warehouse)
                .productVariant(variant)
                .quantity(diff)
                .type(type)
                .timestamp(Instant.now())
                .employee(employee)
                .build();
        movementRepository.save(movement);

        return variant;
    }
}
