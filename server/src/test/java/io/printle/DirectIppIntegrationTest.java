package io.printle;

import com.jayway.jsonpath.JsonPath;
import com.sun.net.httpserver.HttpServer;
import io.printle.job.*;
import io.printle.printer.PrinterPoller;
import org.apache.pdfbox.pdmodel.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(username = "admin@test.local", roles = "ADMIN")
class DirectIppIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JobService jobs;
    @MockitoBean PrintNodeClient cups;
    @MockitoBean PrinterPoller printerPoller;
    @MockitoBean JobStatePoller jobPoller;
    static HttpServer printer;
    static final List<Received> received = new CopyOnWriteArrayList<>();
    static volatile int jobState = 5;
    static String endpoint(String path) { return "ipp://127.0.0.1:" + printer.getAddress().getPort() + path; }

    @BeforeAll static void startPrinter() throws Exception {
        printer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        printer.createContext("/", exchange -> {
            try {
                byte[] bytes = exchange.getRequestBody().readAllBytes();
                var input = new DataInputStream(new ByteArrayInputStream(bytes));
                assertEquals(0x0101, input.readUnsignedShort());
                int operation = input.readUnsignedShort(), requestId = input.readInt();
                var attrs = new LinkedHashMap<String, byte[]>();
                String name = "";
                while (true) {
                    int tag = input.readUnsignedByte();
                    if (tag == 3) break;
                    if (tag < 0x10) continue;
                    int length = input.readUnsignedShort();
                    if (length > 0) name = new String(input.readNBytes(length), StandardCharsets.UTF_8);
                    attrs.put(name, input.readNBytes(input.readUnsignedShort()));
                }
                var request = new Received(operation, exchange.getRequestURI().getPath(), attrs, input.readAllBytes());
                received.add(request);
                assertEquals(List.of("attributes-charset", "attributes-natural-language", "printer-uri"), attrs.keySet().stream().limit(3).toList());
                assertEquals(endpoint(request.path()), request.text("printer-uri"));
                if (operation == 6 && request.path().contains("send-failure")) {
                    exchange.sendResponseHeaders(503, -1); exchange.close(); return;
                }
                var buffer = new ByteArrayOutputStream(); var out = new DataOutputStream(buffer);
                out.writeShort(0x0101); out.writeShort(0); out.writeInt(requestId); out.writeByte(1);
                attr(out, 0x47, "attributes-charset", "utf-8".getBytes(StandardCharsets.UTF_8));
                attr(out, 0x48, "attributes-natural-language", "en".getBytes(StandardCharsets.UTF_8));
                out.writeByte(operation == 11 ? 4 : 2);
                if (operation == 11) {
                    attr(out, 0x49, "document-format-supported", (request.path().contains("no-pdf") ? "image/pwg-raster" : "application/pdf").getBytes(StandardCharsets.UTF_8));
                    for (int n : List.of(5, 6, 8, 9)) attr(out, 0x23, n == 5 ? "operations-supported" : "", integer(n));
                    attr(out, 0x22, "printer-is-accepting-jobs", new byte[]{1});
                    attr(out, 0x22, "color-supported", new byte[]{1});
                    attr(out, 0x23, "printer-state", integer(3));
                    attr(out, 0x44, "sides-supported", "one-sided".getBytes(StandardCharsets.UTF_8));
                    attr(out, 0x44, "", "two-sided-long-edge".getBytes(StandardCharsets.UTF_8));
                    attr(out, 0x44, "print-color-mode-supported", "monochrome".getBytes(StandardCharsets.UTF_8));
                    attr(out, 0x44, "", "color".getBytes(StandardCharsets.UTF_8));
                    attr(out, 0x33, "copies-supported", ByteBuffer.allocate(8).putInt(1).putInt(9).array());
                } else if (operation == 5 || operation == 9) {
                    attr(out, 0x21, "job-id", integer(42));
                    attr(out, 0x23, "job-state", integer(operation == 5 ? 4 : jobState));
                } else if (operation == 8) jobState = 7;
                out.writeByte(3);
                exchange.getResponseHeaders().set("Content-Type", "application/ipp");
                exchange.sendResponseHeaders(200, buffer.size()); exchange.getResponseBody().write(buffer.toByteArray()); exchange.close();
            } catch (Throwable error) {
                exchange.sendResponseHeaders(500, -1); exchange.close();
            }
        });
        printer.start();
    }
    @AfterAll static void stopPrinter() { printer.stop(0); }
    @BeforeEach void reset() { received.clear(); jobState = 5; }

    @Test void addsPrinterAndPrintsPdfWithoutCupsAndSettlesQuota() throws Exception {
        String path = "/print-" + UUID.randomUUID();
        String id = add(path);
        String job = upload("TWO_SIDED_LONG_EDGE");
        mvc.perform(post("/api/jobs/{id}/release", job).param("printerId", id).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.ippUri").value(endpoint(path)))
            .andExpect(jsonPath("$.cupsJobId").value(42));
        var create = received.stream().filter(r -> r.operation() == 5).findFirst().orElseThrow();
        assertEquals("two-sided-long-edge", create.text("sides"));
        assertEquals("monochrome", create.text("print-color-mode"));
        assertEquals(2, ByteBuffer.wrap(create.attrs().get("copies")).getInt());
        var send = received.stream().filter(r -> r.operation() == 6).findFirst().orElseThrow();
        assertEquals("application/pdf", send.text("document-format"));
        assertEquals(1, send.attrs().get("last-document")[0]);
        assertTrue(new String(send.document(), StandardCharsets.ISO_8859_1).startsWith("%PDF-"));
        jobs.syncActiveJobs();
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(job)).value("PROCESSING"));
        jobState = 9; jobs.syncActiveJobs(); jobs.syncActiveJobs();
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(job)).value("COMPLETED"))
            .andExpect(jsonPath("$[?(@.id == '%s')].estimatedCost".formatted(job)).value(0.10));
        org.mockito.Mockito.verifyNoInteractions(cups);
    }

    @Test void deliveryFailureKeepsRemoteIdAndDoesNotResubmitAndCanCancel() throws Exception {
        String path = "/send-failure-" + UUID.randomUUID();
        String id = add(path), job = upload("ONE_SIDED");
        mvc.perform(post("/api/jobs/{id}/release", job).param("printerId", id).with(csrf())).andExpect(status().isBadGateway());
        mvc.perform(post("/api/jobs/{id}/release", job).param("printerId", id).with(csrf()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.cupsJobId").value(42));
        assertEquals(1, received.stream().filter(r -> r.operation() == 6).count());
        mvc.perform(delete("/api/jobs/{id}", job).with(csrf())).andExpect(status().isNoContent());
        assertTrue(received.stream().anyMatch(r -> r.operation() == 8 && r.path().equals(path)));
        jobs.syncActiveJobs();
        mvc.perform(get("/api/jobs")).andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(job)).value("CANCELED"));
    }

    @Test void rejectsUnsupportedFormatDuplicateAndNonAdmin() throws Exception {
        mvc.perform(post("/api/printers/ipp").with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content(body("/no-pdf"))).andExpect(status().isUnprocessableEntity());
        String path = "/duplicate-" + UUID.randomUUID(); add(path);
        mvc.perform(post("/api/printers/ipp").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body(path))).andExpect(status().isConflict());
        mvc.perform(post("/api/printers/ipp").with(user("admin@test.local").roles("USER")).with(csrf())
            .contentType(MediaType.APPLICATION_JSON).content(body("/forbidden"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/printers/ipp").with(csrf()).contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Bad URL\",\"uri\":\"file:///etc/passwd\"}")).andExpect(status().isBadRequest());
    }

    @Test void identicalRemoteIdsAreScopedToTheirPrinterAndRefreshSurvivesCupsOutage() throws Exception {
        String firstPath = "/first-" + UUID.randomUUID(), secondPath = "/second-" + UUID.randomUUID();
        String first = add(firstPath), second = add(secondPath);
        String firstJob = upload("ONE_SIDED"), secondJob = upload("ONE_SIDED");
        mvc.perform(post("/api/jobs/{id}/release", firstJob).param("printerId", first).with(csrf())).andExpect(status().isOk());
        mvc.perform(post("/api/jobs/{id}/release", secondJob).param("printerId", second).with(csrf())).andExpect(status().isOk());
        mvc.perform(delete("/api/jobs/{id}", secondJob).with(csrf())).andExpect(status().isNoContent());
        var cancellations = received.stream().filter(r -> r.operation() == 8).toList();
        assertEquals(1, cancellations.size());
        assertEquals(secondPath, cancellations.getFirst().path());
        org.mockito.Mockito.when(cups.printers()).thenThrow(new IllegalStateException("CUPS is not running"));
        mvc.perform(post("/api/printers/sync").with(csrf())).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(first)).value("ONLINE"));
    }

    @Test void manualFlipIsRejectedBeforeCreatingRemoteJob() throws Exception {
        String id = add("/manual-" + UUID.randomUUID()), job = upload("MANUAL");
        mvc.perform(post("/api/jobs/{id}/release", job).param("printerId", id).with(csrf())).andExpect(status().isConflict());
        assertFalse(received.stream().anyMatch(r -> r.operation() == 5));
    }

    private String add(String path) throws Exception {
        var response = mvc.perform(post("/api/printers/ipp").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body(path)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.transport").value("DIRECT_IPP"))
            .andExpect(jsonPath("$.duplexCapable").value(true)).andReturn();
        return JsonPath.read(response.getResponse().getContentAsString(), "$.id");
    }
    private String body(String path) { return "{\"name\":\"Test direct printer\",\"uri\":\"" + endpoint(path) + "\"}"; }
    private String upload(String duplex) throws Exception {
        byte[] pdf;
        try (var doc = new PDDocument(); var output = new ByteArrayOutputStream()) { doc.addPage(new PDPage()); doc.save(output); pdf = output.toByteArray(); }
        var response = mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "direct.pdf", "application/pdf", pdf))
            .param("duplexMode", duplex).param("copies", "2").with(csrf())).andExpect(status().isCreated()).andReturn();
        return JsonPath.read(response.getResponse().getContentAsString(), "$.id");
    }
    record Received(int operation, String path, Map<String, byte[]> attrs, byte[] document) {
        String text(String name) { return new String(attrs.get(name), StandardCharsets.UTF_8); }
    }
    static byte[] integer(int value) { return ByteBuffer.allocate(4).putInt(value).array(); }
    static void attr(DataOutputStream out, int tag, String name, byte[] value) throws IOException {
        byte[] key = name.getBytes(StandardCharsets.UTF_8);
        out.writeByte(tag); out.writeShort(key.length); out.write(key); out.writeShort(value.length); out.write(value);
    }
}
