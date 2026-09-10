package io.printle.ipp;

import com.hp.jipp.encoding.*;
import com.hp.jipp.model.*;
import io.printle.job.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** RFC 8010/8011 IPP client using com.hp.jipp:jipp-core. */
@Component
public class DirectIppClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
        .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1).build();
    private final AtomicInteger sequence = new AtomicInteger();
    private static final int LIMIT = 1024 * 1024;

    public static String validateUri(String value) {
        try {
            URI uri = URI.create(value == null ? "" : value.trim());
            if (!("ipp".equals(uri.getScheme()) || "ipps".equals(uri.getScheme())) || uri.getHost() == null
                || uri.getRawUserInfo() != null || uri.getRawFragment() != null || uri.getRawQuery() != null
                || uri.getPort() == 0 || uri.getPort() > 65535 || uri.toString().length() > 1024)
                throw new IllegalArgumentException();
            return uri.toASCIIString();
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter an ipp:// or ipps:// printer URL without credentials, query, or fragment");
        }
    }

    public Capabilities inspect(String endpoint) {
        var opAttrs = List.<Attribute<?>>of(
            Types.requestedAttributes.of(
                "printer-name", "printer-location", "printer-state", "printer-state-reasons",
                "printer-is-accepting-jobs", "document-format-supported", "operations-supported",
                "color-supported", "sides-supported", "media-supported", "copies-supported",
                "print-color-mode-supported"
            )
        );
        var request = packet(Operation.getPrinterAttributes, endpoint, null, opAttrs);
        var response = exchange(endpoint, request, null);

        var formats = response.getStrings(Tag.printerAttributes, Types.documentFormatSupported);
        if (!formats.contains("application/pdf"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "This printer does not accept PDF documents directly. Use CUPS for document conversion.");

        var opEnums = response.getValues(Tag.printerAttributes, Types.operationsSupported);
        var operations = opEnums.stream().map(Operation::getCode).toList();
        if (!(operations.contains(2) || operations.containsAll(List.of(5, 6))) || !operations.containsAll(List.of(8, 9)))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "This printer must support Print-Job (or Create-Job/Send-Document), Get-Job-Attributes, and Cancel-Job");

        String name = response.getString(Tag.printerAttributes, Types.printerName);
        if (name == null || name.isBlank()) name = "IPP printer";
        String location = response.getString(Tag.printerAttributes, Types.printerLocation);
        if (location == null) location = "";

        PrinterState printerState = response.getValue(Tag.printerAttributes, Types.printerState);
        String status = (printerState != null && printerState.getCode() == 5) ? "ERROR" : "ONLINE";

        Boolean accepting = response.getValue(Tag.printerAttributes, Types.printerIsAcceptingJobs);
        Boolean color = response.getValue(Tag.printerAttributes, Types.colorSupported);

        var sides = response.getStrings(Tag.printerAttributes, Types.sidesSupported);
        var media = response.getStrings(Tag.printerAttributes, Types.mediaSupported);
        var reasons = response.getStrings(Tag.printerAttributes, Types.printerStateReasons);
        var colorModes = response.getStrings(Tag.printerAttributes, Types.printColorModeSupported);

        var copiesRange = response.getValue(Tag.printerAttributes, Types.copiesSupported);
        int maxCopies = copiesRange != null ? copiesRange.getLast() : 1;

        return new Capabilities(name, location, status, accepting != null ? accepting : true,
            color != null ? color : false, sides, media, reasons, colorModes, maxCopies, operations);
    }

    public PreparedSubmission prepare(String endpoint, UUID key, String user, int copies, ColorMode color, DuplexMode duplex) {
        var caps = inspect(endpoint);
        if (!caps.accepting()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer is not accepting jobs");
        if (copies > caps.maxCopies()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer supports at most " + caps.maxCopies() + " copies per job");
        String sides = switch (duplex) {
            case TWO_SIDED_LONG_EDGE -> "two-sided-long-edge";
            case TWO_SIDED_SHORT_EDGE -> "two-sided-short-edge";
            default -> "one-sided";
        };
        if (!caps.sides().isEmpty() && !caps.sides().contains(sides)) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer does not support the selected sides setting");
        String mode = color == ColorMode.COLOR ? "color" : "monochrome";
        if (color == ColorMode.COLOR && !caps.color()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer does not support color");
        if (caps.color() && !caps.colorModes().isEmpty() && !caps.colorModes().contains(mode))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer cannot guarantee the selected color mode; use CUPS for this printer");
        boolean staged = caps.operations().containsAll(List.of(5, 6));

        var opAttrs = new ArrayList<Attribute<?>>();
        opAttrs.add(Types.jobName.of("printLe-" + key));
        opAttrs.add(Types.ippAttributeFidelity.of(true));
        if (!staged) opAttrs.add(Types.documentFormat.of("application/pdf"));

        var jobAttrs = new ArrayList<Attribute<?>>();
        if (caps.maxCopies() > 1) jobAttrs.add(Types.copies.of(copies));
        if (!caps.sides().isEmpty()) jobAttrs.add(Types.sides.of(sides));
        if (!caps.colorModes().isEmpty() && caps.colorModes().contains(mode)) jobAttrs.add(Types.printColorMode.of(mode));

        AttributeGroup jobGroup = jobAttrs.isEmpty() ? null : AttributeGroup.groupOf(Tag.jobAttributes, jobAttrs);
        var request = packet(staged ? Operation.createJob : Operation.printJob, endpoint, user, opAttrs, jobGroup);
        return new PreparedSubmission(endpoint, request, staged);
    }

    public PrintNodeClient.Submission submit(PreparedSubmission prepared, Path file) {
        var response = exchange(prepared.endpoint(), prepared.packet(), prepared.staged() ? null : file);
        Integer id = response.getValue(Tag.jobAttributes, Types.jobId);
        if (id == null) id = response.getValue(Tag.operationAttributes, Types.jobId);
        if (id == null || id <= 0) throw new IppException("Printer did not return a valid job ID");

        JobState jobState = response.getValue(Tag.jobAttributes, Types.jobState);
        if (jobState == null) jobState = response.getValue(Tag.operationAttributes, Types.jobState);
        String stateStr = jobState != null ? jobState.getName() : (prepared.staged() ? "pending-held" : "pending");

        var reasons = response.getStrings(Tag.jobAttributes, Types.jobStateReasons);
        if (reasons.isEmpty()) reasons = response.getStrings(Tag.operationAttributes, Types.jobStateReasons);
        String reasonsStr = reasons.isEmpty() ? (prepared.staged() ? "job-incoming" : "none") : String.join(",", reasons);

        return new PrintNodeClient.Submission(id, prepared.endpoint(), stateStr, reasonsStr);
    }

    public void send(String endpoint, int id, String user, Path file) {
        var opAttrs = List.<Attribute<?>>of(
            Types.jobId.of(id),
            Types.documentFormat.of("application/pdf"),
            Types.lastDocument.of(true)
        );
        var request = packet(Operation.sendDocument, endpoint, user, opAttrs);
        exchange(endpoint, request, file);
    }

    public PrintNodeClient.IppStatus status(String endpoint, int id, String user) {
        var opAttrs = List.<Attribute<?>>of(
            Types.jobId.of(id),
            Types.requestedAttributes.of("job-state", "job-state-reasons")
        );
        var request = packet(Operation.getJobAttributes, endpoint, user, opAttrs);
        var response = exchange(endpoint, request, null);

        JobState jobState = response.getValue(Tag.jobAttributes, Types.jobState);
        if (jobState == null) jobState = response.getValue(Tag.operationAttributes, Types.jobState);
        String stateStr = jobState != null ? jobState.getName() : "pending";

        var reasons = response.getStrings(Tag.jobAttributes, Types.jobStateReasons);
        if (reasons.isEmpty()) reasons = response.getStrings(Tag.operationAttributes, Types.jobStateReasons);
        String reasonsStr = reasons.isEmpty() ? "none" : String.join(",", reasons);

        return new PrintNodeClient.IppStatus(id, stateStr, reasonsStr);
    }

    public PrintNodeClient.Submission findJob(String endpoint, UUID key, String user) {
        var opAttrs = List.<Attribute<?>>of(
            Types.whichJobs.of("not-completed"),
            Types.myJobs.of(true),
            Types.requestedAttributes.of("job-name", "job-id", "job-state", "job-state-reasons")
        );
        var request = packet(Operation.getJobs, endpoint, user, opAttrs);
        var response = exchange(endpoint, request, null);

        String targetJobName = "printLe-" + key;
        for (var group : response.getAttributeGroups()) {
            if (group.getTag() == Tag.jobAttributes) {
                String jobName = group.getString(Types.jobName);
                Integer jobId = group.getValue(Types.jobId);
                if (targetJobName.equals(jobName) && jobId != null && jobId > 0) {
                    JobState jobState = group.getValue(Types.jobState);
                    String stateStr = jobState != null ? jobState.getName() : "pending";
                    var reasons = group.getStrings(Types.jobStateReasons);
                    String reasonsStr = reasons.isEmpty() ? "none" : String.join(",", reasons);
                    return new PrintNodeClient.Submission(jobId, endpoint, stateStr, reasonsStr);
                }
            }
        }
        return null;
    }

    public void cancel(String endpoint, int id, String user) {
        var opAttrs = List.<Attribute<?>>of(
            Types.jobId.of(id)
        );
        var request = packet(Operation.cancelJob, endpoint, user, opAttrs);
        exchange(endpoint, request, null);
    }

    private IppPacket packet(Operation operation, String endpoint, String user, List<Attribute<?>> extraOpAttrs, AttributeGroup... extraGroups) {
        int reqId = sequence.incrementAndGet();
        var opAttrs = new ArrayList<Attribute<?>>();
        opAttrs.add(Types.attributesCharset.of("utf-8"));
        opAttrs.add(Types.attributesNaturalLanguage.of("en"));
        opAttrs.add(Types.printerUri.of(URI.create(validateUri(endpoint))));
        if (user != null) {
            opAttrs.add(Types.requestingUserName.of(user));
        }
        if (extraOpAttrs != null) {
            opAttrs.addAll(extraOpAttrs);
        }
        var groups = new ArrayList<AttributeGroup>();
        groups.add(AttributeGroup.groupOf(Tag.operationAttributes, opAttrs));
        if (extraGroups != null) {
            for (var g : extraGroups) {
                if (g != null && !g.isEmpty()) {
                    groups.add(g);
                }
            }
        }
        return new IppPacket(0x0101, operation.getCode(), reqId, groups);
    }

    private IppPacket exchange(String endpoint, IppPacket packet, Path file) {
        try {
            var uri = URI.create(validateUri(endpoint));
            var target = URI.create((uri.getScheme().equals("ipps") ? "https" : "http") + "://"
                + uri.getRawAuthority() + (uri.getPort() < 0 ? ":631" : "")
                + (uri.getRawPath().isEmpty() ? "/" : uri.getRawPath()));
            var baos = new ByteArrayOutputStream();
            packet.write(baos);
            var header = HttpRequest.BodyPublishers.ofByteArray(baos.toByteArray());
            var body = file == null ? header : HttpRequest.BodyPublishers.concat(header, HttpRequest.BodyPublishers.ofFile(file));
            var response = http.send(HttpRequest.newBuilder(target).timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/ipp").header("Accept", "application/ipp").POST(body).build(), HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) throw new IppException("Printer returned HTTP " + response.statusCode() + "; check its URL, access policy, and TLS certificate");
            byte[] bytes = response.body();
            if (bytes.length > LIMIT) throw new IppException("Printer response is too large");
            var resPacket = IppPacket.parse(new ByteArrayInputStream(bytes));
            if (resPacket.getRequestId() != packet.getRequestId()) throw new IppException("Invalid IPP response header");
            int code = resPacket.getCode();
            if (code > 0x00ff) {
                String message = resPacket.getString(Tag.operationAttributes, Types.statusMessage);
                throw new IppException("Printer rejected the IPP request (0x" + Integer.toHexString(code) + "): " + (message != null ? message : "unsupported operation or settings"));
            }
            return resPacket;
        } catch (IppException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IppException("Printer request interrupted"); }
        catch (Exception e) { throw new IppException("Could not communicate with the IPP printer; check its address, network access, and TLS certificate"); }
    }

    public static class IppException extends ResponseStatusException {
        public IppException(String message) { super(HttpStatus.BAD_GATEWAY, message); }
    }
    public record Capabilities(String name, String location, String status, boolean accepting, boolean color,
                               List<String> sides, List<String> media, List<String> reasons, List<String> colorModes, int maxCopies, List<Integer> operations) {}
    public record PreparedSubmission(String endpoint, IppPacket packet, boolean staged) {}
}
