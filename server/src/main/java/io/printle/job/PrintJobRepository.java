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
    List<PrintJob> findAllByIppJobIdIsNotNullAndStatusIn(Collection<JobStatus> statuses);
    @org.springframework.data.jpa.repository.Query("select j.id from PrintJob j where j.status = :status and j.expiresAt <= :cutoff")
    List<UUID> findIdsByStatusAndExpiresAtLessThanEqual(@org.springframework.data.repository.query.Param("status") JobStatus status, @org.springframework.data.repository.query.Param("cutoff") Instant cutoff);
    @org.springframework.data.jpa.repository.Query("select j.id from PrintJob j where j.status in :statuses and j.completedAt < :cutoff")
    List<UUID> findIdsByStatusInAndCompletedAtLessThan(@org.springframework.data.repository.query.Param("statuses") Collection<JobStatus> statuses, @org.springframework.data.repository.query.Param("cutoff") Instant cutoff);
    List<PrintJob> findAllByStatusOrderByCompletedAtDesc(JobStatus status);
}
