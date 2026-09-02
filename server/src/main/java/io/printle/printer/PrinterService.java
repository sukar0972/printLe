package io.printle.printer;

import io.printle.job.PrintNodeClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PrinterService {
    private final PrinterRepository printers;
    private final PrintNodeClient node;
    public PrinterService(PrinterRepository printers, PrintNodeClient node) { this.printers = printers; this.node = node; }

    @Transactional
    public List<Printer> synchronize() {
        var profiles = node.printers();
        Set<String> seen = profiles.stream().map(PrintNodeClient.PrinterProfile::queue).collect(Collectors.toSet());
        for (var profile : profiles) {
            var printer = printers.findByCupsQueue(profile.queue()).orElseGet(() -> new Printer(profile.name(), "Mock print-node printer"));
            printer.synchronize(profile); printers.save(printer);
        }
        for (var printer : printers.findAll()) {
            if (printer.getCupsQueue() != null && !seen.contains(printer.getCupsQueue())) printer.markMissing();
        }
        return printers.findAll();
    }
}
