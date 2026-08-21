package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.InventoryAdjustment;
import com.animasys.modules.inventory.domain.InventoryAdjustmentItem;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.importer.domain.ImportMode;
import com.animasys.modules.inventory.importer.domain.ImportRowStatus;
import com.animasys.modules.inventory.importer.domain.ImportSessionItem;
import com.animasys.modules.inventory.importer.dto.ColumnMappingRequest;
import com.animasys.modules.inventory.importer.dto.ImportMappingResponse;
import com.animasys.modules.inventory.importer.dto.ImportSummary;
import com.animasys.modules.inventory.importer.dto.ImportUploadResponse;
import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.repository.InventoryAdjustmentItemRepository;
import com.animasys.modules.inventory.repository.InventoryAdjustmentRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.support.IntegrationTestBase;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Covers the Inventory Reconciliation / Stock Count Excel import mode: the uploaded quantity
 * is the actual counted stock (New Stock = Counted), not a delta to add (New Stock = Current +
 * Excel), which is what ADD_STOCK mode still does unchanged.
 */
class InventoryReconciliationImportE2ETest extends IntegrationTestBase {

    @Autowired private ImportSessionService importSessionService;
    @Autowired private ImportCommitService importCommitService;
    @Autowired private ColumnMappingEngine columnMappingEngine;
    @Autowired private ImportSessionItemRepository importSessionItemRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private ProductVariantRepository productVariantRepository;
    @Autowired private FifoCostingService fifoCostingService;
    @Autowired private InventoryAdjustmentRepository inventoryAdjustmentRepository;
    @Autowired private InventoryAdjustmentItemRepository inventoryAdjustmentItemRepository;

    private Tenant tenant;
    private Employee employee;
    private Warehouse warehouse;
    private String suffix;

    @BeforeEach
    void setUp() {
        suffix = UUID.randomUUID().toString().substring(0, 8);
        tenant = Tenant.builder().id(UUID.randomUUID().toString()).name("Recon Tenant")
                .subdomain("recon-" + suffix).active(true).build();
        tenantRepository.save(tenant);
        bootstrapTenantRoles(tenant);

        Branch branch = Branch.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("Main Branch").build();
        branchRepository.save(branch);

        warehouse = warehouseRepository.save(Warehouse.builder()
                .id(UUID.randomUUID().toString()).branch(branch).name("المخزن الرئيسي").code("MAIN").build());

        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("recon-" + suffix)
                .fullName("Recon User")
                .email("recon-" + suffix + "@example.test")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build();
        employeeRepository.save(employee);
        authenticate(employee);
    }

    // ── Test 1: lower count ─────────────────────────────────────────────────
    @Test
    void countingBelowCurrentStockDeductsDownToTheCountedQuantity() {
        String barcode = uniqueBarcode();
        seedProductViaAddStock(barcode, "Royal Canin " + suffix, 50);

        commitCountFile(row(barcode, "45"));

        assertEquals(45, variantByBarcode(barcode).getStockQuantity());
    }

    // ── Test 2: higher count ────────────────────────────────────────────────
    @Test
    void countingAboveCurrentStockAddsUpToTheCountedQuantity() {
        String barcode = uniqueBarcode();
        seedProductViaAddStock(barcode, "Whiskas " + suffix, 50);

        commitCountFile(row(barcode, "55"));

        assertEquals(55, variantByBarcode(barcode).getStockQuantity());
    }

    // ── Test 3: same count ──────────────────────────────────────────────────
    @Test
    void countingTheSameAsCurrentStockAppliesNoChangeButStillRecordsTheCount() {
        String barcode = uniqueBarcode();
        seedProductViaAddStock(barcode, "Pedigree " + suffix, 50);

        String sessionId = commitCountFile(row(barcode, "50"));

        assertEquals(50, variantByBarcode(barcode).getStockQuantity());
        InventoryAdjustmentItem auditItem = adjustmentItemForSession(sessionId);
        assertEquals(0, auditItem.getQuantityDifference());
        assertEquals(50, auditItem.getSystemQuantity());
        assertEquals(50, auditItem.getCountedQuantity());
    }

    // ── Test 4: multiple products in one file ──────────────────────────────
    @Test
    void reconcilesMultipleProductsInOneFileIndependently() {
        String barcodeA = uniqueBarcode();
        String barcodeB = uniqueBarcode();
        String barcodeC = uniqueBarcode();
        seedProductViaAddStock(barcodeA, "Product A " + suffix, 50);
        seedProductViaAddStock(barcodeB, "Product B " + suffix, 20);
        seedProductViaAddStock(barcodeC, "Product C " + suffix, 10);

        commitCountFile(row(barcodeA, "45"), row(barcodeB, "25"), row(barcodeC, "10"));

        assertEquals(45, variantByBarcode(barcodeA).getStockQuantity());
        assertEquals(25, variantByBarcode(barcodeB).getStockQuantity());
        assertEquals(10, variantByBarcode(barcodeC).getStockQuantity());
    }

    // ── Test 5: unknown product ─────────────────────────────────────────────
    @Test
    void unknownProductInCountFileFailsThatRowButNotTheRest() {
        String knownBarcode = uniqueBarcode();
        String unknownBarcode = uniqueBarcode();
        seedProductViaAddStock(knownBarcode, "Known Product " + suffix, 50);

        ImportUploadResponse upload = uploadCountFile(row(knownBarcode, "45"), row(unknownBarcode, "10"));
        ImportMappingResponse mapping = confirmCountMapping(upload);

        assertEquals(1, mapping.getErrorRows(), "the unregistered barcode must be flagged, not silently created");
        assertEquals(1, mapping.getUpdateRows());

        ImportSummary summary = importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());
        assertEquals(1, summary.getUpdated());
        assertEquals(1, summary.getFailed());
        assertEquals(45, variantByBarcode(knownBarcode).getStockQuantity());
    }

    // ── Test 6: duplicate product within the same count file ──────────────
    @Test
    void duplicateProductWithinTheSameCountFileFailsTheRepeatRow() {
        String barcode = uniqueBarcode();
        seedProductViaAddStock(barcode, "Duplicate Test Product " + suffix, 50);

        ImportUploadResponse upload = uploadCountFile(row(barcode, "45"), row(barcode, "48"));
        ImportMappingResponse mapping = confirmCountMapping(upload);

        assertEquals(1, mapping.getErrorRows(), "the second occurrence of the same product must be flagged");
        assertEquals(1, mapping.getUpdateRows(), "only the first occurrence proceeds");

        importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());
        assertEquals(45, variantByBarcode(barcode).getStockQuantity(), "only the first row's count must apply");
    }

    // ── Test 7: ADD_STOCK mode (sales/purchases-equivalent path) is unchanged ──
    @Test
    void addStockModeStillAddsOnTopOfCurrentStockUnaffectedByReconciliationMode() {
        String barcode = uniqueBarcode();
        seedProductViaAddStock(barcode, "Add Stock Regression " + suffix, 50);

        // A second ADD_STOCK import of the same product must add, not replace.
        seedProductViaAddStock(barcode, "Add Stock Regression " + suffix, 20);

        assertEquals(70, variantByBarcode(barcode).getStockQuantity(),
                "ADD_STOCK mode must remain additive: 50 + 20 = 70, never replaced with 20");
    }

    // ── Test 8: audit trail ─────────────────────────────────────────────────
    @Test
    void reconciliationWritesAnAuditTrailEntryPerProduct() {
        String barcode = uniqueBarcode();
        seedProductViaAddStock(barcode, "Audited Product " + suffix, 50);

        String sessionId = commitCountFile(row(barcode, "45"));

        InventoryAdjustment adjustment = adjustmentForSession(sessionId);
        assertEquals(InventoryAdjustment.AdjustmentSource.IMPORT, adjustment.getSource());
        assertEquals(sessionId, adjustment.getImportSessionId());
        assertEquals(InventoryAdjustment.AdjustmentReason.COUNT_DISCREPANCY, adjustment.getReason());
        assertEquals(InventoryAdjustment.AdjustmentStatus.APPROVED, adjustment.getStatus());
        assertEquals(employee.getId(), adjustment.getRequestedById());

        InventoryAdjustmentItem item = adjustmentItemForSession(sessionId);
        assertEquals(50, item.getSystemQuantity());
        assertEquals(45, item.getCountedQuantity());
        assertEquals(-5, item.getQuantityDifference());
    }

    // ── Test 9: one row failing must not corrupt or block the others ──────
    @Test
    void aRowThatFailsAtCommitTimeDoesNotAffectOtherRowsOrLeaveThePartiallyMutatedState() {
        String goodBarcode = uniqueBarcode();
        String brokenBarcode = uniqueBarcode();
        seedProductViaAddStock(goodBarcode, "Good Row " + suffix, 50);
        seedProductViaAddStock(brokenBarcode, "Broken Row " + suffix, 30);

        ImportUploadResponse upload = uploadCountFile(row(goodBarcode, "45"), row(brokenBarcode, "20"));
        ImportMappingResponse mapping = confirmCountMapping(upload);
        assertEquals(0, mapping.getErrorRows());
        assertEquals(2, mapping.getUpdateRows());

        // Simulate the matched product having disappeared between preview and commit
        // (e.g. deleted concurrently) by corrupting the resolved variant id for one row.
        List<ImportSessionItem> items = importSessionItemRepository.findBySessionIdOrderByRowNumberAsc(upload.getSessionId());
        ImportSessionItem brokenItem = items.stream()
                .filter(i -> "20".equals(readCountedQuantity(i)))
                .findFirst().orElseThrow();
        brokenItem.setResolvedVariantId("no-such-variant-" + UUID.randomUUID().toString().substring(0, 8));
        importSessionItemRepository.save(brokenItem);

        ImportSummary summary = importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());

        assertEquals(1, summary.getUpdated(), "the healthy row must still commit despite the other row failing");
        assertEquals(1, summary.getFailed());
        assertEquals(45, variantByBarcode(goodBarcode).getStockQuantity(), "the healthy row's reconciliation must have applied");
        assertEquals(30, variantByBarcode(brokenBarcode).getStockQuantity(), "the broken row must be left completely untouched, not partially applied");

        ImportSessionItem reloaded = importSessionItemRepository.findById(brokenItem.getId()).orElseThrow();
        assertEquals(ImportRowStatus.FAILED, reloaded.getStatus());
    }

    private String readCountedQuantity(ImportSessionItem item) {
        return item.getCountedQuantity() != null ? String.valueOf(item.getCountedQuantity()) : null;
    }

    // ── shared helpers ──────────────────────────────────────────────────────

    private void seedProductViaAddStock(String barcode, String name, int quantity) {
        MockMultipartFile file = addStockFile(
                List.of("الباركود", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"),
                List.of(barcode, name, String.valueOf(quantity), "50", "70"));

        ImportUploadResponse upload = importSessionService.upload(file, tenant.getId(), employee.getId());
        Map<String, String> autoMapping = autoMap(upload.getHeaders());
        ColumnMappingRequest request = new ColumnMappingRequest();
        request.setMapping(autoMapping);
        request.setAutoCreateSupplier(true);
        request.setPriceBelowCostIsWarningOnly(true);
        importSessionService.confirmMapping(upload.getSessionId(), tenant.getId(), request);
        importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());
    }

    @SafeVarargs
    private String commitCountFile(List<String>... rows) {
        ImportUploadResponse upload = uploadCountFile(rows);
        confirmCountMapping(upload);
        importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());
        return upload.getSessionId();
    }

    @SafeVarargs
    private ImportUploadResponse uploadCountFile(List<String>... rows) {
        MockMultipartFile file = addStockFile(List.of("الباركود", "الكمية"), rows);
        return importSessionService.upload(file, tenant.getId(), employee.getId(), ImportMode.INVENTORY_COUNT);
    }

    private ImportMappingResponse confirmCountMapping(ImportUploadResponse upload) {
        Map<String, String> autoMapping = autoMap(upload.getHeaders());
        ColumnMappingRequest request = new ColumnMappingRequest();
        request.setMapping(autoMapping);
        return importSessionService.confirmMapping(upload.getSessionId(), tenant.getId(), request);
    }

    private Map<String, String> autoMap(List<String> headers) {
        Map<String, String> autoMapping = new LinkedHashMap<>();
        columnMappingEngine.suggestMapping(headers).forEach(s -> {
            if (s.isAutoMapped() && s.getField() != null) {
                autoMapping.put(s.getHeader(), s.getField().code());
            }
        });
        return autoMapping;
    }

    private InventoryAdjustment adjustmentForSession(String sessionId) {
        return inventoryAdjustmentRepository.findAll().stream()
                .filter(a -> sessionId.equals(a.getImportSessionId()))
                .findFirst()
                .orElseGet(() -> fail("no InventoryAdjustment recorded for session " + sessionId));
    }

    private InventoryAdjustmentItem adjustmentItemForSession(String sessionId) {
        InventoryAdjustment adjustment = adjustmentForSession(sessionId);
        return inventoryAdjustmentItemRepository.findAll().stream()
                .filter(i -> i.getInventoryAdjustment().getId().equals(adjustment.getId()))
                .findFirst()
                .orElseGet(() -> fail("no InventoryAdjustmentItem recorded for adjustment " + adjustment.getId()));
    }

    private String uniqueBarcode() {
        return String.valueOf(6_330_000_000_000L + (Math.abs(UUID.randomUUID().getMostSignificantBits()) % 1_000_000_000L));
    }

    private ProductVariant variantByBarcode(String barcode) {
        return productVariantRepository.findAll().stream()
                .filter(v -> tenant.getId().equals(v.getTenantId()) && barcode.equals(v.getBarcode()))
                .findFirst()
                .orElseGet(() -> fail("no variant found for barcode " + barcode));
    }

    private static List<String> row(String... cells) {
        return List.of(cells);
    }

    @SafeVarargs
    private MockMultipartFile addStockFile(List<String> headers, List<String>... rows) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("Sheet1");
            Row headerRow = sheet.createRow(0);
            for (int c = 0; c < headers.size(); c++) {
                headerRow.createCell(c).setCellValue(headers.get(c));
            }
            for (int r = 0; r < rows.length; r++) {
                Row dataRow = sheet.createRow(r + 1);
                List<String> cells = rows[r];
                for (int c = 0; c < cells.size(); c++) {
                    dataRow.createCell(c).setCellValue(cells.get(c));
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "recon-" + UUID.randomUUID() + ".xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
