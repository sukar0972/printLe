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
import io.printle.ipp.DirectIppClient;

import java.io.ByteArrayOutputStream;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@SpringBootTest
@org.springframework.context.annotation.Import(io.printle.PostgresTestConfiguration.class)
@AutoConfigureMockMvc
class JobIntegrationTest {
    @Autowired MockMvc mvc;
    @MockitoBean DirectIppClient ipp;

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void selectedPagesDetermineQuotaReservation() throws Exception {
        var result = mvc.perform(multipart("/api/jobs")
            .file(new MockMultipartFile("file", "selected.pdf", "application/pdf", pdf(5)))
            .param("pages", "1-2, 5").param("copies", "2").with(csrf()))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.pages").value(3))
            .andExpect(jsonPath("$.pageRange").value("1-2, 5")).andReturn();
        mvc.perform(get("/api/jobs/quota")).andExpect(jsonPath("$.pending").value(6));
        String id = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.id");
        mvc.perform(delete("/api/jobs/{id}", id).with(csrf())).andExpect(status().isNoContent());
    }

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
        when(ipp.inspect(anyString())).thenReturn(new DirectIppClient.Capabilities("Test", "Office", "ONLINE", true, true,
            java.util.List.of("one-sided"), java.util.List.of("A4"), java.util.List.of("none"), java.util.List.of("monochrome", "color"), 100, java.util.List.of(2,8,9)));
        var printer = mvc.perform(post("/api/printers/ipp").with(csrf()).contentType("application/json")
            .content("{\"name\":\"Test\",\"uri\":\"ipp://test.example/ipp/print\"}")).andExpect(status().isCreated()).andReturn();
        String printerId = com.jayway.jsonpath.JsonPath.read(printer.getResponse().getContentAsString(), "$.id");
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any()))
            .thenReturn(new DirectIppClient.PreparedSubmission("ipp://test.example/ipp/print", null, false));
        when(ipp.submit(any(), any())).thenReturn(new DirectIppClient.Submission(42, "ipp://test.example/ipp/print", "completed", "none"));

        mvc.perform(post("/api/jobs/{id}/release", id).param("printerId", printerId).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"));
        mvc.perform(post("/api/jobs/{id}/release", id).param("printerId", printerId).with(csrf())).andExpect(status().isOk());
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
