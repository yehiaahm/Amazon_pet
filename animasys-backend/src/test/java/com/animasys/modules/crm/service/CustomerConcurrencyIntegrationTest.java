package com.animasys.modules.crm.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.crm.domain.Customer;
import com.animasys.modules.crm.repository.CustomerRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.domain.Tenant;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.iam.repository.TenantRepository;
import com.animasys.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Real-thread concurrency coverage for customer registration (P0.3 of the production-hardening
 * audit): 15 concurrent requests using the same phone number used to produce 2 customer rows,
 * because the only protection was an app-level check-then-insert (findByPhoneAndTenantId, then
 * save) with nothing serializing the race at the DB level. V49 adds a real unique constraint on
 * (tenant_id, phone_dedupe_key); this test proves it actually closes the race under real threads,
 * not just simulated/sequential calls.
 */
class CustomerConcurrencyIntegrationTest extends IntegrationTestBase {

    @Autowired private CustomerService customerService;
    @Autowired private CustomerRepository customerRepository;
    @Autowired private TenantRepository tenantRepository;
    @Autowired private BranchRepository branchRepository;
    @Autowired private EmployeeRepository employeeRepository;

    private Tenant tenant;
    private Employee manager;

    @BeforeEach
    void setUpData() {
        tenant = tenantRepository.save(Tenant.builder()
                .id("t-cust-conc-" + UUID.randomUUID().toString().substring(0, 8))
                .name("Customer Concurrency Test Tenant")
                .subdomain("cust-conc-" + UUID.randomUUID().toString().substring(0, 6))
                .active(true)
                .inventoryDeductionStrategy("FIFO")
                .build());
        bootstrapTenantRoles(tenant);

        Branch branch = branchRepository.save(Branch.builder()
                .id("b-cust-conc-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .name("Main Branch")
                .build());

        manager = employeeRepository.save(Employee.builder()
                .id("e-cust-conc-" + UUID.randomUUID().toString().substring(0, 8))
                .tenant(tenant)
                .branch(branch)
                .username("mgr-cust-conc-" + UUID.randomUUID().toString().substring(0, 6))
                .fullName("Manager User")
                .email("mgr-cust-conc-" + UUID.randomUUID() + "@test.com")
                .passwordHash("hash")
                .role("MANAGER")
                .active(true)
                .build());

        authenticate(manager);
    }

    @Test
    @DisplayName("Concurrency: 15 simultaneous registrations with the same phone never create more than one customer")
    void concurrentSamePhoneRegistrationsCreateExactlyOneCustomer() throws InterruptedException {
        String sharedPhone = "0100" + UUID.randomUUID().toString().substring(0, 6);
        int totalThreads = 15;
        ExecutorService executorService = Executors.newFixedThreadPool(totalThreads);
        CountDownLatch ready = new CountDownLatch(totalThreads);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(totalThreads);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger duplicateRejectionCount = new AtomicInteger(0);
        AtomicInteger otherFailureCount = new AtomicInteger(0);

        for (int i = 0; i < totalThreads; i++) {
            final int idx = i;
            executorService.submit(() -> {
                try {
                    authenticate(manager);
                    Customer dto = Customer.builder()
                            .name("Race Customer " + idx)
                            .phone(sharedPhone)
                            .build();
                    ready.countDown();
                    start.await();
                    customerService.createCustomer(tenant.getId(), dto, null);
                    successCount.incrementAndGet();
                } catch (BusinessRuleException ex) {
                    duplicateRejectionCount.incrementAndGet();
                } catch (Exception ex) {
                    otherFailureCount.incrementAndGet();
                } finally {
                    done.countDown();
                }
            });
        }

        ready.await(5, TimeUnit.SECONDS);
        start.countDown();
        assertTrue(done.await(30, TimeUnit.SECONDS), "All concurrent registration attempts must finish within 30s");
        executorService.shutdown();

        assertEquals(totalThreads, successCount.get() + duplicateRejectionCount.get() + otherFailureCount.get());
        assertEquals(0, otherFailureCount.get(),
                "Every concurrent attempt must resolve to either success or a clean duplicate-phone business error — no raw 500");
        assertEquals(1, successCount.get(), "Exactly one of the 15 concurrent requests must succeed");
        assertEquals(totalThreads - 1, duplicateRejectionCount.get(),
                "Every other request must receive a deterministic duplicate-phone rejection");

        List<Customer> matching = customerRepository.searchByTenantId(tenant.getId(), sharedPhone);
        assertEquals(1, matching.size(), "Exactly one customer row must exist for this phone after the race");
    }
}
