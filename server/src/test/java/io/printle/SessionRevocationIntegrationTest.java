package io.printle;

import io.printle.user.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SessionRevocationIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder passwords;

    @ParameterizedTest
    @ValueSource(strings = {"suspend", "demote", "reset"})
    void administrativeSecurityChangesRevokeExistingSessions(String change) throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        var account = users.save(new AppUser(email, "Session test", passwords.encode("test-password-123"), Role.ADMIN));
        var login = mvc.perform(formLogin("/api/auth/login").user("email", email).password("password", "test-password-123"))
            .andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        mvc.perform(get("/api/admin/users").session(session)).andExpect(status().isOk());
        if (change.equals("reset")) {
            mvc.perform(post("/api/admin/users/" + account.getId() + "/password-reset")
                .with(user("admin@test.local").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"temporaryPassword\":\"replacement-password-123\"}"))
                .andExpect(status().isNoContent());
        } else {
            mvc.perform(put("/api/admin/users/" + account.getId())
                .with(user("admin@test.local").roles("ADMIN")).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("""
                    {"displayName":"Session test","role":"%s","status":"%s","quotaExempt":false}
                    """.formatted(change.equals("demote") ? "USER" : "ADMIN", change.equals("suspend") ? "SUSPENDED" : "ACTIVE")))
                .andExpect(status().isOk());
        }
        mvc.perform(get("/api/admin/users").session(session)).andExpect(status().isUnauthorized());
    }
}
