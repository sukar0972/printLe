package io.printle.user;

import io.printle.audit.AuditService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import io.printle.quota.QuotaService;

@RestController
@RequestMapping("/api/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {
    private final AppUserRepository users; private final UserGroupRepository groups;
    private final PasswordEncoder passwords; private final AuditService audit;
    private final QuotaService quotas;
    public AdminUserController(AppUserRepository users, UserGroupRepository groups, PasswordEncoder passwords, AuditService audit, QuotaService quotas) {
        this.users = users; this.groups = groups; this.passwords = passwords; this.audit = audit; this.quotas = quotas;
    }
    @GetMapping public List<UserView> list() { return users.findAll().stream().map(UserView::from).toList(); }

    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    public UserView create(@Valid @RequestBody CreateUser request, Authentication auth) {
        if (users.findByEmailIgnoreCase(request.email()).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        var user = users.save(new AppUser(request.email(), request.displayName(), passwords.encode(request.password()), request.role()));
        groups.findByName("Everyone").ifPresent(group -> group.addMember(user));
        audit.record(actor(auth), "USER_CREATED", "USER", user.getId().toString(), user.getEmail());
        return UserView.from(user);
    }

    @PutMapping("/{id}") @Transactional
    public UserView update(@PathVariable UUID id, @Valid @RequestBody UpdateUser request, Authentication auth) {
        var user = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        boolean removingLastAdmin = user.getRole() == Role.ADMIN && user.getStatus() == UserStatus.ACTIVE
            && (request.role() != Role.ADMIN || request.status() != UserStatus.ACTIVE)
            && users.countByRoleAndStatus(Role.ADMIN, UserStatus.ACTIVE) <= 1;
        if (removingLastAdmin) throw new ResponseStatusException(HttpStatus.CONFLICT, "The final active administrator cannot be suspended or demoted");
        if (request.email() != null && users.findByEmailIgnoreCase(request.email()).filter(other -> !other.getId().equals(id)).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email is already in use");
        user.update(request.email(), request.displayName(), request.role(), request.status(), request.monthlyPageQuota(), request.quotaExempt());
        audit.record(actor(auth), "USER_UPDATED", "USER", user.getId().toString(), user.getEmail());
        return UserView.from(user);
    }
    @PostMapping("/{id}/quota-adjustments") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void adjustQuota(@PathVariable UUID id, @Valid @RequestBody QuotaAdjustment request, Authentication auth) {
        var user = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        quotas.adjust(user, request.pages(), request.reason());
        audit.record(actor(auth), "QUOTA_ADJUSTED", "USER", id.toString(), request.pages() + " pages: " + request.reason());
    }
    @PostMapping("/{id}/password-reset") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void resetPassword(@PathVariable UUID id, @Valid @RequestBody PasswordReset request, Authentication auth) {
        var user = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        user.resetPassword(passwords.encode(request.temporaryPassword()));
        audit.record(actor(auth), "PASSWORD_RESET", "USER", id.toString(), "Temporary password issued; change required");
    }
    private AppUser actor(Authentication auth) { return users.findByEmailIgnoreCase(auth.getName()).orElseThrow(); }

    public record CreateUser(@Email @NotBlank String email, @NotBlank @Size(max=120) String displayName,
                             @NotBlank @Size(min=12, max=128) String password, @NotNull Role role) {}
    public record UpdateUser(@Email String email, @NotBlank @Size(max=120) String displayName, @NotNull Role role, @NotNull UserStatus status,
                             @Min(0) Integer monthlyPageQuota, boolean quotaExempt) {}
    public record QuotaAdjustment(@Min(-100000) @Max(100000) int pages, @NotBlank @Size(max=255) String reason) {}
    public record PasswordReset(@NotBlank @Size(min=12, max=128) String temporaryPassword) {}
    public record UserView(UUID id, String email, String displayName, Role role, UserStatus status,
                           Integer monthlyPageQuota, boolean quotaExempt, Instant createdAt, Instant lastSignedInAt, boolean passwordChangeRequired) {
        static UserView from(AppUser u) { return new UserView(u.getId(), u.getEmail(), u.getDisplayName(), u.getRole(), u.getStatus(), u.getMonthlyPageQuota(), u.isQuotaExempt(), u.getCreatedAt(), u.getLastSignedInAt(), u.isPasswordChangeRequired()); }
    }
}
