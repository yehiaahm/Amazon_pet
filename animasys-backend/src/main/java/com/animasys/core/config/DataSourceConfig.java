package com.animasys.core.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;

@Configuration
@Slf4j
public class DataSourceConfig {

    @Value("${spring.datasource.url}")
    private String mysqlUrl;

    @Value("${spring.datasource.username}")
    private String mysqlUsername;

    @Value("${spring.datasource.password:}")
    private String mysqlPassword;

    @Value("${app.allow-h2-fallback:false}")
    private boolean allowH2Fallback;

    @Value("${app.h2-fallback.jdbc-url}")
    private String h2FallbackJdbcUrl;

    private static void applyPoolDefaults(HikariConfig config) {
        config.setMaximumPoolSize(20);
        config.setMinimumIdle(2);
        config.setConnectionTimeout(10_000);
        config.setIdleTimeout(600_000);
        config.setMaxLifetime(1_800_000);
        config.setLeakDetectionThreshold(60_000);
        config.setValidationTimeout(5_000);
    }

    @Bean
    @Primary
    public DataSource dataSource() {
        try {
            log.info("Checking MySQL availability at: {}", mysqlUrl);
            DriverManager.setLoginTimeout(5);
            try (Connection conn = DriverManager.getConnection(mysqlUrl, mysqlUsername, mysqlPassword)) {
                log.info("MySQL connection succeeded. Initializing Hikari pool.");
                HikariConfig config = new HikariConfig();
                config.setJdbcUrl(mysqlUrl);
                config.setUsername(mysqlUsername);
                config.setPassword(mysqlPassword);
                config.setDriverClassName("com.mysql.cj.jdbc.Driver");
                applyPoolDefaults(config);
                return new HikariDataSource(config);
            }
        } catch (Exception e) {
            if (!allowH2Fallback) {
                throw new IllegalStateException(
                        "MySQL unavailable and H2 fallback is disabled. Set SPRING_DATASOURCE_PASSWORD (or use profile local with MySQL), "
                                + "or set ALLOW_H2_FALLBACK=true only for local sandbox. Cause: "
                                + e.getMessage(), e);
            }
            ensureH2FileStoreReady(h2FallbackJdbcUrl);
            if (isInMemoryH2(h2FallbackJdbcUrl)) {
                log.warn("MySQL connection failed ({}). Using H2 in-memory — data will be lost on restart.", e.getMessage());
            } else {
                Path store = h2FileStorePath(h2FallbackJdbcUrl);
                log.warn(
                        "MySQL connection failed ({}). Using persistent H2 at {} — set SPRING_DATASOURCE_PASSWORD to use MySQL instead.",
                        e.getMessage(),
                        store != null ? store.toAbsolutePath() : h2FallbackJdbcUrl);
            }
            HikariConfig config = new HikariConfig();
            config.setJdbcUrl(h2FallbackJdbcUrl);
            config.setUsername("sa");
            config.setPassword("");
            config.setDriverClassName("org.h2.Driver");
            applyPoolDefaults(config);
            return new HikariDataSource(config);
        }
    }

    private static boolean isInMemoryH2(String jdbcUrl) {
        return jdbcUrl != null && jdbcUrl.toLowerCase().contains(":h2:mem:");
    }

    private static void ensureH2FileStoreReady(String jdbcUrl) {
        Path dir = h2FileStorePath(jdbcUrl);
        if (dir == null) {
            return;
        }
        try {
            Files.createDirectories(dir);
        } catch (Exception ex) {
            throw new IllegalStateException("Could not create H2 data directory: " + dir, ex);
        }
    }

    /** Parent directory of the H2 file database, or null for in-memory URLs. */
    static Path h2FileStorePath(String jdbcUrl) {
        if (jdbcUrl == null || !jdbcUrl.toLowerCase().contains("jdbc:h2:file:")) {
            return null;
        }
        String lower = jdbcUrl.toLowerCase();
        int fileIdx = lower.indexOf("file:");
        String pathPart = jdbcUrl.substring(fileIdx + 5);
        int semi = pathPart.indexOf(';');
        if (semi >= 0) {
            pathPart = pathPart.substring(0, semi);
        }
        Path dbFile = Path.of(pathPart);
        return dbFile.getParent();
    }
}
