package com.animasys.modules.inventory.importer.repository;

import com.animasys.modules.inventory.importer.domain.ImportRowStatus;
import com.animasys.modules.inventory.importer.domain.ImportSessionItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ImportSessionItemRepository extends JpaRepository<ImportSessionItem, String> {

    List<ImportSessionItem> findBySessionIdOrderByRowNumberAsc(String sessionId);

    @Query("SELECT i FROM ImportSessionItem i WHERE i.session.id = :sessionId "
            + "AND (:status IS NULL OR i.status = :status) "
            + "AND (:search IS NULL OR LOWER(i.mappedData) LIKE LOWER(CONCAT('%', :search, '%'))) "
            + "ORDER BY i.rowNumber ASC")
    Page<ImportSessionItem> search(@Param("sessionId") String sessionId,
                                    @Param("status") ImportRowStatus status,
                                    @Param("search") String search,
                                    Pageable pageable);

    long countBySessionIdAndStatus(String sessionId, ImportRowStatus status);

    void deleteBySessionId(String sessionId);
}
