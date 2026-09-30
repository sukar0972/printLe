package io.printle.job;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.UUID;
import java.util.Collection;
import java.time.Instant;
import java.util.Optional;

public interface PrintJobRepository extends JpaRepository<PrintJob, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from PrintJob j where j.id = :id")
    Optional<PrintJob> findByIdForUpdate(@Param("id") UUID id);
    List<PrintJob> findAllByOwnerIdOrderByCreatedAtDesc(UUID ownerId);
    List<PrintJob> findAllByIppJobIdIsNotNullAndStatusIn(Collection<JobStatus> statuses);
    @Query("select j.id from PrintJob j where j.status = :status and j.expiresAt <= :cutoff")
    List<UUID> findExpiredIds(@Param("status") JobStatus status, @Param("cutoff") Instant cutoff);
    List<PrintJob> findAllByStatusInAndCompletedAtLessThan(Collection<JobStatus> statuses, Instant cutoff);
    List<PrintJob> findAllByStatusOrderByCompletedAtDesc(JobStatus status);
}
