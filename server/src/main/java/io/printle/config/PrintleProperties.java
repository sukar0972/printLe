package io.printle.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;

@ConfigurationProperties(prefix = "printle")
public record PrintleProperties(String storagePath, String bootstrapAdminEmail,
                                String bootstrapAdminPassword, int defaultMonthlyPageQuota,
                                String printNodeUrl, String defaultCupsQueue, String quotaTimezone,
                                Duration heldJobTtl, Duration completedJobRetention, Duration failedJobRetention) {}
