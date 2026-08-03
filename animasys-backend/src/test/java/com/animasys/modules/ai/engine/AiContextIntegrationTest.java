package com.animasys.modules.ai.engine;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.analytics.bre.BusinessRulesEngine;
import com.animasys.modules.analytics.kpi.KPIEngine;
import com.animasys.modules.ai.config.AiPromptLimits;
import com.animasys.modules.ai.context.AiClientContextSanitizer;
import com.animasys.modules.inventory.domain.InventoryBatch;
import com.animasys.modules.inventory.repository.InventoryBatchRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AiContextIntegrationTest extends IntegrationTestBase {

    @Autowired private BusinessContextBuilder contextBuilder;
    @Autowired private PromptBuilder promptBuilder;
    @Autowired private KPIEngine kpiEngine;
    @Autowired private BusinessRulesEngine rulesEngine;
    @Autowired private SaleRepository saleRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private POSSessionRepository posSessionRepository;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private InventoryBatchRepository batchRepository;

    private Tenant tenant;
    private Employee owner;
    private POSSession posSession;
    private Customer customer;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("AI Context Tenant")
                .subdomain("ai-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
        bootstrapTenantRoles(tenant);
        Branch branch = branchRepository.save(Branch.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Main")
                .address("Cairo")
                .build());
        owner = employeeRepository.save(Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username("ai-" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("AI Owner")
                .email("ai-" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build());
        posSession = posSessionRepository.save(POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(owner)
                .openedAt(Instant.now())
                .openingBalance(BigDecimal.TEN)
                .status("OPEN")
                .build());
        customer = customerRepository.save(Customer.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("AI Customer")
                .phone("0100000001")
                .build());
        authenticate(owner);
        seedCatalog();
    }

    @Test
    @Transactional
    void contextUsesSqlNotFullSaleLoad() {
        seedSales(400);

        Runtime.getRuntime().gc();
        long heapBeforeMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);

        long legacyStart = System.nanoTime();
        var legacySales = saleRepository.findByTenantId(tenant.getId());
        long legacyMs = (System.nanoTime() - legacyStart) / 1_000_000;
        int legacyPromptBytes = buildLegacySalesSection(legacySales).getBytes(StandardCharsets.UTF_8).length;

        long headStart = System.nanoTime();
        String headContext = buildHeadBaselineContext(tenant.getId());
        long headMs = (System.nanoTime() - headStart) / 1_000_000;
        int headContextBytes = headContext.getBytes(StandardCharsets.UTF_8).length;
        int headInsightsPromptBytes = promptBuilder.assembleInsightsPrompt(headContext)
                .getBytes(StandardCharsets.UTF_8).length;

        long sqlStart = System.nanoTime();
        String context = contextBuilder.buildContextString(tenant.getId());
        long sqlMs = (System.nanoTime() - sqlStart) / 1_000_000;

        Runtime.getRuntime().gc();
        long heapAfterMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);
        int promptBytes = context.getBytes(StandardCharsets.UTF_8).length;
        int insightsPromptBytes = promptBuilder.assembleInsightsPrompt(context)
                .getBytes(StandardCharsets.UTF_8).length;

        assertThat(legacySales.size()).isGreaterThan(100);
        assertThat(context).contains("ذكاء المبيعات", "ملخص المخزون", "المؤشرات المالية");
        assertThat(promptBytes).isLessThan(AiPromptLimits.AI_PROMPT_MAX_CONTEXT_BYTES);
        assertThat(hasSaleRepositoryField()).isFalse();
        assertThat(hasBreEntityLoaderFields()).isFalse();

        System.out.printf(
                "MEASURE legacyRows=%d legacyMs=%d legacySalesSectionBytes=%d headMs=%d headContextBytes=%d headInsightsPromptBytes=%d sqlMs=%d contextBytes=%d insightsPromptBytes=%d heapBeforeMb=%d heapAfterMb=%d%n",
                legacySales.size(), legacyMs, legacyPromptBytes, headMs, headContextBytes, headInsightsPromptBytes,
                sqlMs, promptBytes, insightsPromptBytes, heapBeforeMb, heapAfterMb);
    }

    @Test
    @Transactional
    void clientContextTruncationAndBreSqlAlerts() {
        seedSales(50);
        seedExpiringBatch();

        long breStart = System.nanoTime();
        var alerts = rulesEngine.evaluateBusinessRules(tenant.getId());
        long breMs = (System.nanoTime() - breStart) / 1_000_000;

        String longClient = "z".repeat(AiPromptLimits.AI_PROMPT_MAX_CLIENT_CONTEXT + 200);
        String context = contextBuilder.buildContextString(tenant.getId(), longClient);
        int contextBytes = context.getBytes(StandardCharsets.UTF_8).length;
        int insightsPromptBytes = promptBuilder.assembleInsightsPrompt(context)
                .getBytes(StandardCharsets.UTF_8).length;

        String sanitized = AiClientContextSanitizer.sanitize(longClient);
        assertThat(sanitized).isNotNull();
        assertThat(sanitized.length()).isLessThanOrEqualTo(AiPromptLimits.AI_PROMPT_MAX_CLIENT_CONTEXT);
        assertThat(context).contains(AiPromptLimits.CLIENT_CONTEXT_TRUNCATED_SUFFIX);
        assertThat(contextBytes).isLessThan(AiPromptLimits.AI_PROMPT_MAX_CONTEXT_BYTES);
        assertThat(insightsPromptBytes).isLessThan(AiPromptLimits.AI_PROMPT_MAX_CONTEXT_BYTES + 5_000);
        assertThat(alerts).anyMatch(a -> "تنبيه_مخزون_منخفض".equals(a.get("rule")));
        assertThat(alerts).anyMatch(a -> "تحذير_انتهاء_صلاحية_الدفعة".equals(a.get("rule")));
        assertThat(hasBreEntityLoaderFields()).isFalse();

        Runtime.getRuntime().gc();
        long heapMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);
        System.out.printf(
                "MEASURE breMs=%d contextBytes=%d insightsPromptBytes=%d clientContextLen=%d heapMb=%d alerts=%d%n",
                breMs, contextBytes, insightsPromptBytes, sanitized.length(), heapMb, alerts.size());
    }

    private boolean hasBreEntityLoaderFields() {
        return Arrays.stream(BusinessRulesEngine.class.getDeclaredFields())
                .map(Field::getType)
                .anyMatch(t -> {
                    String name = t.getSimpleName();
                    return name.equals("CatalogQueryService") || name.equals("InventoryBatchRepository");
                });
    }

    private void seedExpiringBatch() {
        ProductVariant variant = variantRepository.findAll().stream()
                .filter(v -> tenant.getId().equals(v.getTenantId()))
                .findFirst()
                .orElseThrow();
        batchRepository.save(InventoryBatch.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenant.getId())
                .productVariant(variant)
                .batchNumber("BRE-BATCH-" + UUID.randomUUID().toString().substring(0, 6))
                .unitCost(BigDecimal.ONE)
                .initialQuantity(10)
                .remainingQuantity(5)
                .purchaseDate(Instant.now())
                .expiryDate(java.time.LocalDate.now().plusDays(15))
                .status(InventoryBatch.BatchStatus.ACTIVE)
                .build());
    }

    /** Benchmark-only: pre-6.0C committed context shape (KPIs + alerts, no SQL sales/inventory sections). */
    private String buildHeadBaselineContext(String tenantId) {
        var kpis = kpiEngine.calculateKPIMetrics(tenantId);
        var alerts = rulesEngine.evaluateBusinessRules();
        StringBuilder sb = new StringBuilder();
        sb.append("--- بيانات سياق الأعمال ---\n");
        sb.append("المؤشرات المالية الرئيسية (KPIs):\n");
        kpis.forEach((k, v) -> sb.append("- ").append(k).append(": ").append(v).append("\n"));
        sb.append("\nتنبيهات المخاطر التشغيلية:\n");
        if (alerts.isEmpty()) {
            sb.append("- لا توجد مخاطر فورية مرصودة من محرك قواعد الأعمال.\n");
        } else {
            alerts.forEach(alert -> sb.append("- [").append(alert.get("rule")).append("] ")
                    .append("الخطورة: ").append(alert.get("severity")).append(" | الرسالة: ")
                    .append(alert.get("message")).append("\n"));
        }
        sb.append("--- نهاية بيانات السياق ---\n");
        return sb.toString();
    }

    /** Benchmark-only: reproduces pre-6.0C JVM aggregation for measurement. */
    private String buildLegacySalesSection(List<Sale> sales) {
        StringBuilder sb = new StringBuilder();
        java.math.BigDecimal rev30 = java.math.BigDecimal.ZERO;
        java.util.Map<String, java.math.BigDecimal> items = new java.util.HashMap<>();
        for (Sale sale : sales) {
            if (sale.getStatus() != null && !"COMPLETED".equalsIgnoreCase(sale.getStatus())) continue;
            java.math.BigDecimal rev = sale.getTotalAmount();
            rev30 = rev30.add(rev);
            if (sale.getItems() != null) {
                for (SaleItem item : sale.getItems()) {
                    String key = item.getName();
                    items.merge(key, item.getPrice(), java.math.BigDecimal::add);
                }
            }
        }
        sb.append("legacy-sales-section revenue=").append(rev30)
                .append(" items=").append(items.size())
                .append(" sales=").append(sales.size());
        return sb.toString();
    }

    private boolean hasSaleRepositoryField() {
        return Arrays.stream(BusinessContextBuilder.class.getDeclaredFields())
                .map(Field::getType)
                .anyMatch(t -> t.getSimpleName().equals("SaleRepository"));
    }

    private void seedCatalog() {
        Category category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("General")
                .build());
        for (int i = 0; i < 5; i++) {
            Product product = productRepository.save(Product.builder()
                    .id(UUID.randomUUID().toString())
                    .tenant(tenant)
                    .sku("AI-P-" + UUID.randomUUID().toString().substring(0, 8))
                    .name("AI Product " + i)
                    .category(category)
                    .minStockLimit(10)
                    .build());
            variantRepository.save(ProductVariant.builder()
                    .id(UUID.randomUUID().toString())
                    .product(product)
                    .tenantId(tenant.getId())
                    .sku(product.getSku())
                    .name("Standard")
                    .price(BigDecimal.valueOf(20 + i))
                    .cost(BigDecimal.ONE)
                    .stockQuantity(i)
                    .build());
        }
    }

    private void seedSales(int count) {
        for (int i = 0; i < count; i++) {
            SaleItem item = SaleItem.builder()
                    .id(UUID.randomUUID().toString())
                    .type("PRODUCT")
                    .itemId("v-" + (i % 5))
                    .name("Item " + (i % 5))
                    .quantity(1)
                    .price(BigDecimal.valueOf(25))
                    .listPrice(BigDecimal.valueOf(25))
                    .cost(BigDecimal.ONE)
                    .build();
            Sale sale = Sale.builder()
                    .id(UUID.randomUUID().toString())
                    .saleNumber("AI-S-" + UUID.randomUUID())
                    .posSession(posSession)
                    .totalAmount(BigDecimal.valueOf(50))
                    .tax(BigDecimal.ONE)
                    .discount(BigDecimal.ZERO)
                    .paymentMethod(i % 2 == 0 ? "CASH" : "CARD")
                    .employee(owner)
                    .customer(customer)
                    .date(Instant.now().minus(i % 20, ChronoUnit.DAYS))
                    .status("COMPLETED")
                    .items(new ArrayList<>(List.of(item)))
                    .build();
            item.setSale(sale);
            saleRepository.save(sale);
        }
    }
}
