package com.animasys.modules.inventory.importer.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.domain.Supplier;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.importer.domain.*;
import com.animasys.modules.inventory.importer.dto.*;
import com.animasys.modules.inventory.importer.repository.ImportSessionItemRepository;
import com.animasys.modules.inventory.importer.repository.ImportSessionRepository;
import com.animasys.modules.inventory.repository.SupplierRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ImportSessionService {

    /**
     * Columns worth reaching for the AI provider over when the alias table and the value
     * heuristics come up short — everything the import would otherwise have to invent.
     */
    private static final Set<ImportField> ESSENTIAL_FIELDS = EnumSet.of(
            ImportField.PRODUCT_NAME, ImportField.QUANTITY, ImportField.COST_PRICE, ImportField.SELLING_PRICE);

    private final ExcelParserService excelParserService;
    private final ColumnMappingEngine columnMappingEngine;
    private final AiColumnMappingAdvisor aiColumnMappingAdvisor;
    private final ImportRowNormalizer importRowNormalizer;
    private final ImportRowValidator importRowValidator;
    private final DuplicateDetectionService duplicateDetectionService;
    private final ImportSessionWriter importSessionWriter;
    private final ImportSessionRepository importSessionRepository;
    private final ImportSessionItemRepository importSessionItemRepository;
    private final WarehouseRepository warehouseRepository;
    private final SupplierRepository supplierRepository;
    private final CategoryRepository categoryRepository;
    private final ObjectMapper objectMapper;

    /**
     * Deliberately not transactional: auto-mapping may call out to the AI provider, and
     * holding a database transaction open across a network round-trip would tie up a
     * connection for the whole timeout. Persistence happens afterwards, atomically, in
     * {@link ImportSessionWriter}.
     */
    public ImportUploadResponse upload(MultipartFile file, String tenantId, String employeeId) {
        if (file == null || file.isEmpty()) {
            throw new BusinessRuleException("لم يتم إرفاق ملف");
        }
        String fileType = excelParserService.detectFileType(file);
        ParsedFile parsed = excelParserService.parse(file);
        if (parsed.rows().isEmpty()) {
            throw new BusinessRuleException("الملف لا يحتوي على أي صفوف بيانات");
        }

        List<Map<String, String>> sample = parsed.rows().size() > ColumnMappingEngine.VALUE_SAMPLE_SIZE
                ? parsed.rows().subList(0, ColumnMappingEngine.VALUE_SAMPLE_SIZE)
                : parsed.rows();
        List<ColumnMappingSuggestion> suggestions = columnMappingEngine.suggestMapping(parsed.headers(), sample);

        boolean aiAssisted = false;
        if (hasUnresolvedEssentials(suggestions)) {
            aiAssisted = aiColumnMappingAdvisor.advise(suggestions, sample);
        }

        ImportSession session = importSessionWriter.createSession(
                tenantId, employeeId, file, fileType, parsed, writeJson(parsed.headers()));

        return ImportUploadResponse.builder()
                .sessionId(session.getId())
                .fileName(session.getFileName())
                .sheetName(parsed.sheetName())
                .totalRows(session.getTotalRows())
                .headers(parsed.headers())
                .suggestedMapping(suggestions)
                .aiAssisted(aiAssisted)
                .unmappedFields(unmappedEssentials(suggestions).stream().map(ImportField::code).toList())
                .build();
    }

    private boolean hasUnresolvedEssentials(List<ColumnMappingSuggestion> suggestions) {
        boolean anythingLeftToMatch = suggestions.stream().anyMatch(s -> !s.isAutoMapped());
        if (!anythingLeftToMatch) {
            return false;
        }
        return !unmappedEssentials(suggestions).isEmpty() || !hasIdentifier(mappedFields(suggestions));
    }

    private Set<ImportField> unmappedEssentials(List<ColumnMappingSuggestion> suggestions) {
        Set<ImportField> mapped = mappedFields(suggestions);
        return ESSENTIAL_FIELDS.stream().filter(f -> !mapped.contains(f))
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(ImportField.class)));
    }

    private Set<ImportField> mappedFields(List<ColumnMappingSuggestion> suggestions) {
        Set<ImportField> mapped = EnumSet.noneOf(ImportField.class);
        suggestions.stream().filter(ColumnMappingSuggestion::isAutoMapped)
                .map(ColumnMappingSuggestion::getField).filter(Objects::nonNull).forEach(mapped::add);
        return mapped;
    }

    private static boolean hasIdentifier(Set<ImportField> fields) {
        return fields.stream().anyMatch(ImportField::isIdentifier);
    }

    @Transactional
    public ImportMappingResponse confirmMapping(String sessionId, String tenantId, ColumnMappingRequest request) {
        ImportSession session = getOwnedSession(sessionId, tenantId);

        Map<String, ImportField> headerToField = new LinkedHashMap<>();
        if (request.getMapping() != null) {
            request.getMapping().forEach((header, code) -> {
                ImportField field = ImportField.fromCode(code);
                if (field != null) {
                    headerToField.put(header, field);
                }
            });
        }
        Set<ImportField> mappedFields = headerToField.isEmpty()
                ? EnumSet.noneOf(ImportField.class)
                : EnumSet.copyOf(headerToField.values());
        // The only genuinely blocking condition: nothing in the file identifies a product.
        // Missing quantity/price columns are handled per row as warnings with a 0 default,
        // so a partially-recognized file still reaches the preview instead of being rejected.
        if (!hasIdentifier(mappedFields)) {
            throw new BusinessRuleException(
                    "تعذر التعرف على عمود يحدد المنتج (اسم المنتج أو SKU أو الباركود) — افتح شاشة ربط الأعمدة لاختياره يدويًا");
        }

        ImportValidationContext ctx = ImportValidationContext.builder()
                .existingWarehouseNamesNormalized(warehouseRepository.findByTenantId(tenantId).stream()
                        .map(Warehouse::getName).filter(Objects::nonNull)
                        .map(HeaderNormalizer::normalize).collect(Collectors.toSet()))
                .existingSupplierNamesNormalized(supplierRepository.findByTenantId(tenantId).stream()
                        .map(Supplier::getName).filter(Objects::nonNull)
                        .map(HeaderNormalizer::normalize).collect(Collectors.toSet()))
                .existingCategoryNamesNormalized(categoryRepository.findByTenantId(tenantId).stream()
                        .map(Category::getName).filter(Objects::nonNull)
                        .map(HeaderNormalizer::normalize).collect(Collectors.toSet()))
                .mappedFields(mappedFields)
                .autoCreateSupplier(request.isAutoCreateSupplier())
                .priceBelowCostIsWarningOnly(request.isPriceBelowCostIsWarningOnly())
                .build();

        DuplicateDetectionService.CatalogIndex catalogIndex = duplicateDetectionService.buildIndex(tenantId);

        List<ImportSessionItem> items = importSessionItemRepository.findBySessionIdOrderByRowNumberAsc(sessionId);

        List<Map<ImportField, String>> mappedRows = new ArrayList<>();
        for (ImportSessionItem item : items) {
            mappedRows.add(importRowNormalizer.normalize(mapRow(readJsonMap(item.getRawData()), headerToField)));
        }
        Map<Integer, String> barcodeConflicts = duplicateDetectionService.findIntraFileBarcodeConflicts(mappedRows);
        Map<Integer, String> skuConflicts = duplicateDetectionService.findIntraFileDuplicateSkus(mappedRows);

        int newRows = 0, updateRows = 0, duplicateRows = 0, errorRows = 0, warningRows = 0;
        for (int i = 0; i < items.size(); i++) {
            ImportSessionItem item = items.get(i);
            Map<ImportField, String> mapped = mappedRows.get(i);

            RowValidationResult validation = importRowValidator.validate(mapped, ctx);
            if (barcodeConflicts.containsKey(i)) {
                validation.getWarnings().add(new ValidationIssue(ImportField.BARCODE.code(), barcodeConflicts.get(i)));
            }
            if (skuConflicts.containsKey(i)) {
                validation.getWarnings().add(new ValidationIssue(ImportField.SKU.code(), skuConflicts.get(i)));
            }

            item.setMappedData(writeJson(MappedDataCodec.toStringKeyed(mapped)));
            item.setValidationErrors(writeJson(validation.getErrors()));
            item.setWarnings(writeJson(validation.getWarnings()));
            if (!validation.getWarnings().isEmpty()) {
                warningRows++;
            }

            if (validation.hasErrors()) {
                item.setStatus(ImportRowStatus.ERROR);
                errorRows++;
            } else {
                DuplicateMatch match = duplicateDetectionService.findMatch(catalogIndex, mapped);
                if (match != null) {
                    item.setStatus(ImportRowStatus.DUPLICATE);
                    item.setDuplicateMatchType(match.getMatchType());
                    item.setDuplicateProductId(match.getProductId());
                    item.setResolution(parseDefaultResolution(session.getDuplicateStrategyDefault()));
                    duplicateRows++;
                } else {
                    item.setStatus(ImportRowStatus.NEW);
                    newRows++;
                }
            }
        }
        importSessionItemRepository.saveAll(items);

        session.setColumnMapping(writeJson(request.getMapping()));
        session.setStatus(ImportSessionStatus.MAPPED);
        session.setNewRows(newRows);
        session.setUpdateRows(updateRows);
        session.setDuplicateRows(duplicateRows);
        session.setErrorRows(errorRows);
        importSessionRepository.save(session);

        return ImportMappingResponse.builder()
                .sessionId(sessionId)
                .totalRows(session.getTotalRows())
                .newRows(newRows)
                .updateRows(updateRows)
                .duplicateRows(duplicateRows)
                .errorRows(errorRows)
                .warningRows(warningRows)
                .build();
    }

    @Transactional(readOnly = true)
    public Page<ImportPreviewRow> preview(String sessionId, String tenantId, String statusFilter, String search, Pageable pageable) {
        getOwnedSession(sessionId, tenantId);
        ImportRowStatus status = null;
        if (statusFilter != null && !statusFilter.isBlank()) {
            try {
                status = ImportRowStatus.valueOf(statusFilter.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new BusinessRuleException("قيمة الحالة غير صالحة: " + statusFilter);
            }
        }
        String normalizedSearch = (search == null || search.isBlank()) ? null : search.trim();
        Page<ImportSessionItem> page = importSessionItemRepository.search(sessionId, status, normalizedSearch, pageable);
        return page.map(this::toPreviewRow);
    }

    @Transactional
    public void resolveDuplicates(String sessionId, String tenantId, DuplicateResolutionRequest request) {
        getOwnedSession(sessionId, tenantId);
        DuplicateResolution resolution;
        try {
            resolution = DuplicateResolution.valueOf(request.getResolution());
        } catch (Exception e) {
            throw new BusinessRuleException("قيمة الحل غير صالحة: " + request.getResolution());
        }
        if (request.getItemIds() == null || request.getItemIds().isEmpty()) {
            throw new BusinessRuleException("لم يتم تحديد أي صفوف");
        }
        List<ImportSessionItem> items = importSessionItemRepository.findAllById(request.getItemIds());
        for (ImportSessionItem item : items) {
            if (!item.getSession().getId().equals(sessionId)) {
                continue;
            }
            item.setResolution(resolution);
        }
        importSessionItemRepository.saveAll(items);
    }

    private DuplicateResolution parseDefaultResolution(String raw) {
        try {
            return DuplicateResolution.valueOf(raw);
        } catch (Exception e) {
            return DuplicateResolution.SKIP;
        }
    }

    private ImportSession getOwnedSession(String sessionId, String tenantId) {
        return importSessionRepository.findByIdAndTenantId(sessionId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Import session not found"));
    }

    private Map<ImportField, String> mapRow(Map<String, String> raw, Map<String, ImportField> headerToField) {
        Map<ImportField, String> mapped = new EnumMap<>(ImportField.class);
        headerToField.forEach((header, field) -> mapped.put(field, raw.getOrDefault(header, "")));
        return mapped;
    }

    private ImportPreviewRow toPreviewRow(ImportSessionItem item) {
        Map<String, String> mapped = readJsonMap(item.getMappedData());
        List<ValidationIssue> errors = readJsonIssues(item.getValidationErrors());
        List<ValidationIssue> warnings = readJsonIssues(item.getWarnings());
        return ImportPreviewRow.builder()
                .itemId(item.getId())
                .rowNumber(item.getRowNumber())
                .status(item.getStatus().name())
                .barcode(mapped.get(ImportField.BARCODE.code()))
                .sku(mapped.get(ImportField.SKU.code()))
                .productName(mapped.get(ImportField.PRODUCT_NAME.code()))
                .brand(mapped.get(ImportField.BRAND.code()))
                .category(mapped.get(ImportField.CATEGORY.code()))
                .variant(mapped.get(ImportField.VARIANT.code()))
                .unit(mapped.get(ImportField.UNIT.code()))
                .quantity(mapped.get(ImportField.QUANTITY.code()))
                .costPrice(mapped.get(ImportField.COST_PRICE.code()))
                .sellingPrice(mapped.get(ImportField.SELLING_PRICE.code()))
                .warehouse(mapped.get(ImportField.WAREHOUSE.code()))
                .supplier(mapped.get(ImportField.SUPPLIER.code()))
                .expiryDate(mapped.get(ImportField.EXPIRY_DATE.code()))
                .batchNumber(mapped.get(ImportField.BATCH_NUMBER.code()))
                .duplicateMatchType(item.getDuplicateMatchType() != null ? item.getDuplicateMatchType().name() : null)
                .resolution(item.getResolution() != null ? item.getResolution().name() : null)
                .errors(errors.stream().map(ValidationIssue::getMessage).collect(Collectors.toList()))
                .warnings(warnings.stream().map(ValidationIssue::getMessage).collect(Collectors.toList()))
                .build();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new BusinessRuleException("تعذر معالجة بيانات الصف");
        }
    }

    private Map<String, String> readJsonMap(String json) {
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

    private List<ValidationIssue> readJsonIssues(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<>() {
            });
        } catch (Exception e) {
            return List.of();
        }
    }
}
