package io.printle.job;

import io.printle.audit.AuditService;
import io.printle.config.PrintleProperties;
import io.printle.quota.QuotaLedgerRepository;
import io.printle.quota.QuotaService;
import io.printle.user.AppUser;
import io.printle.user.AppUserRepository;
import org.apache.pdfbox.Loader;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.*;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class JobService {
    private final PrintJobRepository jobs; private final AppUserRepository users;
    private final AuditService audit; private final PrintNodeClient printNode; private final QuotaService quotas;
    private final QuotaLedgerRepository quotaLedger; private final Path storage; private final String defaultQueue;
    private final int defaultQuota; private final ZoneId quotaZone; private final Duration heldTtl, completedRetention, failedRetention;
    public JobService(PrintJobRepository jobs, AppUserRepository users, AuditService audit, PrintNodeClient printNode,
                      QuotaService quotas, QuotaLedgerRepository quotaLedger, PrintleProperties properties) throws IOException {
        this.jobs = jobs; this.users = users; this.audit = audit; this.printNode = printNode; this.quotas = quotas; this.quotaLedger = quotaLedger;
        this.storage = Path.of(properties.storagePath()).toAbsolutePath().normalize(); this.defaultQueue = properties.defaultCupsQueue();
        this.defaultQuota = properties.defaultMonthlyPageQuota(); this.quotaZone = ZoneId.of(properties.quotaTimezone());
        this.heldTtl = properties.heldJobTtl(); this.completedRetention = properties.completedJobRetention(); this.failedRetention = properties.failedJobRetention();
        Files.createDirectories(storage);
    }

    @Transactional
    public PrintJob create(String email, MultipartFile file, int copies, ColorMode color, DuplexMode duplex) {
        if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF to upload");
        if (copies < 1 || copies > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Copies must be between 1 and 100");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read upload", e); }
        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-')
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only PDF files are supported");
        int pages;
        try (var document = Loader.loadPDF(bytes)) { pages = document.getNumberOfPages(); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF is invalid or encrypted", e); }
        if (pages < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF has no pages");
        var owner = users.findByEmailForUpdate(email).orElseThrow();
        int requestedPages = pages * copies;
        int limit = owner.getMonthlyPageQuota() == null ? defaultQuota : owner.getMonthlyPageQuota();
        quotas.requireCapacity(owner, requestedPages, limit, monthStart());
        var originalName = safeName(file.getOriginalFilename());
        var storageKey = UUID.randomUUID() + ".pdf";
        try { Files.write(storage.resolve(storageKey), bytes, StandardOpenOption.CREATE_NEW); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store upload", e); }
        var job = jobs.save(new PrintJob(owner, originalName, storageKey, bytes.length, pages, copies, color, duplex, Instant.now().plus(heldTtl)));
        quotas.reserve(job);
        audit.record(owner, "JOB_UPLOADED", "PRINT_JOB", job.getId().toString(), originalName);
        return job;
    }

    @Transactional(readOnly = true)
    public List<PrintJob> list(String email) {
        var owner = users.findByEmailIgnoreCase(email).orElseThrow();
        return jobs.findAllByOwnerIdOrderByCreatedAtDesc(owner.getId());
    }

    @Transactional
    public void cancel(String email, UUID id) {
        var job = ownedJob(email, id);
        if (job.getStatus() != JobStatus.HELD) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only held jobs can be canceled");
        job.cancelHeld();
        quotas.settle(job, false);
        try { Files.deleteIfExists(storage.resolve(job.getStorageKey())); } catch (IOException ignored) {}
        audit.record(job.getOwner(), "JOB_CANCELED", "PRINT_JOB", id.toString(), job.getOriginalFilename());
    }

    @Transactional
    public PrintJob release(String email, UUID id) {
        var job = ownedJob(email, id);
        if (job.getCupsJobId() != null) return job;
        if (job.getStatus() != JobStatus.HELD) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only held jobs can be released");
        var key = job.ensureSubmissionKey();
        jobs.flush();
        var submission = printNode.submit(key, defaultQueue, storage.resolve(job.getStorageKey()), job.getOriginalFilename(),
            job.getOwner().getEmail(), job.getCopies(), job.getColorMode(), job.getDuplexMode());
        job.submitted(submission.jobId(), submission.queue(), cupsState(submission.state()), submission.reasons());
        audit.record(job.getOwner(), "JOB_RELEASED", "PRINT_JOB", id.toString(), "CUPS " + submission.jobId());
        if (job.getStatus() == JobStatus.COMPLETED || job.getStatus() == JobStatus.CANCELED || job.getStatus() == JobStatus.ABORTED) {
            quotas.settle(job, job.getStatus() == JobStatus.COMPLETED);
            try { Files.deleteIfExists(storage.resolve(job.getStorageKey())); } catch (IOException ignored) {}
            audit.record(job.getOwner(), "JOB_" + job.getStatus(), "PRINT_JOB", id.toString(), "CUPS " + submission.jobId());
        }
        return job;
    }

    @Transactional
    public void syncActiveJobs() {
        var active = Set.of(JobStatus.PENDING, JobStatus.PENDING_HELD, JobStatus.PROCESSING, JobStatus.PROCESSING_STOPPED);
        for (var job : jobs.findAllByCupsJobIdIsNotNullAndStatusIn(active)) {
            try {
                var state = printNode.status(job.getCupsJobId());
                var mapped = cupsState(state.state());
                job.updateIppState(mapped, state.reasons());
                if (mapped == JobStatus.COMPLETED || mapped == JobStatus.CANCELED || mapped == JobStatus.ABORTED) {
                    quotas.settle(job, mapped == JobStatus.COMPLETED);
                    Files.deleteIfExists(storage.resolve(job.getStorageKey()));
                    audit.record(job.getOwner(), "JOB_" + mapped, "PRINT_JOB", job.getId().toString(), "CUPS " + job.getCupsJobId());
                }
            } catch (Exception ignored) {
                // A transient CUPS outage must not invent a job state. Try again on the next poll.
            }
        }
    }

    @Transactional(readOnly = true)
    public QuotaView quota(String email, int defaultLimit) {
        AppUser owner = users.findByEmailIgnoreCase(email).orElseThrow();
        int limit = owner.getMonthlyPageQuota() == null ? defaultLimit : owner.getMonthlyPageQuota();
        var usage = quotas.usage(owner, monthStart());
        int used = usage.used(), pending = usage.pending();
        return new QuotaView(limit, used, pending, owner.isQuotaExempt() ? null : Math.max(0, limit - used - pending), owner.isQuotaExempt());
    }

    @Transactional
    public void expireHeldJobs() {
        for (var job : jobs.findAllByStatusAndExpiresAtLessThanEqual(JobStatus.HELD, Instant.now())) {
            job.expire(); quotas.settle(job, false); deletePayload(job);
            audit.record(job.getOwner(), "JOB_EXPIRED", "PRINT_JOB", job.getId().toString(), job.getOriginalFilename());
        }
    }

    @Transactional
    public void purgeRetainedJobs() {
        purge(jobs.findAllByStatusInAndCompletedAtLessThan(Set.of(JobStatus.COMPLETED), Instant.now().minus(completedRetention)));
        purge(jobs.findAllByStatusInAndCompletedAtLessThan(Set.of(JobStatus.CANCELED, JobStatus.ABORTED, JobStatus.EXPIRED), Instant.now().minus(failedRetention)));
    }

    private void purge(List<PrintJob> expired) {
        for (var job : expired) {
            deletePayload(job); quotaLedger.detachJob(job.getId()); jobs.delete(job);
        }
    }

    private void deletePayload(PrintJob job) {
        try { Files.deleteIfExists(storage.resolve(job.getStorageKey())); } catch (IOException ignored) {}
    }

    private Instant monthStart() {
        return ZonedDateTime.now(quotaZone).withDayOfMonth(1).toLocalDate().atStartOfDay(quotaZone).toInstant();
    }

    private PrintJob ownedJob(String email, UUID id) {
        var job = jobs.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!job.getOwner().getEmail().equalsIgnoreCase(email)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return job;
    }
    private String safeName(String name) {
        String value = name == null || name.isBlank() ? "document.pdf" : Path.of(name).getFileName().toString();
        value = value.replaceAll("[\\p{Cntrl}]", "");
        return value.length() > 255 ? value.substring(value.length() - 255) : value;
    }
    static JobStatus cupsState(String state) {
        try { return JobStatus.valueOf(state.trim().toUpperCase().replace('-', '_')); }
        catch (Exception e) { throw new IllegalArgumentException("Unknown CUPS job state: " + state, e); }
    }
    public record QuotaView(int limit, int used, int pending, Integer remaining, boolean exempt) {}
}
