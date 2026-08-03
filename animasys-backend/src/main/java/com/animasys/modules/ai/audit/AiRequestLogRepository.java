package com.animasys.modules.ai.audit;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AiRequestLogRepository extends JpaRepository<AiRequestLog, String> {
}
