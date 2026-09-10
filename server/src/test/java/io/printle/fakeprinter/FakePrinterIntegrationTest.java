package io.printle.fakeprinter;

import com.jayway.jsonpath.JsonPath;
import io.printle.ipp.DirectIppClient;
import io.printle.job.*;
import io.printle.printer.PrinterPoller;
import org.apache.pdfbox.pdmodel.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@WithMockUser(username = "admin@test.local", roles = "ADMIN")
class FakePrinterIntegrationTest {
    @LocalServerPort int port;
    @Autowired MockMvc mvc;
    @Autowired FakePrinterService fake;
    @Autowired DirectIppClient ipp;
    @Autowired JobService jobs;
    @MockitoBean PrintNodeClient cups;
    @MockitoBean PrinterPoller printerPoller;
    @MockitoBean JobStatePoller jobPoller;

    @BeforeEach void enable() { fake.enable(true); fake.clearEvents(); }
    String endpoint() { return "ipp://127.0.0.1:" + port + fake.snapshot().path(); }

    @Test void normalPrintleWorkflowDiscoversDeliversPollsAndCompletes() throws Exception {
        String printerId = JsonPath.read(mvc.perform(post("/api/printers/ipp").with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Fake Printer\",\"uri\":\"" + endpoint() + "\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.duplexCapable").value(true))
            .andReturn().getResponse().getContentAsString(), "$.id");
        byte[] pdf = pdf();
        String jobId = JsonPath.read(mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "fake-test.pdf", "application/pdf", pdf))
            .param("copies", "2").param("colorMode", "COLOR").param("duplexMode", "TWO_SIDED_LONG_EDGE").with(csrf()))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(), "$.id");
        var release = mvc.perform(post("/api/jobs/{id}/release", jobId).param("printerId", printerId).with(csrf()))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        int remoteId = JsonPath.read(release, "$.cupsJobId");
        var received = fake.snapshot().jobs().stream().filter(j -> j.id() == remoteId).findFirst().orElseThrow();
        assertEquals("processing", received.state());
        assertEquals(2, received.document().pages());
        assertEquals(pdf.length, received.document().bytes());
        assertEquals(64, received.document().sha256().length());
        assertTrue(received.attributes().stream().anyMatch(a -> a.get("name").equals("copies") && a.get("value").equals(2)));
        assertTrue(received.attributes().stream().anyMatch(a -> a.get("name").equals("sides") && a.get("value").equals("two-sided-long-edge")));
        assertTrue(received.attributes().stream().anyMatch(a -> a.get("name").equals("print-color-mode") && a.get("value").equals("color")));
        jobs.syncActiveJobs();
        mvc.perform(put("/api/admin/fake-printer/jobs/{id}", remoteId).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"state\":\"completed\"}"))
            .andExpect(status().isNoContent());
        jobs.syncActiveJobs();
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(jobId)).value("COMPLETED"));
        var operations = fake.snapshot().events().stream().map(FakePrinterService.Event::operation).toList();
        assertTrue(operations.containsAll(List.of("Get-Printer-Attributes", "Create-Job", "Send-Document", "Get-Job-Attributes", "Set job state")));
        mvc.perform(get("/api/admin/fake-printer")).andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(true));
        org.mockito.Mockito.verifyNoInteractions(cups);
    }

    @Test void actualClientCanFindCancelStopAndFailJobs() throws Exception {
        Path file = Files.createTempFile("fake-printer-test", ".pdf");
        try {
            Files.write(file, pdf());
            UUID key = UUID.randomUUID();
            var first = ipp.submit(ipp.prepare(endpoint(), key, "test-user", 1, ColorMode.MONOCHROME, DuplexMode.ONE_SIDED), file);
            ipp.send(endpoint(), first.jobId(), "test-user", file);
            assertEquals(first.jobId(), ipp.findJob(endpoint(), key, "test-user").jobId());
            assertNull(ipp.findJob(endpoint(), key, "different-user"));
            fake.setState(first.jobId(), "stopped");
            assertEquals("processing-stopped", ipp.status(endpoint(), first.jobId(), "test-user").state());
            fake.setState(first.jobId(), "processing");
            ipp.cancel(endpoint(), first.jobId(), "test-user");
            assertEquals("canceled", ipp.status(endpoint(), first.jobId(), "test-user").state());
            var second = ipp.submit(ipp.prepare(endpoint(), UUID.randomUUID(), "test-user", 1, ColorMode.MONOCHROME, DuplexMode.ONE_SIDED), file);
            ipp.send(endpoint(), second.jobId(), "test-user", file);
            fake.setState(second.jobId(), "aborted");
            assertEquals("aborted", ipp.status(endpoint(), second.jobId(), "test-user").state());
            assertThrows(DirectIppClient.IppException.class, () -> ipp.cancel(endpoint(), second.jobId(), "test-user"));
            assertTrue(fake.snapshot().events().stream().anyMatch(e -> e.operation().equals("Cancel-Job") && e.status().equals("0x0404")));
        } finally { Files.deleteIfExists(file); }
    }

    @Test void supportsPrintJobAndLogsProtocolErrorsWithoutCreatingJobs() throws Exception {
        int initial = fake.snapshot().jobs().size();
        var print = request(2, 101).add(1, 0x49, "document-format", "application/pdf");
        var body = new ByteArrayOutputStream(); body.write(print.bytes()); body.write(pdf());
        var result = send(body.toByteArray());
        assertEquals(0, result.code); assertEquals(101, result.id);
        assertEquals(initial + 1, fake.snapshot().jobs().size());
        int id = result.number("job-id", 0);
        assertEquals(5, result.number("job-state", 0));
        assertEquals(0x0406, send(request(9, 102).add(1, 0x21, "job-id", Integer.MAX_VALUE).bytes()).code);
        assertEquals(0x0501, send(request(0x7fff, 103).bytes()).code);
        assertEquals(0x0411, send(request(2, 104).bytes()).code);
        assertEquals(0x040b, send(request(5, 105).add(2, 0x21, "copies", 1000).bytes()).code);
        assertEquals(0x0400, send(new byte[]{1, 1, 0, 11, 0, 0, 0, 106}).code);
        assertEquals(initial + 1, fake.snapshot().jobs().size());
        ipp.cancel(endpoint(), id, "test");
        assertTrue(fake.snapshot().events().stream().anyMatch(e -> e.operation().equals("Malformed request") && e.requestId() == 106));
    }

    @Test void managementRequiresAdminAndCsrfAndEndpointRequiresEnabledSecret() throws Exception {
        mvc.perform(get("/api/admin/fake-printer").with(anonymous())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/fake-printer").with(user("user").roles("USER"))).andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/fake-printer").contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
            .andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/fake-printer").with(user("user").roles("USER")).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/fake-printer/ipp/wrong-token").with(anonymous()).contentType("application/ipp").content(request(11, 1).bytes()))
            .andExpect(status().isNotFound());
        mvc.perform(put("/api/admin/fake-printer").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
            .andExpect(status().isNoContent());
        mvc.perform(post(fake.snapshot().path()).with(anonymous()).contentType("application/ipp").content(request(11, 1).bytes()))
            .andExpect(status().isNotFound());
        fake.enable(true);
        mvc.perform(post(fake.snapshot().path()).with(anonymous()).contentType("application/ipp").content(request(11, 1).bytes()))
            .andExpect(status().isOk()).andExpect(content().contentType("application/ipp"));
        int jobCount = fake.snapshot().jobs().size();
        mvc.perform(delete("/api/admin/fake-printer/events").with(csrf())).andExpect(status().isNoContent());
        assertTrue(fake.snapshot().events().isEmpty()); assertEquals(jobCount, fake.snapshot().jobs().size());
    }

    @Test void eventHistoryIsBounded() throws Exception {
        for (int i = 0; i < 205; i++) fake.exchange(fake.snapshot().path().substring(fake.snapshot().path().lastIndexOf('/') + 1), request(11, i + 1).bytes());
        assertEquals(200, fake.snapshot().events().size());
        assertEquals(205, fake.snapshot().events().getFirst().requestId());
    }

    IppMessage request(int operation, int id) {
        return new IppMessage(operation, id).add(1, 0x47, "attributes-charset", "utf-8")
            .add(1, 0x48, "attributes-natural-language", "en").add(1, 0x45, "printer-uri", endpoint());
    }
    IppMessage send(byte[] body) throws Exception {
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(endpoint().replace("ipp://", "http://")))
            .header("Content-Type", "application/ipp").POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(), HttpResponse.BodyHandlers.ofByteArray());
        assertEquals(200, response.statusCode());
        return IppMessage.read(response.body());
    }
    static byte[] pdf() throws Exception {
        try (var doc = new PDDocument(); var buffer = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage()); doc.addPage(new PDPage()); doc.save(buffer); return buffer.toByteArray();
        }
    }
}
