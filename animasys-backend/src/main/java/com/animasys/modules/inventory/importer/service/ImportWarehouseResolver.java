package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.StockService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * Resolves a row's free-text WAREHOUSE cell to a warehouse id, falling back to the tenant's
 * default sales warehouse. Shared by {@link ImportSessionService} (mapping-time preview
 * snapshot) and {@link ImportBatchExecutor} (commit-time execution) so both stages agree on
 * which warehouse a row targets.
 */
@Component
@RequiredArgsConstructor
public class ImportWarehouseResolver {

    private final WarehouseRepository warehouseRepository;

    public String resolve(String tenantId, String warehouseName) {
        if (warehouseName == null || warehouseName.isBlank()) {
            return StockService.DEFAULT_SALES_WAREHOUSE;
        }
        String normalized = HeaderNormalizer.normalize(warehouseName);
        for (Warehouse warehouse : warehouseRepository.findByTenantId(tenantId)) {
            if (HeaderNormalizer.normalize(warehouse.getName()).equals(normalized)) {
                return warehouse.getId();
            }
        }
        return StockService.DEFAULT_SALES_WAREHOUSE;
    }
}
