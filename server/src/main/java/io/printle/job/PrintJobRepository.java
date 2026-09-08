package io.printle.job;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
import java.util.Collection;
import java.time.Instant;

public interface PrintJobRepository extends JpaRepository<PrintJob, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select j from PrintJob j where j.id = :id")
    java.util.Optional<PrintJob> findByIdForUpdate(@org.springframework.data.repository.query.Param("id") UUID id);
    List<PrintJob> findAllByOwnerIdOrderByCreatedAtDesc(UUID ownerId);
    List<PrintJob> findAllByCupsJobIdIsNotNullAndStatusIn(Collection<JobStatus> statuses);
    List<PrintJob> findAllByStatusAndExpiresAtLessThanEqual(JobStatus status, Instant cutoff);
    List<PrintJob> findAllByStatusInAndCompletedAtLessThan(Collection<JobStatus> statuses, Instant cutoff);
    List<PrintJob> findAllByStatusOrderByCompletedAtDesc(JobStatus status);
}
