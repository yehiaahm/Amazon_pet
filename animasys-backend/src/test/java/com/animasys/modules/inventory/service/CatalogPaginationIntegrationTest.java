package com.animasys.modules.inventory.service;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogPageResponse;
import com.animasys.modules.inventory.dto.CatalogPageDtos.CatalogSearchCriteria;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.support.IntegrationTestBase;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class CatalogPaginationIntegrationTest extends IntegrationTestBase {

    @Autowired private CatalogQueryService catalogQueryService;
    @Autowired private ProductVariantRepository variantRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;

    private Tenant tenant;
    private Employee owner;
    private Category category;

    @BeforeEach
    void setUp() {
        tenant = tenantRepository.save(Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("Catalog Page Tenant")
                .subdomain("cp-" + UUID.randomUUID().toString().substring(0, 6))
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
                .username("cp-" + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Owner CP")
                .email("cp-" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build());
        category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("General")
                .build());
        authenticate(owner);
    }

    @Test
    void paginatedSearchReturnsBoundedPayload() throws Exception {
        String prefix = seedVariants(120);

        Runtime.getRuntime().gc();
        long heapBeforeMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);

        long legacyStart = System.nanoTime();
        int legacyRows = variantRepository.findAllByTenantIdWithProduct(tenant.getId()).size();
        long legacyMs = (System.nanoTime() - legacyStart) / 1_000_000;
        CatalogPageResponse legacyShape = catalogQueryService.search(tenant.getId(), CatalogSearchCriteria.builder()
                .page(0).size(100).sort("sku,asc").build());
        CatalogPageResponse legacyTail = catalogQueryService.search(tenant.getId(), CatalogSearchCriteria.builder()
                .page(1).size(100).sort("sku,asc").build());
        int legacyPayloadBytes = new ObjectMapper().writeValueAsBytes(legacyShape).length
                + new ObjectMapper().writeValueAsBytes(legacyTail).length;

        long pageStart = System.nanoTime();
        CatalogPageResponse page = catalogQueryService.search(tenant.getId(), CatalogSearchCriteria.builder()
                .page(0)
                .size(50)
                .sort("sku,asc")
                .build());
        long pageMs = (System.nanoTime() - pageStart) / 1_000_000;

        int payloadBytes = new ObjectMapper().writeValueAsBytes(page).length;

        assertThat(legacyRows).isEqualTo(120);
        assertThat(page.getContent()).hasSize(50);
        assertThat(page.getTotalElements()).isEqualTo(120);
        assertThat(page.getTotalPages()).isEqualTo(3);
        assertThat(payloadBytes).isLessThan(500_000);
        assertThat(pageMs).isLessThan(2000);

        CatalogPageResponse searchPage = catalogQueryService.search(tenant.getId(), CatalogSearchCriteria.builder()
                .page(0)
                .size(20)
                .search("ITEM-" + prefix + "-00099")
                .build());
        assertThat(searchPage.getTotalElements()).isEqualTo(1);
        assertThat(searchPage.getContent().get(0).getSku()).contains("099");

        Runtime.getRuntime().gc();
        long heapAfterMb = Runtime.getRuntime().totalMemory() / (1024 * 1024);

        System.out.printf(
                "MEASURE legacyRows=%d legacyMs=%d legacyPayloadBytes=%d pageMs=%d payloadBytes=%d heapBeforeMb=%d heapAfterMb=%d totalElements=%d%n",
                legacyRows, legacyMs, legacyPayloadBytes, pageMs, payloadBytes, heapBeforeMb, heapAfterMb, page.getTotalElements());
    }

    private String seedVariants(int count) {
        String prefix = UUID.randomUUID().toString().substring(0, 8);
        for (int i = 0; i < count; i++) {
            Product product = productRepository.save(Product.builder()
                    .id(UUID.randomUUID().toString())
                    .tenant(tenant)
                    .sku("ITEM-" + prefix + "-" + String.format("%05d", i))
                    .name("Product " + i)
                    .category(category)
                    .minStockLimit(5)
                    .build());
            variantRepository.save(ProductVariant.builder()
                    .id(UUID.randomUUID().toString())
                    .product(product)
                    .tenantId(tenant.getId())
                    .sku(product.getSku())
                    .name("Standard")
                    .price(BigDecimal.valueOf(10 + i))
                    .cost(BigDecimal.ONE)
                    .stockQuantity(i % 20)
                    .build());
        }
        return prefix;
    }
}
