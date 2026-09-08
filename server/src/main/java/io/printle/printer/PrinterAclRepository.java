package io.printle.printer;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface PrinterAclRepository extends JpaRepository<PrinterAcl, UUID> {
    List<PrinterAcl> findAllByPrinterId(UUID printerId);
    long countByPrinterId(UUID printerId);
    boolean existsByPrinterIdAndPermissionAndPrincipalTypeAndPrincipalIdIn(UUID printerId, PrinterPermission permission, PrinterPrincipalType type, Collection<UUID> ids);
    void deleteAllByPrinterId(UUID printerId);
}
