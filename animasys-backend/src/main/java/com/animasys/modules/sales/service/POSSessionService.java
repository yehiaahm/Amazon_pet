package com.animasys.modules.sales.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.domain.Sale;
import com.animasys.modules.sales.repository.POSSessionRepository;
import com.animasys.modules.sales.repository.SaleRepository;
import com.animasys.modules.finance.domain.DailyClosing;
import com.animasys.modules.finance.repository.DailyClosingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class POSSessionService {
    private final POSSessionRepository sessionRepository;
    private final BranchRepository branchRepository;
    private final EmployeeRepository employeeRepository;
    private final SaleRepository saleRepository;
    private final DailyClosingRepository dailyClosingRepository;

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
            throw new BusinessRuleException("Session is already closed.");
        }

        Employee employee = employeeRepository.findById(closedById)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + closedById));

        if (employee.getTenant() == null || employee.getTenant().getId() == null) {
            throw new BusinessRuleException("لا يمكن تحديد الشركة (Tenant) لهذه العملية.");
        }
        String tenantId = employee.getTenant().getId();
        if (session.getBranch() == null
                || session.getBranch().getTenant() == null
                || !tenantId.equals(session.getBranch().getTenant().getId())) {
            throw new BusinessRuleException("غير مصرح لك بإغلاق هذه الوردية");
        }

        // 1. Calculate the actual expected cash drawer balance on the backend
        List<Sale> sessionSales = saleRepository.findByPosSession_Id(sessionId);
        BigDecimal cashSalesTotal = sessionSales.stream()
                .filter(s -> "CASH".equalsIgnoreCase(s.getPaymentMethod()) && !"REFUNDED".equalsIgnoreCase(s.getStatus()))
                .map(Sale::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal computedExpectedBalance = session.getOpeningBalance().add(cashSalesTotal);

        // 2. Compute discrepancy difference
        BigDecimal difference = physicalBalance.subtract(computedExpectedBalance);

        // 3. Create DailyClosing record
        DailyClosing dailyClosing = DailyClosing.builder()
                .id(UUID.randomUUID().toString())
                .branch(session.getBranch())
                .cashboxId("cb-1")
                .openingBalance(session.getOpeningBalance())
                .closingBalance(closingBalance)
                .systemExpected(computedExpectedBalance)
                .physicalActual(physicalBalance)
                .difference(difference)
                .closedBy(employee)
                .date(LocalDate.now())
                .build();
        dailyClosingRepository.save(dailyClosing);

        // 4. Update the session details
        session.setClosedAt(Instant.now());
        session.setClosingBalance(closingBalance);
        session.setStatus("CLOSED");

        return sessionRepository.save(session);
    }
}
