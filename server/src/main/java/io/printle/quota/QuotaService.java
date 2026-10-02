package io.printle.quota;

import io.printle.job.PrintJob;
import io.printle.user.AppUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;

@Service
public class QuotaService {
    private final QuotaLedgerRepository ledger;
    public QuotaService(QuotaLedgerRepository ledger) { this.ledger = ledger; }

    public void requireCapacity(AppUser user, int pages, int limit, Instant monthStart) {
        if (user.isQuotaExempt()) return;
        var used = ledger.sumSince(user.getId(), QuotaEntryType.DEBIT, monthStart) + ledger.sumSince(user.getId(), QuotaEntryType.ADJUSTMENT, monthStart);
        var pending = ledger.sumAll(user.getId(), QuotaEntryType.RESERVE) - ledger.sumAll(user.getId(), QuotaEntryType.RELEASE);
        if (used + pending + pages > limit)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This job would exceed the monthly page allowance");
    }

    public void reserve(PrintJob job) { addOnce(job, QuotaEntryType.RESERVE, reservedPages(job), "Job uploaded"); }
    public void settle(PrintJob job, boolean printed) {
        int reserved = reservedPages(job);
        if (printed) addOnce(job, QuotaEntryType.DEBIT, reserved, "IPP completed");
        addOnce(job, QuotaEntryType.RELEASE, reserved, printed ? "Reservation settled" : "Reservation released");
    }

    /** Release the reservation and debit only the pages already known to have printed. */
    public void settlePrinted(PrintJob job, int printedPages) {
        int reserved = reservedPages(job);
        int printed = Math.max(0, Math.min(printedPages, reserved));
        if (printed > 0) addOnce(job, QuotaEntryType.DEBIT, printed, "Pages already printed");
        addOnce(job, QuotaEntryType.RELEASE, reserved, "Reservation released");
    }

    private static int reservedPages(PrintJob job) { return job.getPages() * job.getCopies(); }

    private void addOnce(PrintJob job, QuotaEntryType type, int pages, String note) {
        if (!ledger.existsByJobIdAndEntryTypeAndAttempt(job.getId(), type, job.getAttempt()))
            ledger.save(new QuotaLedgerEntry(job.getOwner(), job, pages, type, note));
    }

    public Usage usage(AppUser user, Instant monthStart) {
        int used = Math.toIntExact(ledger.sumSince(user.getId(), QuotaEntryType.DEBIT, monthStart) + ledger.sumSince(user.getId(), QuotaEntryType.ADJUSTMENT, monthStart));
        int pending = Math.toIntExact(ledger.sumAll(user.getId(), QuotaEntryType.RESERVE) - ledger.sumAll(user.getId(), QuotaEntryType.RELEASE));
        return new Usage(used, Math.max(0, pending));
    }
    public record Usage(int used, int pending) {}
    public void adjust(AppUser user, int pages, String reason) { ledger.save(new QuotaLedgerEntry(user, pages, reason)); }
}
