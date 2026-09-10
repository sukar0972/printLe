package io.printle;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.io.StringReader;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ReportCsvExportIntegrationTest {
    @Autowired MockMvc mvc;

    @Test
    @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void adminCanExportReportCsv() throws Exception {
        var response = mvc.perform(get("/api/admin/reports/jobs.csv"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/csv"))
            .andReturn();

        String csv = response.getResponse().getContentAsString();
        var format = CSVFormat.RFC4180.builder()
            .setHeader()
            .setSkipHeaderRecord(true)
            .build();

        try (var parser = new CSVParser(new StringReader(csv), format)) {
            List<String> headers = parser.getHeaderNames();
            assertEquals(List.of("job_id", "completed_at", "user", "printer", "pages", "color_mode", "estimated_cost", "rate_version"), headers);
        }
    }

    @Test
    @WithMockUser(username = "user@test.local", roles = "USER")
    void nonAdminCannotExportReportCsv() throws Exception {
        mvc.perform(get("/api/admin/reports/jobs.csv"))
            .andExpect(status().isForbidden());
    }
}
