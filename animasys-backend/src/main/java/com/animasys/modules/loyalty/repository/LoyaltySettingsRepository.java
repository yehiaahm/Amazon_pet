package com.animasys.modules.loyalty.repository;

import com.animasys.modules.loyalty.domain.LoyaltySettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltySettingsRepository extends JpaRepository<LoyaltySettings, String> {
}
