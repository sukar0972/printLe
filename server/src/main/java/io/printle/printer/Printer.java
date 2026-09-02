package io.printle.printer;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "printer")
public class Printer {
    @Id private UUID id;
    @Column(nullable = false) private String name;
    private String description;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PrinterStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected Printer() {}
    public Printer(String name, String description) {
        this.id = UUID.randomUUID(); this.name = name.trim(); this.description = description;
        this.status = PrinterStatus.UNCONFIGURED; this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public PrinterStatus getStatus() { return status; }
}

