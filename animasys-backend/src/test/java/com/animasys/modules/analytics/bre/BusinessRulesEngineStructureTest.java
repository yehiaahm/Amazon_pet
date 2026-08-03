package com.animasys.modules.analytics.bre;

import com.animasys.modules.analytics.repository.BreAnalyticsRepository;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class BusinessRulesEngineStructureTest {

    @Test
    void doesNotDependOnEntityLoadingServices() {
        assertThat(hasFieldType(BusinessRulesEngine.class, "CatalogQueryService")).isFalse();
        assertThat(hasFieldType(BusinessRulesEngine.class, "InventoryBatchRepository")).isFalse();
        assertThat(hasRepositoryField(BusinessRulesEngine.class, BreAnalyticsRepository.class)).isTrue();
    }

    private static boolean hasFieldType(Class<?> type, String simpleName) {
        return Arrays.stream(type.getDeclaredFields())
                .map(Field::getType)
                .anyMatch(t -> t.getSimpleName().equals(simpleName));
    }

    private static boolean hasRepositoryField(Class<?> type, Class<?> repositoryType) {
        return Arrays.stream(type.getDeclaredFields())
                .map(Field::getType)
                .anyMatch(t -> t.equals(repositoryType));
    }
}
