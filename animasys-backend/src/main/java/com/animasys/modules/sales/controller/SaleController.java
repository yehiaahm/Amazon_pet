package com.animasys.modules.sales.controller;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.core.security.UserPrincipal;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SaleItem;
import com.animasys.modules.sales.domain.SaleItemBatchAllocation;
import com.animasys.modules.sales.dto.CreateSaleRequest;
import com.animasys.modules.sales.dto.SaleBatchAllocationViewDTO;
import com.animasys.modules.sales.dto.SaleLineRequest;
import com.animasys.modules.sales.dto.SalePageResponse;
import com.animasys.modules.sales.dto.SaleRefundLineRequest;
import com.animasys.modules.sales.dto.SaleRefundRequest;
import com.animasys.modules.sales.dto.SaleRefundResult;
import com.animasys.modules.sales.dto.SaleSearchCriteria;
import com.animasys.modules.sales.repository.SaleItemBatchAllocationRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.sales.service.SaleQueryService;
import com.animasys.modules.sales.service.SaleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/v1/sales")
@RequiredArgsConstructor
public class SaleController {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Africa/Cairo");

    private final SaleService saleService;
    private final SaleQueryService saleQueryService;
    private final SaleRepository saleRepository;
    private final SaleItemBatchAllocationRepository saleItemBatchAllocationRepository;
    private final AuthenticationManager authenticationManager;

    @GetMapping
    @PreAuthorize("@authz.has('sales.create_sale')")
    public ResponseEntity<ApiResponseWrapper<SalePageResponse>> searchSales(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant dateTo,
            @RequestParam(required = false) String customer,
            @RequestParam(required = false) String employee,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String paymentMethod
    ) {
        Employee actor = SecurityUtils.requireEmployee();
        String tenantId = SecurityUtils.requireTenantId();

        SaleSearchCriteria criteria = SaleSearchCriteria.builder()
                .page(page)
                .size(size)
                .sort(sort)
                .search(search)
                .dateFrom(dateFrom)
                .dateTo(dateTo)
                .customer(customer)
                .employee(employee)
                .status(status)
                .paymentMethod(paymentMethod)
                .build();

        SalePageResponse result = saleQueryService.search(tenantId, actor, criteria);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم استرجاع قائمة المبيعات بنجاح"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('sales.create_sale')")
    public ResponseEntity<ApiResponseWrapper<Sale>> getSaleById(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        Sale sale = saleRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessRuleException("الفاتورة غير موجودة"));
        enforceSaleAccess(SecurityUtils.requireEmployee(), sale);
        return ResponseEntity.ok(ApiResponseWrapper.success(sale, "تم استرجاع الفاتورة بنجاح"));
    }

    @GetMapping("/{id}/batch-allocations")
    @PreAuthorize("@authz.has('sales.create_sale')")
    public ResponseEntity<ApiResponseWrapper<List<SaleBatchAllocationViewDTO>>> getSaleBatchAllocations(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        Sale sale = saleRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessRuleException("الفاتورة غير موجودة"));
        enforceSaleAccess(SecurityUtils.requireEmployee(), sale);
        List<SaleBatchAllocationViewDTO> rows = new ArrayList<>();
        if (sale.getItems() != null) {
            for (SaleItem item : sale.getItems()) {
                List<SaleItemBatchAllocation> allocs = saleItemBatchAllocationRepository.findBySaleItemId(item.getId());
                for (SaleItemBatchAllocation alloc : allocs) {
                    rows.add(SaleBatchAllocationViewDTO.builder()
                            .saleItemId(item.getId())
                            .productName(item.getName())
                            .batchNumber(alloc.getInventoryBatch() != null ? alloc.getInventoryBatch().getBatchNumber() : null)
                            .inventoryBatchId(alloc.getInventoryBatch() != null ? alloc.getInventoryBatch().getId() : null)
                            .quantityAllocated(alloc.getQuantityAllocated())
                            .unitCostAtSale(alloc.getUnitCostAtSale())
                            .totalAllocatedCost(alloc.getTotalAllocatedCost())
                            .build());
                }
            }
        }
        return ResponseEntity.ok(ApiResponseWrapper.success(rows, "Batch allocations for sale"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('sales.create_sale')")
    public ResponseEntity<ApiResponseWrapper<Sale>> createSale(@Valid @RequestBody CreateSaleRequest request) {
        String employeeId = SecurityUtils.requireEmployeeId();
        List<SaleItem> items = mapSaleItems(request.getItems());

        Sale created = saleService.createSale(
                request.getPosSessionId(),
                employeeId,
                request.getCustomerId(),
                request.getTotalAmount(),
                request.getTax(),
                request.getDiscount(),
                request.getPaymentMethod(),
                items,
                request.getManagerUsername(),
                request.getManagerPassword());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل المبيعات بنجاح"));
    }

    @PostMapping("/{id}/refund")
    @PreAuthorize("@authz.has('sales.refund_sale')")
    public ResponseEntity<ApiResponseWrapper<SaleRefundResult>> refundSale(
            @PathVariable String id,
            @Valid @RequestBody(required = false) SaleRefundRequest body) {
        Employee actor = SecurityUtils.requireEmployee();
        String tenantId = SecurityUtils.requireTenantId();
        String role = actor.getRole() != null ? actor.getRole().toUpperCase(Locale.ROOT) : "";

        Sale sale = saleRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessRuleException("الفاتورة غير موجودة"));
        enforceSaleAccess(actor, sale);

        if ("CASHIER".equals(role)) {
            String managerUsername = body != null ? body.getManagerUsername() : null;
            String managerPassword = body != null ? body.getManagerPassword() : null;
            requireElevatedApproval(managerUsername, managerPassword);
        }

        List<SaleRefundLineRequest> lines = body != null ? body.getLines() : null;
        SaleRefundResult result = saleService.refundSale(id, actor.getId(), lines);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم إرجاع الفاتورة وعكس المخزون بنجاح"));
    }

    private List<SaleItem> mapSaleItems(List<SaleLineRequest> lines) {
        List<SaleItem> items = new ArrayList<>();
        for (SaleLineRequest line : lines) {
            String typeRaw = line.getType() != null ? line.getType() : "PRODUCT";
            if ("null".equalsIgnoreCase(typeRaw) || typeRaw.isBlank()) {
                typeRaw = "PRODUCT";
            }
            BigDecimal listPrice = line.getListPrice() != null ? line.getListPrice() : line.getPrice();
            items.add(SaleItem.builder()
                    .type(typeRaw)
                    .itemId(line.getItemId())
                    .name(line.getName() != null ? line.getName() : "")
                    .quantity(line.getQuantity())
                    .price(line.getPrice())
                    .listPrice(listPrice)
                    .cost(line.getCost())
                    .build());
        }
        return items;
    }

    private void enforceSaleAccess(Employee actor, Sale sale) {
        String actorTenantId = actor.getTenant() != null ? actor.getTenant().getId() : null;
        String saleTenantId = sale.getEmployee() != null && sale.getEmployee().getTenant() != null
                ? sale.getEmployee().getTenant().getId()
                : null;
        if (actorTenantId == null || saleTenantId == null || !actorTenantId.equals(saleTenantId)) {
            throw new AccessDeniedException("Sale not accessible for this tenant");
        }

        String role = actor.getRole() != null ? actor.getRole().toUpperCase(Locale.ROOT) : "";
        if (!"CASHIER".equals(role)) {
            return;
        }
        if (sale.getEmployee() == null || !actor.getId().equals(sale.getEmployee().getId())) {
            throw new AccessDeniedException("الكاشير يمكنه التعامل فقط مع فواتيره");
        }
        if (!isToday(sale.getDate())) {
            throw new AccessDeniedException("الكاشier يمكنه التعامل فقط مع فواتير اليوم");
        }
    }

    private boolean isToday(Instant date) {
        if (date == null) return false;
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        LocalDate saleDay = date.atZone(BUSINESS_ZONE).toLocalDate();
        return today.equals(saleDay);
    }

    private void requireElevatedApproval(String managerUsername, String managerPassword) {
        if (managerPassword == null || managerPassword.isBlank()) {
            throw new BusinessRuleException("يلزم إدخال رمز المدير لإتمام الإرجاع.");
        }
        String username = (managerUsername != null && !managerUsername.isBlank())
                ? managerUsername
                : "owner_marwan";
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
