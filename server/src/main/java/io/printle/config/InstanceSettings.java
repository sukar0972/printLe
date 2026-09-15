package io.printle.config;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "instance_settings")
public class InstanceSettings {
    @Id private int id;
    @Column(name = "default_monthly_page_quota", nullable = false) private int defaultMonthlyPageQuota;
    @Column(name = "quota_timezone", nullable = false, length = 80) private String quotaTimezone;
    @Column(name = "held_job_ttl_hours", nullable = false) private int heldJobTtlHours;
    @Column(name = "completed_retention_hours", nullable = false) private int completedRetentionHours;
    @Column(name = "failed_retention_hours", nullable = false) private int failedRetentionHours;
    @Column(name = "max_copies", nullable = false) private int maxCopies;
    @Column(name = "max_pages_per_job", nullable = false) private int maxPagesPerJob;
    @Column(name = "color_printing_allowed", nullable = false) private boolean colorPrintingAllowed;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected InstanceSettings() {}
    public InstanceSettings(PrintleProperties properties) {
        id = 1; defaultMonthlyPageQuota = properties.defaultMonthlyPageQuota(); quotaTimezone = properties.quotaTimezone();
        heldJobTtlHours = Math.toIntExact(properties.heldJobTtl().toHours()); completedRetentionHours = Math.toIntExact(properties.completedJobRetention().toHours());
        failedRetentionHours = Math.toIntExact(properties.failedJobRetention().toHours()); maxCopies = 100; maxPagesPerJob = 1000;
        colorPrintingAllowed = true; updatedAt = Instant.now();
    }
    public int getDefaultMonthlyPageQuota() { return defaultMonthlyPageQuota; }
    public String getQuotaTimezone() { return quotaTimezone; }
    public int getHeldJobTtlHours() { return heldJobTtlHours; }
    public int getCompletedRetentionHours() { return completedRetentionHours; }
    public int getFailedRetentionHours() { return failedRetentionHours; }
    public int getMaxCopies() { return maxCopies; }
    public int getMaxPagesPerJob() { return maxPagesPerJob; }
    public boolean isColorPrintingAllowed() { return colorPrintingAllowed; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void update(int defaultQuota, String timezone, int heldHours, int completedHours, int failedHours,
                       int maxCopies, int maxPages, boolean colorAllowed) {
        this.defaultMonthlyPageQuota = defaultQuota; this.quotaTimezone = timezone; this.heldJobTtlHours = heldHours;
        this.completedRetentionHours = completedHours; this.failedRetentionHours = failedHours; this.maxCopies = maxCopies;
        this.maxPagesPerJob = maxPages; this.colorPrintingAllowed = colorAllowed; this.updatedAt = Instant.now();
    }
}
