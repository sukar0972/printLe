package io.printle.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class AppUser {
    @Id private UUID id;
    @Column(nullable = false, unique = true) private String email;
    @Column(name = "display_name", nullable = false) private String displayName;
    @Column(name = "password_hash", nullable = false) private String passwordHash;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private Role role;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private UserStatus status;
    @Column(name = "monthly_page_quota") private Integer monthlyPageQuota;
    @Column(name = "quota_exempt", nullable = false) private boolean quotaExempt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "password_change_required", nullable = false) private boolean passwordChangeRequired;
    @Column(name = "last_signed_in_at") private Instant lastSignedInAt;

    protected AppUser() {}

    public AppUser(String email, String displayName, String passwordHash, Role role) {
        this.id = UUID.randomUUID();
        this.email = email.trim().toLowerCase();
        this.displayName = displayName.trim();
        this.passwordHash = passwordHash;
        this.role = role;
        this.status = UserStatus.ACTIVE;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getDisplayName() { return displayName; }
    public String getPasswordHash() { return passwordHash; }
    public Role getRole() { return role; }
    public UserStatus getStatus() { return status; }
    public Integer getMonthlyPageQuota() { return monthlyPageQuota; }
    public boolean isQuotaExempt() { return quotaExempt; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isPasswordChangeRequired() { return passwordChangeRequired; }
    public Instant getLastSignedInAt() { return lastSignedInAt; }
    public void update(String email, String displayName, Role role, UserStatus status, Integer quota, boolean exempt) {
        if (email != null && !email.isBlank()) this.email = email.trim().toLowerCase();
        this.displayName = displayName.trim(); this.role = role; this.status = status;
        this.monthlyPageQuota = quota; this.quotaExempt = exempt; this.updatedAt = Instant.now();
    }
    public void resetPassword(String hash) { this.passwordHash = hash; this.passwordChangeRequired = true; this.updatedAt = Instant.now(); }
    public void changePassword(String hash) { this.passwordHash = hash; this.passwordChangeRequired = false; this.updatedAt = Instant.now(); }
    public void signedIn() { this.lastSignedInAt = Instant.now(); }
}
