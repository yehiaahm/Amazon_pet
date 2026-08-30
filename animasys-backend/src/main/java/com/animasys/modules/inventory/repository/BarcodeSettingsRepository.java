package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.TenantBarcodeSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BarcodeSettingsRepository extends JpaRepository<TenantBarcodeSettings, String> {
}
