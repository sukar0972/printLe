package io.printle.printer;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class PrinterPoller {
    private final PrinterService printers;
    public PrinterPoller(PrinterService printers) { this.printers = printers; }
    @Scheduled(initialDelay = 3000, fixedDelayString = "${printle.printer-poll-interval-ms:30000}")
    public void poll() { try { printers.synchronize(); } catch (Exception ignored) {} }
}
