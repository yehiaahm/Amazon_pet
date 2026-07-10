package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import java.math.BigDecimal;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class StockServiceTest {

    @Mock
    private ProductVariantRepository variantRepository;
    @Mock
    private StockMovementRepository movementRepository;
    @Mock
    private WarehouseRepository warehouseRepository;
    @Mock
    private EmployeeRepository employeeRepository;

    @InjectMocks
    private StockService stockService;

    private ProductVariant variant;
    private Warehouse warehouse;
    private Employee employee;

    @BeforeEach
    public void setup() {
        MockitoAnnotations.openMocks(this);

        Product product = Product.builder().id("p-1").minStockLimit(5).name("Dog Food").build();
        variant = ProductVariant.builder().id("v-1").product(product).name("10kg").stockQuantity(10).price(BigDecimal.TEN).cost(BigDecimal.ONE).build();
        warehouse = Warehouse.builder().id("wh-1").name("Main Store").code("WH-MAIN").build();
        employee = Employee.builder().id("e-1").fullName("Bob Johnson").role("CASHIER").build();
    }

    @Test
    public void testAdjustStockSuccess() {
        when(variantRepository.findById("v-1")).thenReturn(Optional.of(variant));
        when(warehouseRepository.findById("wh-1")).thenReturn(Optional.of(warehouse));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));

        ProductVariant updated = stockService.adjustStock("v-1", "wh-1", -3, "SALE", "e-1");

        assertEquals(7, updated.getStockQuantity());
        verify(variantRepository, times(1)).save(updated);
        verify(movementRepository, times(1)).save(any(StockMovement.class));
    }

    @Test
    public void testAdjustStockInsufficientThrowsException() {
        when(variantRepository.findById("v-1")).thenReturn(Optional.of(variant));
        when(warehouseRepository.findById("wh-1")).thenReturn(Optional.of(warehouse));
        when(employeeRepository.findById("e-1")).thenReturn(Optional.of(employee));

        assertThrows(BusinessRuleException.class, () -> {
            stockService.adjustStock("v-1", "wh-1", -15, "SALE", "e-1");
        });

        verify(variantRepository, never()).save(any());
        verify(movementRepository, never()).save(any());
    }
}
