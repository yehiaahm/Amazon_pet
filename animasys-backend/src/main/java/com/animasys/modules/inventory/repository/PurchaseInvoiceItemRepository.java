package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.PurchaseInvoiceItem;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseInvoiceItemRepository extends JpaRepository<PurchaseInvoiceItem, String> {
}
