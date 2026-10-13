package io.printle.fakeprinter;

import org.apache.pdfbox.Loader;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;

@Service
public class FakePrinterService {
    static final int MAX_BODY = 26 * 1024 * 1024;
    private static final int MAX_EVENTS = 200, MAX_JOBS = 100;
    private final String token = UUID.randomUUID().toString();
    private final LinkedHashMap<Integer, Job> jobs = new LinkedHashMap<>();
    private final Deque<Event> events = new ArrayDeque<>();
    private boolean enabled;
    private long eventSequence;
    private int jobSequence;

    public record DocumentInfo(int bytes, int pages, String sha256) {}
    public record JobView(int id, String name, String user, String state, int stateCode, String reason,
                          Instant createdAt, List<Map<String, Object>> attributes, DocumentInfo document) {}
    public record Event(long id, Instant time, String operation, int requestId, String status, String message,
                        Integer jobId, List<Map<String, Object>> request, List<Map<String, Object>> response,
                        DocumentInfo document) {}
    public record Snapshot(boolean enabled, String path, List<JobView> jobs, List<Event> events) {}
    private static final class Job {
        final int id;
        final String name, user;
        final Instant createdAt = Instant.now();
        final List<Map<String, Object>> attributes;
        int state = 4;
        String reason = "job-incoming";
        DocumentInfo document;
        Job(int id, IppMessage request) {
            this.id = id; name = request.text("job-name", "Untitled job"); user = request.text("requesting-user-name", "anonymous");
            attributes = request.view();
        }
        JobView view() { return new JobView(id, name, user, stateName(state), state, reason, createdAt, attributes, document); }
    }

    public synchronized Snapshot snapshot() {
        return new Snapshot(enabled, "/api/fake-printer/ipp/" + token,
            jobs.values().stream().map(Job::view).toList().reversed(), List.copyOf(events).reversed());
    }

    public synchronized void enable(boolean value) {
        enabled = value;
        log("Simulator", 0, "ok", value ? "Fake printer enabled" : "Fake printer disabled", null, List.of(), List.of(), null);
    }

    public synchronized void clearEvents() { events.clear(); }

    public synchronized void setState(int id, String state) {
        Job job = jobs.get(id);
        if (job == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Mock job not found");
        if (job.state >= 7) throw new ResponseStatusException(HttpStatus.CONFLICT, "This mock job has already finished");
        if (job.document == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Wait for the PDF to arrive");
        int code = switch (state) {
            case "processing" -> 5; case "stopped" -> 6; case "canceled" -> 7; case "aborted" -> 8; case "completed" -> 9;
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown mock job state");
        };
        job.state = code;
        job.reason = switch (code) {
            case 5 -> "job-printing"; case 6 -> "printer-stopped"; case 7 -> "job-canceled-by-operator";
            case 8 -> "aborted-by-system"; default -> "job-completed-successfully";
        };
        log("Set job state", 0, "ok", "Mock job is now " + stateName(code), id, List.of(), List.of(), null);
    }

    public synchronized void checkAccess(String suppliedToken) {
        if (!enabled || !token.equals(suppliedToken)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Fake printer is not available");
    }

    public synchronized byte[] exchange(String suppliedToken, byte[] bytes) throws IOException {
        checkAccess(suppliedToken);
        IppMessage request;
        try { request = IppMessage.read(bytes); }
        catch (IOException e) {
            int id = bytes.length >= 8 ? ByteBuffer.wrap(bytes).getInt(4) : 0;
            var response = response(0x0400, id, "Malformed IPP request");
            log("Malformed request", id, "0x0400", e.getMessage(), null, List.of(), response.view(), null);
            return response.bytes();
        }
        Job job = null;
        DocumentInfo document = null;
        IppMessage response;
        try {
            if (!request.text("attributes-charset", "").equals("utf-8")) throw new Rejection(0x040d, "Use UTF-8 attributes");
            response = response(0, request.id, "successful-ok");
            switch (request.code) {
                case 11 -> capabilities(response, request);
                case 2, 4, 5 -> {
                    validateOptions(request);
                    if (request.code == 4) break;
                    if (request.code == 2) document = inspectDocument(request);
                    if (jobs.size() >= MAX_JOBS) {
                        var finished = jobs.values().stream().filter(j -> j.state >= 7).findFirst();
                        if (finished.isEmpty()) throw new Rejection(0x0507, "Finish or cancel a mock job before submitting more");
                        jobs.remove(finished.get().id);
                    }
                    job = new Job(++jobSequence, request); jobs.put(job.id, job);
                    if (document != null) receive(job, document);
                    jobAttributes(response, job, request);
                }
                case 6 -> {
                    job = find(request);
                    if (job.state >= 7 || job.document != null) throw new Rejection(0x0404, "This job cannot receive another document");
                    if (!request.text("last-document", "false").equals("true")) throw new Rejection(0x040b, "Only single-document jobs are supported");
                    document = inspectDocument(request); receive(job, document); jobAttributes(response, job, request);
                }
                case 8 -> {
                    job = find(request);
                    if (job.state >= 7) throw new Rejection(0x0404, "This job has already finished");
                    job.state = 7; job.reason = "job-canceled-by-user"; jobAttributes(response, job, request);
                }
                case 9 -> { job = find(request); jobAttributes(response, job, request); }
                case 10 -> {
                    String which = request.text("which-jobs", "not-completed");
                    if (!Set.of("all", "completed", "not-completed").contains(which)) throw new Rejection(0x040b, "Unsupported which-jobs value");
                    int count = 0, limit = request.number("limit", MAX_JOBS);
                    for (Job candidate : jobs.values()) {
                        if (request.text("my-jobs", "false").equals("true") && !candidate.user.equals(request.text("requesting-user-name", "anonymous"))) continue;
                        if (which.equals("completed") && candidate.state < 7 || which.equals("not-completed") && candidate.state >= 7) continue;
                        if (limit > 0 && count >= limit) break;
                        response.boundary(); jobAttributes(response, candidate, request); count++;
                    }
                }
                default -> throw new Rejection(0x0501, "Operation not supported by the fake printer");
            }
        } catch (Rejection e) { response = response(e.code, request.id, e.getMessage()); }
        log(operation(request.code), request.id, "0x%04x".formatted(response.code), response.text("status-message", ""),
            job == null ? null : job.id, request.view(), response.view(), document);
        return response.bytes();
    }

    private static IppMessage response(int code, int id, String message) {
        return new IppMessage(code, id).add(1, 0x47, "attributes-charset", "utf-8")
            .add(1, 0x48, "attributes-natural-language", "en").add(1, 0x41, "status-message", message);
    }

    private void capabilities(IppMessage response, IppMessage request) {
        response.add(4, 0x42, "printer-name", "Fake Printer").add(4, 0x41, "printer-location", "printLe simulator")
            .add(4, 0x45, "printer-uri-supported", request.text("printer-uri", ""))
            .add(4, 0x44, "uri-authentication-supported", "none").add(4, 0x44, "uri-security-supported", "none")
            .add(4, 0x44, "ipp-versions-supported", "1.1", "2.0")
            .add(4, 0x23, "printer-state", jobs.values().stream().anyMatch(j -> j.state == 5) ? 4 : 3)
            .add(4, 0x44, "printer-state-reasons", "none").add(4, 0x22, "printer-is-accepting-jobs", true)
            .add(4, 0x49, "document-format-supported", "application/pdf").add(4, 0x49, "document-format-default", "application/pdf")
            .add(4, 0x23, "operations-supported", 2, 4, 5, 6, 8, 9, 10, 11)
            .add(4, 0x22, "color-supported", true).add(4, 0x44, "print-color-mode-supported", "monochrome", "color")
            .add(4, 0x44, "sides-supported", "one-sided", "two-sided-long-edge", "two-sided-short-edge")
            .add(4, 0x44, "media-supported", "iso_a4_210x297mm", "na_letter_8.5x11in")
            .add(4, 0x33, "copies-supported", ByteBuffer.allocate(8).putInt(1).putInt(999).array())
            .add(4, 0x21, "copies-default", 1).add(4, 0x22, "multiple-document-jobs-supported", false);
    }

    private static void validateOptions(IppMessage request) {
        int copies = request.number("copies", 1);
        if (copies < 1 || copies > 999) throw new Rejection(0x040b, "Copies must be between 1 and 999");
        if (!Set.of("one-sided", "two-sided-long-edge", "two-sided-short-edge").contains(request.text("sides", "one-sided")))
            throw new Rejection(0x040b, "Unsupported sides setting");
        if (!Set.of("monochrome", "color").contains(request.text("print-color-mode", "monochrome")))
            throw new Rejection(0x040b, "Unsupported color mode");
        if (!request.text("document-format", "application/pdf").equals("application/pdf")) throw new Rejection(0x040a, "Only PDF documents are supported");
    }

    private static DocumentInfo inspectDocument(IppMessage request) {
        if (!request.text("document-format", "application/pdf").equals("application/pdf")) throw new Rejection(0x040a, "Only PDF documents are supported");
        if (request.document.length < 5 || !new String(request.document, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"))
            throw new Rejection(0x0411, "Document is not a PDF");
        try (var pdf = Loader.loadPDF(request.document)) {
            return new DocumentInfo(request.document.length, pdf.getNumberOfPages(),
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(request.document)));
        } catch (Exception e) { throw new Rejection(0x0411, "Could not read the PDF document"); }
    }

    private static void receive(Job job, DocumentInfo document) { job.document = document; job.state = 5; job.reason = "job-printing"; }
    private Job find(IppMessage request) {
        Job job = jobs.get(request.number("job-id", -1));
        if (job == null) throw new Rejection(0x0406, "Mock job not found");
        return job;
    }
    private static void jobAttributes(IppMessage response, Job job, IppMessage request) {
        response.add(2, 0x21, "job-id", job.id).add(2, 0x45, "job-uri", request.text("printer-uri", "") + "/jobs/" + job.id)
            .add(2, 0x42, "job-name", job.name).add(2, 0x42, "job-originating-user-name", job.user)
            .add(2, 0x23, "job-state", job.state).add(2, 0x44, "job-state-reasons", job.reason);
    }
    private void log(String operation, int requestId, String status, String message, Integer jobId,
                     List<Map<String, Object>> request, List<Map<String, Object>> response, DocumentInfo document) {
        events.addLast(new Event(++eventSequence, Instant.now(), operation, requestId, status, message, jobId, request, response, document));
        while (events.size() > MAX_EVENTS) events.removeFirst();
    }
    private static String operation(int code) {
        return switch (code) {
            case 2 -> "Print-Job"; case 4 -> "Validate-Job"; case 5 -> "Create-Job"; case 6 -> "Send-Document";
            case 8 -> "Cancel-Job"; case 9 -> "Get-Job-Attributes"; case 10 -> "Get-Jobs"; case 11 -> "Get-Printer-Attributes";
            default -> "Unknown (0x%04x)".formatted(code);
        };
    }
    private static String stateName(int code) {
        return switch (code) { case 4 -> "pending-held"; case 5 -> "processing"; case 6 -> "stopped"; case 7 -> "canceled"; case 8 -> "aborted"; case 9 -> "completed"; default -> "pending"; };
    }
    private static final class Rejection extends RuntimeException {
        final int code;
        Rejection(int code, String message) { super(message); this.code = code; }
    }
}
