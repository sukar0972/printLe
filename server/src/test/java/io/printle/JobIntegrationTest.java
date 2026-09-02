package io.printle;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import io.printle.job.PrintNodeClient;

import java.io.ByteArrayOutputStream;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@SpringBootTest
@AutoConfigureMockMvc
class JobIntegrationTest {
    @Autowired MockMvc mvc;
    @MockitoBean PrintNodeClient printNode;

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void uploadsAndListsPdfJob() throws Exception {
        var file = new MockMultipartFile("file", "quarterly-report.pdf", "application/pdf", pdf(2));
        var uploaded = mvc.perform(multipart("/api/jobs").file(file).param("copies", "2").param("colorMode", "COLOR").with(csrf()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.filename").value("quarterly-report.pdf"))
            .andExpect(jsonPath("$.pages").value(2))
            .andExpect(jsonPath("$.copies").value(2))
            .andExpect(jsonPath("$.status").value("HELD"))
            .andExpect(jsonPath("$.expiresAt").isNotEmpty()).andReturn();
        var id = com.jayway.jsonpath.JsonPath.<String>read(uploaded.getResponse().getContentAsString(), "$.id");

        mvc.perform(get("/api/jobs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[*].filename").value(org.hamcrest.Matchers.hasItem("quarterly-report.pdf")));
        mvc.perform(get("/api/jobs/quota"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pending").value(4));
        mvc.perform(delete("/api/jobs/{id}", id).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/jobs/quota")).andExpect(status().isOk()).andExpect(jsonPath("$.pending").value(0));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void rejectsNonPdfUpload() throws Exception {
        var file = new MockMultipartFile("file", "notes.txt", "text/plain", "hello".getBytes());
        mvc.perform(multipart("/api/jobs").file(file).with(csrf())).andExpect(status().isUnsupportedMediaType());
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void settlesCompletedJobOnlyOnce() throws Exception {
        var uploaded = mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "done.pdf", "application/pdf", pdf(3))).with(csrf()))
            .andExpect(status().isCreated()).andReturn();
        var id = com.jayway.jsonpath.JsonPath.<String>read(uploaded.getResponse().getContentAsString(), "$.id");
        when(printNode.submit(any(), anyString(), any(), anyString(), anyString(), anyInt(), any(), any()))
            .thenReturn(new PrintNodeClient.Submission(42, "mock-success", "completed", "none"));

        mvc.perform(post("/api/jobs/{id}/release", id).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        mvc.perform(post("/api/jobs/{id}/release", id).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/jobs/quota")).andExpect(status().isOk())
            .andExpect(jsonPath("$.used").value(3)).andExpect(jsonPath("$.pending").value(0));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void rejectsJobThatWouldExceedQuota() throws Exception {
        mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "too-many.pdf", "application/pdf", pdf(2)))
                .param("copies", "51").with(csrf()))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("This job would exceed the monthly page allowance"));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void returnsConfiguredCopyLimitAsAUsefulApiError() throws Exception {
        mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "too-many-copies.pdf", "application/pdf", pdf(1)))
                .param("copies", "101").with(csrf()))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Copies must be between 1 and 100"));
    }

    private byte[] pdf(int pages) throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }
}
