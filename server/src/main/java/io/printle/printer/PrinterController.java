package io.printle.printer;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.security.core.Authentication;
import io.printle.audit.AuditService;
import io.printle.user.AppUserRepository;

@RestController
@RequestMapping("/api/printers")
public class PrinterController {
    private final PrinterRepository printers; private final PrinterService service; private final PrinterAccessService access;
    private final PrinterAclRepository acls; private final AuditService audit; private final AppUserRepository users;
    public PrinterController(PrinterRepository printers, PrinterService service, PrinterAccessService access, PrinterAclRepository acls, AuditService audit, AppUserRepository users) { this.printers = printers; this.service = service; this.access = access; this.acls = acls; this.audit = audit; this.users = users; }
    @GetMapping public List<PrinterView> list(Authentication auth) { return printers.findAll().stream().filter(p -> access.allowed(auth.getName(), p, PrinterPermission.VIEW) || access.allowed(auth.getName(), p, PrinterPermission.RELEASE_OWN)).map(PrinterView::from).toList(); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMIN')")
    public PrinterView create(@Valid @RequestBody CreatePrinter request, Authentication auth) { var printer = printers.save(new Printer(request.name(), request.description())); record(auth, "PRINTER_CREATED", printer.getId(), printer.getName()); return PrinterView.from(printer); }
    @PostMapping("/sync") @PreAuthorize("hasRole('ADMIN')")
    public List<PrinterView> sync(Authentication auth) { var result = service.synchronize(); record(auth, "PRINTERS_SYNCHRONIZED", null, result.size() + " CUPS queues"); return result.stream().map(PrinterView::from).toList(); }
    @PutMapping("/{id}") @PreAuthorize("hasRole('ADMIN')")
    public PrinterView update(@PathVariable UUID id, @Valid @RequestBody UpdatePrinter request, Authentication auth) {
        var printer = printers.findById(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        printer.configure(request.name(), request.description(), request.location(), request.enabled(), request.maintenance(), request.errorPolicy(), request.monoPageRate(), request.colorPageRate());
        record(auth, "PRINTER_UPDATED", id, request.name()); return PrinterView.from(printers.save(printer));
    }
    @GetMapping("/{id}/acl") @PreAuthorize("hasRole('ADMIN')")
    public List<AclView> acl(@PathVariable UUID id) { return acls.findAllByPrinterId(id).stream().map(AclView::from).toList(); }
    @PutMapping("/{id}/acl") @PreAuthorize("hasRole('ADMIN')") @org.springframework.transaction.annotation.Transactional
    public List<AclView> replaceAcl(@PathVariable UUID id, @RequestBody List<@Valid AclRule> rules, Authentication auth) {
        var printer = printers.findById(id).orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(HttpStatus.NOT_FOUND));
        acls.deleteAllByPrinterId(id);
        var result = acls.saveAll(rules.stream().map(r -> new PrinterAcl(printer, r.principalType(), r.principalId(), r.permission())).toList());
        record(auth, "PRINTER_ACL_REPLACED", id, result.size() + " rules"); return result.stream().map(AclView::from).toList();
    }
    private void record(Authentication auth, String action, UUID id, String details) { audit.record(users.findByEmailIgnoreCase(auth.getName()).orElseThrow(), action, "PRINTER", id == null ? null : id.toString(), details); }
    public record CreatePrinter(@NotBlank @Size(max=120) String name, @Size(max=500) String description) {}
    public record UpdatePrinter(@NotBlank @Size(max=120) String name, @Size(max=500) String description,
                                @Size(max=160) String location, boolean enabled, boolean maintenance,
                                @jakarta.validation.constraints.NotNull PrinterErrorPolicy errorPolicy,
                                @DecimalMin("0.0") @NotNull BigDecimal monoPageRate,
                                @DecimalMin("0.0") @NotNull BigDecimal colorPageRate) {}
    public record AclRule(@NotNull PrinterPrincipalType principalType, @NotNull UUID principalId, @NotNull PrinterPermission permission) {}
    public record AclView(UUID id, PrinterPrincipalType principalType, UUID principalId, PrinterPermission permission) {
        static AclView from(PrinterAcl acl) { return new AclView(acl.getId(), acl.getPrincipalType(), acl.getPrincipalId(), acl.getPermission()); }
    }
    public record PrinterView(UUID id, String name, String description, PrinterStatus status, String cupsQueue,
                              String location, boolean enabled, boolean maintenance, boolean colorCapable,
                              boolean duplexCapable, String mediaSupported, String stateReasons, PrinterErrorPolicy errorPolicy,
                              String transport, String vendorId, String productId, String deviceSerial,
                              String ieee1284DeviceId, Instant lastSeenAt, BigDecimal monoPageRate, BigDecimal colorPageRate, int rateVersion) {
        static PrinterView from(Printer p) { return new PrinterView(p.getId(), p.getName(), p.getDescription(), p.getStatus(), p.getCupsQueue(), p.getLocation(), p.isEnabled(), p.isMaintenance(), p.isColorCapable(), p.isDuplexCapable(), p.getMediaSupported(), p.getStateReasons(), p.getErrorPolicy(), p.getTransport(), p.getVendorId(), p.getProductId(), p.getDeviceSerial(), p.getIeee1284DeviceId(), p.getLastSeenAt(), p.getMonoPageRate(), p.getColorPageRate(), p.getRateVersion()); }
    }
}
