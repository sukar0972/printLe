package io.printle.printer;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/printers")
public class PrinterController {
    private final PrinterRepository printers;
    public PrinterController(PrinterRepository printers) { this.printers = printers; }
    @GetMapping public List<PrinterView> list() { return printers.findAll().stream().map(PrinterView::from).toList(); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @PreAuthorize("hasRole('ADMIN')")
    public PrinterView create(@Valid @RequestBody CreatePrinter request) { return PrinterView.from(printers.save(new Printer(request.name(), request.description()))); }
    public record CreatePrinter(@NotBlank @Size(max=120) String name, @Size(max=500) String description) {}
    public record PrinterView(UUID id, String name, String description, PrinterStatus status) {
        static PrinterView from(Printer printer) { return new PrinterView(printer.getId(), printer.getName(), printer.getDescription(), printer.getStatus()); }
    }
}

