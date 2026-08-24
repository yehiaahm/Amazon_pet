package com.animasys.modules.crm.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.crm.repository.PetRepository;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final PetRepository petRepository;
    private final TenantRepository tenantRepository;
    private final SaleRepository saleRepository;

    public Customer createCustomer(String tenantId, Customer dto, Pet petDto) {
        if (dto.getName() == null || dto.getName().isBlank()) {
            throw new BusinessRuleException("اسم العميل مطلوب");
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found: " + tenantId));

        String normalizedPhone = normalizePhone(dto.getPhone());

        // Fast-path check: rejects the common sequential case with a clean, specific message.
        // This alone is a check-then-insert race under concurrency — the DB unique constraint
        // on (tenant_id, phone_dedupe_key) added in V49 is what actually closes that race; the
        // catch below turns its violation into the same clean business error instead of a 500.
        if (normalizedPhone != null) {
            customerRepository.findByPhoneAndTenantId(normalizedPhone, tenantId)
                    .ifPresent(existing -> {
                        throw new BusinessRuleException("عميل بهذا الرقم مسجل بالفعل: " + normalizedPhone);
                    });
        }

        Customer customer = Customer.builder()
                .id(UUID.randomUUID().toString())
                .tenant(tenant)
                .name(dto.getName().trim())
                .phone(normalizedPhone)
                .phoneDedupeKey(normalizedPhone)
                .email(dto.getEmail())
                .isBanned(dto.getIsBanned() != null ? dto.getIsBanned() : false)
                .discount(clampDiscount(dto.getDiscount() != null ? dto.getDiscount() : 0))
                .notes(normalizeNotes(dto.getNotes()))
                .build();

        try {
            customer = customerRepository.saveAndFlush(customer);
        } catch (DataIntegrityViolationException e) {
            throw new BusinessRuleException("عميل بهذا الرقم مسجل بالفعل: " + normalizedPhone);
        }

        if (petDto != null && petDto.getName() != null && !petDto.getName().isBlank()) {
            Pet pet = Pet.builder()
                    .id(UUID.randomUUID().toString())
                    .customer(customer)
                    .name(petDto.getName())
                    .species(petDto.getSpecies())
                    .breed(petDto.getBreed())
                    .age(petDto.getAge())
                    .build();
            petRepository.save(pet);
        }

        return customer;
    }

    @Transactional(readOnly = true)
    public List<Customer> getAllCustomers(String tenantId) {
        return customerRepository.findByTenantId(tenantId);
    }

    @Transactional(readOnly = true)
    public List<Customer> searchCustomersList(String tenantId, String query) {
        if (query == null || query.isBlank()) {
            return getAllCustomers(tenantId);
        }
        return customerRepository.searchByTenantId(tenantId, query.trim());
    }

    @Transactional(readOnly = true)
    public Page<Customer> searchCustomers(String tenantId, String query, Pageable pageable) {
        if (query == null || query.isBlank()) {
            return customerRepository.findByTenantId(tenantId, pageable);
        }
        return customerRepository.findByTenantIdAndNameContainingIgnoreCaseOrTenantIdAndPhoneContaining(
                tenantId, query, tenantId, query, pageable);
    }

    @Transactional(readOnly = true)
    public Customer getById(String tenantId, String id) {
        return requireCustomerForTenant(tenantId, id);
    }

    public Customer updateCustomer(String tenantId, String id, Customer dto) {
        Customer existing = requireCustomerForTenant(tenantId, id);

        if (dto.getName() == null || dto.getName().isBlank()) {
            throw new BusinessRuleException("اسم العميل مطلوب");
        }

        String normalizedPhone = normalizePhone(dto.getPhone());

        // Prevent duplicate phone within the same tenant (allow keeping own number)
        if (normalizedPhone != null) {
            customerRepository.findByPhoneAndTenantId(normalizedPhone, tenantId)
                    .ifPresent(other -> {
                        if (!other.getId().equals(id)) {
                            throw new BusinessRuleException("عميل بهذا الرقم مسجل بالفعل: " + normalizedPhone);
                        }
                    });
        }

        existing.setName(dto.getName().trim());
        existing.setPhone(normalizedPhone);
        existing.setPhoneDedupeKey(normalizedPhone);
        existing.setEmail(dto.getEmail());
        if (dto.getNotes() != null) {
            existing.setNotes(normalizeNotes(dto.getNotes()));
        }
        if (dto.getIsBanned() != null) {
            existing.setIsBanned(dto.getIsBanned());
        }
        if (dto.getDiscount() != null) {
            existing.setDiscount(clampDiscount(dto.getDiscount()));
        }
        try {
            return customerRepository.saveAndFlush(existing);
        } catch (DataIntegrityViolationException e) {
            throw new BusinessRuleException("عميل بهذا الرقم مسجل بالفعل: " + normalizedPhone);
        }
    }

    public void deleteCustomer(String tenantId, String id) {
        requireCustomerForTenant(tenantId, id);
        customerRepository.deleteById(id);
    }

    @Transactional(readOnly = true)
    public List<Pet> getPetsByCustomer(String tenantId, String customerId) {
        requireCustomerForTenant(tenantId, customerId);
        return petRepository.findByCustomerId(customerId);
    }

    @Transactional(readOnly = true)
    public List<Sale> getPurchaseHistory(String tenantId, String customerId) {
        requireCustomerForTenant(tenantId, customerId);
        return saleRepository.findByCustomerIdAndTenantId(customerId, tenantId);
    }

    @Transactional(readOnly = true)
    public List<Pet> getAllPetsByTenant(String tenantId) {
        return petRepository.findByCustomerTenantId(tenantId);
    }

    public Pet createPet(String tenantId, String customerId, Pet dto) {
        Customer customer = requireCustomerForTenant(tenantId, customerId);
        Pet pet = Pet.builder()
                .id(UUID.randomUUID().toString())
                .customer(customer)
                .name(dto.getName())
                .species(dto.getSpecies())
                .breed(dto.getBreed())
                .age(dto.getAge())
                .build();
        return petRepository.save(pet);
    }

    public Pet updatePet(String tenantId, String petId, Pet dto) {
        Pet existing = requirePetForTenant(tenantId, petId);
        existing.setName(dto.getName());
        existing.setSpecies(dto.getSpecies());
        existing.setBreed(dto.getBreed());
        existing.setAge(dto.getAge());
        return petRepository.save(existing);
    }

    public void deletePet(String tenantId, String petId) {
        requirePetForTenant(tenantId, petId);
        petRepository.deleteById(petId);
    }

    private Customer requireCustomerForTenant(String tenantId, String id) {
        return customerRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found: " + id));
    }

    private Pet requirePetForTenant(String tenantId, String petId) {
        Pet pet = petRepository.findByIdWithCustomer(petId)
                .orElseThrow(() -> new ResourceNotFoundException("Pet not found: " + petId));
        if (pet.getCustomer() == null || pet.getCustomer().getTenant() == null
                || !tenantId.equals(pet.getCustomer().getTenant().getId())) {
            throw new ResourceNotFoundException("Pet not found: " + petId);
        }
        return pet;
    }

    private static int clampDiscount(int discount) {
        if (discount < 0) return 0;
        if (discount > 100) return 100;
        return discount;
    }

    private static String normalizePhone(String phone) {
        if (phone == null) {
            return null;
        }
        String trimmed = phone.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalizeNotes(String notes) {
        if (notes == null) {
            return null;
        }
        String trimmed = notes.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
