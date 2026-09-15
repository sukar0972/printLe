package io.printle.printer;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;
import java.util.Optional;

public interface PrinterRepository extends JpaRepository<Printer, UUID> {
    long countByIppUriIsNotNull();
    java.util.Optional<Printer> findByIppUri(String uri);
}
