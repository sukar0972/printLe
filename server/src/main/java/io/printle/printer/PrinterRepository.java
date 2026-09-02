package io.printle.printer;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PrinterRepository extends JpaRepository<Printer, UUID> {}

