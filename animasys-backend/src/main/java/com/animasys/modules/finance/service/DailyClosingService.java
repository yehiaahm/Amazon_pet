package com.animasys.modules.finance.service;

import com.animasys.core.exception.ResourceNotFoundException;
import com.animasys.core.security.SecurityUtils;
import com.animasys.modules.finance.domain.DailyClosing;
import com.animasys.modules.finance.repository.DailyClosingRepository;
import com.animasys.modules.iam.domain.Branch;
import com.animasys.modules.iam.domain.Employee;
import com.animasys.modules.iam.repository.BranchRepository;
import com.animasys.modules.iam.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class DailyClosingService {

    private final DailyClosingRepository dailyClosingRepository;
    private final BranchRepository branchRepository;
    private final EmployeeRepository employeeRepository;

    public DailyClosing createDailyClosing(String branchId, String closedById, DailyClosing dto) {
        Branch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new ResourceNotFoundException("Branch not found: " + branchId));
        Employee employee = employeeRepository.findById(closedById)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + closedById));

        if (dto.getPhysicalActual() == null || dto.getSystemExpected() == null) {
            throw new com.animasys.core.exception.BusinessRuleException("الرصيد الفعلي والمتوقع مطلوبان لإغلاق اليوم");
        }

        DailyClosing dailyClosing = DailyClosing.builder()
                .id(UUID.randomUUID().toString())
                .branch(branch)
                .cashboxId(dto.getCashboxId() != null ? dto.getCashboxId() : "cb-1")
                .openingBalance(dto.getOpeningBalance())
                .closingBalance(dto.getClosingBalance())
                .systemExpected(dto.getSystemExpected())
                .physicalActual(dto.getPhysicalActual())
                .difference(dto.getPhysicalActual().subtract(dto.getSystemExpected()))
                .closedBy(employee)
                .date(dto.getDate() != null ? dto.getDate() : LocalDate.now())
                .build();

        return dailyClosingRepository.save(dailyClosing);
    }

    @Transactional(readOnly = true)
    public List<DailyClosing> getByBranch(String branchId) {
        return dailyClosingRepository.findByBranchId(branchId);
    }
    
    @Transactional(readOnly = true)
    public List<DailyClosing> getAll() {
        return dailyClosingRepository.findByBranchId(SecurityUtils.requireBranchId());
    }
}
