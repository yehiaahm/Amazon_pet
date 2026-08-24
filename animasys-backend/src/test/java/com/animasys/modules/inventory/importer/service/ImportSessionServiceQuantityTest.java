package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.importer.repository.ImportSessionRepository;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.SupplierRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Regression for a fixed truncation-vs-rounding mismatch: the inventory-count
 * import UI tells the user a decimal counted quantity "will be rounded"
 * (سيتم تقريبها), but parseQuantity() truncated toward zero instead, silently
 * deducting/adding one extra unit of stock for values like 4.9 or 4.5.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ImportSessionServiceQuantityTest {

    @Mock private ExcelParserService excelParserService;
    @Mock private ColumnMappingEngine columnMappingEngine;
    @Mock private AiColumnMappingAdvisor aiColumnMappingAdvisor;
    @Mock private ImportRowNormalizer importRowNormalizer;
    @Mock private ImportRowValidator importRowValidator;
    @Mock private DuplicateDetectionService duplicateDetectionService;
    @Mock private ImportSessionWriter importSessionWriter;
    @Mock private ImportSessionRepository importSessionRepository;
    @Mock private ImportSessionItemRepository importSessionItemRepository;
    @Mock private WarehouseRepository warehouseRepository;
    @Mock private SupplierRepository supplierRepository;
    @Mock private CategoryRepository categoryRepository;
    @Mock private FifoCostingService fifoCostingService;
    @Mock private ImportWarehouseResolver importWarehouseResolver;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks
    private ImportSessionService importSessionService;

    @Test
    void roundsHalfUpInsteadOfTruncating() {
        assertEquals(5, importSessionService.parseQuantity("4.9"));
        assertEquals(5, importSessionService.parseQuantity("4.5"));
        assertEquals(4, importSessionService.parseQuantity("4.4"));
        assertEquals(4, importSessionService.parseQuantity("4.0"));
    }

    @Test
    void handlesThousandsSeparatorsAndBlanks() {
        assertEquals(1200, importSessionService.parseQuantity("1,200"));
        assertEquals(0, importSessionService.parseQuantity(""));
        assertEquals(0, importSessionService.parseQuantity(null));
        assertEquals(0, importSessionService.parseQuantity("not-a-number"));
    }
}
