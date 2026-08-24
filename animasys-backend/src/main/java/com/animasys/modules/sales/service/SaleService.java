package com.animasys.modules.sales.service;

import com.animasys.core.audit.AuditLog;
import com.animasys.core.audit.AuditLogRepository;
import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.inventory.domain.ProductVariant;
import com.animasys.modules.inventory.domain.Warehouse;
import com.animasys.modules.inventory.repository.ProductVariantRepository;
import com.animasys.modules.inventory.repository.WarehouseRepository;
import com.animasys.modules.inventory.service.FifoCostingService;
import com.animasys.modules.inventory.service.InventoryIntegrityService;
import com.animasys.modules.inventory.service.StockService;
import com.animasys.modules.loyalty.service.LoyaltyService;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.events.SaleCompletedEvent;
import com.animasys.modules.sales.events.SaleRefundedEvent;
import com.animasys.modules.sales.dto.SaleRefundFinancials;
import com.animasys.modules.sales.dto.SaleRefundLineRequest;
import com.animasys.modules.sales.dto.SaleRefundResult;
import com.animasys.modules.sales.dto.SalePaymentRequest;
import com.animasys.modules.sales.dto.SalePaymentSummaryDTO;
import com.animasys.modules.sales.domain.SalePayment;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleItemRepository;
import com.animasys.modules.sales.repository.SalePaymentRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.services.domain.GroomingService;
import com.animasys.modules.services.repository.GroomingServiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.animasys.core.security.UserPrincipal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class SaleService {

    /** Cashier may lower unit price by at most this percent vs catalog price. */
    private static final BigDecimal MAX_PRICE_DISCOUNT_PERCENT = new BigDecimal("20");

    private static final Set<String> ALLOWED_PAYMENT_METHODS =
            Set.of("CASH", "CARD", "MOBILE", "INSTAPAY", "VODAFONE_CASH");

    /** Value stored on Sale.paymentMethod when a sale is paid via two tenders (see #payments). */
    private static final String SPLIT_PAYMENT_METHOD = "SPLIT";

    private static final BigDecimal PAYMENT_SUM_TOLERANCE = new BigDecimal("0.01");

    private final SaleRepository saleRepository;
    private final SaleItemRepository itemRepository;
    private final SalePaymentRepository paymentRepository;
    private final POSSessionRepository sessionRepository;
    private final EmployeeRepository employeeRepository;
    private final CustomerRepository customerRepository;
    private final WarehouseRepository warehouseRepository;
    private final ProductVariantRepository variantRepository;
    private final GroomingServiceRepository groomingServiceRepository;
    private final StockService stockService;
    private final FifoCostingService fifoCostingService;
    private final InventoryIntegrityService inventoryIntegrityService;
    private final AuditLogRepository auditLogRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final SaleItemBatchAllocationRepository saleItemBatchAllocationRepository;
    private final AuthenticationManager authenticationManager;
    private final LoyaltyService loyaltyService;

    public Sale createSale(String posSessionId, String employeeId, String customerId,
                           BigDecimal clientTotal, BigDecimal clientTax, BigDecimal clientDiscount,
                           String paymentMethod, List<SaleItem> clientItems) {
        return createSale(posSessionId, employeeId, customerId, clientTotal, clientTax, clientDiscount,
                paymentMethod, clientItems, null, null, false, null, null);
    }

    public Sale createSale(String posSessionId, String employeeId, String customerId,
                           BigDecimal clientTotal, BigDecimal clientTax, BigDecimal clientDiscount,
                           String paymentMethod, List<SaleItem> clientItems,
                           String managerUsername, String managerPassword) {
        return createSale(posSessionId, employeeId, customerId, clientTotal, clientTax, clientDiscount,
                paymentMethod, clientItems, managerUsername, managerPassword, false, null, null);
    }

    public Sale createSale(String posSessionId, String employeeId, String customerId,
                           BigDecimal clientTotal, BigDecimal clientTax, BigDecimal clientDiscount,
                           String paymentMethod, List<SaleItem> clientItems,
                           String managerUsername, String managerPassword,
                           boolean isDelivery, BigDecimal clientDeliveryFee) {
        return createSale(posSessionId, employeeId, customerId, clientTotal, clientTax, clientDiscount,
                paymentMethod, clientItems, managerUsername, managerPassword, isDelivery, clientDeliveryFee, null);
    }

    public Sale createSale(String posSessionId, String employeeId, String customerId,
                           BigDecimal clientTotal, BigDecimal clientTax, BigDecimal clientDiscount,
                           String paymentMethod, List<SaleItem> clientItems,
                           String managerUsername, String managerPassword,
                           boolean isDelivery, BigDecimal clientDeliveryFee, BigDecimal loyaltyRedeemRequested) {
        return createSale(posSessionId, employeeId, customerId, clientTotal, clientTax, clientDiscount,
                paymentMethod, clientItems, managerUsername, managerPassword, isDelivery, clientDeliveryFee,
                loyaltyRedeemRequested, null);
    }

    public Sale createSale(String posSessionId, String employeeId, String customerId,
                           BigDecimal clientTotal, BigDecimal clientTax, BigDecimal clientDiscount,
                           String paymentMethod, List<SaleItem> clientItems,
                           String managerUsername, String managerPassword,
                           boolean isDelivery, BigDecimal clientDeliveryFee, BigDecimal loyaltyRedeemRequested,
                           List<SalePaymentRequest> payments) {
        if (clientItems == null || clientItems.isEmpty()) {
            throw new BusinessRuleException("لا يمكن إتمام البيع بدون أصناف");
        }

        POSSession session = sessionRepository.findById(posSessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Active POS Session not found: " + posSessionId));

        if (!"OPEN".equals(session.getStatus())) {
            throw new BusinessRuleException("Cannot checkout a sale on a closed POS session.");
        }

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + employeeId));

        String employeeRole = employee.getRole() != null ? employee.getRole().toUpperCase(Locale.ROOT) : "";
        boolean isElevated = Set.of("OWNER", "MANAGER").contains(employeeRole);

        String tenantId = resolveTenantId(session, employee);

        // Resolved once up front: item validation (stock check) and the FIFO deduction
        // further down must agree on the same warehouse, or a "stock available" check
        // can pass while the scoped deduction finds nothing and the sale rolls back.
        String warehouseId = resolveSalesWarehouseId(session.getBranch());

        Customer customer = null;
        if (customerId != null && !customerId.trim().isEmpty()) {
            customer = customerRepository.findByIdAndTenantId(customerId, tenantId)
                    .orElseThrow(() -> new ResourceNotFoundException("العميل غير موجود: " + customerId));
            if (Boolean.TRUE.equals(customer.getIsBanned())) {
                throw new BusinessRuleException("هذا العميل محظور ولا يمكن إتمام عملية بيع له.");
            }
        }

        // Rebuild line items from catalog prices/costs (never trust client money fields)
        List<SaleItem> validatedItems = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;

        for (SaleItem raw : clientItems) {
            if (raw.getQuantity() <= 0) {
                throw new BusinessRuleException("كمية غير صالحة للصنف: " + raw.getName());
            }

            String type = raw.getType() != null ? raw.getType().toUpperCase(Locale.ROOT) : "PRODUCT";
            BigDecimal catalogPrice;
            BigDecimal unitCost;
            String displayName;

            if ("PRODUCT".equals(type)) {
                ProductVariant variant = variantRepository.findByIdWithProduct(raw.getItemId())
                        .orElseThrow(() -> new ResourceNotFoundException("الصنف غير موجود: " + raw.getItemId()));
                stockService.ensureMirrored(variant.getId());
                int batchAvailable = resolveBatchAvailability(
                        tenantId, warehouseId, variant, raw.getQuantity(), employeeId);
                if (batchAvailable < raw.getQuantity()) {
                    throw new BusinessRuleException(
                            "مخزون غير كافٍ للصنف '" + buildProductDisplayName(variant) + "'. المتاح: "
                                    + batchAvailable);
                }
                catalogPrice = variant.getPrice();
                unitCost = variant.getCost() != null ? variant.getCost() : BigDecimal.ZERO;
                displayName = buildProductDisplayName(variant);
                // POS may send a richer label; keep it if catalog build is weak
                String clientName = raw.getName() != null ? raw.getName().trim() : "";
                if (isWeakDisplayName(displayName) && !clientName.isEmpty()) {
                    displayName = clientName;
                }
            } else if ("SERVICE".equals(type)) {
                GroomingService service = groomingServiceRepository.findById(raw.getItemId())
                        .orElseThrow(() -> new ResourceNotFoundException("الخدمة غير موجودة: " + raw.getItemId()));
                catalogPrice = service.getPrice();
                unitCost = BigDecimal.ZERO;
                displayName = service.getName();
            } else {
                throw new BusinessRuleException("نوع بند غير مدعوم: " + type);
            }

            // Temporary per-bill price override: cashier may raise freely or lower within cap.
            // Catalog cost is always taken from the product master (never from client).
            BigDecimal unitPrice = catalogPrice;
            if (raw.getPrice() != null) {
                if (raw.getPrice().compareTo(BigDecimal.ZERO) <= 0) {
                    throw new BusinessRuleException("سعر البيع يجب أن يكون أكبر من صفر للصنف: " + displayName);
                }
                unitPrice = raw.getPrice().setScale(2, RoundingMode.HALF_UP);
            }

            BigDecimal minAllowed = catalogPrice.multiply(BigDecimal.valueOf(100).subtract(MAX_PRICE_DISCOUNT_PERCENT))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            if (unitPrice.compareTo(minAllowed) < 0) {
                if (!isElevated) {
                    requireElevatedApproval(managerUsername, managerPassword,
                            "يلزم موافقة المدير لبيع '" + displayName + "' بأقل من "
                                    + minAllowed + " (الحد الأدنى: خصم " + MAX_PRICE_DISCOUNT_PERCENT + "%).", tenantId);
                }
            }

            SaleItem line = SaleItem.builder()
                    .type(type)
                    .itemId(raw.getItemId())
                    .name(displayName)
                    .quantity(raw.getQuantity())
                    .price(unitPrice)
                    .listPrice(catalogPrice.setScale(2, RoundingMode.HALF_UP))
                    .cost(unitCost)
                    .build();
            validatedItems.add(line);
            subtotal = subtotal.add(unitPrice.multiply(BigDecimal.valueOf(raw.getQuantity())));
        }

        // Loyalty from CRM + cashier manual discount (manual capped at 10% of subtotal)
        BigDecimal loyaltyPercent = BigDecimal.ZERO;
        if (customer != null && customer.getDiscount() != null && customer.getDiscount() > 0) {
            loyaltyPercent = BigDecimal.valueOf(Math.min(100, Math.max(0, customer.getDiscount())));
        }
        BigDecimal loyaltyDiscount = subtotal.multiply(loyaltyPercent)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);

        BigDecimal maxManualDiscount = subtotal.multiply(BigDecimal.TEN)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);

        BigDecimal clientDisc = clientDiscount != null ? clientDiscount.max(BigDecimal.ZERO) : BigDecimal.ZERO;
        // Manual portion = anything the client asked beyond loyalty, capped at 10%
        BigDecimal requestedManual = clientDisc.subtract(loyaltyDiscount).max(BigDecimal.ZERO);
        if (requestedManual.compareTo(maxManualDiscount) > 0) {
            throw new BusinessRuleException(
                    "خصم الكاشير لا يتجاوز 10% من إجمالي الفاتورة (الحد الأقصى: " + maxManualDiscount + ").");
        }
        BigDecimal discount = loyaltyDiscount.add(requestedManual).min(subtotal).setScale(2, RoundingMode.HALF_UP);

        BigDecimal tax = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        // Delivery fee only counts when the order is actually flagged as delivery,
        // even if a stray fee value was sent alongside isDelivery=false.
        BigDecimal deliveryFee = isDelivery && clientDeliveryFee != null
                ? clientDeliveryFee.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal preLoyaltyTotal = subtotal.subtract(discount).add(tax).add(deliveryFee).setScale(2, RoundingMode.HALF_UP);

        // Loyalty balance redemption (the real points/ledger system) is independent from the
        // flat customer.discount% above — it's an additional deduction applied last, clamped
        // to the account balance and configured caps by LoyaltyService.resolveRedemption, which
        // also locks the loyalty account for the rest of this transaction.
        BigDecimal loyaltyRedeemed = loyaltyService.resolveRedemption(tenantId, customer, preLoyaltyTotal, loyaltyRedeemRequested);
        BigDecimal total = preLoyaltyTotal.subtract(loyaltyRedeemed).setScale(2, RoundingMode.HALF_UP);

        if (clientTotal != null
                && clientTotal.subtract(total).abs().compareTo(new BigDecimal("2.00")) > 0) {
            throw new BusinessRuleException(
                    "إجمالي الفاتورة غير متطابق مع أسعار النظام. المتوقع: " + total + "، المُرسل: " + clientTotal);
        }

        List<SalePayment> tenders = new ArrayList<>();
        String payMethod;
        if (payments != null && !payments.isEmpty()) {
            if (payments.size() != 2) {
                throw new BusinessRuleException("الدفع المقسم يجب أن يكون على طريقتين بالضبط.");
            }
            BigDecimal tenderSum = BigDecimal.ZERO;
            Set<String> distinctMethods = new HashSet<>();
            for (SalePaymentRequest tender : payments) {
                String tenderMethod = tender.getMethod() != null ? tender.getMethod().toUpperCase(Locale.ROOT) : "";
                if (!ALLOWED_PAYMENT_METHODS.contains(tenderMethod)) {
                    throw new BusinessRuleException("طريقة دفع غير مدعومة: " + tender.getMethod());
                }
                if (tender.getAmount() == null || tender.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    throw new BusinessRuleException("مبلغ كل طريقة دفع يجب أن يكون أكبر من صفر.");
                }
                distinctMethods.add(tenderMethod);
                tenderSum = tenderSum.add(tender.getAmount());
                tenders.add(SalePayment.builder().method(tenderMethod).amount(tender.getAmount()).build());
            }
            if (distinctMethods.size() != 2) {
                throw new BusinessRuleException("الدفع المقسم يجب أن يكون بطريقتين مختلفتين.");
            }
            if (tenderSum.subtract(total).abs().compareTo(PAYMENT_SUM_TOLERANCE) > 0) {
                throw new BusinessRuleException(
                        "مجموع طرق الدفع (" + tenderSum + ") لا يساوي إجمالي الفاتورة (" + total + ").");
            }
            payMethod = SPLIT_PAYMENT_METHOD;
        } else {
            if (paymentMethod == null || paymentMethod.isBlank()) {
                throw new BusinessRuleException("طريقة الدفع مطلوبة.");
            }
            payMethod = paymentMethod.toUpperCase(Locale.ROOT);
            if (!ALLOWED_PAYMENT_METHODS.contains(payMethod)) {
                throw new BusinessRuleException("طريقة دفع غير مدعومة: " + paymentMethod);
            }
            tenders.add(SalePayment.builder().method(payMethod).amount(total).build());
        }

        Sale sale = Sale.builder()
                .id(UUID.randomUUID().toString())
                .saleNumber("INV-" + UUID.randomUUID().toString().toUpperCase())
                .posSession(session)
                .totalAmount(total)
                .tax(tax)
                .discount(discount)
                .paymentMethod(payMethod)
                .employee(employee)
                .customer(customer)
                .date(Instant.now())
                .status("COMPLETED")
                .delivery(isDelivery)
                .deliveryFee(deliveryFee)
                .loyaltyRedeemed(loyaltyRedeemed)
                .build();

        sale = saleRepository.save(sale);

        // Ledger write happens synchronously, in this same transaction: if checkout rolls
        // back for any reason (including an idempotency-retry failure), the redemption rolls
        // back with it. Earning is handled separately, post-commit (see LoyaltyEarnListener).
        if (customer != null && loyaltyRedeemed.compareTo(BigDecimal.ZERO) > 0) {
            loyaltyService.recordRedemption(sale, customer, loyaltyRedeemed, employee);
        }

        List<SaleItem> savedItems = new ArrayList<>();
        for (SaleItem item : validatedItems) {
            item.setId(UUID.randomUUID().toString());
            item.setSale(sale);
            savedItems.add(itemRepository.save(item));
        }
        sale.setItems(savedItems);

        List<SalePayment> savedPayments = new ArrayList<>();
        for (SalePayment tender : tenders) {
            tender.setId(UUID.randomUUID().toString());
            tender.setSale(sale);
            savedPayments.add(paymentRepository.save(tender));
        }
        sale.setPayments(savedPayments);

        // Batch FIFO/FEFO allocation updates stock mirrors via InventoryStockSyncService
        for (SaleItem item : savedItems) {
            if ("PRODUCT".equalsIgnoreCase(item.getType())) {
                fifoCostingService.allocateSaleItemFifo(tenantId, warehouseId, item, employeeId);
            }
        }

        auditLogRepository.save(AuditLog.builder()
                .id(UUID.randomUUID().toString())
                .employee(employee)
                .action("POS_CHECKOUT")
                .affectedEntity("Sale")
                .entityId(sale.getId())
                .newState("Checked out sale: " + sale.getSaleNumber() + ", Total: $" + sale.getTotalAmount())
                .timestamp(sale.getDate())
                .build());

        // Ledger + notifications after commit (stock already committed with sale)
        eventPublisher.publishEvent(new SaleCompletedEvent(this, sale));

        return sale;
    }

    public Sale refundSale(String saleId, String employeeId) {
        return refundSale(saleId, employeeId, null).getSale();
    }

    public SaleRefundResult refundSale(String saleId, String employeeId, List<SaleRefundLineRequest> lines) {
        if (saleId == null || saleId.isBlank()) {
            throw new BusinessRuleException("معرّف الفاتورة مطلوب للإرجاع.");
        }
        if (employeeId == null || employeeId.isBlank()) {
            throw new BusinessRuleException("معرّف الموظف مطلوب لتسجيل الإرجاع.");
        }

        Employee refundingEmployee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new ResourceNotFoundException("الموظف غير موجود: " + employeeId));

        if (refundingEmployee.getTenant() == null || refundingEmployee.getTenant().getId() == null) {
            throw new BusinessRuleException("لا يمكن تحديد الشركة (Tenant) لهذه العملية.");
        }
        String tenantId = refundingEmployee.getTenant().getId();

        Sale sale = saleRepository.findByIdAndTenantId(saleId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("الفاتورة غير موجودة: " + saleId));

        if ("REFUNDED".equalsIgnoreCase(sale.getStatus())) {
            return SaleRefundResult.builder()
                    .sale(sale)
                    .refundAmount(BigDecimal.ZERO)
                    .cogsReversed(BigDecimal.ZERO)
                    .fullRefund(true)
                    .build();
        }
        if (sale.getStatus() != null
                && !"COMPLETED".equalsIgnoreCase(sale.getStatus())
                && !"PARTIALLY_REFUNDED".equalsIgnoreCase(sale.getStatus())) {
            throw new BusinessRuleException("لا يمكن إرجاع فاتورة بحالة: " + sale.getStatus());
        }

        tenantId = resolveTenantId(sale.getPosSession(), refundingEmployee);

        Map<String, Integer> refundQtyByItemId = new LinkedHashMap<>();
        if (lines == null || lines.isEmpty()) {
            if (sale.getItems() != null) {
                for (SaleItem item : sale.getItems()) {
                    if ("PRODUCT".equalsIgnoreCase(item.getType())) {
                        int returnable = returnableQuantity(item);
                        if (returnable > 0) {
                            refundQtyByItemId.put(item.getId(), returnable);
                        }
                    }
                }
            }
        } else {
            for (SaleRefundLineRequest line : lines) {
                if (line.getSaleItemId() == null || line.getSaleItemId().isBlank()) {
                    throw new BusinessRuleException("معرّف بند الفاتورة مطلوب للإرجاع الجزئي.");
                }
                if (line.getQuantity() == null || line.getQuantity() <= 0) {
                    throw new BusinessRuleException("كمية الإرجاع يجب أن تكون أكبر من صفر.");
                }
                refundQtyByItemId.merge(line.getSaleItemId(), line.getQuantity(), Integer::sum);
            }
        }

        if (refundQtyByItemId.isEmpty()) {
            throw new BusinessRuleException("لا توجد كميات قابلة للإرجاع في هذه الفاتورة.");
        }

        BigDecimal saleSubtotal = BigDecimal.ZERO;
        if (sale.getItems() != null) {
            for (SaleItem item : sale.getItems()) {
                saleSubtotal = saleSubtotal.add(
                        item.getPrice().multiply(BigDecimal.valueOf(item.getQuantity())));
            }
        }

        BigDecimal returnLineSubtotal = BigDecimal.ZERO;
        BigDecimal productRevenue = BigDecimal.ZERO;
        BigDecimal serviceRevenue = BigDecimal.ZERO;
        BigDecimal totalCogsReversed = BigDecimal.ZERO;
        List<SaleRefundLineRequest> processed = new ArrayList<>();

        for (Map.Entry<String, Integer> entry : refundQtyByItemId.entrySet()) {
            String saleItemId = entry.getKey();
            int qty = entry.getValue();
            SaleItem item = sale.getItems().stream()
                    .filter(i -> saleItemId.equals(i.getId()))
                    .findFirst()
                    .orElseThrow(() -> new BusinessRuleException("بند غير موجود في الفاتورة: " + saleItemId));

            if (!"PRODUCT".equalsIgnoreCase(item.getType())) {
                throw new BusinessRuleException("يمكن إرجاع المنتجات فقط عبر FIFO: " + item.getName());
            }

            int returnable = returnableQuantity(item);
            if (qty > returnable) {
                throw new BusinessRuleException(
                        "كمية الإرجاع للصنف '" + item.getName() + "' تتجاوز المتاح (" + returnable + ").");
            }

            BigDecimal lineReturnSubtotal = item.getPrice().multiply(BigDecimal.valueOf(qty));
            returnLineSubtotal = returnLineSubtotal.add(lineReturnSubtotal);
            productRevenue = productRevenue.add(lineReturnSubtotal);

            String warehouseId = resolveSalesWarehouseId(sale.getPosSession().getBranch());

            BigDecimal cogsReversed = fifoCostingService.processCustomerReturn(
                    tenantId,
                    warehouseId,
                    item.getId(),
                    qty,
                    employeeId);
            totalCogsReversed = totalCogsReversed.add(cogsReversed);
            processed.add(SaleRefundLineRequest.builder().saleItemId(saleItemId).quantity(qty).build());
        }

        BigDecimal discountReversed = BigDecimal.ZERO;
        if (sale.getDiscount() != null && sale.getDiscount().compareTo(BigDecimal.ZERO) > 0
                && saleSubtotal.compareTo(BigDecimal.ZERO) > 0) {
            discountReversed = sale.getDiscount()
                    .multiply(returnLineSubtotal)
                    .divide(saleSubtotal, 2, RoundingMode.HALF_UP);
        }

        BigDecimal taxReversed = BigDecimal.ZERO;
        if (sale.getTax() != null && sale.getTax().compareTo(BigDecimal.ZERO) > 0
                && saleSubtotal.compareTo(BigDecimal.ZERO) > 0) {
            taxReversed = sale.getTax()
                    .multiply(returnLineSubtotal)
                    .divide(saleSubtotal, 2, RoundingMode.HALF_UP);
        }

        BigDecimal refundAmount = returnLineSubtotal.subtract(discountReversed).add(taxReversed)
                .setScale(2, RoundingMode.HALF_UP);

        List<SalePaymentSummaryDTO> refundBreakdown = buildRefundBreakdown(sale, refundAmount);

        BigDecimal loyaltyRatio = saleSubtotal.compareTo(BigDecimal.ZERO) > 0
                ? returnLineSubtotal.divide(saleSubtotal, 6, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        boolean fullRefund = isFullyRefunded(sale);
        sale.setStatus(fullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED");
        sale = saleRepository.saveAndFlush(sale);

        auditLogRepository.save(AuditLog.builder()
                .id(UUID.randomUUID().toString())
                .employee(refundingEmployee)
                .action(fullRefund ? "REFUND" : "PARTIAL_REFUND")
                .affectedEntity("Sale")
                .entityId(sale.getId())
                .oldState(sale.getStatus())
                .newState((fullRefund ? "Full refund " : "Partial refund ") + sale.getSaleNumber()
                        + " amount " + refundAmount)
                .timestamp(Instant.now())
                .build());

        SaleRefundFinancials financials = SaleRefundFinancials.builder()
                .refundAmount(refundAmount)
                .productRevenueReversed(productRevenue)
                .serviceRevenueReversed(serviceRevenue)
                .discountReversed(discountReversed)
                .taxReversed(taxReversed)
                .cogsReversed(totalCogsReversed)
                .fullRefund(fullRefund)
                .loyaltyRatio(loyaltyRatio)
                .build();

        eventPublisher.publishEvent(new SaleRefundedEvent(this, sale, employeeId, financials));

        return SaleRefundResult.builder()
                .sale(sale)
                .refundAmount(refundAmount)
                .cogsReversed(totalCogsReversed)
                .fullRefund(fullRefund)
                .linesProcessed(processed)
                .refundBreakdown(refundBreakdown)
                .build();
    }

    /**
     * Prorates a refund amount across a sale's original tenders by each tender's share of the
     * sale total (same proportional-reversal approach already used above for discount/tax), so a
     * refund on a split (e.g. cash + card) sale tells the cashier how much of each tender to return.
     */
    private List<SalePaymentSummaryDTO> buildRefundBreakdown(Sale sale, BigDecimal refundAmount) {
        List<SalePayment> tenders = sale.getPayments();
        if (tenders == null || tenders.isEmpty() || sale.getTotalAmount() == null
                || sale.getTotalAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return List.of(SalePaymentSummaryDTO.builder()
                    .method(sale.getPaymentMethod())
                    .amount(refundAmount)
                    .build());
        }
        List<SalePaymentSummaryDTO> breakdown = new ArrayList<>();
        for (SalePayment tender : tenders) {
            BigDecimal share = refundAmount.multiply(tender.getAmount())
                    .divide(sale.getTotalAmount(), 2, RoundingMode.HALF_UP);
            breakdown.add(SalePaymentSummaryDTO.builder().method(tender.getMethod()).amount(share).build());
        }
        return breakdown;
    }

    private int returnableQuantity(SaleItem item) {
        int fromAllocations = saleItemBatchAllocationRepository.findBySaleItemId(item.getId()).stream()
                .mapToInt(SaleItemBatchAllocation::getQuantityAllocated)
                .sum();
        if (fromAllocations > 0) {
            return fromAllocations;
        }
        return Math.max(0, item.getQuantity() - item.getQuantityReturned());
    }

    private boolean isFullyRefunded(Sale sale) {
        if (sale.getItems() == null || sale.getItems().isEmpty()) {
            return true;
        }
        for (SaleItem item : sale.getItems()) {
            if ("PRODUCT".equalsIgnoreCase(item.getType()) && returnableQuantity(item) > 0) {
                return false;
            }
        }
        return true;
    }

    /** Prefer product title on the invoice; append variant only when it adds info. */
    private String buildProductDisplayName(ProductVariant variant) {
        String variantName = variant.getName() != null ? variant.getName().trim() : "";
        String productName = "";
        if (variant.getProduct() != null && variant.getProduct().getName() != null) {
            productName = variant.getProduct().getName().trim();
        }

        if (productName.isEmpty()) {
            return variantName.isEmpty() ? "Item" : variantName;
        }
        if (isWeakDisplayName(variantName) || variantName.equalsIgnoreCase(productName)) {
            return productName;
        }
        return productName + " (" + variantName + ")";
    }

    private boolean isWeakDisplayName(String name) {
        if (name == null) return true;
        String t = name.trim();
        if (t.isEmpty()) return true;
        return t.equals("...")
                || t.equalsIgnoreCase("standard")
                || t.equalsIgnoreCase("default")
                || t.equalsIgnoreCase("item")
                || t.equalsIgnoreCase("product");
    }

    private String resolveTenantId(POSSession session, Employee employee) {
        if (session != null && session.getBranch() != null) {
            Branch branch = session.getBranch();
            Tenant branchTenant = branch.getTenant();
            if (branchTenant != null && branchTenant.getId() != null && !branchTenant.getId().isBlank()) {
                return branchTenant.getId();
            }
        }
        if (employee.getTenant() != null && employee.getTenant().getId() != null && !employee.getTenant().getId().isBlank()) {
            return employee.getTenant().getId();
        }
        throw new BusinessRuleException("لا يمكن تحديد الشركة (Tenant) لهذه العملية. راجع ربط الموظف والفرع.");
    }

    /**
     * Deterministic sales-warehouse resolution. Every other stock-affecting flow (receiving,
     * manual adjustment, imports — see StockService.DEFAULT_SALES_WAREHOUSE usages) treats the
     * well-known retail-facing warehouse ("wh-shelf") as where sellable stock lives; this used to
     * instead take "the first warehouse for the branch" off an unordered query, which could
     * resolve to a different warehouse (e.g. "wh-main") that legitimately has zero stock for an
     * item sitting on the shelf — checkout would then report the item unavailable even though the
     * catalog correctly showed it in stock. Only fall back to another warehouse (sorted
     * deterministically, never relying on DB row order) if the default doesn't exist for this
     * branch at all.
     */
    private String resolveSalesWarehouseId(Branch branch) {
        List<Warehouse> branchWarehouses = warehouseRepository.findByBranchId(branch.getId());
        boolean hasDefault = branchWarehouses.stream()
                .anyMatch(w -> StockService.DEFAULT_SALES_WAREHOUSE.equals(w.getId()));
        if (hasDefault) {
            return StockService.DEFAULT_SALES_WAREHOUSE;
        }
        return branchWarehouses.stream()
                .map(Warehouse::getId)
                .min(Comparator.naturalOrder())
                .orElse(StockService.DEFAULT_SALES_WAREHOUSE);
    }

    /**
     * Batch layers are source of truth. Reconcile mirrors so variant.stock matches batches (never inflate batches from stale variant qty).
     */
    private int resolveBatchAvailability(
            String tenantId, String warehouseId, ProductVariant variant, int quantityNeeded, String employeeId) {
        int displayed = fifoCostingService.getAvailableBatchQuantity(tenantId, warehouseId, variant.getId());
        if (displayed >= quantityNeeded) {
            return displayed;
        }

        try {
            inventoryIntegrityService.reconcileTenant(tenantId);
        } catch (Exception ignored) {
            // best-effort: batch layers are source of truth
        }
        return fifoCostingService.getAvailableBatchQuantity(tenantId, warehouseId, variant.getId());
    }

    private void requireElevatedApproval(String managerUsername, String managerPassword, String message, String tenantId) {
        if (managerPassword == null || managerPassword.isBlank()) {
            throw new BusinessRuleException(message);
        }
        String username = managerUsername;
        if (username == null || username.isBlank()) {
            username = employeeRepository.findByTenantId(tenantId).stream()
                    .filter(e -> "OWNER".equalsIgnoreCase(e.getRole()) || "MANAGER".equalsIgnoreCase(e.getRole()))
                    .map(Employee::getUsername)
                    .findFirst()
                    .orElseThrow(() -> new BusinessRuleException("لا يوجد مدير متاح في النظام لطلب الموافقة."));
        }
        try {
            Authentication auth = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(username, managerPassword));
            UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
            String elevatedRole = principal.getEmployee().getRole();
            if (elevatedRole == null || !Set.of("OWNER", "MANAGER").contains(elevatedRole.toUpperCase(Locale.ROOT))) {
                throw new BusinessRuleException("الرمز المدخل ليس لمدير أو مالك معتمد.");
            }
        } catch (BusinessRuleException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessRuleException("رمز المدير غير صحيح.");
        }
    }
}
