package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.importer.domain.ImportMappingPreset;
import com.animasys.modules.inventory.importer.domain.ImportMode;
import com.animasys.modules.inventory.importer.dto.ImportMappingPresetDTO;
import com.animasys.modules.inventory.importer.dto.SaveImportMappingPresetRequest;
import com.animasys.modules.inventory.importer.repository.ImportMappingPresetRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Lets a tenant save a confirmed column mapping and reuse it on a later upload instead of
 * re-picking columns, as long as the mapping still applies (secondary to the reconciliation
 * feature, kept intentionally small: no versioning, no per-header fuzzy matching).
 */
@Service
@RequiredArgsConstructor
public class ImportMappingPresetService {

    private final ImportMappingPresetRepository repository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<ImportMappingPresetDTO> list(String tenantId, String modeCode) {
        ImportMode mode = parseMode(modeCode);
        return repository.findByTenantIdAndImportModeOrderByNameAsc(tenantId, mode).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public ImportMappingPresetDTO save(String tenantId, String employeeId, SaveImportMappingPresetRequest request) {
        ImportMode mode = parseMode(request.getImportMode());
        String name = request.getName().trim();
        if (name.isEmpty()) {
            throw new BusinessRuleException("اسم التخطيط مطلوب");
        }

        ImportMappingPreset preset = repository.findByTenantIdAndNameAndImportMode(tenantId, name, mode)
                .orElseGet(() -> ImportMappingPreset.builder()
                        .id("impmap-" + UUID.randomUUID().toString().substring(0, 12))
                        .tenantId(tenantId)
                        .name(name)
                        .importMode(mode)
                        .createdBy(employeeId)
                        .build());
        preset.setMapping(writeJson(request.getMapping()));
        repository.save(preset);
        return toDto(preset);
    }

    @Transactional
    public void delete(String tenantId, String presetId) {
        ImportMappingPreset preset = repository.findByIdAndTenantId(presetId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("التخطيط المحفوظ غير موجود"));
        repository.delete(preset);
    }

    private ImportMode parseMode(String modeCode) {
        try {
            return ImportMode.valueOf(modeCode);
        } catch (Exception e) {
            throw new BusinessRuleException("وضع الاستيراد غير صالح: " + modeCode);
        }
    }

    private ImportMappingPresetDTO toDto(ImportMappingPreset preset) {
        return ImportMappingPresetDTO.builder()
                .id(preset.getId())
                .name(preset.getName())
                .importMode(preset.getImportMode().name())
                .mapping(readJson(preset.getMapping()))
                .createdAt(preset.getCreatedAt())
                .build();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new BusinessRuleException("تعذر حفظ التخطيط");
        }
    }

    private Map<String, String> readJson(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return Map.of();
        }
    }
}
