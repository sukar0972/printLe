package io.printle.job;

import io.printle.config.PrintleProperties;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/jobs")
public class JobController {
    private final JobService service; private final PrintleProperties properties;
    public JobController(JobService service, PrintleProperties properties) { this.service = service; this.properties = properties; }

    @GetMapping @Transactional(readOnly = true)
    public List<JobView> list(Authentication auth) { return service.list(auth.getName()).stream().map(JobView::from).toList(); }
    @GetMapping("/quota") public JobService.QuotaView quota(Authentication auth) { return service.quota(auth.getName(), properties.defaultMonthlyPageQuota()); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public JobView upload(Authentication auth, @RequestPart("file") MultipartFile file,
                          @RequestParam(defaultValue = "1") int copies,
                          @RequestParam(defaultValue = "MONOCHROME") ColorMode colorMode,
                          @RequestParam(defaultValue = "ONE_SIDED") DuplexMode duplexMode) {
        return JobView.from(service.create(auth.getName(), file, copies, colorMode, duplexMode));
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(Authentication auth, @PathVariable UUID id) { service.cancel(auth.getName(), id); }
    @PostMapping("/{id}/release")
    public JobView release(Authentication auth, @PathVariable UUID id, @RequestParam(required = false) UUID printerId) { return JobView.from(service.release(auth.getName(), id, printerId)); }
    @PostMapping("/{id}/retry")
    public JobView retry(Authentication auth, @PathVariable UUID id) { return JobView.from(service.retry(auth.getName(), id)); }
    @PostMapping("/{id}/flip")
    public JobView flip(Authentication auth, @PathVariable UUID id) { return JobView.from(service.confirmFlip(auth.getName(), id)); }

    public record JobView(UUID id, String filename, long sizeBytes, int pages, int copies, ColorMode colorMode,
                          DuplexMode duplexMode, JobStatus status, Instant createdAt, Integer cupsJobId,
                          String cupsQueue, String ippStateReasons, Instant submittedAt, Instant completedAt, Instant expiresAt,
                          UUID printerId, String printerName, java.math.BigDecimal estimatedCost, Integer costRateVersion, Instant pricedAt, int attempt,
                          String manualPhase, Integer oddCupsJobId, Integer evenCupsJobId) {
        static JobView from(PrintJob job) { return new JobView(job.getId(), job.getOriginalFilename(), job.getSizeBytes(), job.getPages(), job.getCopies(), job.getColorMode(), job.getDuplexMode(), job.getStatus(), job.getCreatedAt(), job.getCupsJobId(), job.getCupsQueue(), job.getIppStateReasons(), job.getSubmittedAt(), job.getCompletedAt(), job.getExpiresAt(), job.getPrinter() == null ? null : job.getPrinter().getId(), job.getPrinter() == null ? null : job.getPrinter().getName(), job.getEstimatedCost(), job.getCostRateVersion(), job.getPricedAt(), job.getAttempt(), job.getManualPhase(), job.getOddCupsJobId(), job.getEvenCupsJobId()); }
    }
}
