package com.animasys.modules.inventory.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.inventory.domain.PurchaseInvoice;
import com.animasys.modules.inventory.dto.PurchaseInvoiceCreateResult;
import com.animasys.modules.inventory.dto.PurchaseReturnRequest;
import com.animasys.modules.inventory.dto.PurchaseReturnResult;
import com.animasys.modules.inventory.service.PurchaseInvoiceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/purchase-invoices")
@RequiredArgsConstructor
public class PurchaseInvoiceController {

    private final PurchaseInvoiceService purchaseInvoiceService;

    @PostMapping
    @PreAuthorize("@authz.has('purchases.create_invoice')")
    public ResponseEntity<ApiResponseWrapper<PurchaseInvoice>> createInvoice(@RequestBody PurchaseInvoice invoice) {
        String employeeId = SecurityUtils.requireEmployeeId();
        String tenantId = SecurityUtils.requireTenantId();
        PurchaseInvoiceCreateResult created = purchaseInvoiceService.createInvoice(invoice, employeeId, tenantId);
        String message = created.getStockReceiptWarnings().isEmpty()
                ? "تم حفظ فاتورة الشراء وتحديث المخزون بنجاح"
                : "تم حفظ الفاتورة مع تحذيرات على بعض الأسطر (لم تدخل للمخزون)";
        return ResponseEntity.ok(ApiResponseWrapper.success(
                created.getInvoice(), message, created.getStockReceiptWarnings()));
    }

    @GetMapping
    @PreAuthorize("@authz.has('purchases.view')")
    public ResponseEntity<ApiResponseWrapper<List<PurchaseInvoice>>> getAllInvoices() {
        String tenantId = SecurityUtils.requireTenantId();
        List<PurchaseInvoice> list = purchaseInvoiceService.getAllInvoicesByTenant(tenantId);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة فواتير الشراء بنجاح"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('purchases.view')")
    public ResponseEntity<ApiResponseWrapper<PurchaseInvoice>> getInvoiceById(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        PurchaseInvoice invoice = purchaseInvoiceService.getInvoiceById(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(invoice, "تم استرجاع تفاصيل فاتورة الشراء"));
    }

    @PostMapping("/{id}/return")
    @PreAuthorize("@authz.has('purchases.return')")
    public ResponseEntity<ApiResponseWrapper<PurchaseReturnResult>> returnInvoice(
            @PathVariable String id,
            @RequestBody(required = false) PurchaseReturnRequest body) {
        String employeeId = SecurityUtils.requireEmployeeId();
        String tenantId = SecurityUtils.requireTenantId();
        PurchaseReturnResult result = purchaseInvoiceService.returnInvoice(tenantId, employeeId, id, body);
        return ResponseEntity.ok(ApiResponseWrapper.success(result, "تم إرجاع البضاعة للمورد وتحديث المخزون والحساب بنجاح"));
    }

}
