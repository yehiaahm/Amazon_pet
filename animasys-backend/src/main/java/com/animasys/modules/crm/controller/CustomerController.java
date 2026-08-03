package com.animasys.modules.crm.controller;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.dto.CreateCustomerPetRequest;
import com.animasys.modules.crm.dto.CreateCustomerRequest;
import com.animasys.modules.crm.service.CustomerService;
import com.animasys.modules.sales.domain.Sale;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/v1/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    @PostMapping
    @PreAuthorize("@authz.has('customers.add')")
    public ResponseEntity<ApiResponseWrapper<Customer>> createCustomer(
            @Valid @RequestBody CreateCustomerRequest request) {
        String tenantId = SecurityUtils.requireTenantId();
        Customer dto = toCustomer(request);
        Pet petDto = toPet(request.getPet());
        Customer created = customerService.createCustomer(tenantId, dto, petDto);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponseWrapper.success(created, "تم تسجيل العميل بنجاح"));
    }

    @GetMapping
    @PreAuthorize("@authz.has('customers.view')")
    public ResponseEntity<ApiResponseWrapper<List<Customer>>> getAllCustomers(
            @RequestParam(required = false) String search) {
        String tenantId = SecurityUtils.requireTenantId();
        List<Customer> list = customerService.searchCustomersList(tenantId, search);
        return ResponseEntity.ok(ApiResponseWrapper.success(list, "تم استرجاع قائمة العملاء"));
    }

    @GetMapping("/{id}")
    @PreAuthorize("@authz.has('customers.view')")
    public ResponseEntity<ApiResponseWrapper<Customer>> getCustomer(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        Customer customer = customerService.getById(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(customer, "تم استرجاع بيانات العميل"));
    }

    @PutMapping("/{id}")
    @PreAuthorize("@authz.has('customers.edit')")
    public ResponseEntity<ApiResponseWrapper<Customer>> updateCustomer(
            @PathVariable String id,
            @Valid @RequestBody Customer dto) {
        String tenantId = SecurityUtils.requireTenantId();
        Customer updated = customerService.updateCustomer(tenantId, id, dto);
        return ResponseEntity.ok(ApiResponseWrapper.success(updated, "تم تحديث بيانات العميل"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("@authz.has('customers.delete')")
    public ResponseEntity<ApiResponseWrapper<Void>> deleteCustomer(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        customerService.deleteCustomer(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(null, "تم حذف العميل"));
    }

    @GetMapping("/{id}/pets")
    @PreAuthorize("@authz.has('pets.view')")
    public ResponseEntity<ApiResponseWrapper<List<Pet>>> getCustomerPets(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        List<Pet> pets = customerService.getPetsByCustomer(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(pets, "تم استرجاع قائمة الحيوانات الأليفة"));
    }

    @GetMapping("/{id}/sales")
    @PreAuthorize("@authz.has('customers.view_purchase_history')")
    public ResponseEntity<ApiResponseWrapper<List<Sale>>> getCustomerPurchaseHistory(@PathVariable String id) {
        String tenantId = SecurityUtils.requireTenantId();
        List<Sale> sales = customerService.getPurchaseHistory(tenantId, id);
        return ResponseEntity.ok(ApiResponseWrapper.success(sales, "تم استرجاع سجل مشتريات العميل"));
    }

    private Customer toCustomer(CreateCustomerRequest request) {
        Customer c = new Customer();
        c.setName(request.resolvedName());
        c.setPhone(request.resolvedPhone());
        c.setEmail(request.resolvedEmail());
        c.setIsBanned(request.resolvedIsBanned());
        c.setDiscount(request.resolvedDiscount());
        c.setNotes(request.resolvedNotes());
        return c;
    }

    private Pet toPet(CreateCustomerPetRequest petReq) {
        if (petReq == null || petReq.getName() == null || petReq.getName().isBlank()) {
            return null;
        }
        Pet p = new Pet();
        p.setName(petReq.getName().trim());
        p.setSpecies(petReq.getSpecies() != null ? petReq.getSpecies() : "OTHER");
        p.setBreed(petReq.getBreed());
        p.setAge(petReq.getAge());
        return p;
    }
}
