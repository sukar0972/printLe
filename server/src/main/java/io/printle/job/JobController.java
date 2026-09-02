package io.printle.job;

import io.printle.config.PrintleProperties;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/jobs")
public class JobController {
    private final JobService service; private final PrintleProperties properties;
    public JobController(JobService service, PrintleProperties properties) { this.service = service; this.properties = properties; }

    @GetMapping public List<JobView> list(Authentication auth) { return service.list(auth.getName()).stream().map(JobView::from).toList(); }
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

    public record JobView(UUID id, String filename, long sizeBytes, int pages, int copies, ColorMode colorMode,
                          DuplexMode duplexMode, JobStatus status, Instant createdAt) {
        static JobView from(PrintJob job) { return new JobView(job.getId(), job.getOriginalFilename(), job.getSizeBytes(), job.getPages(), job.getCopies(), job.getColorMode(), job.getDuplexMode(), job.getStatus(), job.getCreatedAt()); }
    }
}

