package io.printle;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AdminUserIntegrationTest {
    @Autowired MockMvc mvc;

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
}

