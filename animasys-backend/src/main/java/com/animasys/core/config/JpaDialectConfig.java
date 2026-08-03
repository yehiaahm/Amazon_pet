package com.animasys.core.config;

import org.hibernate.cfg.AvailableSettings;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * With {@link DataSourceConfig} H2 fallback, JDBC metadata uses schema {@code PUBLIC};
 * align Hibernate when not on MySQL.
 */
@Configuration
public class JpaDialectConfig {

    @Bean
    public HibernatePropertiesCustomizer hibernatePropertiesFromDataSource(DataSource dataSource) {
        return properties -> {
            try (Connection connection = dataSource.getConnection()) {
                String url = connection.getMetaData().getURL();
                if (url != null && url.toLowerCase().contains(":h2:")) {
                    properties.put(AvailableSettings.DEFAULT_SCHEMA, "PUBLIC");
                }
            } catch (SQLException e) {
                throw new IllegalStateException("Could not read JDBC URL from DataSource", e);
            }
        };
    }
}
