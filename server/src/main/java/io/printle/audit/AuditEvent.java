package io.printle.audit;

import io.printle.user.AppUser;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_event")
public class AuditEvent {
    @Id private UUID id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "actor_id") private AppUser actor;
    @Column(nullable = false) private String action;
    @Column(name = "target_type", nullable = false) private String targetType;
    @Column(name = "target_id") private String targetId;
    @Column(columnDefinition = "text") private String details;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    protected AuditEvent() {}
    public AuditEvent(AppUser actor, String action, String targetType, String targetId, String details) {
        this.id = UUID.randomUUID(); this.actor = actor; this.action = action; this.targetType = targetType;
        this.targetId = targetId; this.details = details; this.createdAt = Instant.now();
    }
}

