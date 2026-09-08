package io.printle.config;

import io.printle.audit.AuditService;
import io.printle.job.PrintNodeClient;
import io.printle.user.AppUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.nio.file.*;
import java.time.ZoneId;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/system")
@PreAuthorize("hasRole('ADMIN')")
public class AdminSystemController {
    private final InstanceSettingsService service; private final PrintNodeClient node; private final PrintleProperties properties;
    private final AppUserRepository users; private final AuditService audit;
    public AdminSystemController(InstanceSettingsService service, PrintNodeClient node, PrintleProperties properties, AppUserRepository users, AuditService audit) {
        this.service = service; this.node = node; this.properties = properties; this.users = users; this.audit = audit;
    }
    @GetMapping("/settings") @Transactional public SettingsView settings() { return SettingsView.from(service.current()); }
    @PutMapping("/settings") @Transactional public SettingsView update(@Valid @RequestBody UpdateSettings request, Authentication auth) {
        try { ZoneId.of(request.quotaTimezone()); } catch (Exception e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown quota timezone"); }
        var value = service.current(); value.update(request.defaultMonthlyPageQuota(), request.quotaTimezone(), request.heldJobTtlHours(), request.completedRetentionHours(), request.failedRetentionHours(), request.maxCopies(), request.maxPagesPerJob(), request.colorPrintingAllowed());
        var actor = users.findByEmailIgnoreCase(auth.getName()).orElseThrow(); audit.record(actor, "SETTINGS_UPDATED", "INSTANCE", "1", "Print and retention policy changed");
        return SettingsView.from(value);
    }
    @GetMapping("/diagnostics") public Map<String, Object> diagnostics() {
        boolean storageWritable = Files.isWritable(Path.of(properties.storagePath()).toAbsolutePath().normalize());
        try { var printers = node.printers(); return Map.of("database", "ok", "storage", storageWritable ? "ok" : "not-writable", "printNode", "ok", "discoveredPrinters", printers.size()); }
        catch (Exception e) { return Map.of("database", "ok", "storage", storageWritable ? "ok" : "not-writable", "printNode", "unavailable", "discoveredPrinters", 0); }
    }
    public record UpdateSettings(@Min(1) @Max(1000000) int defaultMonthlyPageQuota, @NotBlank String quotaTimezone,
        @Min(1) @Max(8760) int heldJobTtlHours, @Min(1) @Max(87600) int completedRetentionHours,
        @Min(1) @Max(87600) int failedRetentionHours, @Min(1) @Max(100) int maxCopies,
        @Min(1) @Max(10000) int maxPagesPerJob, boolean colorPrintingAllowed) {}
    public record SettingsView(int defaultMonthlyPageQuota, String quotaTimezone, int heldJobTtlHours,
        int completedRetentionHours, int failedRetentionHours, int maxCopies, int maxPagesPerJob,
        boolean colorPrintingAllowed, java.time.Instant updatedAt) {
        static SettingsView from(InstanceSettings s) { return new SettingsView(s.getDefaultMonthlyPageQuota(), s.getQuotaTimezone(), s.getHeldJobTtlHours(), s.getCompletedRetentionHours(), s.getFailedRetentionHours(), s.getMaxCopies(), s.getMaxPagesPerJob(), s.isColorPrintingAllowed(), s.getUpdatedAt()); }
    }
}
