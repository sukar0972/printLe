package io.printle;

import io.printle.audit.AuditEventRepository;
import io.printle.user.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.charset.StandardCharsets;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class UserCsvImportIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired AppUserRepository users;
    @Autowired UserGroupRepository groups;
    @Autowired AuditEventRepository audit;

    @Test
    @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void dryRunValidatesWithoutPersisting() throws Exception {
        String csv = """
            email,displayName,role,status,monthlyPageQuota,quotaExempt,password
            new1@import.test,User One,USER,ACTIVE,50,false,Password12345!
            new2@import.test,User Two,MANAGER,ACTIVE,100,true,
            invalid-email,Bad User,USER,ACTIVE,10,false,
            new1@import.test,Duplicate User,USER,ACTIVE,50,false,Password12345!
            """;

        MockMultipartFile file = new MockMultipartFile("file", "users.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/admin/users/import")
                .file(file)
                .param("dryRun", "true")
                .with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dryRun").value(true))
            .andExpect(jsonPath("$.totalRows").value(4))
            .andExpect(jsonPath("$.validRows").value(2))
            .andExpect(jsonPath("$.importedRows").value(0))
            .andExpect(jsonPath("$.errorRows").value(2))
            .andExpect(jsonPath("$.rows[0].success").value(true))
            .andExpect(jsonPath("$.rows[1].success").value(true))
            .andExpect(jsonPath("$.rows[2].success").value(false))
            .andExpect(jsonPath("$.rows[2].errors", hasItem("Invalid email format")))
            .andExpect(jsonPath("$.rows[3].success").value(false))
            .andExpect(jsonPath("$.rows[3].errors", hasItem(containsString("Duplicate email in CSV"))));

        assertFalse(users.findByEmailIgnoreCase("new1@import.test").isPresent());
        assertFalse(users.findByEmailIgnoreCase("new2@import.test").isPresent());
    }

    @Test
    @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void commitModePersistsUsersAddsToEveryoneAndCreatesAudit() throws Exception {
        String csv = """
            email,displayName,role,status,monthlyPageQuota,quotaExempt,password
            commit1@import.test,Commit User One,USER,ACTIVE,75,false,
            commit2@import.test,Commit User Two,OPERATOR,ACTIVE,200,true,SecurePass1234!
            """;

        MockMultipartFile file = new MockMultipartFile("file", "users.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/admin/users/import")
                .file(file)
                .param("dryRun", "false")
                .with(csrf()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.dryRun").value(false))
            .andExpect(jsonPath("$.totalRows").value(2))
            .andExpect(jsonPath("$.validRows").value(2))
            .andExpect(jsonPath("$.importedRows").value(2))
            .andExpect(jsonPath("$.errorRows").value(0))
            .andExpect(jsonPath("$.rows[0].success").value(true))
            .andExpect(jsonPath("$.rows[0].temporaryPassword").isString())
            .andExpect(jsonPath("$.rows[1].success").value(true))
            .andExpect(jsonPath("$.rows[1].temporaryPassword").isEmpty());

        var user1 = users.findByEmailIgnoreCase("commit1@import.test").orElseThrow();
        assertEquals("Commit User One", user1.getDisplayName());
        assertEquals(Role.USER, user1.getRole());
        assertEquals(75, user1.getMonthlyPageQuota());
        assertFalse(user1.isQuotaExempt());
        assertTrue(user1.isPasswordChangeRequired());

        var user2 = users.findByEmailIgnoreCase("commit2@import.test").orElseThrow();
        assertEquals("Commit User Two", user2.getDisplayName());
        assertEquals(Role.OPERATOR, user2.getRole());
        assertEquals(200, user2.getMonthlyPageQuota());
        assertTrue(user2.isQuotaExempt());
        assertFalse(user2.isPasswordChangeRequired());

        assertTrue(groups.findAllByMembersId(user1.getId()).stream().anyMatch(g -> g.getName().equals("Everyone")));
        assertTrue(groups.findAllByMembersId(user2.getId()).stream().anyMatch(g -> g.getName().equals("Everyone")));

        assertTrue(audit.findAll().stream().anyMatch(e -> "USER_CREATED".equals(e.getAction()) && "commit1@import.test".equals(e.getDetails())));
        assertTrue(audit.findAll().stream().anyMatch(e -> "USER_CREATED".equals(e.getAction()) && "commit2@import.test".equals(e.getDetails())));
    }

    @Test
    @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void rejectsMissingRequiredHeaders() throws Exception {
        String csv = "name,role\nUser,USER";
        MockMultipartFile file = new MockMultipartFile("file", "users.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/admin/users/import")
                .file(file)
                .with(csrf()))
            .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser(username = "user@test.local", roles = "USER")
    void nonAdminCannotImport() throws Exception {
        String csv = "email,displayName\nu@test.com,User";
        MockMultipartFile file = new MockMultipartFile("file", "users.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8));

        mvc.perform(multipart("/api/admin/users/import")
                .file(file)
                .with(csrf()))
            .andExpect(status().isForbidden());
    }
}
