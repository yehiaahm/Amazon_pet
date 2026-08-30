package com.animasys.modules.inventory.controller;

import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.dto.SkuDuplicateMergeReport;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.service.ProductVariantDuplicateMergeService;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CatalogAdminTenantIsolationIntegrationTest extends IntegrationTestBase {

    @Autowired private CatalogAdminController catalogAdminController;
    @Autowired private ProductVariantDuplicateMergeService duplicateMergeService;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private ProductRepository productRepository;
    @Autowired private ProductVariantRepository variantRepository;

    private Tenant tenantA;
    private Tenant tenantB;
    private Employee employeeA;
    private String skuA;
    private String skuB;

    @BeforeEach
    void seedTenants() {
        tenantA = saveTenant("iso-a");
        tenantB = saveTenant("iso-b");
        employeeA = saveOwner(tenantA, "owner-a");
        saveOwner(tenantB, "owner-b");

        skuA = "SKU-A-" + UUID.randomUUID().toString().substring(0, 8);
        skuB = "SKU-B-" + UUID.randomUUID().toString().substring(0, 8);
        seedProduct(tenantA, skuA);
        seedProduct(tenantB, skuB);

        bootstrapTenantRoles(tenantA);
        bootstrapTenantRoles(tenantB);
        authenticate(employeeA);
    }

    @Test
    void previewViaControllerReturnsOnlyAuthenticatedTenantDuplicates() {
        ResponseEntity<?> response = catalogAdminController.previewDuplicateSkus();
        SkuDuplicateMergeReport report = extractReport(response);

        assertThat(report.getDuplicateGroupsFound())
                .allMatch(g -> tenantA.getId().equals(g.getTenantId()));
        assertThat(report.getDuplicateGroupsFound())
                .noneMatch(g -> tenantB.getId().equals(g.getTenantId()));
    }

    @Test
    void previewServiceRejectsCrossTenantAccess() {
        assertThrows(AccessDeniedException.class,
                () -> duplicateMergeService.previewDuplicates(tenantB.getId()));
    }

    @Test
    void mergeServiceRejectsCrossTenantAccess() {
        int productsBefore = productRepository.findByTenantId(tenantB.getId()).size();
        assertThrows(AccessDeniedException.class,
                () -> duplicateMergeService.mergeTenant(tenantB.getId()));
        assertThat(productRepository.findByTenantId(tenantB.getId())).hasSize(productsBefore);
    }

    @Test
    void mergeViaControllerAffectsOnlyAuthenticatedTenant() {
        String tenantBSkuBefore = productRepository.findByTenantId(tenantB.getId()).get(0).getSku();

        catalogAdminController.mergeDuplicateSkus();

        assertThat(productRepository.findByTenantId(tenantB.getId()).get(0).getSku())
                .isEqualTo(tenantBSkuBefore);
        assertThat(productRepository.findByTenantId(tenantA.getId())).hasSize(1);
    }

    @Test
    void previewDoesNotEnumerateOtherTenants() {
        SkuDuplicateMergeReport report = duplicateMergeService.previewDuplicates(tenantA.getId());

        assertThat(report.getDuplicateGroupsFound())
                .extracting(SkuDuplicateMergeReport.DuplicateVariantGroup::getTenantId)
                .doesNotContain(tenantB.getId());
        assertThat(productRepository.findByTenantId(tenantB.getId()))
                .extracting(Product::getSku)
                .containsExactly(skuB);
    }

    @Test
    void mergeAllTenantsEndpointRemoved() {
        assertThat(CatalogAdminController.class.getDeclaredMethods())
                .noneMatch(m -> "mergeAllTenants".equals(m.getName()));
    }

    private Tenant saveTenant(String prefix) {
        return tenantRepository.save(Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("Tenant " + prefix)
                .subdomain(prefix + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
    }

    private Employee saveOwner(Tenant tenant, String prefix) {
        Branch branch = branchRepository.save(Branch.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("Main")
                .address("Cairo")
                .build());
        return employeeRepository.save(Employee.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .branch(branch)
                .username(prefix + UUID.randomUUID().toString().substring(0, 8))
                .passwordHash("hash")
                .fullName("Owner " + prefix)
                .email(prefix + "-" + UUID.randomUUID() + "@test.com")
                .role("OWNER")
                .active(true)
                .build());
    }

    private void seedProduct(Tenant tenant, String sku) {
        Category category = categoryRepository.save(Category.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name("General")
                .build());

        Product product = productRepository.save(Product.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .sku(sku)
                .name("Product " + sku)
                .category(category)
                .minStockLimit(1)
                .build());

        variantRepository.save(ProductVariant.builder()
                .id(UUID.randomUUID().toString())
                .product(product)
                .tenantId(tenant.getId())
                .name("Standard")
                .sku(sku)
                .price(BigDecimal.TEN)
                .cost(BigDecimal.ONE)
                .stockQuantity(1)
                .build());
    }

    @SuppressWarnings("unchecked")
    private SkuDuplicateMergeReport extractReport(ResponseEntity<?> response) {
        var body = (com.animasys.core.response.ApiResponseWrapper<SkuDuplicateMergeReport>) response.getBody();
        assertThat(body).isNotNull();
        return body.getData();
    }
}
