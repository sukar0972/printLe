package io.printle.job;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.StringWriter;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/admin/reports")
@PreAuthorize("hasAnyRole('ADMIN','MANAGER')")
public class ReportController {
    private final PrintJobRepository jobs;
    public ReportController(PrintJobRepository jobs) { this.jobs = jobs; }
    @GetMapping @Transactional(readOnly = true) public ReportView report() {
        var rows = jobs.findAllByStatusOrderByCompletedAtDesc(JobStatus.COMPLETED).stream().map(JobCostView::from).toList();
        int pages = rows.stream().mapToInt(JobCostView::printedPages).sum();
        var cost = rows.stream().map(JobCostView::estimatedCost).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ReportView(rows.size(), pages, cost, rows);
    }
    @GetMapping(value = "/jobs.csv", produces = "text/csv")
    @Transactional(readOnly = true) public String csv() {
        var sw = new StringWriter();
        var format = CSVFormat.RFC4180.builder()
            .setHeader("job_id", "completed_at", "user", "printer", "pages", "color_mode", "estimated_cost", "rate_version")
            .build();
        try (var printer = new CSVPrinter(sw, format)) {
            for (var row : report().jobs()) {
                printer.printRecord(
                    row.id(),
                    row.completedAt(),
                    row.user(),
                    row.printer(),
                    row.printedPages(),
                    row.colorMode(),
                    row.estimatedCost(),
                    row.rateVersion()
                );
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return sw.toString();
    }
    public record JobCostView(UUID id, Instant completedAt, String user, String printer, int printedPages,
                              ColorMode colorMode, BigDecimal estimatedCost, Integer rateVersion) {
        static JobCostView from(PrintJob j) { return new JobCostView(j.getId(), j.getCompletedAt(), j.getOwner().getEmail(),
            j.getPrinter() == null ? null : j.getPrinter().getName(), j.getPages() * j.getCopies(), j.getColorMode(),
            j.getEstimatedCost() == null ? BigDecimal.ZERO : j.getEstimatedCost(), j.getCostRateVersion()); }
    }
    public record ReportView(int completedJobs, int printedPages, BigDecimal estimatedCost, List<JobCostView> jobs) {}
}
