package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface CategoryRepository extends JpaRepository<Category, String> {
    List<Category> findByTenantId(String tenantId);
    Optional<Category> findByNameIgnoreCaseAndTenantId(String name, String tenantId);
}
