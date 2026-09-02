package io.printle.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "printle")
public record PrintleProperties(String storagePath, String bootstrapAdminEmail,
                                String bootstrapAdminPassword, int defaultMonthlyPageQuota,
                                String printNodeUrl, String defaultCupsQueue) {}
