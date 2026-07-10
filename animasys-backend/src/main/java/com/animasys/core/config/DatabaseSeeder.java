package com.animasys.core.config;

import com.animasys.modules.crm.domain.*;
import com.animasys.modules.crm.repository.*;
import com.animasys.modules.iam.domain.*;
import com.animasys.modules.iam.repository.*;
import com.animasys.modules.inventory.domain.*;
import com.animasys.modules.inventory.repository.*;
import com.animasys.modules.services.domain.*;
import com.animasys.modules.services.repository.*;
import com.animasys.modules.finance.domain.*;
import com.animasys.modules.finance.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class DatabaseSeeder implements CommandLineRunner {

    private final TenantRepository tenantRepository;
    private final BranchRepository branchRepository;
    private final EmployeeRepository employeeRepository;
    private final WarehouseRepository warehouseRepository;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final GroomingServiceRepository serviceRepository;
    private final CustomerRepository customerRepository;
    private final PetRepository petRepository;
    private final BankAccountRepository bankAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        if (employeeRepository.count() > 0) {
            // Already seeded
            return;
        }

        // 1. Tenant
        Tenant tenant = Tenant.builder()
                .id("t-1")
                .name("AnimaSys Main Pet Center")
                .subdomain("demo")
                .active(true)
                .build();
        tenantRepository.save(tenant);

        // 2. Branch
        Branch branch = Branch.builder()
                .id("b-1")
                .tenant(tenant)
                .name("Main Downtown Branch")
                .address("77 Enterprise Way")
                .phone("+123456789")
                .build();
        branchRepository.save(branch);

        // 3. Employee
        Employee admin = Employee.builder()
                .id("e-1")
                .tenant(tenant)
                .branch(branch)
                .username("admin")
                .passwordHash(passwordEncoder.encode("admin"))
                .fullName("Sarah Connor")
                .email("admin@animasys.com")
                .role("OWNER")
                .active(true)
                .build();
        employeeRepository.save(admin);

        // 4. Warehouses
        Warehouse shelf = Warehouse.builder()
                .id("wh-shelf")
                .branch(branch)
                .name("Retail Shelves WH")
                .code("WH-SHELF")
                .build();
        warehouseRepository.save(shelf);

        Warehouse mainStore = Warehouse.builder()
                .id("wh-main")
                .branch(branch)
                .name("Backroom Main Store")
                .code("WH-MAIN")
                .build();
        warehouseRepository.save(mainStore);

        // 5. Category
        Category food = Category.builder()
                .id("cat-1")
                .tenant(tenant)
                .name("Pet Food")
                .build();
        categoryRepository.save(food);

        Category toys = Category.builder()
                .id("cat-2")
                .tenant(tenant)
                .name("Toys & Accessories")
                .build();
        categoryRepository.save(toys);

        // 6. Products & Variants
        Product dogFood = Product.builder()
                .id("p-1")
                .tenant(tenant)
                .sku("DOG-FOOD-ROYAL")
                .name("Royal Canin Dog Food")
                .category(food)
                .minStockLimit(5)
                .build();
        productRepository.save(dogFood);

        ProductVariant dogFoodLarge = ProductVariant.builder()
                .id("v-1")
                .product(dogFood)
                .name("10kg Large Breed")
                .price(BigDecimal.valueOf(85.00))
                .cost(BigDecimal.valueOf(45.00))
                .stockQuantity(12)
                .build();
        variantRepository.save(dogFoodLarge);

        ProductVariant dogFoodMedium = ProductVariant.builder()
                .id("v-2")
                .product(dogFood)
                .name("3kg Medium Breed")
                .price(BigDecimal.valueOf(35.00))
                .cost(BigDecimal.valueOf(18.00))
                .stockQuantity(25)
                .build();
        variantRepository.save(dogFoodMedium);

        // 7. Services
        GroomingService wash = GroomingService.builder()
                .id("srv-1")
                .tenant(tenant)
                .name("Premium Bath & Wash")
                .price(BigDecimal.valueOf(45.00))
                .durationMinutes(45)
                .build();
        serviceRepository.save(wash);

        GroomingService haircut = GroomingService.builder()
                .id("srv-2")
                .tenant(tenant)
                .name("Styling & Haircut")
                .price(BigDecimal.valueOf(60.00))
                .durationMinutes(60)
                .build();
        serviceRepository.save(haircut);

        // 8. Customers & Pets
        Customer customer = Customer.builder()
                .id("c-1")
                .tenant(tenant)
                .name("John Wick")
                .phone("+987654321")
                .email("wick@continental.com")
                .build();
        customerRepository.save(customer);

        Pet pet = Pet.builder()
                .id("pet-1")
                .customer(customer)
                .name("Daisy")
                .species("DOG")
                .breed("Beagle")
                .age(1)
                .build();
        petRepository.save(pet);

        // 9. Bank Accounts
        BankAccount bank = BankAccount.builder()
                .id("ba-1")
                .tenant(tenant)
                .name("Corporate Operating Bank Account")
                .balance(BigDecimal.valueOf(25000.00))
                .build();
        bankAccountRepository.save(bank);
    }
}
