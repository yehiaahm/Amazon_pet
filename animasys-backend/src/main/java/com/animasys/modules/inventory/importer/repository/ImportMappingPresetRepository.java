package com.animasys.modules.inventory.importer.repository;

import com.animasys.modules.inventory.importer.domain.ImportMappingPreset;
import com.animasys.modules.inventory.importer.domain.ImportMode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ImportMappingPresetRepository extends JpaRepository<ImportMappingPreset, String> {

    List<ImportMappingPreset> findByTenantIdAndImportModeOrderByNameAsc(String tenantId, ImportMode importMode);

    Optional<ImportMappingPreset> findByIdAndTenantId(String id, String tenantId);

    Optional<ImportMappingPreset> findByTenantIdAndNameAndImportMode(String tenantId, String name, ImportMode importMode);
}
