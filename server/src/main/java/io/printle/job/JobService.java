package io.printle.job;

import io.printle.audit.AuditService;
import io.printle.config.PrintleProperties;
import io.printle.config.InstanceSettings;
import io.printle.config.InstanceSettingsService;
import io.printle.quota.QuotaLedgerRepository;
import io.printle.quota.QuotaService;
import io.printle.printer.Printer;
import io.printle.printer.PrinterErrorPolicy;
import io.printle.printer.PrinterRepository;
import io.printle.printer.PrinterStatus;
import io.printle.printer.PrinterAccessService;
import io.printle.printer.PrinterPermission;
import io.printle.user.AppUser;
import io.printle.user.AppUserRepository;
import io.printle.user.UserGroupRepository;
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
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;

@Service
public class JobService {
    private final PrintJobRepository jobs; private final AppUserRepository users;
    private final AuditService audit; private final PrintNodeClient printNode; private final QuotaService quotas;
    private final QuotaLedgerRepository quotaLedger; private final Path storage; private final String defaultQueue;
    private final PrinterRepository printers;
    private final PrinterAccessService printerAccess;
    private final InstanceSettingsService settings; private final UserGroupRepository groups;
    public JobService(PrintJobRepository jobs, AppUserRepository users, AuditService audit, PrintNodeClient printNode,
                      QuotaService quotas, QuotaLedgerRepository quotaLedger, PrinterRepository printers,
                      PrinterAccessService printerAccess, InstanceSettingsService settings, UserGroupRepository groups, PrintleProperties properties) throws IOException {
        this.jobs = jobs; this.users = users; this.audit = audit; this.printNode = printNode; this.quotas = quotas; this.quotaLedger = quotaLedger; this.printers = printers; this.printerAccess = printerAccess;
        this.storage = Path.of(properties.storagePath()).toAbsolutePath().normalize(); this.defaultQueue = properties.defaultCupsQueue();
        this.settings = settings; this.groups = groups;
        Files.createDirectories(storage);
    }

    @Transactional
    public PrintJob create(String email, MultipartFile file, int copies, ColorMode color, DuplexMode duplex) {
        if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF to upload");
        var policy = settings.current();
        if (copies < 1 || copies > policy.getMaxCopies()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Copies must be between 1 and " + policy.getMaxCopies());
        if (color == ColorMode.COLOR && !policy.isColorPrintingAllowed()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Color printing is disabled by the administrator");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read upload", e); }
        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-')
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only PDF files are supported");
        int pages;
        try (var document = Loader.loadPDF(bytes)) { pages = document.getNumberOfPages(); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF is invalid or encrypted", e); }
        if (pages < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF has no pages");
        if (pages > policy.getMaxPagesPerJob()) throw new ResponseStatusException(HttpStatus.CONFLICT, "This document exceeds the per-job page limit");
        var owner = users.findByEmailForUpdate(email).orElseThrow();
        int requestedPages = pages * copies;
        int limit = effectiveLimit(owner, policy);
        quotas.requireCapacity(owner, requestedPages, limit, monthStart(policy));
        var originalName = safeName(file.getOriginalFilename());
        var storageKey = UUID.randomUUID() + ".pdf";
        try { Files.write(storage.resolve(storageKey), bytes, StandardOpenOption.CREATE_NEW); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store upload", e); }
        var job = jobs.save(new PrintJob(owner, originalName, storageKey, bytes.length, pages, copies, color, duplex, Instant.now().plus(Duration.ofHours(policy.getHeldJobTtlHours()))));
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
        if (job.getStatus() == JobStatus.HELD || job.getStatus() == JobStatus.AWAITING_FLIP) {
            job.cancelHeld(); quotas.settle(job, false); deletePayload(job);
            audit.record(job.getOwner(), "JOB_CANCELED", "PRINT_JOB", id.toString(), job.getOriginalFilename());
            return;
        }
        if (Set.of(JobStatus.PENDING, JobStatus.PENDING_HELD, JobStatus.PROCESSING, JobStatus.PROCESSING_STOPPED).contains(job.getStatus())) {
            printNode.cancel(job.getCupsJobId());
            audit.record(job.getOwner(), "JOB_CANCEL_REQUESTED", "PRINT_JOB", id.toString(), "CUPS " + job.getCupsJobId());
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "This job can no longer be canceled");
    }

    @Transactional
    public PrintJob release(String email, UUID id, UUID printerId) {
        var job = ownedJob(email, id);
        if (job.getCupsJobId() != null) return job;
        if (job.getStatus() != JobStatus.HELD) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only held jobs can be released");
        Printer printer = printerId == null ? printers.findByCupsQueue(defaultQueue).orElse(null)
            : printers.findById(printerId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Printer not found"));
        String queue = printer == null ? defaultQueue : validatePrinter(job, printer);
        if (printer != null) printerAccess.require(email, printer, PrinterPermission.RELEASE_OWN);
        if (printer != null) job.assignPrinter(printer);
        var key = job.ensureSubmissionKey();
        jobs.flush();
        var submission = job.getDuplexMode() == DuplexMode.MANUAL
            ? printNode.submit(key, queue, storage.resolve(job.getStorageKey()), job.getOriginalFilename() + " (odd pages)", job.getOwner().getEmail(), job.getCopies(), job.getColorMode(), job.getDuplexMode(), "odd")
            : printNode.submit(key, queue, storage.resolve(job.getStorageKey()), job.getOriginalFilename(), job.getOwner().getEmail(), job.getCopies(), job.getColorMode(), job.getDuplexMode());
        if (job.getDuplexMode() == DuplexMode.MANUAL) job.submittedManualOdd(submission.jobId(), submission.queue(), cupsState(submission.state()), submission.reasons());
        else job.submitted(submission.jobId(), submission.queue(), cupsState(submission.state()), submission.reasons());
        audit.record(job.getOwner(), "JOB_RELEASED", "PRINT_JOB", id.toString(), "CUPS " + submission.jobId());
        if (job.getStatus() == JobStatus.COMPLETED || job.getStatus() == JobStatus.CANCELED || job.getStatus() == JobStatus.ABORTED) {
            quotas.settle(job, job.getStatus() == JobStatus.COMPLETED);
            if (job.getStatus() != JobStatus.ABORTED) deletePayload(job);
            priceIfCompleted(job);
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
                if (mapped == JobStatus.COMPLETED && job.getDuplexMode() == DuplexMode.MANUAL && "ODD".equals(job.getManualPhase())) {
                    job.awaitingFlip(state.reasons());
                    audit.record(job.getOwner(), "JOB_AWAITING_FLIP", "PRINT_JOB", job.getId().toString(), "Odd pages complete");
                    continue;
                }
                if (mapped == JobStatus.COMPLETED || mapped == JobStatus.CANCELED || mapped == JobStatus.ABORTED) {
                    quotas.settle(job, mapped == JobStatus.COMPLETED);
                    if (mapped != JobStatus.ABORTED) deletePayload(job);
                    priceIfCompleted(job);
                    audit.record(job.getOwner(), "JOB_" + mapped, "PRINT_JOB", job.getId().toString(), "CUPS " + job.getCupsJobId());
                }
            } catch (Exception ignored) {
                // A transient CUPS outage must not invent a job state. Try again on the next poll.
            }
        }
    }

    @Transactional
    public PrintJob retry(String email, UUID id) {
        var job = ownedJob(email, id);
        if (job.getStatus() != JobStatus.ABORTED) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only aborted jobs can be retried");
        if (!Files.exists(storage.resolve(job.getStorageKey()))) throw new ResponseStatusException(HttpStatus.GONE, "The retained document is no longer available");
        var owner = users.findByEmailForUpdate(email).orElseThrow();
        var policy = settings.current(); int limit = effectiveLimit(owner, policy);
        quotas.requireCapacity(owner, job.getPages() * job.getCopies(), limit, monthStart(policy));
        job.prepareRetry(Instant.now().plus(Duration.ofHours(policy.getHeldJobTtlHours()))); quotas.reserve(job);
        audit.record(owner, "JOB_RETRY_CREATED", "PRINT_JOB", id.toString(), "Attempt " + job.getAttempt());
        return job;
    }

    @Transactional
    public PrintJob confirmFlip(String email, UUID id) {
        var job = ownedJob(email, id);
        if (job.getStatus() != JobStatus.AWAITING_FLIP || job.getDuplexMode() != DuplexMode.MANUAL)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This job is not waiting for a paper-stack flip");
        var key = UUID.nameUUIDFromBytes((job.getId() + ":even:" + job.getAttempt()).getBytes(StandardCharsets.UTF_8));
        var submission = printNode.submit(key, job.getCupsQueue(), storage.resolve(job.getStorageKey()), job.getOriginalFilename() + " (even pages)",
            job.getOwner().getEmail(), job.getCopies(), job.getColorMode(), DuplexMode.MANUAL, "even");
        job.submittedManualEven(submission.jobId(), cupsState(submission.state()), submission.reasons());
        audit.record(job.getOwner(), "JOB_FLIP_CONFIRMED", "PRINT_JOB", id.toString(), "CUPS " + submission.jobId());
        if (job.getStatus() == JobStatus.COMPLETED) {
            quotas.settle(job, true); deletePayload(job); priceIfCompleted(job);
            audit.record(job.getOwner(), "JOB_COMPLETED", "PRINT_JOB", id.toString(), "Manual duplex complete");
        }
        return job;
    }

    @Transactional(readOnly = true)
    public QuotaView quota(String email, int defaultLimit) {
        AppUser owner = users.findByEmailIgnoreCase(email).orElseThrow();
        var policy = settings.current(); int limit = effectiveLimit(owner, policy);
        var usage = quotas.usage(owner, monthStart(policy));
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
        var policy = settings.current();
        purge(jobs.findAllByStatusInAndCompletedAtLessThan(Set.of(JobStatus.COMPLETED), Instant.now().minus(Duration.ofHours(policy.getCompletedRetentionHours()))));
        purge(jobs.findAllByStatusInAndCompletedAtLessThan(Set.of(JobStatus.CANCELED, JobStatus.ABORTED, JobStatus.EXPIRED), Instant.now().minus(Duration.ofHours(policy.getFailedRetentionHours()))));
    }

    private void purge(List<PrintJob> expired) {
        for (var job : expired) {
            deletePayload(job); quotaLedger.detachJob(job.getId()); jobs.delete(job);
        }
    }

    private void deletePayload(PrintJob job) {
        try { Files.deleteIfExists(storage.resolve(job.getStorageKey())); } catch (IOException ignored) {}
    }

    private Instant monthStart(InstanceSettings policy) {
        var zone = ZoneId.of(policy.getQuotaTimezone());
        return ZonedDateTime.now(zone).withDayOfMonth(1).toLocalDate().atStartOfDay(zone).toInstant();
    }
    private int effectiveLimit(AppUser owner, InstanceSettings policy) {
        if (owner.getMonthlyPageQuota() != null) return owner.getMonthlyPageQuota();
        return groups.findAllByMembersId(owner.getId()).stream().map(group -> group.getMonthlyPageQuota())
            .filter(java.util.Objects::nonNull).min(Integer::compareTo).orElse(policy.getDefaultMonthlyPageQuota());
    }
    private String validatePrinter(PrintJob job, Printer printer) {
        if (!printer.isEnabled() || printer.isMaintenance()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Printer is disabled or under maintenance");
        if (printer.getStatus() == PrinterStatus.OFFLINE) throw new ResponseStatusException(HttpStatus.CONFLICT, "Printer is offline");
        if (printer.getStatus() == PrinterStatus.ERROR && printer.getErrorPolicy() == PrinterErrorPolicy.BLOCK)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Printer is blocked: " + printer.getStateReasons());
        if (job.getColorMode() == ColorMode.COLOR && !printer.isColorCapable())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This printer does not support color");
        if ((job.getDuplexMode() == DuplexMode.TWO_SIDED_LONG_EDGE || job.getDuplexMode() == DuplexMode.TWO_SIDED_SHORT_EDGE) && !printer.isDuplexCapable())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This printer does not support hardware duplex");
        if (printer.getCupsQueue() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Printer has no CUPS queue");
        return printer.getCupsQueue();
    }
    private void priceIfCompleted(PrintJob job) {
        if (job.getStatus() != JobStatus.COMPLETED || job.getPrinter() == null) return;
        var printer = job.getPrinter();
        BigDecimal rate = job.getColorMode() == ColorMode.COLOR ? printer.getColorPageRate() : printer.getMonoPageRate();
        job.price(rate.multiply(BigDecimal.valueOf((long) job.getPages() * job.getCopies())), printer.getRateVersion());
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
