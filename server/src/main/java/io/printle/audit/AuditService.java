package io.printle.audit;

import io.printle.user.AppUser;
import org.springframework.stereotype.Service;

@Service
public class AuditService {
    private final AuditEventRepository events;
    public AuditService(AuditEventRepository events) { this.events = events; }
    public void record(AppUser actor, String action, String targetType, String targetId, String details) {
        events.save(new AuditEvent(actor, action, targetType, targetId, details));
    }
}

