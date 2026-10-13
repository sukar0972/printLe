package io.printle;

import io.printle.audit.AuditEventRepository;
import io.printle.user.AppUser;
import io.printle.user.AppUserRepository;
import io.printle.user.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@org.springframework.context.annotation.Import(io.printle.PostgresTestConfiguration.class)
@AutoConfigureMockMvc
class AdminUserIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder passwords;
    @Autowired AuditEventRepository audit;

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void adminCreatesUser() throws Exception {
        mvc.perform(post("/api/admin/users").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
            {"email":"alex@example.com","displayName":"Alex Morgan","password":"a-long-test-password","role":"USER"}
            """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.email").value("alex@example.com"))
            .andExpect(jsonPath("$.role").value("USER"));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "USER")
    void regularUserCannotManageUsers() throws Exception {
        mvc.perform(get("/api/admin/users")).andExpect(status().isForbidden());
    }

    @Test void adminCanChangeTheirOwnEmailAndSignInAgainWithTheNewAddress() throws Exception {
        String previousEmail = UUID.randomUUID() + "@self.test";
        String nextEmail = "updated-" + previousEmail;
        String password = "test-password-123";
        var admin = users.save(new AppUser(previousEmail, "Self edit", passwords.encode(password), Role.ADMIN));
        var login = mvc.perform(formLogin("/api/auth/login").user("email", previousEmail).password("password", password))
            .andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        mvc.perform(put("/api/admin/users/{id}", admin.getId()).session(session).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
            {"email":"%s","displayName":"Self edit","role":"ADMIN","status":"ACTIVE","quotaExempt":false}
            """.formatted(nextEmail)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(nextEmail));
        assertTrue(users.findByEmailIgnoreCase(previousEmail).isEmpty());
        assertEquals(admin.getId(), users.findByEmailIgnoreCase(nextEmail).orElseThrow().getId());
        assertTrue(audit.findAll().stream().anyMatch(event -> event.getAction().equals("USER_UPDATED")
            && event.getTargetId().equals(admin.getId().toString()) && event.getActor().getId().equals(admin.getId())));
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
        var nextLogin = mvc.perform(formLogin("/api/auth/login").user("email", nextEmail).password("password", password))
            .andExpect(status().isOk()).andReturn();
        mvc.perform(get("/api/auth/me").session((MockHttpSession) nextLogin.getRequest().getSession(false)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(nextEmail));
    }
}
