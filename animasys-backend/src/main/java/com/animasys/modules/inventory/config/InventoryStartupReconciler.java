package com.animasys.modules.inventory.config;

import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.service.InventoryIntegrityService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * After migrations (e.g. V12 legacy batch import), align displayed stock with batch totals.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class InventoryStartupReconciler implements ApplicationRunner {

    private final TenantRepository tenantRepository;
    private final InventoryIntegrityService inventoryIntegrityService;

    @Override
    public void run(ApplicationArguments args) {
        for (Tenant tenant : tenantRepository.findAll()) {
            try {
                var result = inventoryIntegrityService.reconcileTenant(tenant.getId());
                int fixed = (int) result.getOrDefault("variantsResynced", 0);
                if (fixed > 0) {
                    log.warn("Startup inventory reconcile for tenant {} fixed {} variant(s)", tenant.getId(), fixed);
                }
            } catch (Exception ex) {
                log.error("Startup inventory reconcile failed for tenant {}: {}", tenant.getId(), ex.getMessage());
            }
        }
    }
}
