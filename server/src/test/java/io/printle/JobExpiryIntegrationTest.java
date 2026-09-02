package io.printle;

import io.printle.job.JobService;
import io.printle.job.PrintNodeClient;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.io.ByteArrayOutputStream;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"printle.held-job-ttl=1ms", "printle.failed-job-retention=1ms", "printle.cleanup-interval-ms=3600000"})
@AutoConfigureMockMvc
class JobExpiryIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JobService jobs;
    @MockitoBean PrintNodeClient printNode;

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void expiresHeldJobReleasesQuotaAndPurgesRecord() throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage()); document.save(output);
            mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "expire.pdf", "application/pdf", output.toByteArray())).with(csrf()))
                .andExpect(status().isCreated());
        }
        Thread.sleep(5);
        jobs.expireHeldJobs();
        mvc.perform(get("/api/jobs")).andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("EXPIRED"));
        mvc.perform(get("/api/jobs/quota")).andExpect(status().isOk()).andExpect(jsonPath("$.pending").value(0));
        Thread.sleep(5);
        jobs.purgeRetainedJobs();
        mvc.perform(get("/api/jobs")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }
}
