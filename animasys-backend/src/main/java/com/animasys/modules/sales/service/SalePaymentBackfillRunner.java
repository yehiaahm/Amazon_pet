package com.animasys.modules.sales.service;

import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SalePayment;
import com.animasys.modules.sales.repository.SalePaymentRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Sales created before sale_payments existed have no tender row. On every boot, give each
 * of them exactly one, mirroring their single payment_method + total_amount, so drawer
 * reconciliation and refund-tender breakdowns work uniformly for every sale, old or new.
 * Self-limiting: findSalesMissingPayments() returns nothing once a sale has been backfilled.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SalePaymentBackfillRunner implements CommandLineRunner {

    private final SaleRepository saleRepository;
    private final SalePaymentRepository salePaymentRepository;

    @Override
    @Transactional
    public void run(String... args) {
        List<Sale> unbacked = saleRepository.findSalesMissingPayments();
        if (unbacked.isEmpty()) {
            return;
        }
        for (Sale sale : unbacked) {
            String method = sale.getPaymentMethod() != null ? sale.getPaymentMethod() : "CASH";
            BigDecimal amount = sale.getTotalAmount() != null ? sale.getTotalAmount() : BigDecimal.ZERO;
            salePaymentRepository.save(SalePayment.builder()
                    .id(UUID.randomUUID().toString())
                    .sale(sale)
                    .method(method)
                    .amount(amount)
                    .build());
        }
        log.info("Backfilled sale_payments for {} legacy sale(s)", unbacked.size());
    }
}
