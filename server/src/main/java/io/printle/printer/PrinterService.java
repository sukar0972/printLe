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
    private final io.printle.ipp.DirectIppClient ipp;
    public PrinterService(PrinterRepository printers, PrintNodeClient node, io.printle.ipp.DirectIppClient ipp) { this.printers = printers; this.node = node; this.ipp = ipp; }

    @Transactional
    public Printer addIpp(String name, String uri) {
        uri = io.printle.ipp.DirectIppClient.validateUri(uri);
        if (printers.findByIppUri(uri).isPresent()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "This IPP printer is already registered");
        var caps = ipp.inspect(uri);
        var printer = new Printer(name, "Direct IPP printer");
        printer.connectIpp(uri, caps);
        return printers.save(printer);
    }

    @Transactional
    public void refreshDirect() {
        for (var printer : printers.findAll()) {
            if (!printer.isDirectIpp()) continue;
            try { printer.refreshIpp(ipp.inspect(printer.getIppUri())); }
            catch (Exception e) { printer.markIppUnavailable(); }
        }
    }

    @Transactional
    public List<Printer> refresh() {
        refreshDirect();
        try { return synchronize(); }
        catch (IllegalStateException e) {
            var known = printers.findAll();
            if (known.stream().noneMatch(Printer::isDirectIpp)) throw e;
            return known;
        }
    }

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
