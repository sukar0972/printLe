package io.printle.job;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface PrintJobRepository extends JpaRepository<PrintJob, UUID> {
    List<PrintJob> findAllByOwnerIdOrderByCreatedAtDesc(UUID ownerId);
}

