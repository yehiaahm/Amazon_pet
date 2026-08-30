package com.animasys.modules.inventory.barcode;

import com.animasys.core.exception.BusinessRuleException;
import com.animasys.modules.inventory.domain.BarcodeFormat;
import com.animasys.modules.inventory.domain.BarcodeSequence;
import com.animasys.modules.inventory.repository.BarcodeSequenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class BarcodeGeneratorService implements IdentifierGenerator {

    private static final int MAX_RETRIES = 3;
    private final BarcodeSequenceRepository sequenceRepository;

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String generate(String tenantId, String type) {
        for (int attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                return doGenerate(tenantId, type);
            } catch (OptimisticLockingFailureException e) {
                if (attempt == MAX_RETRIES - 1) {
                    throw new BusinessRuleException(
                            "Failed to generate barcode after " + MAX_RETRIES + " attempts. Please try again.");
                }
            }
        }
        throw new BusinessRuleException("Failed to generate barcode. Please try again.");
    }

    private String doGenerate(String tenantId, String type) {
        BarcodeSequence seq = sequenceRepository.findByTenantIdForUpdate(tenantId)
                .orElseGet(() -> {
                    BarcodeSequence newSeq = BarcodeSequence.builder()
                            .tenantId(tenantId)
                            .lastNumber(1000000L)
                            .build();
                    return sequenceRepository.save(newSeq);
                });

        long currentNum = seq.getLastNumber() + 1;
        seq.setLastNumber(currentNum);
        sequenceRepository.save(seq);

        return formatValue(currentNum, type);
    }

    private String formatValue(long num, String format) {
        String paddedNum = String.format("%010d", num);
        if ("EAN_13".equalsIgnoreCase(format) || "EAN13".equalsIgnoreCase(format)) {
            String base = "29" + paddedNum;
            int checksum = calculateEan13Checksum(base);
            return base + checksum;
        } else if ("UPC_A".equalsIgnoreCase(format) || "UPCA".equalsIgnoreCase(format)) {
            String base = "0" + paddedNum;
            int checksum = calculateUpcaChecksum(base);
            return base + checksum;
        } else if ("QR_CODE".equalsIgnoreCase(format) || "QR".equalsIgnoreCase(format)) {
            return "QR" + paddedNum;
        } else {
            return "INT" + paddedNum;
        }
    }

    public static int calculateEan13Checksum(String code) {
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int digit = Character.getNumericValue(code.charAt(i));
            sum += (i % 2 == 0) ? digit : digit * 3;
        }
        return (10 - (sum % 10)) % 10;
    }

    public static int calculateUpcaChecksum(String code) {
        int sum = 0;
        for (int i = 0; i < 11; i++) {
            int digit = Character.getNumericValue(code.charAt(i));
            sum += (i % 2 == 0) ? digit * 3 : digit;
        }
        return (10 - (sum % 10)) % 10;
    }
}
