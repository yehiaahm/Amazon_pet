package com.animasys.modules.sales.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.util.BusinessTimeZone;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.domain.SalePayment;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SalePaymentRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.finance.domain.DailyClosing;
import com.animasys.modules.finance.repository.DailyClosingRepository;
import com.animasys.modules.finance.domain.Expense;
import com.animasys.modules.finance.repository.ExpenseRepository;
import com.animasys.modules.finance.domain.CashDeposit;
import com.animasys.modules.finance.repository.CashDepositRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional
public class POSSessionService {
    private final POSSessionRepository sessionRepository;
    private final BranchRepository branchRepository;
    private final EmployeeRepository employeeRepository;
    private final SaleRepository saleRepository;
    private final SalePaymentRepository salePaymentRepository;
    private final DailyClosingRepository dailyClosingRepository;
    private final ExpenseRepository expenseRepository;
    private final CashDepositRepository cashDepositRepository;

    public POSSession startSession(String branchId, String openedById, BigDecimal openingBalance) {
        Optional<POSSession> active = sessionRepository.findByBranchIdAndStatus(branchId, "OPEN");
        if (active.isPresent()) {
            throw new BusinessRuleException("A register session is already open for this branch.");
        }

        Employee employee = employeeRepository.findById(openedById)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + openedById));

        if (employee.getTenant() == null || employee.getTenant().getId() == null) {
            throw new BusinessRuleException("لا يمكن تحديد الشركة (Tenant) لهذه العملية.");
        }
        String tenantId = employee.getTenant().getId();

        Branch branch = branchRepository.findById(branchId)
                .filter(b -> b.getTenant() != null && tenantId.equals(b.getTenant().getId()))
                .orElseThrow(() -> new BusinessRuleException("الفرع غير موجود"));

        POSSession session = POSSession.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .openedBy(employee)
                .openedAt(Instant.now())
                .openingBalance(openingBalance)
                .status("OPEN")
                .build();

        return sessionRepository.save(session);
    }

    public POSSession closeSession(String sessionId, BigDecimal closingBalance, BigDecimal expectedBalance, BigDecimal physicalBalance, String closedById) {
        POSSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));

        if ("CLOSED".equals(session.getStatus())) {
            return session;
        }

        Employee employee = employeeRepository.findById(closedById)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + closedById));

        if (employee.getTenant() != null && employee.getTenant().getId() != null) {
            String tenantId = employee.getTenant().getId();
            if (session.getBranch() != null
                    && session.getBranch().getTenant() != null
                    && !tenantId.equals(session.getBranch().getTenant().getId())) {
                throw new BusinessRuleException("غير مصرح لك بإغلاق هذه الوردية");
            }
        }

        // Safely resolve branch
        Branch branch = session.getBranch();
        if (branch == null) {
            branch = employee.getBranch();
        }
        if (branch == null) {
            branch = branchRepository.findAll().stream().findFirst().orElse(null);
        }

        // 1. Calculate the actual expected cash drawer balance on the backend.
        // Bucketed per-tender (not per-sale): a split sale's cash portion lands in cashSalesTotal
        // and its card portion in cardSalesTotal, via each sale's SalePayment rows rather than a
        // single sales.payment_method string match.
        List<Sale> sessionSales = saleRepository.findByPosSession_Id(sessionId);
        List<String> sessionSaleIds = sessionSales.stream().map(Sale::getId).toList();
        Map<String, List<SalePayment>> paymentsBySaleId = sessionSaleIds.isEmpty()
                ? Map.of()
                : salePaymentRepository.findBySale_IdIn(sessionSaleIds).stream()
                        .collect(Collectors.groupingBy(p -> p.getSale().getId()));

        BigDecimal cashSalesTotal = BigDecimal.ZERO;
        BigDecimal cardSalesTotal = BigDecimal.ZERO;
        BigDecimal instapaySalesTotal = BigDecimal.ZERO;
        BigDecimal vodafoneSalesTotal = BigDecimal.ZERO;
        BigDecimal totalSales = BigDecimal.ZERO;

        for (Sale sale : sessionSales) {
            if ("REFUNDED".equalsIgnoreCase(sale.getStatus())) {
                continue;
            }
            BigDecimal netAmount = getNetSaleAmount(sale);
            totalSales = totalSales.add(netAmount);

            BigDecimal saleTotal = sale.getTotalAmount();
            if (saleTotal == null || saleTotal.compareTo(BigDecimal.ZERO) == 0) {
                continue;
            }
            BigDecimal retainedRatio = netAmount.divide(saleTotal, 6, RoundingMode.HALF_UP);

            for (SalePayment tender : paymentsBySaleId.getOrDefault(sale.getId(), List.of())) {
                BigDecimal netTenderAmount = tender.getAmount().multiply(retainedRatio)
                        .setScale(2, RoundingMode.HALF_UP);
                String method = tender.getMethod() != null ? tender.getMethod().toUpperCase(Locale.ROOT) : "";
                switch (method) {
                    case "CASH" -> cashSalesTotal = cashSalesTotal.add(netTenderAmount);
                    case "CARD" -> cardSalesTotal = cardSalesTotal.add(netTenderAmount);
                    case "INSTAPAY" -> instapaySalesTotal = instapaySalesTotal.add(netTenderAmount);
                    case "VODAFONE_CASH" -> vodafoneSalesTotal = vodafoneSalesTotal.add(netTenderAmount);
                    default -> { /* e.g. MOBILE — not bucketed into a drawer total, same as before */ }
                }
            }
        }

        List<Sale> deliverySales = sessionSales.stream()
                .filter(s -> s.isDelivery() && !"REFUNDED".equalsIgnoreCase(s.getStatus()))
                .toList();
        int deliveryOrdersCount = deliverySales.size();
        BigDecimal deliveryFeesTotal = deliverySales.stream()
                .map(Sale::getDeliveryFee)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        java.time.ZoneId zone = BusinessTimeZone.ZONE;
        Instant openedAtInstant = session.getOpenedAt() != null ? session.getOpenedAt() : Instant.now();
        LocalDate sessionStartDay = LocalDate.ofInstant(openedAtInstant, zone);
        
        List<Expense> expenses = (branch != null && branch.getId() != null)
                ? expenseRepository.findByBranchIdAndDateBetween(branch.getId(), sessionStartDay, LocalDate.now(zone))
                : List.of();

        BigDecimal cashExpensesTotal = expenses.stream()
                .filter(e -> "CASH".equalsIgnoreCase(e.getPaidFrom()))
                .map(Expense::getAmount)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<CashDeposit> deposits = (branch != null && branch.getId() != null)
                ? cashDepositRepository.findByBranchIdAndDateBetween(branch.getId(), sessionStartDay, LocalDate.now(zone))
                : List.of();

        BigDecimal cashDepositsTotal = deposits.stream()
                .filter(d -> "CASH".equalsIgnoreCase(d.getDepositedTo()))
                .map(CashDeposit::getAmount)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal openingBal = session.getOpeningBalance() != null ? session.getOpeningBalance() : BigDecimal.ZERO;
        BigDecimal computedExpectedBalance = openingBal.add(cashSalesTotal).add(cashDepositsTotal).subtract(cashExpensesTotal);

        BigDecimal actualPhysical = physicalBalance != null ? physicalBalance : (closingBalance != null ? closingBalance : computedExpectedBalance);
        BigDecimal actualClosing = closingBalance != null ? closingBalance : actualPhysical;
        BigDecimal difference = actualPhysical.subtract(computedExpectedBalance);

        // 3. Create DailyClosing record
        if (branch != null) {
            try {
                DailyClosing dailyClosing = DailyClosing.builder()
                        .id(UUID.randomUUID().toString())
                        .branch(branch)
                        .cashboxId("cb-1")
                        .openingBalance(openingBal)
                        .closingBalance(actualClosing)
                        .systemExpected(computedExpectedBalance)
                        .physicalActual(actualPhysical)
                        .difference(difference)
                        .closedBy(employee)
                        .date(LocalDate.now())
                        .cashSalesTotal(cashSalesTotal)
                        .cardSalesTotal(cardSalesTotal)
                        .instapaySalesTotal(instapaySalesTotal)
                        .vodafoneSalesTotal(vodafoneSalesTotal)
                        .totalSales(totalSales)
                        .cashExpensesTotal(cashExpensesTotal)
                        .cashDepositsTotal(cashDepositsTotal)
                        .deliveryOrdersCount(deliveryOrdersCount)
                        .deliveryFeesTotal(deliveryFeesTotal)
                        .build();
                dailyClosingRepository.save(dailyClosing);
            } catch (Exception ex) {
                // Log and continue gracefully — closing session must succeed
                System.err.println("Warning: Daily closing save deferred: " + ex.getMessage());
            }
        }

        // 4. Update the session details
        session.setClosedAt(Instant.now());
        session.setClosingBalance(actualClosing);
        session.setStatus("CLOSED");

        return sessionRepository.save(session);
    }

    private BigDecimal getNetSaleAmount(Sale sale) {
        if (sale == null || "REFUNDED".equalsIgnoreCase(sale.getStatus())) {
            return BigDecimal.ZERO;
        }
        if (!"PARTIALLY_REFUNDED".equalsIgnoreCase(sale.getStatus())) {
            return sale.getTotalAmount() != null ? sale.getTotalAmount() : BigDecimal.ZERO;
        }
        if (sale.getItems() == null || sale.getItems().isEmpty()) {
            return sale.getTotalAmount() != null ? sale.getTotalAmount() : BigDecimal.ZERO;
        }
        
        BigDecimal originalSubtotal = BigDecimal.ZERO;
        BigDecimal retainedSubtotal = BigDecimal.ZERO;
        
        for (com.animasys.modules.sales.domain.SaleItem item : sale.getItems()) {
            if (item == null) continue;
            BigDecimal price = item.getPrice() != null ? item.getPrice() : BigDecimal.ZERO;
            BigDecimal qty = BigDecimal.valueOf(item.getQuantity());
            BigDecimal retainedQty = BigDecimal.valueOf(Math.max(0, item.getQuantity() - item.getQuantityReturned()));
            
            originalSubtotal = originalSubtotal.add(price.multiply(qty));
            retainedSubtotal = retainedSubtotal.add(price.multiply(retainedQty));
        }
        
        if (originalSubtotal.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }
        
        BigDecimal discount = sale.getDiscount() != null ? sale.getDiscount() : BigDecimal.ZERO;
        BigDecimal tax = sale.getTax() != null ? sale.getTax() : BigDecimal.ZERO;
        
        BigDecimal retainedDiscount = discount
            .multiply(retainedSubtotal)
            .divide(originalSubtotal, 2, java.math.RoundingMode.HALF_UP);
            
        BigDecimal retainedTax = tax
            .multiply(retainedSubtotal)
            .divide(originalSubtotal, 2, java.math.RoundingMode.HALF_UP);
            
        return retainedSubtotal.subtract(retainedDiscount).add(retainedTax).setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
