package io.printle.job;

import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;

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
        var out = new StringBuilder("job_id,completed_at,user,printer,pages,color_mode,estimated_cost,rate_version\n");
        for (var row : report().jobs()) out.append(row.id()).append(',').append(row.completedAt()).append(',')
            .append(csv(row.user())).append(',').append(csv(row.printer())).append(',').append(row.printedPages()).append(',')
            .append(row.colorMode()).append(',').append(row.estimatedCost()).append(',').append(row.rateVersion()).append('\n');
        return out.toString();
    }
    private String csv(String value) { return "\"" + (value == null ? "" : value.replace("\"", "\"\"")) + "\""; }
    public record JobCostView(UUID id, Instant completedAt, String user, String printer, int printedPages,
                              ColorMode colorMode, BigDecimal estimatedCost, Integer rateVersion) {
        static JobCostView from(PrintJob j) { return new JobCostView(j.getId(), j.getCompletedAt(), j.getOwner().getEmail(),
            j.getPrinter() == null ? null : j.getPrinter().getName(), j.getPages() * j.getCopies(), j.getColorMode(),
            j.getEstimatedCost() == null ? BigDecimal.ZERO : j.getEstimatedCost(), j.getCostRateVersion()); }
    }
    public record ReportView(int completedJobs, int printedPages, BigDecimal estimatedCost, List<JobCostView> jobs) {}
}
