package io.printle.fakeprinter;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

@RestController
public class FakePrinterController {
    private final FakePrinterService printer;
    public FakePrinterController(FakePrinterService printer) { this.printer = printer; }

    public record View(boolean enabled, String localUri, String path,
                       java.util.List<FakePrinterService.JobView> jobs, java.util.List<FakePrinterService.Event> events) {}
    public record Enabled(boolean enabled) {}
    public record State(@NotBlank String state) {}

    @GetMapping("/api/admin/fake-printer") @PreAuthorize("hasRole('ADMIN')")
    public View view(HttpServletRequest request) {
        var snapshot = printer.snapshot();
        return new View(snapshot.enabled(), "ipp://127.0.0.1:" + request.getLocalPort() + snapshot.path(), snapshot.path(), snapshot.jobs(), snapshot.events());
    }

    @PutMapping("/api/admin/fake-printer") @PreAuthorize("hasRole('ADMIN')") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void configure(@RequestBody Enabled request) { printer.enable(request.enabled()); }

    @PutMapping("/api/admin/fake-printer/jobs/{id}") @PreAuthorize("hasRole('ADMIN')") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void state(@PathVariable int id, @Valid @RequestBody State request) { printer.setState(id, request.state()); }

    @DeleteMapping("/api/admin/fake-printer/events") @PreAuthorize("hasRole('ADMIN')") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void clear() { printer.clearEvents(); }

    // IPP clients have no browser session. The unguessable URL is available only to administrators.
    @PostMapping(value = "/api/fake-printer/ipp/{token}", consumes = "application/ipp", produces = "application/ipp")
    public byte[] ipp(@PathVariable String token, HttpServletRequest request) throws IOException {
        printer.checkAccess(token);
        if (request.getContentLengthLong() > FakePrinterService.MAX_BODY) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        byte[] body = request.getInputStream().readNBytes(FakePrinterService.MAX_BODY + 1);
        if (body.length > FakePrinterService.MAX_BODY) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE);
        return printer.exchange(token, body);
    }
}
