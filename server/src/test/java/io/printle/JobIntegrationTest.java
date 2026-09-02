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

import java.io.ByteArrayOutputStream;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class JobIntegrationTest {
    @Autowired MockMvc mvc;

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void uploadsAndListsPdfJob() throws Exception {
        var file = new MockMultipartFile("file", "quarterly-report.pdf", "application/pdf", pdf(2));
        mvc.perform(multipart("/api/jobs").file(file).param("copies", "2").param("colorMode", "COLOR").with(csrf()))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.filename").value("quarterly-report.pdf"))
            .andExpect(jsonPath("$.pages").value(2))
            .andExpect(jsonPath("$.copies").value(2))
            .andExpect(jsonPath("$.status").value("HELD"));

        mvc.perform(get("/api/jobs"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].filename").value("quarterly-report.pdf"));
        mvc.perform(get("/api/jobs/quota"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.pending").value(4));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void rejectsNonPdfUpload() throws Exception {
        var file = new MockMultipartFile("file", "notes.txt", "text/plain", "hello".getBytes());
        mvc.perform(multipart("/api/jobs").file(file).with(csrf())).andExpect(status().isUnsupportedMediaType());
    }

    private byte[] pdf(int pages) throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) document.addPage(new PDPage());
            document.save(output);
            return output.toByteArray();
        }
    }
}

