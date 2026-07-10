package com.animasys.modules.sales.service;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import com.animasys.modules.sales.domain.POSSession;
import com.animasys.modules.sales.repository.POSSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class POSSessionService {
    private final POSSessionRepository sessionRepository;
    private final BranchRepository branchRepository;
    private final EmployeeRepository employeeRepository;

    public POSSession startSession(String branchId, String openedById, BigDecimal openingBalance) {
        Optional<POSSession> active = sessionRepository.findByBranchIdAndStatus(branchId, "OPEN");
        if (active.isPresent()) {
            throw new BusinessRuleException("A register session is already open for this branch.");
        }

        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResourceNotFoundException("Branch not found: " + branchId));

        Employee employee = employeeRepository.findById(openedById)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + openedById));

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

    public POSSession closeSession(String sessionId, BigDecimal closingBalance) {
        POSSession session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));

        if ("CLOSED".equals(session.getStatus())) {
            throw new BusinessRuleException("Session is already closed.");
        }

        session.setClosedAt(Instant.now());
        session.setClosingBalance(closingBalance);
        session.setStatus("CLOSED");

        return sessionRepository.save(session);
    }
}
