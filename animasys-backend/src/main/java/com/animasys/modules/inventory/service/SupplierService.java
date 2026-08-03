package com.animasys.modules.inventory.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.inventory.domain.Supplier;
import com.animasys.modules.inventory.repository.SupplierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class SupplierService {

    private final SupplierRepository supplierRepository;
    private final TenantRepository tenantRepository;

    public Supplier createSupplier(String tenantId, Supplier dto) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));

        Supplier supplier = Supplier.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name(dto.getName())
                .supplierCode(dto.getSupplierCode() != null ? dto.getSupplierCode() : "SUP-" + UUID.randomUUID().toString().substring(0, 8))
                .phone(dto.getPhone())
                .address(dto.getAddress())
                .taxNumber(dto.getTaxNumber())
                .build();

        return supplierRepository.save(supplier);
    }

    @Transactional(readOnly = true)
    public List<Supplier> getAllByTenant(String tenantId) {
        // Since we don't have findByTenantId yet, let's write it in supplierRepository or use a generic list filter
        // Wait, let's look at the current SupplierRepository — it has findByNameIgnoreCaseAndTenantId and findBySupplierCodeAndTenantId
        // Let's add findByTenantId to SupplierRepository
        return supplierRepository.findByTenantId(tenantId);
    }

    @Transactional(readOnly = true)
    public Supplier getById(String tenantId, String id) {
        return supplierRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier not found: " + id));
    }

    public Supplier updateSupplier(String tenantId, String id, Supplier dto) {
        Supplier existing = getById(tenantId, id);
        existing.setName(dto.getName());
        existing.setPhone(dto.getPhone());
        existing.setAddress(dto.getAddress());
        existing.setTaxNumber(dto.getTaxNumber());
        return supplierRepository.save(existing);
    }

    public void deleteSupplier(String tenantId, String id) {
        Supplier existing = getById(tenantId, id);
        supplierRepository.delete(existing);
    }
}
