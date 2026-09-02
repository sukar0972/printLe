package io.printle.job;

import io.printle.printer.Printer;
import io.printle.user.AppUser;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "print_job")
public class PrintJob {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "owner_id") private AppUser owner;
    @Column(name = "original_filename", nullable = false) private String originalFilename;
    @Column(name = "storage_key", nullable = false, unique = true) private String storageKey;
    @Column(name = "content_type", nullable = false) private String contentType;
    @Column(name = "size_bytes", nullable = false) private long sizeBytes;
    @Column(nullable = false) private int pages;
    @Column(nullable = false) private int copies;
    @Enumerated(EnumType.STRING) @Column(name = "color_mode", nullable = false) private ColorMode colorMode;
    @Enumerated(EnumType.STRING) @Column(name = "duplex_mode", nullable = false) private DuplexMode duplexMode;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private JobStatus status;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "printer_id") private Printer printer;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "submission_key", unique = true) private UUID submissionKey;
    @Column(name = "cups_job_id") private Integer cupsJobId;
    @Column(name = "cups_queue", length = 127) private String cupsQueue;
    @Column(name = "ipp_state_reasons", length = 1000) private String ippStateReasons;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "completed_at") private Instant completedAt;

    protected PrintJob() {}
    public PrintJob(AppUser owner, String originalFilename, String storageKey, long sizeBytes, int pages,
                    int copies, ColorMode colorMode, DuplexMode duplexMode) {
        this.id = UUID.randomUUID(); this.owner = owner; this.originalFilename = originalFilename;
        this.storageKey = storageKey; this.contentType = "application/pdf"; this.sizeBytes = sizeBytes;
        this.pages = pages; this.copies = copies; this.colorMode = colorMode; this.duplexMode = duplexMode;
        this.status = JobStatus.HELD; this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }
    public UUID getId() { return id; }
    public AppUser getOwner() { return owner; }
    public String getOriginalFilename() { return originalFilename; }
    public String getStorageKey() { return storageKey; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public int getPages() { return pages; }
    public int getCopies() { return copies; }
    public ColorMode getColorMode() { return colorMode; }
    public DuplexMode getDuplexMode() { return duplexMode; }
    public JobStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public UUID getSubmissionKey() { return submissionKey; }
    public Integer getCupsJobId() { return cupsJobId; }
    public String getCupsQueue() { return cupsQueue; }
    public String getIppStateReasons() { return ippStateReasons; }
    public Instant getSubmittedAt() { return submittedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public UUID ensureSubmissionKey() { if (submissionKey == null) submissionKey = UUID.randomUUID(); return submissionKey; }
    public void submitted(int jobId, String queue, JobStatus initialState, String reasons) {
        this.cupsJobId = jobId; this.cupsQueue = queue; this.submittedAt = Instant.now();
        updateIppState(initialState, reasons);
    }
    public void updateIppState(JobStatus state, String reasons) {
        this.status = state; this.ippStateReasons = reasons; this.updatedAt = Instant.now();
        if (state == JobStatus.COMPLETED || state == JobStatus.CANCELED || state == JobStatus.ABORTED) this.completedAt = updatedAt;
    }
    public void cancelHeld() { this.status = JobStatus.CANCELED; this.updatedAt = Instant.now(); this.completedAt = updatedAt; }
}
