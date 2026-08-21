package com.animasys.modules.finance.service;

import com.animasys.modules.finance.domain.AccountsPayableSettings;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AccountsPayableSettingsIntegrationTest extends IntegrationTestBase {

    @Autowired
    private AccountsPayableService accountsPayableService;

    @Autowired
    private TenantRepository tenantRepository;

    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder()
                .id(UUID.randomUUID().toString())
                .name("AP Settings Tenant")
                .subdomain("ap-" + UUID.randomUUID().toString().substring(0, 8))
                .active(true)
                .build();
        tenantRepository.save(tenant);
    }

    @Test
    void updateSettings_firstTimeForTenant_savesSuccessfully() {
        AccountsPayableSettings updated = accountsPayableService.updateSettings(tenant.getId(), 15);

        assertThat(updated.getReminderDaysBeforeDue()).isEqualTo(15);
    }
}
