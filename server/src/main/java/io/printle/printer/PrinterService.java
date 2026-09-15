package io.printle.printer;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class PrinterService {
    private final PrinterRepository printers;
    private final io.printle.ipp.DirectIppClient ipp;
    public PrinterService(PrinterRepository printers, io.printle.ipp.DirectIppClient ipp) { this.printers = printers; this.ipp = ipp; }

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
        return printers.findAll();
    }
}
