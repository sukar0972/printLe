package io.printle;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestBuilders.formLogin;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthIntegrationTest {
    @Autowired MockMvc mvc;

    @Test void rejectsAnonymousApiRequests() throws Exception {
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/me"))
            .andExpect(status().isUnauthorized());
    }

    @Test void bootstrapAdminCanLogIn() throws Exception {
        mvc.perform(formLogin("/api/auth/login").user("email", "admin@test.local").password("password", "test-password-123"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.authenticated").value(true));
    }
}

