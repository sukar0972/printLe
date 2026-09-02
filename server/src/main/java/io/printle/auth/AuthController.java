package io.printle.auth;

import io.printle.user.AppUserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AppUserRepository users;
    public AuthController(AppUserRepository users) { this.users = users; }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) { return Map.of("token", token.getToken()); }

    @GetMapping("/me")
    public UserView me(Authentication authentication) {
        var user = users.findByEmailIgnoreCase(authentication.getName()).orElseThrow();
        return new UserView(user.getId().toString(), user.getEmail(), user.getDisplayName(), user.getRole().name());
    }
    public record UserView(String id, String email, String displayName, String role) {}
}

