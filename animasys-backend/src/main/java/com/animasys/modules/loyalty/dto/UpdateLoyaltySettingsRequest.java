package com.animasys.modules.loyalty.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.Set;

@Data
public class UpdateLoyaltySettingsRequest {
    private Boolean enabled;
    private Boolean programOpen;
    private BigDecimal earnRatePercent;
    private BigDecimal maxUsagePercent;
    private BigDecimal maxUsageAmount;
    private Boolean expirationEnabled;
    private Integer expirationMonths;
    private Set<String> eligibleCategoryIds;
    private Set<String> excludedCategoryIds;
    private Set<String> eligibleProductIds;
    private Set<String> excludedProductIds;
}
