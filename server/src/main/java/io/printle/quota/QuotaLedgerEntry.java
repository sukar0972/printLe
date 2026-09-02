package io.printle.quota;

import io.printle.job.PrintJob;
import io.printle.user.AppUser;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "quota_ledger", uniqueConstraints = @UniqueConstraint(name = "uq_quota_ledger_job_type", columnNames = {"job_id", "entry_type"}))
public class QuotaLedgerEntry {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id") private AppUser user;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "job_id") private PrintJob job;
    @Column(nullable = false) private int pages;
    @Enumerated(EnumType.STRING) @Column(name = "entry_type", nullable = false) private QuotaEntryType entryType;
    @Column(length = 255) private String note;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected QuotaLedgerEntry() {}
    public QuotaLedgerEntry(AppUser user, PrintJob job, int pages, QuotaEntryType entryType, String note) {
        this.id = UUID.randomUUID(); this.user = user; this.job = job; this.pages = pages;
        this.entryType = entryType; this.note = note; this.createdAt = Instant.now();
    }
}
