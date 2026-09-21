package io.printle.printer;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.List;

@Service
public class PrinterService {
    private final PrinterRepository printers;
    private final io.printle.ipp.DirectIppClient ipp;
    private final TransactionTemplate transactions;
    public PrinterService(PrinterRepository printers, io.printle.ipp.DirectIppClient ipp, org.springframework.transaction.PlatformTransactionManager transactionManager) {
        this.printers = printers; this.ipp = ipp;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public Printer addIpp(String name, String uri) {
        String endpoint = io.printle.ipp.DirectIppClient.validateUri(uri);
        if (printers.findByIppUri(endpoint).isPresent()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "This IPP printer is already registered");
        var caps = ipp.inspect(endpoint);
        return transactions.execute(tx -> {
            if (printers.findByIppUri(endpoint).isPresent()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "This IPP printer is already registered");
            var printer = new Printer(name, "Direct IPP printer");
            printer.connectIpp(endpoint, caps);
            return printers.save(printer);
        });
    }

    public void refreshDirect() {
        List<Target> targets = transactions.execute(tx -> printers.findAll().stream()
            .filter(Printer::isDirectIpp)
            .map(printer -> new Target(printer.getId(), printer.getIppUri()))
            .toList());
        for (var target : targets == null ? List.<Target>of() : targets) {
            try {
                var caps = ipp.inspect(target.uri());
                transactions.execute(tx -> {
                    printers.findById(target.id()).filter(printer -> target.uri().equals(printer.getIppUri())).ifPresent(printer -> printer.refreshIpp(caps));
                    return null;
                });
            } catch (Exception e) {
                transactions.execute(tx -> {
                    printers.findById(target.id()).filter(printer -> target.uri().equals(printer.getIppUri())).ifPresent(Printer::markIppUnavailable);
                    return null;
                });
            }
        }
    }

    public List<Printer> refresh() {
        refreshDirect();
        return printers.findAll();
    }

    private record Target(java.util.UUID id, String uri) {}
}
