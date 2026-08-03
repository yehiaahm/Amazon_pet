package com.animasys.modules.inventory.repository;

import com.animasys.modules.inventory.domain.ImportSessionItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ImportSessionItemRepository extends JpaRepository<ImportSessionItem, String> {
    List<ImportSessionItem> findBySessionId(String sessionId);

    List<ImportSessionItem> findByAffectedEntityId(String affectedEntityId);
}
