package com.animasys.modules.finance.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.service.ExpenseService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/v1/expenses")
@RequiredArgsConstructor
public class ExpenseController {

    private final ExpenseService expenseService;

    @GetMapping
    @PreAuthorize("@authz.has('finance.view_expenses')")
    public ResponseEntity<ApiResponseWrapper<List<Expense>>> getExpenses(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        String tenantId = SecurityUtils.requireTenantId();
        List<Expense> list;
        if (from != null && to != null) {
            list = expenseService.getByTenantAndDateRange(tenantId, from, to);
        } else {
            list = expenseService.getAllByTenant(tenantId);
        }
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة المصاريف بنجاح"));
    }

    @PostMapping
    @PreAuthorize("@authz.has('finance.add_expense')")
    public ResponseEntity<ApiResponseWrapper<Expense>> createExpense(@RequestBody Expense dto) {
        String tenantId = SecurityUtils.requireTenantId();
        String branchId = SecurityUtils.requireBranchId();
        Expense created = expenseService.createExpense(tenantId, branchId, dto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل المصروف بنجاح"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('finance.view_expenses')")
    public ResponseEntity<ApiResponseWrapper<Expense>> getExpenseById(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        Expense expense = expenseService.getById(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(expense, "تم استرجاع تفاصيل المصروف"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('finance.delete_expense')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteExpense(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        expenseService.deleteExpense(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف المصروف بنجاح"));
    }
}
