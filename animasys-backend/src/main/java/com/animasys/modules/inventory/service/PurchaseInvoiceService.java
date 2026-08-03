package com.animasys.modules.inventory.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.finance.domain.PurchaseInvoiceInstallment;
import com.animasys.modules.finance.service.AccountsPayableService;
import com.animasys.modules.inventory.dto.PurchaseInvoiceCreateResult;
import com.animasys.modules.inventory.dto.PurchaseInvoiceLineReceiptWarning;
import com.animasys.modules.inventory.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class PurchaseInvoiceService {

    private final PurchaseInvoiceRepository invoiceRepository;
    private final SupplierRepository supplierRepository;
    private final EmployeeRepository employeeRepository;
    private final TenantRepository tenantRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final CategoryRepository categoryRepository;
    private final FifoCostingService fifoCostingService;
    private final InventoryIntegrityService inventoryIntegrityService;
    private final SkuCatalogService skuCatalogService;
    private final CatalogPersistenceService catalogPersistenceService;
    private final AccountsPayableService accountsPayableService;

    public PurchaseInvoiceCreateResult createInvoice(PurchaseInvoice dto, String employeeId, String tenantId) {
        String rawFingerprint = (dto.getSupplierName() + "_" + dto.getInvoiceNumber() + "_" + dto.getInvoiceDate() + "_" + dto.getGrandTotal())
                .replaceAll("\\s+", "").toLowerCase();

        Optional<PurchaseInvoice> existing = invoiceRepository.findByFingerprint(rawFingerprint);
        if (existing.isPresent()) {
            throw new BusinessRuleException("هذه الفاتورة تم استيرادها مسبقاً! البصمة مطابقة للفاتورة رقم: " + dto.getInvoiceNumber());
        }

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود"));

        String resolvedTenantId = tenantId != null && !tenantId.isBlank() ? tenantId : "t-1";
        Tenant tenant = tenantRepository.findById(resolvedTenantId)
                .orElseThrow(() -> new ResourceNotFoundException("الشركة غير موجودة"));

        Supplier supplier = resolveSupplier(dto, tenant);

        String invoiceId = "pi-" + UUID.randomUUID().toString().substring(0, 8);
        PurchaseInvoice invoice = PurchaseInvoice.builder()
                .id(invoiceId)
                .invoiceNumber(dto.getInvoiceNumber())
                .invoiceDate(dto.getInvoiceDate())
                .supplier(supplier)
                .supplierName(dto.getSupplierName())
                .currency(dto.getCurrency())
                .vat(dto.getVat() != null ? dto.getVat() : BigDecimal.ZERO)
                .discount(dto.getDiscount() != null ? dto.getDiscount() : BigDecimal.ZERO)
                .shipping(dto.getShipping() != null ? dto.getShipping() : BigDecimal.ZERO)
                .netTotal(dto.getNetTotal())
                .grandTotal(dto.getGrandTotal())
                .uploadedAt(Instant.now())
                .uploadedBy(employee)
                .imageUrl(dto.getImageUrl())
                .status("COMPLETED")
                .dueDate(dto.getDueDate() != null ? dto.getDueDate() : dto.getInvoiceDate())
                .paymentType(dto.getPaymentType() != null ? dto.getPaymentType() : "LUMP_SUM")
                .paymentStatus(dto.getPaymentStatus() != null ? dto.getPaymentStatus() : "UNPAID")
                .paidAmount(dto.getPaidAmount() != null ? dto.getPaidAmount() : BigDecimal.ZERO)
                .fingerprint(rawFingerprint)
                .items(new ArrayList<>())
                .installments(new ArrayList<>())
                .build();

        if ("INSTALLMENTS".equals(invoice.getPaymentType()) && dto.getInstallments() != null && !dto.getInstallments().isEmpty()) {
            int num = 1;
            for (PurchaseInvoiceInstallment instDto : dto.getInstallments()) {
                PurchaseInvoiceInstallment inst = PurchaseInvoiceInstallment.builder()
                        .id("inst-" + UUID.randomUUID().toString().substring(0, 8))
                        .purchaseInvoice(invoice)
                        .installmentNumber(instDto.getInstallmentNumber() > 0 ? instDto.getInstallmentNumber() : num)
                        .dueDate(instDto.getDueDate())
                        .amount(instDto.getAmount())
                        .paidAmount(BigDecimal.ZERO)
                        .status("PENDING")
                        .notes(instDto.getNotes())
                        .build();
                invoice.getInstallments().add(inst);
                num++;
            }
        } else {
            invoice.getInstallments().add(accountsPayableService.createDefaultInstallment(invoice));
        }

        if (dto.getItems() != null) {
            for (PurchaseInvoiceItem itemDto : dto.getItems()) {
                PurchaseInvoiceItem item = PurchaseInvoiceItem.builder()
                        .id("pii-" + UUID.randomUUID().toString().substring(0, 8))
                        .purchaseInvoice(invoice)
                        .productName(itemDto.getProductName())
                        .sku(itemDto.getSku())
                        .cost(itemDto.getCost())
                        .price(itemDto.getPrice())
                        .quantity(itemDto.getQuantity())
                        .confidenceName(itemDto.getConfidenceName())
                        .confidenceQty(itemDto.getConfidenceQty())
                        .confidenceCost(itemDto.getConfidenceCost())
                        .confidencePrice(itemDto.getConfidencePrice())
                        .expiryDate(itemDto.getExpiryDate())
                        .build();
                invoice.getItems().add(item);
            }
        }

        PurchaseInvoice saved = invoiceRepository.save(invoice);

        List<PurchaseInvoiceLineReceiptWarning> warnings =
                receiveStockFromInvoice(saved, employeeId, tenant.getId());
        inventoryIntegrityService.reconcileTenant(tenant.getId());

        return PurchaseInvoiceCreateResult.builder()
                .invoice(saved)
                .stockReceiptWarnings(warnings)
                .build();
    }

    /** Backward-compatible overload. */
    public PurchaseInvoiceCreateResult createInvoice(PurchaseInvoice dto, String employeeId) {
        return createInvoice(dto, employeeId, null);
    }

    private List<PurchaseInvoiceLineReceiptWarning> receiveStockFromInvoice(
            PurchaseInvoice invoice, String employeeId, String tenantId) {
        List<PurchaseInvoiceLineReceiptWarning> warnings = new ArrayList<>();
        if (invoice.getItems() == null) {
            return warnings;
        }

        Tenant tenant = tenantRepository.findById(tenantId).orElse(null);

        Instant purchaseInstant = Instant.now();
        if (invoice.getInvoiceDate() != null && !invoice.getInvoiceDate().isBlank()) {
            try {
                purchaseInstant = LocalDate.parse(invoice.getInvoiceDate().substring(0, Math.min(10, invoice.getInvoiceDate().length())))
                        .atStartOfDay(ZoneId.systemDefault()).toInstant();
            } catch (Exception ignored) {
                purchaseInstant = Instant.now();
            }
        }

        final String currentTenantId = tenantId;
        String supplierId = invoice.getSupplier() != null ? invoice.getSupplier().getId() : null;
        int lineIndex = 0;

        for (PurchaseInvoiceItem item : invoice.getItems()) {
            lineIndex++;
            int effectiveQty = item.getQuantity() != null ? item.getQuantity() : 0;
            if (effectiveQty <= 0) {
                continue;
            }

            int conversionFactor = (item.getConversionFactor() != null && item.getConversionFactor() > 0) ? item.getConversionFactor() : 1;
            int finalQuantity = effectiveQty * conversionFactor;

            BigDecimal unitCost = item.getCost() != null ? item.getCost() : BigDecimal.ZERO;
            if (conversionFactor > 1 && unitCost.compareTo(BigDecimal.ZERO) > 0) {
                unitCost = unitCost.divide(BigDecimal.valueOf(conversionFactor), 4, java.math.RoundingMode.HALF_UP);
            }
            final BigDecimal finalUnitCost = unitCost;

            String sku = item.getSku() != null ? item.getSku().trim() : "";
            if (sku.isBlank()) {
                sku = "SKU-" + Math.abs((item.getProductName() + "_" + lineIndex).hashCode());
                item.setSku(sku);
            }

            Optional<Product> productOpt = productRepository.findBySkuIgnoreCaseAndTenantId(sku, tenantId);
            ProductVariant variant;
            if (productOpt.isPresent()) {
                variant = skuCatalogService.findCanonicalVariant(productOpt.get())
                        .orElseGet(() -> skuCatalogService.updateOrCreateSingleVariant(
                                productOpt.get(),
                                item.getProductName(),
                                item.getPrice(),
                                finalUnitCost
                        ));
            } else {
                warnings.add(lineWarning(lineIndex, item, "SKU_NOT_FOUND",
                        "السطر " + lineIndex + " (SKU: " + sku + "): الرمز غير مسجل في النظام."));
                continue;
            }

            if (item.getPrice() != null && item.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                variant.setPrice(item.getPrice());
            }
            variant = catalogPersistenceService.saveVariant(variant);

            String batchNumber = (item.getLotNumber() != null && !item.getLotNumber().isBlank()) 
                    ? item.getLotNumber().trim() 
                    : ("B-" + invoice.getInvoiceNumber().replaceAll("\\s+", "") + "-" + String.format("%03d", lineIndex));

            try {
                fifoCostingService.createPurchaseBatch(
                        tenantId,
                        StockService.DEFAULT_SALES_WAREHOUSE,
                        variant.getId(),
                        supplierId,
                        invoice.getId(),
                        batchNumber,
                        finalUnitCost,
                        finalQuantity,
                        item.getExpiryDate(),
                        purchaseInstant,
                        employeeId
                );
            } catch (Exception ex) {
                String detail = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
                warnings.add(lineWarning(lineIndex, item, "RECEIPT_FAILED",
                        "السطر " + lineIndex + " (SKU: " + sku + "): فشل إنشاء دفعة المخزون — " + detail));
            }
        }

        return warnings;
    }

    private static PurchaseInvoiceLineReceiptWarning lineWarning(
            int lineIndex, PurchaseInvoiceItem item, String code, String messageAr) {
        return PurchaseInvoiceLineReceiptWarning.builder()
                .lineIndex(lineIndex)
                .purchaseInvoiceItemId(item.getId())
                .sku(item.getSku())
                .productName(item.getProductName())
                .code(code)
                .messageAr(messageAr)
                .build();
    }

    private Supplier resolveSupplier(PurchaseInvoice dto, Tenant tenant) {
        Supplier supplier = null;
        if (dto.getSupplier() != null && dto.getSupplier().getId() != null) {
            supplier = supplierRepository.findById(dto.getSupplier().getId()).orElse(null);
        }

        if (supplier == null) {
            Optional<Supplier> existingSup = supplierRepository.findByNameIgnoreCaseAndTenantId(dto.getSupplierName(), tenant.getId());
            if (existingSup.isPresent()) {
                supplier = existingSup.get();
            } else {
                supplier = Supplier.builder()
                        .id("sup-" + UUID.randomUUID().toString().substring(0, 8))
                        .tenant(tenant)
                        .name(dto.getSupplierName())
                        .supplierCode("SUP-" + String.format("%04d", (int) (Math.random() * 10000)))
                        .phone(dto.getSupplier() != null ? dto.getSupplier().getPhone() : null)
                        .address(dto.getSupplier() != null ? dto.getSupplier().getAddress() : null)
                        .taxNumber(dto.getSupplier() != null ? dto.getSupplier().getTaxNumber() : null)
                        .build();
                supplier = supplierRepository.save(supplier);
            }
        } else if (dto.getSupplier() != null) {
            boolean updated = false;
            if (dto.getSupplier().getPhone() != null && supplier.getPhone() == null) {
                supplier.setPhone(dto.getSupplier().getPhone());
                updated = true;
            }
            if (dto.getSupplier().getAddress() != null && supplier.getAddress() == null) {
                supplier.setAddress(dto.getSupplier().getAddress());
                updated = true;
            }
            if (dto.getSupplier().getTaxNumber() != null && supplier.getTaxNumber() == null) {
                supplier.setTaxNumber(dto.getSupplier().getTaxNumber());
                updated = true;
            }
            if (updated) {
                supplier = supplierRepository.save(supplier);
            }
        }
        return supplier;
    }

    public List<PurchaseInvoice> getAllInvoices() {
        return invoiceRepository.findByUploadedByTenantId(SecurityUtils.requireTenantId());
    }

    public List<PurchaseInvoice> getAllInvoicesByTenant(String tenantId) {
        return invoiceRepository.findByUploadedByTenantId(tenantId);
    }

    public PurchaseInvoice getInvoiceById(String tenantId, String id) {
        return invoiceRepository.findByIdAndUploadedByTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("فاتورة الشراء غير موجودة"));
    }

    public PurchaseInvoice payInvoice(String tenantId, String id, BigDecimal amount) {
        PurchaseInvoice invoice = invoiceRepository.findByIdAndUploadedByTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("فاتورة الشراء غير موجودة"));

        BigDecimal newPaid = (invoice.getPaidAmount() != null ? invoice.getPaidAmount() : BigDecimal.ZERO).add(amount);
        if (newPaid.compareTo(invoice.getGrandTotal()) > 0) {
            throw new BusinessRuleException("المبلغ المدفوع يتجاوز إجمالي الفاتورة");
        }
        invoice.setPaidAmount(newPaid);

        if (newPaid.compareTo(invoice.getGrandTotal()) >= 0) {
            invoice.setPaymentStatus("PAID");
        } else if (newPaid.compareTo(BigDecimal.ZERO) > 0) {
            invoice.setPaymentStatus("PARTIALLY_PAID");
        } else {
            invoice.setPaymentStatus("UNPAID");
        }

        // Apply payment to earliest open installment
        if (invoice.getInstallments() != null && !invoice.getInstallments().isEmpty()) {
            BigDecimal remaining = amount;
            for (PurchaseInvoiceInstallment inst : invoice.getInstallments()) {
                if ("PAID".equals(inst.getStatus()) || remaining.compareTo(BigDecimal.ZERO) <= 0) continue;
                BigDecimal instPaid = inst.getPaidAmount() != null ? inst.getPaidAmount() : BigDecimal.ZERO;
                BigDecimal instRemaining = inst.getAmount().subtract(instPaid);
                BigDecimal apply = remaining.min(instRemaining);
                inst.setPaidAmount(instPaid.add(apply));
                if (inst.getPaidAmount().compareTo(inst.getAmount()) >= 0) {
                    inst.setStatus("PAID");
                    inst.setPaidAt(Instant.now());
                } else if (inst.getPaidAmount().compareTo(BigDecimal.ZERO) > 0) {
                    inst.setStatus("PARTIALLY_PAID");
                }
                remaining = remaining.subtract(apply);
            }
        }

        return invoiceRepository.save(invoice);
    }
}
