package com.animasys.modules.inventory.importer.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.importer.dto.ColumnMappingRequest;
import com.animasys.modules.inventory.importer.dto.ImportMappingResponse;
import com.animasys.modules.inventory.importer.dto.ImportSummary;
import com.animasys.modules.inventory.importer.dto.ImportUploadResponse;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.support.IntegrationTestBase;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * End-to-end cover for the "just upload the file" path: a real Arabic supplier template
 * must go upload -> auto-mapping -> commit with no manual column mapping at any point.
 */
class SupplierTemplateImportE2ETest extends IntegrationTestBase {

    /** Verbatim header row of the customer's supplier template, including its unnamed spacer column. */
    private static final List<String> TEMPLATE_HEADERS = List.of(
            "الباركود  *", "كود الصنف (SKU)", "اسم المنتج  *", "الماركة", "الفئة",
            "اسم الصنف / الوزن / الحجم", "الوحدة", "الكمية الحالية  *", "سعر التكلفة",
            "سعر البيع", "حد الطلب الأدنى", "المخزن / الفرع", "المورد", "تاريخ الصلاحية",
            "رقم الباتش", "", "ملاحظات");

    @Autowired private ImportSessionService importSessionService;
    @Autowired private ImportCommitService importCommitService;
    @Autowired private ImportErrorReportService importErrorReportService;
    @Autowired private ColumnMappingEngine columnMappingEngine;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private WarehouseRepository warehouseRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository productVariantRepository;

    private Tenant tenant;
    private Employee employee;
    private String suffix;

    @BeforeEach
    void setUp() {
        suffix = UUID.randomUUID().toString().substring(0, 8);
        tenant = Tenant.builder().id(UUID.randomUUID().toString()).name("Import Tenant")
                .subdomain("import-" + suffix).active(true).build();
        tenantRepository.save(tenant);
        bootstrapTenantRoles(tenant);

        Branch branch = Branch.builder().id(UUID.randomUUID().toString()).tenant(tenant).name("Main Branch").build();
        branchRepository.save(branch);

        warehouseRepository.save(Warehouse.builder()
                .id(UUID.randomUUID().toString()).branch(branch).name("المخزن الرئيسي").code("MAIN").build());

        employee = Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("importer-" + suffix)
                .fullName("Importer User")
                .email("importer-" + suffix + "@example.test")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build();
        employeeRepository.save(employee);
        authenticate(employee);
    }

    @Test
    void importsSupplierTemplateWithoutAnyManualColumnMapping() {
        // The test H2 store is a persistent file shared across runs, so identities must be run-unique.
        String catBarcode = uniqueBarcode();
        String dogBarcode = uniqueBarcode();
        String dogSku = "SKU-DOG-" + suffix;
        String catName = "Best Pet Salmon Cat Wet 400g " + suffix;

        MockMultipartFile file = templateFile(
                row(catBarcode, "", catName, "Best Pet", "قطط",
                        "400 جم", "علبة", "19", "70", "85", "5", "المخزن الرئيسي", "الشرق للتوريدات",
                        "2027-01-31", "LOT-A", "", ""),
                row(dogBarcode, dogSku, "Royal Canin Maxi Adult 15kg " + suffix, "Royal Canin", "كلاب",
                        "15 كجم", "كيس", "4", "1800", "2150", "2", "فرع المعادي", "الشرق للتوريدات",
                        "", "", "", "طلبية خاصة"));

        ImportUploadResponse upload = importSessionService.upload(file, tenant.getId(), employee.getId());

        // The wizard sends exactly what auto-mapping produced — nothing hand-picked.
        Map<String, String> autoMapping = new LinkedHashMap<>();
        columnMappingEngine.suggestMapping(upload.getHeaders()).forEach(s -> {
            if (s.isAutoMapped() && s.getField() != null) {
                autoMapping.put(s.getHeader(), s.getField().code());
            }
        });

        ColumnMappingRequest request = new ColumnMappingRequest();
        request.setMapping(autoMapping);
        request.setAutoCreateSupplier(true);
        request.setPriceBelowCostIsWarningOnly(true);

        ImportMappingResponse mapping = importSessionService.confirmMapping(upload.getSessionId(), tenant.getId(), request);
        assertEquals(2, mapping.getTotalRows());
        assertEquals(0, mapping.getErrorRows(), "auto-mapped template rows must validate cleanly");
        assertEquals(2, mapping.getNewRows());

        ImportSummary summary = importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());
        assertEquals(2, summary.getImported());
        assertEquals(0, summary.getFailed());

        // Barcode-only row gets a derived SKU; both land with their prices and stock.
        assertTrue(productRepository.findAll().stream().anyMatch(p -> catName.equals(p.getName())),
                "product name from the template must be persisted");

        ProductVariant catFood = variantByBarcode(catBarcode);
        assertEquals(0, new BigDecimal("85").compareTo(catFood.getPrice()));
        assertEquals(0, new BigDecimal("70").compareTo(catFood.getCost()));
        assertEquals(19, catFood.getStockQuantity());

        ProductVariant dogFood = variantByBarcode(dogBarcode);
        assertEquals(dogSku, dogFood.getSku());
        assertEquals(4, dogFood.getStockQuantity());
    }

    @Test
    void importsAMessySheetWithATitleRowNonTemplateHeadersAndNoCostColumn() {
        // Nothing here matches the official template: the labels are ad-hoc, the header row
        // sits under a title and a spacer, there is no cost column at all, and the numbers
        // carry Arabic-Indic digits and a currency suffix. This is the upload that used to
        // come back as "فشل ربط الأعمدة".
        String barcode = uniqueBarcode();
        String name = "Whiskas Tuna Cat Wet " + suffix;
        MockMultipartFile file = messyFile(
                List.of("جرد فرع المعادي"),
                List.of(""),
                List.of("الاسم", "باركود", "الرصيد", "السعر"),
                List.of(name, barcode, "١٢", "95 ج.م"));

        ImportUploadResponse upload = importSessionService.upload(file, tenant.getId(), employee.getId());

        Map<String, String> autoMapping = new LinkedHashMap<>();
        columnMappingEngine.suggestMapping(upload.getHeaders()).forEach(s -> {
            if (s.isAutoMapped() && s.getField() != null) {
                autoMapping.put(s.getHeader(), s.getField().code());
            }
        });

        ColumnMappingRequest request = new ColumnMappingRequest();
        request.setMapping(autoMapping);
        request.setAutoCreateSupplier(true);
        request.setPriceBelowCostIsWarningOnly(true);

        ImportMappingResponse mapping = importSessionService.confirmMapping(upload.getSessionId(), tenant.getId(), request);
        assertEquals(1, mapping.getTotalRows());
        assertEquals(0, mapping.getErrorRows(), "a missing cost column must warn, not fail the row");

        ImportSummary summary = importCommitService.commit(upload.getSessionId(), tenant.getId(), employee.getId());
        assertEquals(1, summary.getImported());

        ProductVariant variant = variantByBarcode(barcode);
        assertEquals(0, new BigDecimal("95").compareTo(variant.getPrice()), "currency suffix must not break the price");
        assertEquals(12, variant.getStockQuantity(), "Arabic-Indic digits must parse as a quantity");
        assertEquals(0, BigDecimal.ZERO.compareTo(variant.getCost()), "an absent cost column defaults to zero");
    }

    @SafeVarargs
    private MockMultipartFile messyFile(List<String>... rows) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("Sheet1");
            for (int r = 0; r < rows.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < rows[r].size(); c++) {
                    row.createCell(c).setCellValue(rows[r].get(c));
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "messy-stock.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void generatesApPrefixedSkuFromBarcodeWhenSkuColumnIsBlank() {
        String barcode = uniqueBarcode();
        ImportMappingResponse mapping = uploadAndAutoMapAndConfirm(messyFile(
                List.of("الباركود", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"),
                List.of(barcode, "دراي فود قطط " + suffix, "5", "50", "70")));
        assertEquals(0, mapping.getErrorRows());
        String sessionId = lastSessionId;

        importCommitService.commit(sessionId, tenant.getId(), employee.getId());

        assertEquals("AP-" + barcode, variantByBarcode(barcode).getSku());
    }

    @Test
    void generatesSequentialSkuWhenRowHasNeitherSkuNorBarcode() {
        ImportMappingResponse mapping = uploadAndAutoMapAndConfirm(messyFile(
                List.of("اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"),
                List.of("منتج بدون كود أول " + suffix, "5", "50", "70"),
                List.of("منتج بدون كود تاني " + suffix, "3", "20", "35")));
        assertEquals(0, mapping.getErrorRows());
        String sessionId = lastSessionId;

        ImportSummary summary = importCommitService.commit(sessionId, tenant.getId(), employee.getId());
        assertEquals(2, summary.getImported(), "both rows must import: " + summary);

        // The sequence is global (SKUs must never collide across tenants), so its absolute
        // starting number depends on everything else that has ever run against this test
        // database — only the shape and the +1 relationship between the two are stable.
        List<Integer> generatedSequence = productRepository.findByTenantId(tenant.getId()).stream()
                .map(com.animasys.modules.inventory.domain.Product::getSku)
                .filter(sku -> sku != null && sku.matches("AP-\\d{6}"))
                .map(sku -> Integer.parseInt(sku.substring(3)))
                .sorted()
                .toList();
        assertEquals(2, generatedSequence.size(), "rows with no identifier at all must get a generated code");
        assertEquals(generatedSequence.get(0) + 1, generatedSequence.get(1),
                "the two generated codes must be consecutive");
    }

    @Test
    void flagsDuplicateSkuWithinTheSameFileAsAWarningNotAnError() {
        String sku = "SKU-DUP-" + suffix;
        ImportMappingResponse mapping = uploadAndAutoMapAndConfirm(messyFile(
                List.of("SKU", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"),
                List.of(sku, "دراي فود قطط أ " + suffix, "5", "50", "70"),
                List.of(sku, "دراي فود قطط ب " + suffix, "3", "20", "35")));

        assertEquals(0, mapping.getErrorRows(), "a repeated SKU must not fail the row");
        assertTrue(mapping.getWarningRows() >= 1);
    }

    @Test
    void flagsAnExpiredBatchAsAWarningAndStillImportsIt() {
        String barcode = uniqueBarcode();
        ImportMappingResponse mapping = uploadAndAutoMapAndConfirm(messyFile(
                List.of("الباركود", "اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع", "تاريخ الصلاحية"),
                List.of(barcode, "دراي فود منتهي " + suffix, "5", "50", "70", "2020-01-01")));

        assertEquals(0, mapping.getErrorRows(), "an expired batch is importable, just worth flagging");
        assertEquals(1, mapping.getWarningRows());
    }

    @Test
    void errorReportListsRowsThatFailedValidation() throws Exception {
        ImportMappingResponse mapping = uploadAndAutoMapAndConfirm(messyFile(
                List.of("اسم المنتج", "الكمية", "سعر التكلفة", "سعر البيع"),
                List.of("", "5", "50", "70")));
        assertEquals(1, mapping.getErrorRows(), "a row with no name, SKU, or barcode must fail");
        String sessionId = lastSessionId;

        importCommitService.commit(sessionId, tenant.getId(), employee.getId());
        byte[] report = importErrorReportService.buildErrorReport(sessionId, tenant.getId());

        try (var workbook = new org.apache.poi.xssf.usermodel.XSSFWorkbook(new java.io.ByteArrayInputStream(report))) {
            XSSFSheet sheet = workbook.getSheetAt(0);
            assertEquals("رقم الصف", sheet.getRow(0).getCell(0).getStringCellValue());
            assertNotNull(sheet.getRow(1), "the failed row must be listed in the report");
        }
    }

    /** Uploads, applies exactly what auto-mapping produced, and confirms — records the session id for the caller. */
    private ImportMappingResponse uploadAndAutoMapAndConfirm(MockMultipartFile file) {
        ImportUploadResponse upload = importSessionService.upload(file, tenant.getId(), employee.getId());
        lastSessionId = upload.getSessionId();

        Map<String, String> autoMapping = new LinkedHashMap<>();
        columnMappingEngine.suggestMapping(upload.getHeaders()).forEach(s -> {
            if (s.isAutoMapped() && s.getField() != null) {
                autoMapping.put(s.getHeader(), s.getField().code());
            }
        });

        ColumnMappingRequest request = new ColumnMappingRequest();
        request.setMapping(autoMapping);
        request.setAutoCreateSupplier(true);
        request.setPriceBelowCostIsWarningOnly(true);
        return importSessionService.confirmMapping(upload.getSessionId(), tenant.getId(), request);
    }

    private String lastSessionId;

    private String uniqueBarcode() {
        return String.valueOf(6_220_000_000_000L + (Math.abs(UUID.randomUUID().getMostSignificantBits()) % 1_000_000_000L));
    }

    private ProductVariant variantByBarcode(String barcode) {
        return productVariantRepository.findAll().stream()
                .filter(v -> tenant.getId().equals(v.getTenantId()) && barcode.equals(v.getBarcode()))
                .findFirst()
                .orElseGet(() -> fail("no variant imported for barcode " + barcode));
    }

    private static List<String> row(String... cells) {
        return List.of(cells);
    }

    private MockMultipartFile templateFile(List<String>... rows) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            XSSFSheet sheet = workbook.createSheet("المنتجات");
            Row header = sheet.createRow(0);
            for (int c = 0; c < TEMPLATE_HEADERS.size(); c++) {
                header.createCell(c).setCellValue(TEMPLATE_HEADERS.get(c));
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
            return new MockMultipartFile("file", "supplier-template.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
