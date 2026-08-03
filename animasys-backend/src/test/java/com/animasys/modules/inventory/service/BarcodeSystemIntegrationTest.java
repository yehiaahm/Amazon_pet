package com.animasys.modules.inventory.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.barcode.*;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.dto.BarcodeSettingsRequest;
import com.animasys.modules.inventory.dto.BulkPrintRequestItem;
import com.animasys.modules.inventory.dto.QrLabelRequest;
import com.animasys.modules.inventory.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class BarcodeSystemIntegrationTest {

    @Autowired private ProductService productService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private BarcodeSettingsRepository settingsRepository;
    @Autowired private BarcodeHistoryRepository historyRepository;
    @Autowired private BarcodeGeneratorService barcodeGeneratorService;
    @Autowired private BarcodeImageService barcodeImageService;
    @Autowired private QrLabelService qrLabelService;
    @Autowired private PdfLabelService pdfLabelService;
    @Autowired private com.animasys.modules.inventory.repository.CategoryRepository categoryRepository;

    private Tenant tenant;
    private Branch branch;
    private Employee employee;
    private com.animasys.modules.inventory.domain.Category category;

    @BeforeEach
    void seed() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-test-barcode-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Barcode Testing Tenant")
                .subdomain("barcode-test-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());

        branch = branchRepository.save(Branch.builder()
                .id("br-test-barcode-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Test Branch")
                .address("Cairo")
                .build());

        employee = employeeRepository.save(Employee.builder()
                .id("e-test-barcode-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("barcode-user-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("password")
                .fullName("Barcode tester")
                .email("barcode-test-" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build());

        category = categoryRepository.save(com.animasys.modules.inventory.domain.Category.builder()
                .id("cat-test-barcode-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Test Category")
                .build());
    }

    // ── Helper ──────────────────────────────────────────────────────────────

    private ProductVariant createVariantWithBarcode(String sku, String barcode) {
        Product product = productRepository.save(Product.builder()
                .id("p-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .sku(sku)
                .name("Test Product " + sku)
                .category(category)
                .build());
        ProductVariant variant = ProductVariant.builder()
                .id("pv-" + UUID.randomUUID().toString().substring(0, 8))
                .product(product)
                .tenantId(tenant.getId())
                .sku(sku)
                .name("Standard")
                .price(new BigDecimal("10.00"))
                .cost(new BigDecimal("5.00"))
                .barcode(barcode)
                .barcodeFormat(BarcodeFormat.CODE_128)
                .barcodeSource(BarcodeSource.SYSTEM_GENERATED)
                .barcodeStatus(BarcodeStatus.ACTIVE)
                .build();
        return variantRepository.save(variant);
    }

    // ── Existing tests (preserved) ──────────────────────────────────────────

    @Test
    void testTenantSettingsDefaultAndSave() {
        TenantBarcodeSettings settings = productService.getBarcodeSettings(tenant.getId());
        assertNotNull(settings);
        assertTrue(settings.isAutoGenerateBarcode());
        assertEquals(BarcodeFormat.CODE_128, settings.getDefaultBarcodeFormat());

        BarcodeSettingsRequest update = new BarcodeSettingsRequest();
        update.setAutoGenerateBarcode(false);
        update.setDefaultBarcodeFormat(BarcodeFormat.EAN_13);
        update.setDefaultLabelSize(settings.getDefaultLabelSize());
        update.setIncludeName(settings.isIncludeName());
        update.setIncludeSku(settings.isIncludeSku());
        update.setIncludePrice(settings.isIncludePrice());
        update.setDefaultTemplateStyle(settings.getDefaultTemplateStyle());
        TenantBarcodeSettings updated = productService.updateBarcodeSettings(tenant.getId(), update);
        assertFalse(updated.isAutoGenerateBarcode());
        assertEquals(BarcodeFormat.EAN_13, updated.getDefaultBarcodeFormat());
    }

    @Test
    void testAutoBarcodeGenerationOnProductCreation() {
        com.animasys.modules.inventory.dto.CreateProductRequest request = new com.animasys.modules.inventory.dto.CreateProductRequest();
        java.util.Map<String, Object> prodMap = new java.util.HashMap<>();
        prodMap.put("sku", "AUTO-BARCODE-" + System.currentTimeMillis());
        prodMap.put("name", "Auto Barcode Product");
        prodMap.put("minStockLimit", 5);
        request.setProduct(prodMap);

        java.util.Map<String, Object> varMap = new java.util.HashMap<>();
        varMap.put("name", "Standard");
        varMap.put("price", new BigDecimal("10.00"));
        varMap.put("cost", new BigDecimal("5.00"));
        varMap.put("barcode", "");
        request.setVariant(varMap);

        java.util.Map<String, Object> res = productService.createProductFromRequest(tenant.getId(), request);
        assertNotNull(res.get("barcode"));
        assertEquals("SYSTEM_GENERATED", res.get("barcodeSource"));

        String variantId = (String) res.get("variantId");
        ProductVariant variant = variantRepository.findById(variantId).orElseThrow();
        assertEquals(BarcodeFormat.CODE_128, variant.getBarcodeFormat());

        List<BarcodeHistory> history = historyRepository.findByProductVariantIdOrderByGeneratedAtDesc(variantId);
        assertFalse(history.isEmpty());
        assertEquals(res.get("barcode"), history.get(0).getNewBarcode());
    }

    @Test
    void testManualBarcodeAssignmentAndValidation() {
        com.animasys.modules.inventory.dto.CreateProductRequest request = new com.animasys.modules.inventory.dto.CreateProductRequest();
        java.util.Map<String, Object> prodMap = new java.util.HashMap<>();
        prodMap.put("sku", "EAN-BARCODE-" + System.currentTimeMillis());
        prodMap.put("name", "Manual EAN Product");
        request.setProduct(prodMap);

        java.util.Map<String, Object> varMap = new java.util.HashMap<>();
        varMap.put("name", "Standard");
        varMap.put("price", new BigDecimal("10.00"));
        varMap.put("barcode", "4006381333931");
        varMap.put("barcodeFormat", "EAN_13");
        request.setVariant(varMap);

        java.util.Map<String, Object> res = productService.createProductFromRequest(tenant.getId(), request);
        assertEquals("4006381333931", res.get("barcode"));
        assertEquals("MANUFACTURER", res.get("barcodeSource"));

        varMap.put("barcode", "4006381333935");
        varMap.put("sku", "EAN-BARCODE-BAD");
        assertThrows(Exception.class, () -> {
            productService.createProductFromRequest(tenant.getId(), request);
        });
    }

    @Test
    void testBarcodeUniquenessConstraint() {
        String sharedBarcode = "INT9999999999";

        com.animasys.modules.inventory.dto.CreateProductRequest request1 = new com.animasys.modules.inventory.dto.CreateProductRequest();
        java.util.Map<String, Object> prod1 = new java.util.HashMap<>();
        prod1.put("sku", "SKU-UNIQUE-1");
        prod1.put("name", "Product 1");
        request1.setProduct(prod1);
        java.util.Map<String, Object> var1 = new java.util.HashMap<>();
        var1.put("barcode", sharedBarcode);
        request1.setVariant(var1);
        productService.createProductFromRequest(tenant.getId(), request1);

        com.animasys.modules.inventory.dto.CreateProductRequest request2 = new com.animasys.modules.inventory.dto.CreateProductRequest();
        java.util.Map<String, Object> prod2 = new java.util.HashMap<>();
        prod2.put("sku", "SKU-UNIQUE-2");
        prod2.put("name", "Product 2");
        request2.setProduct(prod2);
        java.util.Map<String, Object> var2 = new java.util.HashMap<>();
        var2.put("barcode", sharedBarcode);
        request2.setVariant(var2);

        assertThrows(Exception.class, () -> {
            productService.createProductFromRequest(tenant.getId(), request2);
        });
    }

    // ── New tests: Barcode generation ───────────────────────────────────────

    @Test
    void testBarcodeRegeneration() {
        ProductVariant variant = createVariantWithBarcode("REGEN-1", "INT1000001000000");
        Map<String, Object> result = productService.generateBarcodeForVariant(
                tenant.getId(), variant.getId(), "CODE_128", employee);
        assertNotNull(result.get("barcode"));
        assertNotEquals("INT1000001000000", result.get("barcode"));
        assertEquals("CODE_128", result.get("barcodeFormat"));

        List<BarcodeHistory> history = historyRepository.findByProductVariantIdOrderByGeneratedAtDesc(variant.getId());
        assertFalse(history.isEmpty());
        assertEquals("Regeneration requested", history.get(0).getReason());
    }

    @Test
    void testClearBarcode() {
        ProductVariant variant = createVariantWithBarcode("CLEAR-1", "INT1000001000001");
        productService.clearBarcode(tenant.getId(), variant.getId(), employee);

        ProductVariant refreshed = variantRepository.findById(variant.getId()).orElseThrow();
        assertNull(refreshed.getBarcode());
        assertEquals(BarcodeStatus.VOID, refreshed.getBarcodeStatus());

        List<BarcodeHistory> history = historyRepository.findByProductVariantIdOrderByGeneratedAtDesc(variant.getId());
        assertFalse(history.isEmpty());
        assertEquals("Barcode Cleared", history.get(0).getReason());
        assertEquals("VOID", history.get(0).getNewBarcode());
    }

    // ── New tests: Dimension validation ─────────────────────────────────────

    @Test
    void testImageDimensionValidation() {
        assertThrows(IllegalArgumentException.class,
                () -> barcodeImageService.generatePNG("CODE_128", "TEST", 10, 100));
        assertThrows(IllegalArgumentException.class,
                () -> barcodeImageService.generatePNG("CODE_128", "TEST", 100, 5000));
        assertThrows(IllegalArgumentException.class,
                () -> barcodeImageService.generateSVG("CODE_128", "TEST", 3000, 100));

        byte[] png = barcodeImageService.generatePNG("CODE_128", "TEST", 300, 100);
        assertNotNull(png);
        assertTrue(png.length > 0);
    }

    // ── New tests: ZPL escaping ────────────────────────────────────────────

    @Test
    void testZplEscaping() {
        assertEquals("Hello~~World", ZplEscapeUtils.escape("Hello~World"));
        assertEquals("Hello^^World", ZplEscapeUtils.escape("Hello^World"));
        assertEquals("A~~B^^C", ZplEscapeUtils.escape("A~B^C"));
        assertEquals("", ZplEscapeUtils.escape(null));
        assertEquals("safe text", ZplEscapeUtils.escape("safe text"));
    }

    // ── New tests: PDF generation ───────────────────────────────────────────

    @Test
    void testPdfGenerationWithValidData() {
        ProductVariant variant = createVariantWithBarcode("PDF-1", "INT1000001000010");
        TenantBarcodeSettings settings = productService.getBarcodeSettings(tenant.getId());

        LabelPrintData printData = LabelPrintData.builder()
                .productName("Test PDF Product")
                .sku("PDF-1")
                .price(new BigDecimal("25.50"))
                .barcode("INT1000001000010")
                .formatName("CODE_128")
                .style(TemplateStyle.PET_SHOP_SMALL)
                .quantity(3)
                .includeName(true)
                .includeSku(true)
                .includePrice(true)
                .includeBarcodeNumber(true)
                .build();

        byte[] pdf = pdfLabelService.generateLabelsPdf(List.of(printData));
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
        assertEquals(0x25, pdf[0] & 0xFF); // PDF magic number %
    }

    @Test
    void testPdfGenerationEmptyList() {
        byte[] pdf = pdfLabelService.generateLabelsPdf(List.of());
        assertNotNull(pdf);
        assertEquals(0, pdf.length);
    }

    @Test
    void testPdfGenerationExceedsMaxLabels() {
        LabelPrintData printData = LabelPrintData.builder()
                .productName("Overflow")
                .sku("OVF")
                .price(BigDecimal.TEN)
                .barcode("INT1000001")
                .formatName("CODE_128")
                .style(TemplateStyle.PET_SHOP_SMALL)
                .quantity(600)
                .includeName(true)
                .includeSku(true)
                .includePrice(true)
                .includeBarcodeNumber(true)
                .build();

        assertThrows(com.animasys.core.exception.BusinessRuleException.class,
                () -> pdfLabelService.generateLabelsPdf(List.of(printData)));
    }

    // ── New tests: Bulk print ───────────────────────────────────────────────

    @Test
    void testBulkPrintPdfEmptyList() {
        assertThrows(com.animasys.core.exception.BusinessRuleException.class,
                () -> productService.bulkPrintBarcodePdf(tenant.getId(), List.of(), null));
    }

    @Test
    void testBulkPrintZplEmptyList() {
        assertThrows(com.animasys.core.exception.BusinessRuleException.class,
                () -> productService.bulkPrintBarcodeZpl(tenant.getId(), List.of(), null));
    }

    @Test
    void testBulkPrintPdfWithValidItem() {
        ProductVariant variant = createVariantWithBarcode("BULK-1", "INT1000001000020");
        BulkPrintRequestItem item = new BulkPrintRequestItem();
        item.setVariantId(variant.getId());
        item.setQuantity(2);

        byte[] pdf = productService.bulkPrintBarcodePdf(tenant.getId(), List.of(item), TemplateStyle.PET_SHOP_SMALL);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }

    @Test
    void testBulkPrintZplWithValidItem() {
        ProductVariant variant = createVariantWithBarcode("BULK-2", "INT1000001000021");
        BulkPrintRequestItem item = new BulkPrintRequestItem();
        item.setVariantId(variant.getId());
        item.setQuantity(1);

        String zpl = productService.bulkPrintBarcodeZpl(tenant.getId(), List.of(item), TemplateStyle.PET_SHOP_SMALL);
        assertNotNull(zpl);
        assertTrue(zpl.contains("^XA"));
        assertTrue(zpl.contains("^XZ"));
    }

    // ── New tests: EAN-13 checksum ──────────────────────────────────────────

    @Test
    void testEan13ChecksumCorrectness() {
        assertEquals(1, BarcodeGeneratorService.calculateEan13Checksum("400638133393"));
        assertEquals(7, BarcodeGeneratorService.calculateEan13Checksum("590123412345"));
    }

    @Test
    void testUpcaChecksumCorrectness() {
        assertEquals(2, BarcodeGeneratorService.calculateUpcaChecksum("03600029145"));
        assertEquals(5, BarcodeGeneratorService.calculateUpcaChecksum("01234567890"));
    }

    // ── New tests: QR Label ─────────────────────────────────────────────────

    @Test
    void testQrPayloadSerialization() {
        QrPayload payload = QrPayload.forProduct("t-1", "pv-1", "INT1000001", "SKU-1", "Dog Food", "25.50");
        String json = payload.toJson();
        assertNotNull(json);
        assertTrue(json.contains("\"type\":\"product\""));
        assertTrue(json.contains("\"variantId\":\"pv-1\""));
        assertTrue(json.contains("\"version\":1"));

        QrPayload deserialized = QrPayload.fromJson(json);
        assertEquals("product", deserialized.getType());
        assertEquals("pv-1", deserialized.getVariantId());
        assertEquals("Dog Food", deserialized.getProductName());
    }

    @Test
    void testQrPayloadFutureProofStructure() {
        QrPayload payload = QrPayload.forProduct("t-1", "pv-1", "INT1000001", "SKU-1", "Product", "10.00");
        assertEquals(QrPayload.CURRENT_VERSION, payload.getVersion());
        assertEquals("product", payload.getType());
        assertNotNull(payload.getTenant());
        assertNotNull(payload.getVariantId());
        assertNotNull(payload.getBarcode());
    }

    @Test
    void testQrPngGeneration() {
        ProductVariant variant = createVariantWithBarcode("QR-1", "INT1000001000030");
        byte[] qrPng = qrLabelService.generateQrPng(tenant.getId(), variant.getId(), 300, 300);
        assertNotNull(qrPng);
        assertTrue(qrPng.length > 100);
    }

    @Test
    void testQrLabelPdfGeneration() {
        ProductVariant variant = createVariantWithBarcode("QRPDF-1", "INT1000001000031");
        byte[] pdf = qrLabelService.generateQrLabelPdf(tenant.getId(), variant.getId(), 2, null);
        assertNotNull(pdf);
        assertTrue(pdf.length > 100);
    }

    @Test
    void testQrLabelPdfExceedsMax() {
        ProductVariant variant = createVariantWithBarcode("QRPDF-2", "INT1000001000032");
        assertThrows(com.animasys.core.exception.BusinessRuleException.class,
                () -> qrLabelService.generateQrLabelPdf(tenant.getId(), variant.getId(), 999, null));
    }

    @Test
    void testQrLabelZplGeneration() {
        ProductVariant variant = createVariantWithBarcode("QRZPL-1", "INT1000001000033");
        String zpl = qrLabelService.generateQrLabelZpl(tenant.getId(), variant.getId(), 1, null);
        assertNotNull(zpl);
        assertTrue(zpl.contains("^XA"));
        assertTrue(zpl.contains("^XZ"));
        assertTrue(zpl.contains("^BQ")); // QR code ZPL command
    }

    @Test
    void testQrPayloadRequiresBarcode() {
        ProductVariant variant = createVariantWithBarcode("QR-NOBAR", null);
        variant.setBarcode(null);
        variantRepository.save(variant);

        assertThrows(com.animasys.core.exception.BusinessRuleException.class,
                () -> qrLabelService.buildQrPayload(tenant.getId(), variant.getId()));
    }

    // ── New tests: Tenant isolation ─────────────────────────────────────────

    @Test
    void testTenantIsolationOnBarcodeGeneration() {
        Tenant otherTenant = tenantRepository.save(Tenant.builder()
                .id("t-other-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Other Tenant")
                .subdomain("other-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
        Branch otherBranch = branchRepository.save(Branch.builder()
                .id("br-other-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(otherTenant)
                .name("Other Branch")
                .build());
        Employee otherEmployee = employeeRepository.save(Employee.builder()
                .id("e-other-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(otherTenant)
                .branch(otherBranch)
                .username("other-" + UUID.randomUUID().toString().substring(0, 6))
                .passwordHash("pass")
                .fullName("Other")
                .email("other-" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build());

        ProductVariant variant = createVariantWithBarcode("ISO-1", "INT1000001000040");

        assertThrows(Exception.class,
                () -> qrLabelService.buildQrPayload(otherTenant.getId(), variant.getId()));
    }
}
