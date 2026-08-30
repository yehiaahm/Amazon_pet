package com.animasys.modules.loyalty.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.loyalty.domain.LoyaltySettings;
import com.animasys.modules.loyalty.dto.UpdateLoyaltySettingsRequest;
import com.animasys.modules.loyalty.repository.LoyaltySettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;

@Service
@RequiredArgsConstructor
@Transactional
public class LoyaltySettingsService {

    private final LoyaltySettingsRepository settingsRepository;
    private final TenantRepository tenantRepository;

    public LoyaltySettings getSettings(String tenantId) {
        return settingsRepository.findById(tenantId).orElseGet(() -> createDefaultSettings(tenantId));
    }

    public LoyaltySettings updateSettings(String tenantId, UpdateLoyaltySettingsRequest request) {
        LoyaltySettings settings = getSettings(tenantId);

        if (request.getEarnRatePercent() != null) {
            if (request.getEarnRatePercent().compareTo(BigDecimal.ZERO) < 0
                    || request.getEarnRatePercent().compareTo(BigDecimal.valueOf(100)) > 0) {
                throw new BusinessRuleException("نسبة الكسب يجب أن تكون بين 0 و 100");
            }
            settings.setEarnRatePercent(request.getEarnRatePercent());
        }
        if (request.getMaxUsagePercent() != null) {
            settings.setMaxUsagePercent(request.getMaxUsagePercent().compareTo(BigDecimal.ZERO) < 0
                    ? BigDecimal.ZERO : request.getMaxUsagePercent());
        }
        if (request.getMaxUsageAmount() != null) {
            settings.setMaxUsageAmount(request.getMaxUsageAmount().compareTo(BigDecimal.ZERO) < 0
                    ? BigDecimal.ZERO : request.getMaxUsageAmount());
        }
        if (request.getEnabled() != null) {
            settings.setEnabled(request.getEnabled());
        }
        if (request.getProgramOpen() != null) {
            settings.setProgramOpen(request.getProgramOpen());
        }
        if (request.getExpirationEnabled() != null) {
            settings.setExpirationEnabled(request.getExpirationEnabled());
        }
        if (request.getExpirationMonths() != null) {
            if (request.getExpirationMonths() < 1) {
                throw new BusinessRuleException("مدة انتهاء الصلاحية يجب أن تكون شهرًا واحدًا على الأقل");
            }
            settings.setExpirationMonths(request.getExpirationMonths());
        }
        if (request.getEligibleCategoryIds() != null) {
            settings.setEligibleCategoryIds(new HashSet<>(request.getEligibleCategoryIds()));
        }
        if (request.getExcludedCategoryIds() != null) {
            settings.setExcludedCategoryIds(new HashSet<>(request.getExcludedCategoryIds()));
        }
        if (request.getEligibleProductIds() != null) {
            settings.setEligibleProductIds(new HashSet<>(request.getEligibleProductIds()));
        }
        if (request.getExcludedProductIds() != null) {
            settings.setExcludedProductIds(new HashSet<>(request.getExcludedProductIds()));
        }

        return settingsRepository.save(settings);
    }

    public LoyaltySettings setProgramOpen(String tenantId, boolean open) {
        LoyaltySettings settings = getSettings(tenantId);
        settings.setProgramOpen(open);
        return settingsRepository.save(settings);
    }

    private LoyaltySettings createDefaultSettings(String tenantId) {
        LoyaltySettings settings = LoyaltySettings.builder()
                .tenantId(tenantId)
                .enabled(false)
                .programOpen(true)
                .earnRatePercent(new BigDecimal("2.00"))
                .expirationEnabled(false)
                .build();
        tenantRepository.findById(tenantId).ifPresent(settings::setTenant);
        return settingsRepository.save(settings);
    }
}
