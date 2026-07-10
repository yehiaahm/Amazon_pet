package com.animasys.core.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DriverManager;

@Configuration
@Slf4j
public class DataSourceConfig {

    @Value("${spring.datasource.url}")
    private String mysqlUrl;

    @Value("${spring.datasource.username}")
    private String mysqlUsername;

    @Value("${spring.datasource.password}")
    private String mysqlPassword;

    @Bean
    @Primary
    public DataSource dataSource() {
        // Attempt MySQL connection test
        try {
            log.info("Checking MySQL availability at: {}", mysqlUrl);
            DriverManager.setLoginTimeout(3); // 3 seconds timeout
            try (Connection conn = DriverManager.getConnection(mysqlUrl, mysqlUsername, mysqlPassword)) {
                log.info("MySQL connection succeeded! Initializing Hikari Connection Pool...");
                HikariConfig config = new HikariConfig();
                config.setJdbcUrl(mysqlUrl);
                config.setUsername(mysqlUsername);
                config.setPassword(mysqlPassword);
                config.setDriverClassName("com.mysql.cj.jdbc.Driver");
                return new HikariDataSource(config);
            }
        } catch (Exception e) {
            log.warn("=============================================================");
            log.warn("MySQL connection failed: {}", e.getMessage());
            log.warn("Falling back to H2 In-Memory Database for sandbox stability.");
            log.warn("=============================================================");
            
            HikariConfig config = new HikariConfig();
            config.setJdbcUrl("jdbc:h2:mem:animasys_erp;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_UPPER=false");
            config.setUsername("sa");
            config.setPassword("");
            config.setDriverClassName("org.h2.Driver");
            return new HikariDataSource(config);
        }
    }
}
