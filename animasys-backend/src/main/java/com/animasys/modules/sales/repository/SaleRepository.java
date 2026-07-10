package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.Sale;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface SaleRepository extends JpaRepository<Sale, String> {
    List<Sale> findByPosSessionId(String posSessionId);
}
