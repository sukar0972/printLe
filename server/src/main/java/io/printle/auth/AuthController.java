package io.printle.auth;

import io.printle.user.AppUser;
import io.printle.user.AppUserRepository;
import io.printle.user.Role;
import io.printle.user.UserGroup;
import io.printle.user.UserGroupRepository;
import io.printle.audit.AuditService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AppUserRepository users; private final UserGroupRepository groups; private final PasswordEncoder passwords; private final AuditService audit;
    public AuthController(AppUserRepository users, UserGroupRepository groups, PasswordEncoder passwords, AuditService audit) {
        this.users = users; this.groups = groups; this.passwords = passwords; this.audit = audit;
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) { return Map.of("token", token.getToken()); }

    @GetMapping("/setup")
    public Map<String, Boolean> setup() { return Map.of("required", users.count() == 0); }

    @PostMapping("/setup") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public synchronized void completeSetup(@Valid @RequestBody SetupRequest request) {
        if (users.count() > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "An administrator already exists");
        var everyone = groups.findByName("Everyone").orElseGet(() -> groups.save(new UserGroup("Everyone", true)));
        var admin = users.save(new AppUser(request.email(), request.displayName(), passwords.encode(request.password()), Role.ADMIN));
        everyone.addMember(admin);
        audit.record(admin, "SETUP_ADMIN", "USER", admin.getId().toString(), "First-run administrator");
    }

    @GetMapping("/me")
    public UserView me(Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName()).orElseThrow();
        return new UserView(user.getId().toString(), user.getEmail(), user.getDisplayName(), user.getRole().name(), user.isPasswordChangeRequired());
    }
    @PostMapping("/password") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void changePassword(Authentication authentication, @Valid @RequestBody PasswordChange request) {
        var user = users.findByEmailIgnoreCase(authentication.getName()).orElseThrow();
        if (!passwords.matches(request.currentPassword(), user.getPasswordHash()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect");
        if (request.currentPassword().equals(request.newPassword()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a different password");
        user.changePassword(passwords.encode(request.newPassword()));
        audit.record(user, "PASSWORD_CHANGED", "USER", user.getId().toString(), "Self-service password change");
    }
    public record PasswordChange(@NotBlank String currentPassword, @NotBlank @Size(min=12, max=128) String newPassword) {}
    public record SetupRequest(@NotBlank @Email String email, @NotBlank @Size(min=1, max=80) String displayName, @NotBlank @Size(min=12, max=128) String password) {}
    public record UserView(String id, String email, String displayName, String role, boolean passwordChangeRequired) {}
}
