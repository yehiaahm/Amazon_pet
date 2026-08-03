package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.repository.WarehouseStockRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertThrows;

@ExtendWith(MockitoExtension.class)
class StockServiceTest {

    @Mock private ProductVariantRepository variantRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private WarehouseStockRepository warehouseStockRepository;
    @Mock private ProductRepository productRepository;
    @Mock private InventoryStockSyncService stockSyncService;

    @InjectMocks
    private StockService stockService;

    @Test
    void adjustStockIsBlockedToProtectFifoLayers() {
        assertThrows(BusinessRuleException.class, () ->
                stockService.adjustStock("v-1", "wh-1", -3, "SALE", "e-1"));
    }

    @Test
    void deductForSaleIsBlocked() {
        assertThrows(BusinessRuleException.class, () ->
                stockService.deductForSale("v-1", 1, "e-1"));
    }
}
