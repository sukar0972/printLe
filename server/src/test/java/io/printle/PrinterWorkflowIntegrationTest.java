package io.printle;

import com.jayway.jsonpath.JsonPath;
import io.printle.job.PrintNodeClient;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.io.ByteArrayOutputStream;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class PrinterWorkflowIntegrationTest {
    @Autowired MockMvc mvc;
    @MockitoBean PrintNodeClient node;

    @BeforeEach void profiles() {
        when(node.printers()).thenReturn(List.of(
            profile("mock-color", "Color Lab", true, true, "ONLINE", List.of()),
            profile("mock-mono", "Mono Desk", false, true, "ONLINE", List.of()),
            profile("mock-simple", "Simplex", false, false, "ONLINE", List.of()),
            profile("mock-jam", "Jammed", true, true, "ERROR", List.of("media-jam"))));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void discoversProfilesPreservesAdminConfigAndRejectsCapabilities() throws Exception {
        var sync = mvc.perform(post("/api/printers/sync").with(csrf())).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.cupsQueue == 'mock-color')].colorCapable").value(true)).andReturn();
        List<String> colorIds = JsonPath.read(sync.getResponse().getContentAsString(), "$[?(@.cupsQueue == 'mock-color')].id");
        List<String> monoIds = JsonPath.read(sync.getResponse().getContentAsString(), "$[?(@.cupsQueue == 'mock-mono')].id");
        var colorId = colorIds.getFirst(); var monoId = monoIds.getFirst();
        mvc.perform(put("/api/printers/{id}", colorId).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
            {"name":"Edited Color","description":"admin choice","location":"Floor 2","enabled":true,"maintenance":false,"errorPolicy":"WARN","monoPageRate":0.03,"colorPageRate":0.25}
            """)).andExpect(status().isOk()).andExpect(jsonPath("$.rateVersion").value(2));
        mvc.perform(post("/api/printers/sync").with(csrf())).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == '%s')].name".formatted(colorId)).value("Edited Color"));

        var job = upload("color-capability.pdf", 2, "COLOR", "ONE_SIDED");
        mvc.perform(post("/api/jobs/{id}/release", job).queryParam("printerId", monoId).with(csrf()))
            .andExpect(status().isConflict());
        when(node.submit(any(), eq("mock-color"), any(), anyString(), anyString(), anyInt(), any(), any()))
            .thenReturn(new PrintNodeClient.Submission(91, "mock-color", "completed", "none"));
        mvc.perform(post("/api/jobs/{id}/release", job).queryParam("printerId", colorId).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("COMPLETED"))
            .andExpect(jsonPath("$.estimatedCost").value(0.50)).andExpect(jsonPath("$.costRateVersion").value(2));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void manualDuplexWaitsForFlipAndSubmitsEvenPagesExactlyOnce() throws Exception {
        var sync = mvc.perform(post("/api/printers/sync").with(csrf())).andReturn();
        List<String> ids = JsonPath.read(sync.getResponse().getContentAsString(), "$[?(@.cupsQueue == 'mock-simple')].id");
        var printerId = ids.getFirst(); var job = upload("manual.pdf", 3, "MONOCHROME", "MANUAL");
        when(node.submit(any(), eq("mock-simple"), any(), contains("odd pages"), anyString(), anyInt(), any(), any(), eq("odd")))
            .thenReturn(new PrintNodeClient.Submission(101, "mock-simple", "completed", "none"));
        when(node.submit(any(), eq("mock-simple"), any(), contains("even pages"), anyString(), anyInt(), any(), any(), eq("even")))
            .thenReturn(new PrintNodeClient.Submission(102, "mock-simple", "completed", "none"));
        mvc.perform(post("/api/jobs/{id}/release", job).queryParam("printerId", printerId).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("AWAITING_FLIP"))
            .andExpect(jsonPath("$.oddCupsJobId").value(101));
        mvc.perform(post("/api/jobs/{id}/flip", job).with(csrf())).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("COMPLETED")).andExpect(jsonPath("$.evenCupsJobId").value(102));
        mvc.perform(post("/api/jobs/{id}/flip", job).with(csrf())).andExpect(status().isConflict());
        verify(node).submit(any(), eq("mock-simple"), any(), contains("even pages"), anyString(), anyInt(), any(), any(), eq("even"));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void abortedJobCanBeRetriedAsANewQuotaAttempt() throws Exception {
        var sync = mvc.perform(post("/api/printers/sync").with(csrf())).andReturn();
        List<String> ids = JsonPath.read(sync.getResponse().getContentAsString(), "$[?(@.cupsQueue == 'mock-color')].id");
        var printerId = ids.getFirst(); var job = upload("retry.pdf", 1, "MONOCHROME", "ONE_SIDED");
        when(node.submit(any(), eq("mock-color"), any(), anyString(), anyString(), anyInt(), any(), any()))
            .thenReturn(new PrintNodeClient.Submission(111, "mock-color", "aborted", "document-format-error"));
        mvc.perform(post("/api/jobs/{id}/release", job).queryParam("printerId", printerId).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ABORTED"));
        mvc.perform(post("/api/jobs/{id}/retry", job).with(csrf())).andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("HELD")).andExpect(jsonPath("$.attempt").value(1));
        mvc.perform(get("/api/jobs/quota")).andExpect(status().isOk()).andExpect(jsonPath("$.pending").value(1));
    }

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void printerAclHidesPrinterWithoutAnExplicitPermission() throws Exception {
        var sync = mvc.perform(post("/api/printers/sync").with(csrf())).andReturn();
        List<String> ids = JsonPath.read(sync.getResponse().getContentAsString(), "$[?(@.cupsQueue == 'mock-mono')].id");
        var printerId = ids.getFirst();
        var created = mvc.perform(post("/api/admin/users").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
            {"email":"acl-user@example.com","displayName":"ACL User","password":"a-long-test-password","role":"USER"}
            """)).andExpect(status().isCreated()).andReturn();
        String userId = JsonPath.read(created.getResponse().getContentAsString(), "$.id");
        var users = mvc.perform(get("/api/admin/users")).andReturn();
        List<String> adminIds = JsonPath.read(users.getResponse().getContentAsString(), "$[?(@.email == 'admin@test.local')].id");
        mvc.perform(put("/api/printers/{id}/acl", printerId).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
            [{"principalType":"USER","principalId":"%s","permission":"VIEW"}]
            """.formatted(adminIds.getFirst()))).andExpect(status().isOk());
        mvc.perform(get("/api/printers").with(user("acl-user@example.com").roles("USER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == '%s')]".formatted(printerId)).isEmpty());
        mvc.perform(put("/api/printers/{id}/acl", printerId).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
            [{"principalType":"USER","principalId":"%s","permission":"VIEW"}]
            """.formatted(userId)))
            .andExpect(status().isOk());
        mvc.perform(get("/api/printers").with(user("acl-user@example.com").roles("USER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == '%s')]".formatted(printerId)).isNotEmpty());
    }

    private String upload(String name, int pages, String color, String duplex) throws Exception {
        var response = mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", name, "application/pdf", pdf(pages)))
            .param("colorMode", color).param("duplexMode", duplex).with(csrf())).andExpect(status().isCreated()).andReturn();
        return JsonPath.read(response.getResponse().getContentAsString(), "$.id");
    }
    private PrintNodeClient.PrinterProfile profile(String queue, String name, boolean color, boolean duplex, String status, List<String> reasons) {
        return new PrintNodeClient.PrinterProfile(queue, name, "Test", status, true, color, duplex, List.of("A4"), reasons,
            new PrintNodeClient.Device("MOCK_USB", "1209", "0001", queue, "MFG:printLe;MDL:Test;"));
    }
    private byte[] pdf(int pages) throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) document.addPage(new PDPage()); document.save(output); return output.toByteArray();
        }
    }
}
