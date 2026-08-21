package com.animasys.modules.sales.repository;

import com.animasys.modules.sales.domain.SalePayment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SalePaymentRepository extends JpaRepository<SalePayment, String> {
    List<SalePayment> findBySale_Id(String saleId);

    List<SalePayment> findBySale_IdIn(List<String> saleIds);
}
