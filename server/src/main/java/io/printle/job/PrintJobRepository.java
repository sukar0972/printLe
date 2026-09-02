package io.printle.job;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;
import java.util.Collection;
import java.time.Instant;

public interface PrintJobRepository extends JpaRepository<PrintJob, UUID> {
    List<PrintJob> findAllByOwnerIdOrderByCreatedAtDesc(UUID ownerId);
    List<PrintJob> findAllByCupsJobIdIsNotNullAndStatusIn(Collection<JobStatus> statuses);
    List<PrintJob> findAllByStatusAndExpiresAtLessThanEqual(JobStatus status, Instant cutoff);
    List<PrintJob> findAllByStatusInAndCompletedAtLessThan(Collection<JobStatus> statuses, Instant cutoff);
}
