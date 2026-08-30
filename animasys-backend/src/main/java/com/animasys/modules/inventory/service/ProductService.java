package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Brand;
import com.animasys.modules.inventory.domain.Category;
import com.animasys.modules.inventory.domain.Product;
import com.animasys.modules.inventory.domain.ProductVariant;
import jakarta.persistence.EntityManager;
import com.animasys.modules.inventory.domain.Supplier;
import com.animasys.modules.inventory.dto.CreateProductRequest;
import com.animasys.modules.inventory.dto.UpdateProductRequest;
import com.animasys.modules.inventory.repository.SupplierRepository;
import com.animasys.modules.inventory.repository.BrandRepository;
import com.animasys.modules.inventory.repository.CategoryRepository;
import com.animasys.modules.inventory.repository.ProductRepository;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import com.animasys.modules.inventory.domain.BarcodeFormat;
import com.animasys.modules.inventory.domain.BarcodeHistory;
import com.animasys.modules.inventory.domain.BarcodeSource;
import com.animasys.modules.inventory.domain.BarcodeStatus;
import com.animasys.modules.inventory.domain.TemplateStyle;
import com.animasys.modules.inventory.domain.TenantBarcodeSettings;
import com.animasys.modules.inventory.repository.BarcodeSettingsRepository;
import com.animasys.modules.inventory.repository.BarcodeHistoryRepository;
import com.animasys.modules.inventory.barcode.BarcodeGeneratorService;
import com.animasys.modules.inventory.barcode.BarcodeImageService;
import com.animasys.modules.inventory.barcode.LabelTemplateService;
import com.animasys.modules.inventory.barcode.PdfLabelService;
import com.animasys.modules.inventory.barcode.ZplLabelService;
import com.animasys.modules.inventory.barcode.LabelPrintData;
import com.animasys.modules.inventory.barcode.LabelLayout;
import com.animasys.modules.inventory.dto.BulkPrintRequestItem;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.EmployeeRepository;

@Service
@RequiredArgsConstructor
@Transactional
public class ProductService {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final TenantRepository tenantRepository;
    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final SupplierRepository supplierRepository;
    private final FifoCostingService fifoCostingService;
    private final SkuCatalogService skuCatalogService;
    private final CatalogPersistenceService catalogPersistenceService;
    private final CatalogQueryService catalogQueryService;
    private final EntityManager entityManager;

    private final BarcodeSettingsRepository barcodeSettingsRepository;
    private final BarcodeHistoryRepository barcodeHistoryRepository;
    private final BarcodeGeneratorService barcodeGeneratorService;
    private final BarcodeImageService barcodeImageService;
    private final ZplLabelService zplLabelService;
    private final PdfLabelService pdfLabelService;
    private final EmployeeRepository employeeRepository;

    public Map<String, Object> createProductFromRequest(String tenantId, CreateProductRequest request) {
        if (request.getSku() == null || request.getSku().isBlank()) {
            throw new BusinessRuleException("كود SKU مطلوب");
        }
        if (request.getProductName() == null || request.getProductName().isBlank()) {
            throw new BusinessRuleException("اسم المنتج مطلوب");
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));

        Optional<Product> existing = productRepository.findBySkuIgnoreCaseAndTenantId(request.getSku().trim(), tenantId);
        if (existing.isEmpty() && !request.isAllowDuplicateName()) {
            // Same product re-entered under a different/new SKU (e.g. a second purchase at a
            // new cost) must land on the SAME catalog row, not fragment stock/FIFO across two —
            // route it to the existing product by name instead of minting a duplicate. Skipped
            // when the caller already confirmed this is intentionally a distinct product (e.g.
            // import's per-row "create new anyway" duplicate resolution).
            List<Product> nameMatches = productRepository.findByNameIgnoreCaseAndTenantId(request.getProductName().trim(), tenantId);
            if (!nameMatches.isEmpty()) {
                existing = Optional.of(nameMatches.get(0));
            }
        }
        if (existing.isPresent()) {
            Product product = existing.get();
            product.setName(request.getProductName().trim());
            product.setMinStockLimit(Math.max(0, request.getMinStockLimit()));
            product.setReorderLevel(Math.max(0, request.getReorderLevel()));
            Brand brand = resolveBrand(tenant, request);
            if (brand != null) {
                product.setBrand(brand);
            }
            Supplier supplier = resolveSupplier(tenant, request);
            if (supplier != null) {
                product.setSupplier(supplier);
            }
            Category category = resolveCategory(tenant, request);
            product.setCategory(category);
            product = productRepository.saveAndFlush(product);

            ProductVariant variant = skuCatalogService.updateOrCreateSingleVariant(
                    product,
                    request.getVariantName(),
                    request.getPrice(),
                    request.getCost()
            );
            applyWholesalePrice(variant, request.getWholesalePrice());
            variant = catalogPersistenceService.saveVariant(variant);
            addOpeningStockIfNeeded(tenantId, request, product, variant);
            assignBarcodeToVariant(tenantId, variant, request.getBarcode(), request.getBarcodeFormat());
            return buildProductResponse(product, variant);
        }

        // Neither SKU nor name matched (or the caller explicitly confirmed a distinct
        // product) — this is genuinely a new product.
        Category category = resolveCategory(tenant, request);
        Brand brand = resolveBrand(tenant, request);
        Supplier supplier = resolveSupplier(tenant, request);

        Product product = Product.builder()
                .id("p-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .sku(request.getSku().trim())
                .name(request.getProductName().trim())
                .category(category)
                .brand(brand)
                .supplier(supplier)
                .minStockLimit(Math.max(0, request.getMinStockLimit()))
                .reorderLevel(Math.max(0, request.getReorderLevel()))
                .build();
        product = productRepository.saveAndFlush(product);

        ProductVariant variant = skuCatalogService.updateOrCreateSingleVariant(
                product,
                request.getVariantName(),
                request.getPrice(),
                request.getCost()
        );
        applyWholesalePrice(variant, request.getWholesalePrice());
        variant = catalogPersistenceService.saveVariant(variant);

        addOpeningStockIfNeeded(tenantId, request, product, variant);
        assignBarcodeToVariant(tenantId, variant, request.getBarcode(), request.getBarcodeFormat());
        return buildProductResponse(product, variant);
    }

    private void addOpeningStockIfNeeded(String tenantId, CreateProductRequest request, Product product, ProductVariant variant) {
        if (request.getInitialStock() <= 0) {
            return;
        }
        String employeeId;
        try {
            employeeId = com.animasys.core.security.SecurityUtils.requireEmployeeId();
        } catch (Exception ignored) {
            employeeId = "e-1";
        }
        BigDecimal unitCost = request.getCost() != null ? request.getCost() : BigDecimal.ZERO;
        fifoCostingService.createOpeningBatch(
                tenantId,
                StockService.DEFAULT_SALES_WAREHOUSE,
                variant.getId(),
                unitCost,
                request.getInitialStock(),
                null,
                "OPENING-" + product.getSku(),
                employeeId
        );
    }

    private Map<String, Object> buildProductResponse(Product product, ProductVariant variant) {
        Map<String, Object> result = new HashMap<>();
        result.put("id", product.getId());
        result.put("sku", product.getSku());
        result.put("name", product.getName());
        if (product.getCategory() != null) {
            result.put("categoryId", product.getCategory().getId());
        }
        result.put("brandId", product.getBrand() != null ? product.getBrand().getId() : "");
        result.put("unitId", "");
        result.put("minStockLimit", product.getMinStockLimit());
        result.put("reorderLevel", product.getReorderLevel());
        if (product.getCategory() != null) {
            result.put("categoryName", product.getCategory().getName());
        }
        if (product.getBrand() != null) {
            result.put("brandName", product.getBrand().getName());
        }
        if (product.getSupplier() != null) {
            result.put("supplierId", product.getSupplier().getId());
            result.put("supplierName", product.getSupplier().getName());
        }
        result.put("variantId", variant.getId());
        result.put("variantName", variant.getName());
        result.put("price", variant.getPrice());
        result.put("cost", variant.getCost());
        result.put("wholesalePrice", variant.getWholesalePrice());
        result.put("stockQuantity", variant.getStockQuantity());
        result.put("barcode", variant.getBarcode());
        result.put("barcodeFormat", variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : null);
        result.put("barcodeSource", variant.getBarcodeSource() != null ? variant.getBarcodeSource().name() : null);
        result.put("barcodeGenerated", variant.getBarcodeGenerated());
        return result;
    }

    private Category resolveCategory(Tenant tenant, CreateProductRequest request) {
        if (request.getCategoryId() != null && !request.getCategoryId().isBlank()
                && !"c-1".equals(request.getCategoryId()) && !"default".equalsIgnoreCase(request.getCategoryId())) {
            return categoryRepository.findById(request.getCategoryId())
                    .orElseGet(() -> findOrCreateCategory(request.getCategoryName(), tenant));
        }
        return findOrCreateCategory(request.getCategoryName(), tenant);
    }

    private Brand resolveBrand(Tenant tenant, CreateProductRequest request) {
        if (request.getBrandName() == null || request.getBrandName().isBlank()) {
            return null;
        }
        return findOrCreateBrand(request.getBrandName().trim(), tenant);
    }

    private Supplier resolveSupplier(Tenant tenant, CreateProductRequest request) {
        if (request.getSupplierId() != null && !request.getSupplierId().isBlank()) {
            return supplierRepository.findById(request.getSupplierId())
                    .filter(s -> s.getTenant().getId().equals(tenant.getId()))
                    .orElse(null);
        }
        if (request.getSupplierName() == null || request.getSupplierName().isBlank()) {
            return null;
        }
        return findOrCreateSupplier(request.getSupplierName().trim(), tenant);
    }

    private Supplier findOrCreateSupplier(String name, Tenant tenant) {
        return supplierRepository.findByNameIgnoreCaseAndTenantId(name, tenant.getId())
                .orElseGet(() -> supplierRepository.save(Supplier.builder()
                        .id("sup-" + UUID.randomUUID().toString().substring(0, 8))
                        .tenant(tenant)
                        .name(name)
                        .supplierCode("SUP-" + String.format("%04d", (int) (Math.random() * 10000)))
                        .build()));
    }

    private void applyWholesalePrice(ProductVariant variant, BigDecimal wholesalePrice) {
        if (wholesalePrice != null && wholesalePrice.compareTo(BigDecimal.ZERO) >= 0) {
            variant.setWholesalePrice(wholesalePrice);
        }
    }

    private Category findOrCreateCategory(String name, Tenant tenant) {
        String categoryName = (name == null || name.isBlank()) ? "عام" : name.trim();
        return categoryRepository.findByNameIgnoreCaseAndTenantId(categoryName, tenant.getId())
                .orElseGet(() -> categoryRepository.save(Category.builder()
                        .id("cat-" + UUID.randomUUID().toString().substring(0, 8))
                        .tenant(tenant)
                        .name(categoryName)
                        .build()));
    }

    private Brand findOrCreateBrand(String name, Tenant tenant) {
        return brandRepository.findByNameIgnoreCaseAndTenantId(name, tenant.getId())
                .orElseGet(() -> brandRepository.save(Brand.builder()
                        .id("br-" + UUID.randomUUID().toString().substring(0, 8))
                        .tenant(tenant)
                        .name(name)
                        .build()));
    }

    public Product createProduct(String tenantId, Product productDto, ProductVariant variantDto) {
        CreateProductRequest request = new CreateProductRequest();
        Map<String, Object> product = new HashMap<>();
        product.put("sku", productDto.getSku());
        product.put("name", productDto.getName());
        product.put("minStockLimit", productDto.getMinStockLimit());
        if (productDto.getCategory() != null) {
            product.put("categoryId", productDto.getCategory().getId());
        }
        Map<String, Object> variant = new HashMap<>();
        variant.put("name", variantDto.getName());
        variant.put("price", variantDto.getPrice());
        variant.put("cost", variantDto.getCost());
        request.setProduct(product);
        request.setVariant(variant);
        createProductFromRequest(tenantId, request);
        return productRepository.findBySkuAndTenantId(productDto.getSku(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found after create"));
    }

    @Transactional(readOnly = true)
    public List<Product> getAllByTenant(String tenantId) {
        return dedupeProductsBySku(productRepository.findByTenantId(tenantId));
    }

    /** POS / search: one row per SKU, optional case-insensitive filter on SKU or name. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> searchCatalog(String tenantId, String query) {
        String normalizedQuery = query != null ? query.trim().toLowerCase(Locale.ROOT) : "";
        List<ProductVariant> variants = catalogQueryService.listUniqueVariantsForTenant(tenantId);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ProductVariant variant : variants) {
            Product product = variant.getProduct();
            if (product == null) {
                continue;
            }
            if (!normalizedQuery.isEmpty()) {
                String sku = product.getSku() != null ? product.getSku().toLowerCase(Locale.ROOT) : "";
                String name = product.getName() != null ? product.getName().toLowerCase(Locale.ROOT) : "";
                String barcode = variant.getBarcode() != null ? variant.getBarcode().toLowerCase(Locale.ROOT) : "";
                if (!sku.contains(normalizedQuery) && !name.contains(normalizedQuery) && !barcode.contains(normalizedQuery)) {
                    continue;
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("productId", product.getId());
            row.put("variantId", variant.getId());
            row.put("sku", product.getSku());
            row.put("name", product.getName());
            row.put("price", variant.getPrice());
            row.put("cost", variant.getCost());
            row.put("wholesalePrice", variant.getWholesalePrice());
            row.put("stockQuantity", variant.getStockQuantity());
            row.put("minStockLimit", product.getMinStockLimit());
            row.put("reorderLevel", product.getReorderLevel());
            row.put("barcode", variant.getBarcode());
            row.put("barcodeFormat", variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : null);
            row.put("barcodeSource", variant.getBarcodeSource() != null ? variant.getBarcodeSource().name() : null);
            row.put("barcodeGenerated", variant.getBarcodeGenerated());
            if (product.getCategory() != null) {
                row.put("categoryId", product.getCategory().getId());
            }
            rows.add(row);
        }
        return rows;
    }

    private List<Product> dedupeProductsBySku(List<Product> products) {
        Map<String, Product> bySku = new LinkedHashMap<>();
        for (Product product : products) {
            if (product.getSku() == null) {
                continue;
            }
            String key = SkuCatalogService.normalizeSku(product.getSku());
            bySku.putIfAbsent(key, product);
        }
        return new ArrayList<>(bySku.values());
    }

    @Transactional(readOnly = true)
    public Product getById(String id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<ProductVariant> getVariantsByProduct(String productId) {
        return variantRepository.findByProductId(productId);
    }

    public Product updateProduct(String id, Product dto) {
        Product existing = getById(id);
        existing.setName(dto.getName());
        existing.setSku(dto.getSku());
        existing.setMinStockLimit(dto.getMinStockLimit());
        existing.setReorderLevel(dto.getReorderLevel());
        if (dto.getCategory() != null && dto.getCategory().getId() != null) {
            Category category = categoryRepository.findById(dto.getCategory().getId())
                    .orElseThrow(() -> new ResourceNotFoundException("Category not found: " + dto.getCategory().getId()));
            existing.setCategory(category);
        }
        return productRepository.save(existing);
    }

    public Map<String, Object> updateProductFromRequest(String tenantId, String variantId, UpdateProductRequest request) {
        ProductVariant variant = variantRepository.findByIdWithProduct(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("المنتج أو الصنف غير موجود"));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول لهذا المنتج");
        }

        Product product = variant.getProduct();
        if (product == null) {
            throw new ResourceNotFoundException("Product not found for variant: " + variantId);
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));

        if (request.getProductName() != null && !request.getProductName().isBlank()) {
            product.setName(request.getProductName().trim());
        }
        if (request.getSku() != null && !request.getSku().isBlank()) {
            String newSku = request.getSku().trim();
            if (!newSku.equalsIgnoreCase(product.getSku())) {
                Optional<Product> duplicate = productRepository.findBySkuIgnoreCaseAndTenantId(newSku, tenantId);
                if (duplicate.isPresent() && !duplicate.get().getId().equals(product.getId())) {
                    throw new BusinessRuleException("كود SKU مستخدم بالفعل لمنتج آخر");
                }
                product.setSku(newSku);
            }
        }
        if (request.getMinStockLimit() != null) {
            product.setMinStockLimit(request.getMinStockLimit());
        }
        if (request.getReorderLevel() != null) {
            product.setReorderLevel(request.getReorderLevel());
        }
        if (request.getCategoryId() != null || request.getCategoryName() != null) {
            Category category = resolveCategoryForUpdate(tenant, request.getCategoryId(), request.getCategoryName());
            product.setCategory(category);
        }
        if (request.getBrandName() != null) {
            product.setBrand(request.getBrandName().isBlank() ? null : findOrCreateBrand(request.getBrandName().trim(), tenant));
        }
        if (request.getSupplierId() != null || request.getSupplierName() != null) {
            product.setSupplier(resolveSupplierForUpdate(tenant, request.getSupplierId(), request.getSupplierName()));
        }

        product = productRepository.saveAndFlush(product);

        if (request.getVariantName() != null && !request.getVariantName().isBlank()) {
            variant.setName(request.getVariantName().trim());
        }
        if (request.getPrice() != null) {
            if (request.getPrice().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessRuleException("سعر البيع لا يمكن أن يكون سالبًا");
            }
            variant.setPrice(request.getPrice());
        }
        if (request.getCost() != null) {
            if (request.getCost().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessRuleException("التكلفة لا يمكن أن تكون سالبة");
            }
            variant.setCost(request.getCost());
        }
        if (request.getWholesalePrice() != null) {
            if (request.getWholesalePrice().compareTo(BigDecimal.ZERO) < 0) {
                throw new BusinessRuleException("سعر الجملة لا يمكن أن يكون سالبًا");
            }
            variant.setWholesalePrice(request.getWholesalePrice());
        }

        skuCatalogService.syncVariantSkuFromProduct(variant, product);
        variant = variantRepository.saveAndFlush(variant);
        return buildProductResponse(product, variant);
    }

    private Category resolveCategoryForUpdate(Tenant tenant, String categoryId, String categoryName) {
        if (categoryId != null && !categoryId.isBlank()
                && !"c-1".equals(categoryId) && !"default".equalsIgnoreCase(categoryId)) {
            return categoryRepository.findById(categoryId)
                    .orElseGet(() -> findOrCreateCategory(categoryName, tenant));
        }
        return findOrCreateCategory(categoryName, tenant);
    }

    private Supplier resolveSupplierForUpdate(Tenant tenant, String supplierId, String supplierName) {
        if (supplierId != null && !supplierId.isBlank()) {
            return supplierRepository.findById(supplierId)
                    .filter(s -> s.getTenant().getId().equals(tenant.getId()))
                    .orElse(null);
        }
        if (supplierName == null || supplierName.isBlank()) {
            return null;
        }
        return findOrCreateSupplier(supplierName.trim(), tenant);
    }

    public void deleteProduct(String id) {
        Product existing = getById(id);
        productRepository.delete(existing);
    }

    public void deleteProductVariant(String tenantId, String variantId) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("المنتج أو الصنف غير موجود"));

        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("Unauthorized variant access");
        }

        if (isVariantReferenced(variantId)) {
            throw new BusinessRuleException("لا يمكن حذف هذا المنتج لأنه مرتبط بعمليات بيع أو تحويل مخزني سابقة");
        }

        Product product = variant.getProduct();

        // Delete the variant
        variantRepository.delete(variant);
        variantRepository.flush();

        // If the product has no other variants, delete the product too
        if (product != null) {
            List<ProductVariant> remaining = variantRepository.findByProductId(product.getId());
            if (remaining.isEmpty() || (remaining.size() == 1 && remaining.get(0).getId().equals(variantId))) {
                productRepository.delete(product);
            }
        }
    }

    private boolean isVariantReferenced(String variantId) {
        // Check if there are sales allocations
        Number countSales = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM sale_item_batch_allocations WHERE inventory_batch_id IN " +
                "(SELECT id FROM inventory_batches WHERE product_variant_id = :variantId)")
                .setParameter("variantId", variantId)
                .getSingleResult();
        if (countSales.intValue() > 0) return true;

        // Check if there are stock transfer items
        Number countTransfers = (Number) entityManager.createNativeQuery(
                "SELECT COUNT(*) FROM stock_transfer_items WHERE product_variant_id = :variantId")
                .setParameter("variantId", variantId)
                .getSingleResult();
        if (countTransfers.intValue() > 0) return true;

        return false;
    }

    private void assignBarcodeToVariant(String tenantId, ProductVariant variant, String barcode, String formatStr) {
        Employee employee = null;
        try {
            employee = com.animasys.core.security.SecurityUtils.requireEmployee();
        } catch (Exception ignored) {
            List<Employee> emps = employeeRepository.findByTenantId(tenantId);
            if (!emps.isEmpty()) {
                employee = emps.get(0);
            }
        }

        TenantBarcodeSettings settings = barcodeSettingsRepository.findById(tenantId)
                .orElseGet(() -> tenantBarcodeSettingsDefault(tenantId));

        if (barcode != null && !barcode.trim().isEmpty()) {
            String trimmedBarcode = barcode.trim();
            if (!trimmedBarcode.equals(variant.getBarcode())) {
                Optional<ProductVariant> duplicate = variantRepository.findByBarcodeAndTenantId(trimmedBarcode, tenantId);
                if (duplicate.isPresent() && !duplicate.get().getId().equals(variant.getId())) {
                    throw new BusinessRuleException("الباركود مستخدم بالفعل لمنتج آخر: " + duplicate.get().getProduct().getName());
                }

                BarcodeFormat format = parseBarcodeFormat(formatStr != null ? formatStr : settings.getDefaultBarcodeFormat().name());
                validateBarcodeContent(trimmedBarcode, format);

                String oldBarcode = variant.getBarcode();
                variant.setBarcode(trimmedBarcode);
                variant.setBarcodeFormat(format);
                variant.setBarcodeGenerated(false);
                variant.setBarcodeSource(BarcodeSource.MANUFACTURER);
                variant.setBarcodeStatus(BarcodeStatus.ACTIVE);
                variant.setGeneratedByEmployee(employee);
                variant.setBarcodeGeneratedAt(java.time.Instant.now());
                variantRepository.save(variant);

                logBarcodeHistory(variant, oldBarcode, trimmedBarcode, format, BarcodeSource.MANUFACTURER, "Manual Assignment", employee);
            }
        } else {
            if (variant.getBarcode() == null || variant.getBarcode().trim().isEmpty()) {
                if (settings.isAutoGenerateBarcode()) {
                    BarcodeFormat format = settings.getDefaultBarcodeFormat();
                    String generatedCode = barcodeGeneratorService.generate(tenantId, format.name());
                    
                    variant.setBarcode(generatedCode);
                    variant.setBarcodeFormat(format);
                    variant.setBarcodeGenerated(true);
                    variant.setBarcodeSource(BarcodeSource.SYSTEM_GENERATED);
                    variant.setBarcodeStatus(BarcodeStatus.ACTIVE);
                    variant.setGeneratedByEmployee(employee);
                    variant.setBarcodeGeneratedAt(java.time.Instant.now());
                    variantRepository.save(variant);

                    logBarcodeHistory(variant, null, generatedCode, format, BarcodeSource.SYSTEM_GENERATED, "Auto Generation on Create", employee);
                }
            }
        }
    }

    private void validateBarcodeContent(String content, BarcodeFormat format) {
        if (content == null || content.isBlank()) {
            throw new BusinessRuleException("الباركود لا يمكن أن يكون فارغاً");
        }
        switch (format) {
            case EAN_13 -> {
                if (content.length() != 13) {
                    throw new BusinessRuleException("باركود EAN-13 يجب أن يكون مكوناً من 13 رقماً بالضبط.");
                }
                if (!content.matches("^\\d+$")) {
                    throw new BusinessRuleException("باركود EAN-13 يجب أن يحتوي على أرقام فقط.");
                }
                int calculated = BarcodeGeneratorService.calculateEan13Checksum(content);
                int actual = Character.getNumericValue(content.charAt(12));
                if (calculated != actual) {
                    throw new BusinessRuleException("رقم التحقق (Checksum) لـ EAN-13 غير صحيح. المتوقع: " + calculated);
                }
            }
            case UPC_A -> {
                if (content.length() != 12) {
                    throw new BusinessRuleException("باركود UPC-A يجب أن يكون مكوناً من 12 رقماً بالضبط.");
                }
                if (!content.matches("^\\d+$")) {
                    throw new BusinessRuleException("باركود UPC-A يجب أن يحتوي على أرقام فقط.");
                }
                int calculated = BarcodeGeneratorService.calculateUpcaChecksum(content);
                int actual = Character.getNumericValue(content.charAt(11));
                if (calculated != actual) {
                    throw new BusinessRuleException("رقم التحقق (Checksum) لـ UPC-A غير صحيح. المتوقع: " + calculated);
                }
            }
            case CODE_128 -> {
                if (!content.matches("^[\\x00-\\x7F]+$")) {
                    throw new BusinessRuleException("باركود Code 128 يجب أن يحتوي على أحرف ASCII صالحة فقط.");
                }
            }
        }
    }

    private void logBarcodeHistory(
            ProductVariant variant,
            String oldBarcode,
            String newBarcode,
            BarcodeFormat format,
            BarcodeSource source,
            String reason,
            Employee employee
    ) {
        BarcodeHistory history = BarcodeHistory.builder()
                .id(UUID.randomUUID().toString())
                .productVariant(variant)
                .oldBarcode(oldBarcode)
                .newBarcode(newBarcode)
                .barcodeFormat(format)
                .barcodeSource(source)
                .statusState(BarcodeStatus.ACTIVE)
                .reason(reason)
                .generatedByEmployee(employee)
                .generatedAt(java.time.Instant.now())
                .build();
        barcodeHistoryRepository.save(history);
    }

    private TenantBarcodeSettings tenantBarcodeSettingsDefault(String tenantId) {
        return TenantBarcodeSettings.builder()
                .tenantId(tenantId)
                .autoGenerateBarcode(true)
                .defaultBarcodeFormat(BarcodeFormat.CODE_128)
                .defaultLabelSize("50x25")
                .includePrice(true)
                .includeName(true)
                .includeSku(true)
                .defaultTemplateStyle(TemplateStyle.PET_SHOP_SMALL)
                .build();
    }

    private BarcodeFormat parseBarcodeFormat(String formatStr) {
        if (formatStr == null) return BarcodeFormat.CODE_128;
        try {
            return BarcodeFormat.valueOf(formatStr.toUpperCase().trim());
        } catch (Exception e) {
            return BarcodeFormat.CODE_128;
        }
    }

    public Map<String, Object> generateBarcodeForVariant(String tenantId, String variantId, String formatStr, Employee employee) {
        return generateBarcodeForVariant(tenantId, variantId, formatStr, true, employee);
    }

    public Map<String, Object> generateBarcodeForVariant(String tenantId, String variantId, String formatStr, boolean force, Employee employee) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found: " + variantId));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول لهذا المنتج");
        }

        String oldBarcode = variant.getBarcode();
        BarcodeFormat format = parseBarcodeFormat(formatStr);
        String newBarcode = barcodeGeneratorService.generate(tenantId, format.name());

        variant.setBarcode(newBarcode);
        variant.setBarcodeFormat(format);
        variant.setBarcodeGenerated(true);
        variant.setBarcodeGeneratedAt(java.time.Instant.now());
        variant.setGeneratedByEmployee(employee);
        variant.setBarcodeSource(BarcodeSource.SYSTEM_GENERATED);
        variant.setBarcodeStatus(BarcodeStatus.ACTIVE);

        variantRepository.save(variant);

        logBarcodeHistory(variant, oldBarcode, newBarcode, format, BarcodeSource.SYSTEM_GENERATED, "Barcode generation requested", employee);

        Map<String, Object> response = new HashMap<>();
        response.put("variantId", variant.getId());
        response.put("barcode", variant.getBarcode());
        response.put("barcodeFormat", variant.getBarcodeFormat().name());
        response.put("barcodeGenerated", variant.getBarcodeGenerated());
        response.put("barcodeSource", variant.getBarcodeSource().name());
        response.put("base64Image", barcodeImageService.generatePNGAsBase64(format.name(), newBarcode, 300, 100));
        return response;
    }

    public Map<String, Object> updateCustomBarcode(String tenantId, String variantId, String customBarcode, String formatStr, Employee employee) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found: " + variantId));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول لهذا المنتج");
        }

        if (customBarcode == null || customBarcode.isBlank()) {
            throw new BusinessRuleException("يرجى إدخال رمز باركود صالح");
        }

        String trimmedBarcode = customBarcode.trim().toUpperCase(java.util.Locale.ROOT);
        String oldBarcode = variant.getBarcode();
        BarcodeFormat format = parseBarcodeFormat(formatStr);

        variant.setBarcode(trimmedBarcode);
        variant.setBarcodeFormat(format);
        variant.setBarcodeGenerated(false);
        variant.setBarcodeGeneratedAt(java.time.Instant.now());
        variant.setGeneratedByEmployee(employee);
        variant.setBarcodeSource(BarcodeSource.USER_DEFINED);
        variant.setBarcodeStatus(BarcodeStatus.ACTIVE);

        variantRepository.save(variant);

        logBarcodeHistory(variant, oldBarcode, trimmedBarcode, format, BarcodeSource.USER_DEFINED, "Custom barcode manual update", employee);

        Map<String, Object> response = new HashMap<>();
        response.put("variantId", variant.getId());
        response.put("barcode", variant.getBarcode());
        response.put("barcodeFormat", variant.getBarcodeFormat().name());
        response.put("barcodeGenerated", variant.getBarcodeGenerated());
        response.put("barcodeSource", variant.getBarcodeSource().name());
        response.put("base64Image", barcodeImageService.generatePNGAsBase64(format.name(), trimmedBarcode, 300, 100));
        return response;
    }

    public void clearBarcode(String tenantId, String variantId, Employee employee) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found: " + variantId));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول لهذا المنتج");
        }

        if (variant.getBarcode() == null) {
            return;
        }

        if (isVariantReferenced(variant.getId())) {
            throw new BusinessRuleException("لا يمكن حذف باركود المنتج لوجود عمليات بيع أو تحويل مخزني مسجلة له في النظام.");
        }

        String oldBarcode = variant.getBarcode();
        BarcodeFormat oldFormat = variant.getBarcodeFormat();

        variant.setBarcode(null);
        variant.setBarcodeFormat(null);
        variant.setBarcodeGenerated(false);
        variant.setBarcodeGeneratedAt(null);
        variant.setGeneratedByEmployee(null);
        variant.setBarcodeSource(null);
        variant.setBarcodeStatus(BarcodeStatus.VOID);

        variantRepository.save(variant);

        logBarcodeHistory(variant, oldBarcode, "VOID", oldFormat != null ? oldFormat : BarcodeFormat.CODE_128, BarcodeSource.SYSTEM_GENERATED, "Barcode Cleared", employee);
    }

    public Map<String, Object> getBarcodeData(String tenantId, String variantId, int width, int height) {
        ProductVariant variant = variantRepository.findByIdWithProduct(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found"));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول لهذا المنتج");
        }

        if (variant.getBarcode() == null || variant.getBarcode().isBlank()) {
            throw new BusinessRuleException("المنتج لا يحتوي على باركود");
        }

        String format = variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : "CODE_128";
        String base64Image = barcodeImageService.generatePNGAsBase64(format, variant.getBarcode(), width, height);

        Map<String, Object> response = new HashMap<>();
        response.put("variantId", variant.getId());
        response.put("sku", variant.getSku());
        response.put("name", variant.getProduct().getName());
        response.put("variantName", variant.getName());
        response.put("price", variant.getPrice());
        response.put("barcode", variant.getBarcode());
        response.put("barcodeFormat", format);
        response.put("barcodeSource", variant.getBarcodeSource() != null ? variant.getBarcodeSource().name() : "MANUFACTURER");
        response.put("base64Image", base64Image);
        return response;
    }

    public byte[] printBarcodePdf(String tenantId, String variantId, int quantity, TemplateStyle style) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found: " + variantId));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول");
        }

        if (variant.getBarcode() == null || variant.getBarcode().isBlank()) {
            throw new BusinessRuleException("المنتج لا يحتوي على باركود صالح");
        }

        TenantBarcodeSettings settings = barcodeSettingsRepository.findById(tenantId)
                .orElseGet(() -> tenantBarcodeSettingsDefault(tenantId));

        LabelPrintData printData = LabelPrintData.builder()
                .productName(variant.getProduct().getName())
                .sku(variant.getSku())
                .price(variant.getPrice())
                .barcode(variant.getBarcode())
                .formatName(variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : "CODE_128")
                .style(style != null ? style : settings.getDefaultTemplateStyle())
                .quantity(quantity)
                .includeName(settings.isIncludeName())
                .includeSku(settings.isIncludeSku())
                .includePrice(settings.isIncludePrice())
                .includeBarcodeNumber(true)
                .build();

        return pdfLabelService.generateLabelsPdf(List.of(printData));
    }

    public String printBarcodeZpl(String tenantId, String variantId, int quantity, TemplateStyle style) {
        ProductVariant variant = variantRepository.findById(variantId)
                .orElseThrow(() -> new ResourceNotFoundException("Variant not found: " + variantId));
        if (!tenantId.equals(variant.getTenantId())) {
            throw new BusinessRuleException("غير مصرح بالوصول");
        }

        if (variant.getBarcode() == null || variant.getBarcode().isBlank()) {
            throw new BusinessRuleException("المنتج لا يحتوي على باركود صالح");
        }

        TenantBarcodeSettings settings = barcodeSettingsRepository.findById(tenantId)
                .orElseGet(() -> tenantBarcodeSettingsDefault(tenantId));

        return zplLabelService.generateZpl(
                variant.getProduct().getName(),
                variant.getSku(),
                variant.getPrice(),
                variant.getBarcode(),
                variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : "CODE_128",
                style != null ? style : settings.getDefaultTemplateStyle(),
                settings.isIncludeName(),
                settings.isIncludeSku(),
                settings.isIncludePrice(),
                true
        );
    }

    public byte[] bulkPrintBarcodePdf(String tenantId, List<BulkPrintRequestItem> items, TemplateStyle style) {
        if (items == null || items.isEmpty()) {
            throw new BusinessRuleException("No print items provided");
        }
        List<LabelPrintData> printList = new ArrayList<>();
        TenantBarcodeSettings settings = barcodeSettingsRepository.findById(tenantId)
                .orElseGet(() -> tenantBarcodeSettingsDefault(tenantId));

        for (BulkPrintRequestItem item : items) {
            ProductVariant variant = variantRepository.findByIdWithProduct(item.getVariantId()).orElse(null);

            if (variant == null || !tenantId.equals(variant.getTenantId()) || variant.getBarcode() == null) {
                continue;
            }

            int qty = 1;
            if (Boolean.TRUE.equals(item.getUseStockQuantity())) {
                qty = Math.max(1, variant.getStockQuantity());
            } else if (item.getQuantity() != null && item.getQuantity() > 0) {
                qty = item.getQuantity();
            }

            LabelPrintData printData = LabelPrintData.builder()
                    .productName(variant.getProduct().getName())
                    .sku(variant.getSku())
                    .price(variant.getPrice())
                    .barcode(variant.getBarcode())
                    .formatName(variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : "CODE_128")
                    .style(style != null ? style : settings.getDefaultTemplateStyle())
                    .quantity(qty)
                    .includeName(settings.isIncludeName())
                    .includeSku(settings.isIncludeSku())
                    .includePrice(settings.isIncludePrice())
                    .includeBarcodeNumber(true)
                    .build();

            printList.add(printData);
        }

        return pdfLabelService.generateLabelsPdf(printList);
    }

    public String bulkPrintBarcodeZpl(String tenantId, List<BulkPrintRequestItem> items, TemplateStyle style) {
        if (items == null || items.isEmpty()) {
            throw new BusinessRuleException("No print items provided");
        }
        StringBuilder sb = new StringBuilder();
        TenantBarcodeSettings settings = barcodeSettingsRepository.findById(tenantId)
                .orElseGet(() -> tenantBarcodeSettingsDefault(tenantId));

        for (BulkPrintRequestItem item : items) {
            ProductVariant variant = variantRepository.findByIdWithProduct(item.getVariantId()).orElse(null);

            if (variant == null || !tenantId.equals(variant.getTenantId()) || variant.getBarcode() == null) {
                continue;
            }

            int qty = 1;
            if (Boolean.TRUE.equals(item.getUseStockQuantity())) {
                qty = Math.max(1, variant.getStockQuantity());
            } else if (item.getQuantity() != null && item.getQuantity() > 0) {
                qty = item.getQuantity();
            }

            for (int q = 0; q < qty; q++) {
                String zpl = zplLabelService.generateZpl(
                        variant.getProduct().getName(),
                        variant.getSku(),
                        variant.getPrice(),
                        variant.getBarcode(),
                        variant.getBarcodeFormat() != null ? variant.getBarcodeFormat().name() : "CODE_128",
                        style != null ? style : settings.getDefaultTemplateStyle(),
                        settings.isIncludeName(),
                        settings.isIncludeSku(),
                        settings.isIncludePrice(),
                        true
                );
                sb.append(zpl).append("\n");
            }
        }

        return sb.toString();
    }

    public TenantBarcodeSettings getBarcodeSettings(String tenantId) {
        return barcodeSettingsRepository.findById(tenantId)
                .orElseGet(() -> barcodeSettingsRepository.save(tenantBarcodeSettingsDefault(tenantId)));
    }

    public TenantBarcodeSettings updateBarcodeSettings(String tenantId, com.animasys.modules.inventory.dto.BarcodeSettingsRequest dto) {
        TenantBarcodeSettings existing = getBarcodeSettings(tenantId);
        existing.setAutoGenerateBarcode(dto.isAutoGenerateBarcode());
        existing.setDefaultBarcodeFormat(dto.getDefaultBarcodeFormat());
        existing.setDefaultLabelSize(dto.getDefaultLabelSize());
        existing.setIncludeName(dto.isIncludeName());
        existing.setIncludeSku(dto.isIncludeSku());
        existing.setIncludePrice(dto.isIncludePrice());
        existing.setDefaultTemplateStyle(dto.getDefaultTemplateStyle());
        return barcodeSettingsRepository.save(existing);
    }
}
