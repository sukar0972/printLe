package io.printle.quota;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Modifying;
import java.time.Instant;
import java.util.UUID;

public interface QuotaLedgerRepository extends JpaRepository<QuotaLedgerEntry, UUID> {
    boolean existsByJobIdAndEntryTypeAndAttempt(UUID jobId, QuotaEntryType entryType, int attempt);

    @Query("select coalesce(sum(e.pages), 0) from QuotaLedgerEntry e where e.user.id = :userId and e.entryType = :type and e.createdAt >= :since")
    long sumSince(@Param("userId") UUID userId, @Param("type") QuotaEntryType type, @Param("since") Instant since);

    @Query("select coalesce(sum(e.pages), 0) from QuotaLedgerEntry e where e.user.id = :userId and e.entryType = :type")
    long sumAll(@Param("userId") UUID userId, @Param("type") QuotaEntryType type);

    @Modifying
    @Query("update QuotaLedgerEntry e set e.job = null where e.job.id = :jobId")
    int detachJob(@Param("jobId") UUID jobId);
}
