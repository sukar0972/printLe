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
    private final AuditService audit; private final QuotaService quotas;
    private final QuotaLedgerRepository quotaLedger; private final Path storage;
    private final PrinterRepository printers;
    private final io.printle.ipp.DirectIppClient ipp;
    private final org.springframework.transaction.support.TransactionTemplate transactions;
    private final PrinterAccessService printerAccess;
    private final InstanceSettingsService settings; private final UserGroupRepository groups;
    public JobService(PrintJobRepository jobs, AppUserRepository users, AuditService audit,
                      QuotaService quotas, QuotaLedgerRepository quotaLedger, PrinterRepository printers,
                      PrinterAccessService printerAccess, InstanceSettingsService settings, UserGroupRepository groups, PrintleProperties properties, io.printle.ipp.DirectIppClient ipp, org.springframework.transaction.PlatformTransactionManager transactionManager) throws IOException {
        this.ipp = ipp;
        this.transactions = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        this.jobs = jobs; this.users = users; this.audit = audit; this.quotas = quotas; this.quotaLedger = quotaLedger; this.printers = printers; this.printerAccess = printerAccess;
        this.storage = Path.of(properties.storagePath()).toAbsolutePath().normalize();
        this.settings = settings; this.groups = groups;
        Files.createDirectories(storage);
    }

    @Transactional
    public PrintJob create(String email, MultipartFile file, int copies, ColorMode color, DuplexMode duplex, String pageRange) {
        if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF to upload");
        var policy = settings.current();
        if (copies < 1 || copies > policy.getMaxCopies()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Copies must be between 1 and " + policy.getMaxCopies());
        if (color == ColorMode.COLOR && !policy.isColorPrintingAllowed()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Color printing is disabled by the administrator");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read upload", e); }
        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-')
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only PDF files are supported");
        try { bytes = PdfSelection.select(bytes, pageRange); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF is invalid or encrypted", e); }
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
        job.selectPages(pageRange);
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
            if (job.getIppUri() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "This historical job has no IPP endpoint");
            ipp.cancel(job.getIppUri(), job.getIppJobId(), email);
            audit.record(job.getOwner(), "JOB_CANCEL_REQUESTED", "PRINT_JOB", id.toString(), "IPP " + job.getIppJobId());
            return;
        }
        throw new ResponseStatusException(HttpStatus.CONFLICT, "This job can no longer be canceled");
    }

    public PrintJob release(String email, UUID id, UUID printerId) {
        DirectSubmissionPlan[] plan = {null};
        var job = transactions.execute(transaction -> prepareRelease(email, id, printerId, plan));
        if (plan[0] != null) {
            return executeDirect(plan[0]);
        }
        return job;
    }

    private record DirectSubmissionPlan(UUID jobId, String endpoint, UUID key, String email,
                                        int copies, ColorMode colorMode, DuplexMode duplexMode,
                                        int pages, String storageKey, String phase, boolean reverse) {}

    private PrintJob executeDirect(DirectSubmissionPlan plan) {
        boolean manual = plan.duplexMode() == DuplexMode.MANUAL;
        boolean even = "EVEN".equals(plan.phase());

        Path payload = storage.resolve(plan.storageKey());
        boolean temporary = false;
        boolean attempted = false;
        try {
            var prepared = ipp.prepare(plan.endpoint(), plan.key(), plan.email(),
                manual ? 1 : plan.copies(), plan.colorMode(), manual ? DuplexMode.ONE_SIDED : plan.duplexMode());
            if (manual) {
                var bytes = PdfSelection.manualPass(Files.readAllBytes(payload), even, plan.copies(), plan.reverse());
                payload = Files.createTempFile(storage, "manual-", ".pdf");
                temporary = true;
                Files.write(payload, bytes);
            }
            attempted = true;
            if (prepared.staged()) {
                var submission = ipp.submit(prepared, null);
                transactions.execute(tx -> {
                    var current = ownedJob(plan.email(), plan.jobId());
                    applyRemote(current, submission, plan.phase());
                    return current;
                });
                ipp.send(plan.endpoint(), submission.jobId(), plan.email(), payload);
                return transactions.execute(tx -> {
                    var current = ownedJob(plan.email(), plan.jobId());
                    if (current.getPrinter() != null) current.getPrinter().getName();
                    return current;
                });
            } else {
                var remote = ipp.submit(prepared, payload);
                return transactions.execute(tx -> {
                    var current = ownedJob(plan.email(), plan.jobId());
                    applyRemote(current, remote, plan.phase());
                    return current;
                });
            }
        } catch (IOException | RuntimeException e) {
            if (!attempted) transactions.execute(tx -> {
                var current = ownedJob(plan.email(), plan.jobId());
                if (current.getStatus() == JobStatus.SUBMISSION_UNKNOWN && plan.key().equals(current.getSubmissionKey()))
                    current.restoreBeforeSubmission(plan.phase());
                return null;
            });
            if (e instanceof RuntimeException runtime) throw runtime;
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not prepare manual duplex pages", e);
        } finally {
            if (temporary) {
                try { Files.deleteIfExists(payload); } catch (IOException ignored) {}
            }
        }
    }

    private void applyRemote(PrintJob job, io.printle.ipp.DirectIppClient.Submission remote, String phase) {
        if ("ODD".equals(phase)) job.submittedManualOdd(remote.jobId(), ippState(remote.state()), remote.reasons());
        else if ("EVEN".equals(phase)) job.submittedManualEven(remote.jobId(), ippState(remote.state()), remote.reasons());
        else job.submitted(remote.jobId(), ippState(remote.state()), remote.reasons());
        settleTerminal(job);
        if (job.getPrinter() != null) job.getPrinter().getName();
    }
    private void settleTerminal(PrintJob job) {
        if (!Set.of(JobStatus.COMPLETED, JobStatus.CANCELED, JobStatus.ABORTED).contains(job.getStatus())) return;
        quotas.settle(job, job.getStatus() == JobStatus.COMPLETED);
        if (job.getStatus() != JobStatus.ABORTED) deletePayload(job);
        priceIfCompleted(job);
    }

    private PrintJob prepareRelease(String email, UUID id, UUID printerId, DirectSubmissionPlan[] plan) {
        var job = ownedJob(email, id);
        if (job.getIppJobId() != null) { if (job.getPrinter() != null) job.getPrinter().getName(); return job; }
        if (job.getStatus() == JobStatus.SUBMISSION_UNKNOWN) throw new ResponseStatusException(HttpStatus.CONFLICT, "Delivery is unconfirmed. Check the printer; this job will not be resent automatically");
        if (job.getStatus() != JobStatus.HELD) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only held jobs can be released");
        if (printerId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose an IPP printer");
        Printer printer = printers.findById(printerId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Printer not found"));
        validatePrinter(job, printer);
        printerAccess.require(email, printer, PrinterPermission.RELEASE_OWN);
        job.assignPrinter(printer);
        var key = job.ensureSubmissionKey();
        jobs.flush();
        {
            String phase = (job.getDuplexMode() == DuplexMode.MANUAL && job.getPages() > 1) ? "ODD" : null;
            job.useDirectIpp(printer.getIppUri());
            job.beginDirectSubmission(key, phase);
            audit.record(job.getOwner(), "JOB_RELEASED", "PRINT_JOB", id.toString(), "Direct IPP");
            plan[0] = new DirectSubmissionPlan(job.getId(), printer.getIppUri(), key, email,
                job.getCopies(), job.getColorMode(), job.getDuplexMode(), job.getPages(),
                job.getStorageKey(), phase, false);
            return job;
        }
    }

    @Transactional
    public void syncActiveJobs() {
        for (var uncertain : jobs.findAllByStatusOrderByCompletedAtDesc(JobStatus.SUBMISSION_UNKNOWN)) {
            if (uncertain.getIppUri() == null) continue;
            try {
                var remote = ipp.findJob(uncertain.getIppUri(), uncertain.getSubmissionKey(), uncertain.getOwner().getEmail());
                if (remote != null) {
                    var current = jobs.findByIdForUpdate(uncertain.getId()).orElseThrow();
                    if (current.getStatus() == JobStatus.SUBMISSION_UNKNOWN) applyRemote(current, remote, current.getManualPhase());
                }
            } catch (Exception ignored) { /* Never guess whether an unacknowledged Print-Job printed. */ }
        }
        var active = Set.of(JobStatus.PENDING, JobStatus.PENDING_HELD, JobStatus.PROCESSING, JobStatus.PROCESSING_STOPPED);
        for (var job : jobs.findAllByIppJobIdIsNotNullAndStatusIn(active)) {
            try {
                if (job.getIppUri() == null) continue;
                var state = ipp.status(job.getIppUri(), job.getIppJobId(), job.getOwner().getEmail());
                var mapped = ippState(state.state());
                job.updateIppState(mapped, state.reasons());
                if (mapped == JobStatus.COMPLETED && job.getDuplexMode() == DuplexMode.MANUAL && "ODD".equals(job.getManualPhase()) && job.getPages() > 1) {
                    job.awaitingFlip(state.reasons());
                    audit.record(job.getOwner(), "JOB_AWAITING_FLIP", "PRINT_JOB", job.getId().toString(), "Odd pages complete");
                    continue;
                }
                if (mapped == JobStatus.COMPLETED || mapped == JobStatus.CANCELED || mapped == JobStatus.ABORTED) {
                    quotas.settle(job, mapped == JobStatus.COMPLETED);
                    if (mapped != JobStatus.ABORTED) deletePayload(job);
                    priceIfCompleted(job);
                    audit.record(job.getOwner(), "JOB_" + mapped, "PRINT_JOB", job.getId().toString(), "IPP " + job.getIppJobId());
                }
            } catch (Exception ignored) {
                // A transient printer outage must not invent a job state. Try again on the next poll.
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

    public PrintJob confirmFlip(String email, UUID id) { return confirmFlip(email, id, false); }

    public PrintJob confirmFlip(String email, UUID id, boolean reverse) {
        DirectSubmissionPlan[] plan = {null};
        var job = transactions.execute(transaction -> prepareFlip(email, id, reverse, plan));
        if (plan[0] != null) {
            return executeDirect(plan[0]);
        }
        return job;
    }

    private PrintJob prepareFlip(String email, UUID id, boolean reverse, DirectSubmissionPlan[] plan) {
        var job = ownedJob(email, id);
        if (job.getStatus() != JobStatus.AWAITING_FLIP || job.getDuplexMode() != DuplexMode.MANUAL)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This job is not waiting for a paper-stack flip");
        var key = UUID.nameUUIDFromBytes((job.getId() + ":even:" + job.getAttempt()).getBytes(StandardCharsets.UTF_8));
        if (job.getIppUri() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "This historical job has no IPP endpoint");
        {
            printerAccess.require(email, job.getPrinter(), PrinterPermission.RELEASE_OWN);
            validatePrinter(job, job.getPrinter());
            job.beginDirectSubmission(key, "EVEN");
            audit.record(job.getOwner(), "JOB_FLIP_CONFIRMED", "PRINT_JOB", id.toString(), "Direct IPP even pages");
            plan[0] = new DirectSubmissionPlan(job.getId(), job.getIppUri(), key, email,
                job.getCopies(), job.getColorMode(), job.getDuplexMode(), job.getPages(),
                job.getStorageKey(), "EVEN", reverse);
            return job;
        }
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
        if (printer.getIppUri() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Printer has no IPP endpoint; register an IPP printer");
        return printer.getIppUri();
    }

    private void priceIfCompleted(PrintJob job) {
        if (job.getStatus() != JobStatus.COMPLETED || job.getPrinter() == null) return;
        var printer = job.getPrinter();
        BigDecimal rate = job.getColorMode() == ColorMode.COLOR ? printer.getColorPageRate() : printer.getMonoPageRate();
        job.price(rate.multiply(BigDecimal.valueOf((long) job.getPages() * job.getCopies())), printer.getRateVersion());
    }

    private PrintJob ownedJob(String email, UUID id) {
        var job = jobs.findByIdForUpdate(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!job.getOwner().getEmail().equalsIgnoreCase(email)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return job;
    }
    private String safeName(String name) {
        String value = name == null || name.isBlank() ? "document.pdf" : Path.of(name).getFileName().toString();
        value = value.replaceAll("[\\p{Cntrl}]", "");
        return value.length() > 255 ? value.substring(value.length() - 255) : value;
    }
    static JobStatus ippState(String state) {
        try { return JobStatus.valueOf(state.trim().toUpperCase().replace('-', '_')); }
        catch (Exception e) { throw new IllegalArgumentException("Unknown IPP job state: " + state, e); }
    }
    public record QuotaView(int limit, int used, int pending, Integer remaining, boolean exempt) {}
}
