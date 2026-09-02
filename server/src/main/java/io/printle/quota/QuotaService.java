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
        var used = ledger.sumSince(user.getId(), QuotaEntryType.DEBIT, monthStart);
        var pending = ledger.sumAll(user.getId(), QuotaEntryType.RESERVE) - ledger.sumAll(user.getId(), QuotaEntryType.RELEASE);
        if (used + pending + pages > limit)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This job would exceed the monthly page allowance");
    }

    public void reserve(PrintJob job) { addOnce(job, QuotaEntryType.RESERVE, "Job uploaded"); }
    public void settle(PrintJob job, boolean printed) {
        if (printed) addOnce(job, QuotaEntryType.DEBIT, "CUPS completed");
        addOnce(job, QuotaEntryType.RELEASE, printed ? "Reservation settled" : "Reservation released");
    }

    private void addOnce(PrintJob job, QuotaEntryType type, String note) {
        if (!ledger.existsByJobIdAndEntryType(job.getId(), type))
            ledger.save(new QuotaLedgerEntry(job.getOwner(), job, job.getPages() * job.getCopies(), type, note));
    }

    public Usage usage(AppUser user, Instant monthStart) {
        int used = Math.toIntExact(ledger.sumSince(user.getId(), QuotaEntryType.DEBIT, monthStart));
        int pending = Math.toIntExact(ledger.sumAll(user.getId(), QuotaEntryType.RESERVE) - ledger.sumAll(user.getId(), QuotaEntryType.RELEASE));
        return new Usage(used, Math.max(0, pending));
    }
    public record Usage(int used, int pending) {}
}
