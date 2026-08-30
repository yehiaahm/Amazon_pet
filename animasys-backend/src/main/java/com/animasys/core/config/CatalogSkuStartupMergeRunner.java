package com.animasys.core.config;

import com.animasys.modules.inventory.service.ProductVariantDuplicateMergeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** Replaced by {@link CatalogMigrationLifecycle} (merge before V18) plus idempotent post-boot merge. */
@Component
@Order(200)
@RequiredArgsConstructor
@Slf4j
public class CatalogSkuStartupMergeRunner implements ApplicationRunner {

    private final ProductVariantDuplicateMergeService duplicateMergeService;

    @Override
    public void run(ApplicationArguments args) {
        int remaining = duplicateMergeService.countRemainingDuplicateSkuGroups(null);
        if (remaining == 0) {
            return;
        }
        var report = duplicateMergeService.mergeAllTenants();
        log.warn("Catalog SKU startup merge corrected {} duplicate groups, clean={}",
                report.getMergedVariants().size(), report.isDatabaseClean());
    }
}
