package io.printle.printer;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "printer_acl", uniqueConstraints = @UniqueConstraint(columnNames = {"printer_id", "principal_type", "principal_id", "permission"}))
public class PrinterAcl {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "printer_id") private Printer printer;
    @Enumerated(EnumType.STRING) @Column(name = "principal_type", nullable = false) private PrinterPrincipalType principalType;
    @Column(name = "principal_id", nullable = false) private UUID principalId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PrinterPermission permission;
    protected PrinterAcl() {}
    public PrinterAcl(Printer printer, PrinterPrincipalType type, UUID principalId, PrinterPermission permission) {
        this.id = UUID.randomUUID(); this.printer = printer; this.principalType = type; this.principalId = principalId; this.permission = permission;
    }
    public UUID getId() { return id; }
    public PrinterPrincipalType getPrincipalType() { return principalType; }
    public UUID getPrincipalId() { return principalId; }
    public PrinterPermission getPermission() { return permission; }
}
