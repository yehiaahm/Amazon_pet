package com.animasys.modules.crm.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.domain.Pet;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.crm.repository.PetRepository;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

    @Mock private CustomerRepository customerRepository;
    @Mock private PetRepository petRepository;
    @Mock private TenantRepository tenantRepository;
    @Mock private SaleRepository saleRepository;

    @InjectMocks private CustomerService customerService;

    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder().id("t-crm").name("CRM").subdomain("crm").build();
    }

    @Test
    void createCustomer_successWithOptionalPet() {
        Customer dto = Customer.builder().name("Ahmed").phone("0100").discount(150).build();
        Pet petDto = Pet.builder().name("Max").species("Dog").build();

        when(tenantRepository.findById("t-crm")).thenReturn(Optional.of(tenant));
        when(customerRepository.findByPhoneAndTenantId("0100", "t-crm")).thenReturn(Optional.empty());
        when(customerRepository.saveAndFlush(any(Customer.class))).thenAnswer(inv -> inv.getArgument(0));
        when(petRepository.save(any(Pet.class))).thenAnswer(inv -> inv.getArgument(0));

        Customer created = customerService.createCustomer("t-crm", dto, petDto);

        assertEquals("Ahmed", created.getName());
        assertEquals(100, created.getDiscount());
        verify(petRepository).save(any(Pet.class));
    }

    @Test
    void createCustomer_rejectsDuplicatePhone() {
        Customer dto = Customer.builder().name("Ahmed").phone("0100").build();
        Customer existing = Customer.builder().id("c-1").phone("0100").build();

        when(tenantRepository.findById("t-crm")).thenReturn(Optional.of(tenant));
        when(customerRepository.findByPhoneAndTenantId("0100", "t-crm")).thenReturn(Optional.of(existing));

        assertThrows(BusinessRuleException.class,
                () -> customerService.createCustomer("t-crm", dto, null));
    }

    @Test
    void createCustomer_rejectsBlankName() {
        Customer dto = Customer.builder().name("  ").phone("0100").build();

        assertThrows(BusinessRuleException.class,
                () -> customerService.createCustomer("t-crm", dto, null));
    }

    @Test
    void updateCustomer_allowsSamePhone_rejectsOtherCustomerPhone() {
        Customer existing = Customer.builder().id("c-1").name("Ahmed").phone("0100").tenant(tenant).build();
        Customer other = Customer.builder().id("c-2").phone("0200").build();
        Customer dto = Customer.builder().name("Ahmed Ali").phone("0200").build();

        when(customerRepository.findByIdAndTenantId("c-1", "t-crm")).thenReturn(Optional.of(existing));
        when(customerRepository.findByPhoneAndTenantId("0200", "t-crm")).thenReturn(Optional.of(other));

        assertThrows(BusinessRuleException.class,
                () -> customerService.updateCustomer("t-crm", "c-1", dto));
    }

    @Test
    void getById_crossTenantReturnsNotFound() {
        when(customerRepository.findByIdAndTenantId("c-1", "t-crm")).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class,
                () -> customerService.getById("t-crm", "c-1"));
    }

    @Test
    void getPetsByCustomer_crossTenantPetAccessDenied() {
        Tenant other = Tenant.builder().id("t-other").build();
        Customer customer = Customer.builder().id("c-1").tenant(other).build();
        Pet pet = Pet.builder().id("p-1").customer(customer).name("Max").build();

        when(petRepository.findByIdWithCustomer("p-1")).thenReturn(Optional.of(pet));

        assertThrows(ResourceNotFoundException.class,
                () -> customerService.updatePet("t-crm", "p-1", Pet.builder().name("Max").build()));
    }
}
