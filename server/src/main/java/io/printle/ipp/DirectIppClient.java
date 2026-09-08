package io.printle.ipp;

import io.printle.job.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** IPP/1.1 encoding and operations (RFC 8010/8011), without a CUPS scheduler. */
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
        var request = request(0x000b, endpoint, null);
        request.strings(0x44, "requested-attributes", List.of("printer-name", "printer-location", "printer-state",
            "printer-state-reasons", "printer-is-accepting-jobs", "document-format-supported", "operations-supported",
            "color-supported", "sides-supported", "media-supported", "copies-supported", "print-color-mode-supported"));
        var response = exchange(endpoint, request, null);
        var formats = response.strings("document-format-supported");
        if (!formats.contains("application/pdf"))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "This printer does not accept PDF documents directly. Use CUPS for document conversion.");
        var operations = response.ints("operations-supported");
        if (!operations.containsAll(List.of(5, 6, 8, 9)))
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "This printer must support Create-Job, Send-Document, Get-Job-Attributes, and Cancel-Job for direct printing");
        return new Capabilities(response.text("printer-name", "IPP printer"), response.text("printer-location", ""),
            response.integer("printer-state", 3) == 5 ? "ERROR" : "ONLINE", response.bool("printer-is-accepting-jobs", true),
            response.bool("color-supported", false), response.strings("sides-supported"), response.strings("media-supported"),
            response.strings("printer-state-reasons"), response.strings("print-color-mode-supported"), response.rangeMax("copies-supported", 1));
    }

    public PrintNodeClient.Submission create(String endpoint, UUID key, String user, int copies, ColorMode color, DuplexMode duplex) {
        var caps = inspect(endpoint);
        if (!caps.accepting()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer is not accepting jobs");
        if (copies > caps.maxCopies()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer supports at most " + caps.maxCopies() + " copies per job");
        if (duplex == DuplexMode.MANUAL) throw new ResponseStatusException(HttpStatus.CONFLICT, "Manual flip is currently available through CUPS only; select one-sided or hardware duplex");
        String sides = switch (duplex) {
            case TWO_SIDED_LONG_EDGE -> "two-sided-long-edge";
            case TWO_SIDED_SHORT_EDGE -> "two-sided-short-edge";
            default -> "one-sided";
        };
        if (!caps.sides().isEmpty() && !caps.sides().contains(sides)) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer does not support the selected sides setting");
        String mode = color == ColorMode.COLOR ? "color" : "monochrome";
        if (color == ColorMode.COLOR && !caps.color()) throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer does not support color");
        if (caps.color() && !caps.colorModes().contains(mode))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The printer cannot guarantee the selected color mode; use CUPS for this printer");
        var request = request(5, endpoint, user);
        request.string(0x42, "job-name", "printLe-" + key);
        request.bool("ipp-attribute-fidelity", true);
        request.group(2);
        if (caps.maxCopies() > 1) request.integer(0x21, "copies", copies);
        if (!caps.sides().isEmpty()) request.string(0x44, "sides", sides);
        if (caps.colorModes().contains(mode)) request.string(0x44, "print-color-mode", mode);
        var response = exchange(endpoint, request, null);
        int id = response.integer("job-id", 0);
        if (id <= 0) throw new IppException("Printer did not return a valid job ID");
        return new PrintNodeClient.Submission(id, endpoint, state(response.integer("job-state", 4)), response.text("job-state-reasons", "job-incoming"));
    }

    public void send(String endpoint, int id, String user, Path file) {
        var request = request(6, endpoint, null);
        request.integer(0x21, "job-id", id);
        request.string(0x42, "requesting-user-name", user);
        request.string(0x49, "document-format", "application/pdf");
        request.bool("last-document", true);
        exchange(endpoint, request, file);
    }

    public PrintNodeClient.IppStatus status(String endpoint, int id, String user) {
        var request = request(9, endpoint, null);
        request.integer(0x21, "job-id", id);
        request.string(0x42, "requesting-user-name", user);
        request.strings(0x44, "requested-attributes", List.of("job-state", "job-state-reasons"));
        var response = exchange(endpoint, request, null);
        return new PrintNodeClient.IppStatus(id, state(response.integer("job-state", 0)), response.text("job-state-reasons", "none"));
    }

    public void cancel(String endpoint, int id, String user) {
        var request = request(8, endpoint, null);
        request.integer(0x21, "job-id", id);
        request.string(0x42, "requesting-user-name", user);
        exchange(endpoint, request, null);
    }

    private static String state(int value) {
        return switch (value) {
            case 3 -> "pending"; case 4 -> "pending-held"; case 5 -> "processing";
            case 6 -> "processing-stopped"; case 7 -> "canceled"; case 8 -> "aborted"; case 9 -> "completed";
            default -> throw new IppException("Printer returned an unknown job state");
        };
    }

    private Request request(int operation, String endpoint, String user) {
        var request = new Request(operation, sequence.incrementAndGet());
        request.group(1);
        request.string(0x47, "attributes-charset", "utf-8");
        request.string(0x48, "attributes-natural-language", "en");
        request.string(0x45, "printer-uri", validateUri(endpoint));
        if (user != null) request.string(0x42, "requesting-user-name", user);
        return request;
    }

    private Response exchange(String endpoint, Request request, Path file) {
        try {
            var uri = URI.create(validateUri(endpoint));
            var target = URI.create((uri.getScheme().equals("ipps") ? "https" : "http") + "://"
                + uri.getRawAuthority() + (uri.getPort() < 0 ? ":631" : "")
                + (uri.getRawPath().isEmpty() ? "/" : uri.getRawPath()));
            var header = HttpRequest.BodyPublishers.ofByteArray(request.bytes());
            var body = file == null ? header : HttpRequest.BodyPublishers.concat(header, HttpRequest.BodyPublishers.ofFile(file));
            var response = http.send(HttpRequest.newBuilder(target).timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/ipp").header("Accept", "application/ipp").POST(body).build(), HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) throw new IppException("Printer returned HTTP " + response.statusCode() + "; check its URL, access policy, and TLS certificate");
            byte[] bytes = response.body();
            if (bytes.length > LIMIT) throw new IppException("Printer response is too large");
            return decode(bytes, request.id);
        } catch (IppException e) { throw e; }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IppException("Printer request interrupted"); }
        catch (Exception e) { throw new IppException("Could not communicate with the IPP printer; check its address, network access, and TLS certificate"); }
    }

    static Response decode(byte[] bytes, int id) throws IOException {
        var input = new DataInputStream(new ByteArrayInputStream(bytes));
        int major = input.readUnsignedByte(); input.readUnsignedByte();
        int code = input.readUnsignedShort();
        if (major < 1 || major > 2 || input.readInt() != id) throw new IppException("Invalid IPP response header");
        var values = new HashMap<String, List<byte[]>>();
        String name = null;
        while (true) {
            int tag = input.readUnsignedByte();
            if (tag == 3) break;
            if (tag < 0x10) { name = null; continue; }
            int length = input.readUnsignedShort();
            if (length > 0) name = new String(read(input, length), StandardCharsets.UTF_8);
            byte[] value = read(input, input.readUnsignedShort());
            // Ignore unsupported/out-of-band values, which are not normal strings or numbers.
            if (name != null && tag >= 0x21 && tag != 0x34 && tag != 0x37)
                values.computeIfAbsent(name, ignored -> new ArrayList<>()).add(value);
        }
        var response = new Response(values);
        if (code > 0x00ff) throw new IppException("Printer rejected the IPP request (0x" + Integer.toHexString(code) + "): " + response.text("status-message", "unsupported operation or settings"));
        return response;
    }
    private static byte[] read(DataInputStream input, int length) throws IOException {
        var bytes = input.readNBytes(length);
        if (bytes.length != length) throw new EOFException();
        return bytes;
    }
    public static class IppException extends ResponseStatusException {
        public IppException(String message) { super(HttpStatus.BAD_GATEWAY, message); }
    }
    public record Capabilities(String name, String location, String status, boolean accepting, boolean color,
                               List<String> sides, List<String> media, List<String> reasons, List<String> colorModes, int maxCopies) {}
    record Response(Map<String, List<byte[]>> values) {
        List<byte[]> raw(String key) { return values.getOrDefault(key, List.of()); }
        List<String> strings(String key) { return raw(key).stream().map(v -> new String(v, StandardCharsets.UTF_8)).toList(); }
        String text(String key, String fallback) { var list = strings(key); return list.isEmpty() ? fallback : String.join(",", list); }
        List<Integer> ints(String key) { return raw(key).stream().filter(v -> v.length == 4).map(v -> ByteBuffer.wrap(v).getInt()).toList(); }
        int integer(String key, int fallback) { return ints(key).stream().findFirst().orElse(fallback); }
        boolean bool(String key, boolean fallback) { var v = raw(key); return v.isEmpty() || v.getFirst().length != 1 ? fallback : v.getFirst()[0] != 0; }
        int rangeMax(String key, int fallback) { return raw(key).stream().filter(v -> v.length == 8).map(v -> ByteBuffer.wrap(v).getInt(4)).findFirst().orElse(fallback); }
    }
    static class Request {
        final int id;
        final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        final DataOutputStream out = new DataOutputStream(buffer);
        Request(int operation, int id) {
            this.id = id;
            try { out.writeShort(0x0101); out.writeShort(operation); out.writeInt(id); } catch (IOException e) { throw new UncheckedIOException(e); }
        }
        void group(int tag) { buffer.write(tag); }
        void string(int tag, String name, String value) { attribute(tag, name, value.getBytes(StandardCharsets.UTF_8)); }
        void strings(int tag, String name, List<String> values) { for (int i = 0; i < values.size(); i++) string(tag, i == 0 ? name : "", values.get(i)); }
        void integer(int tag, String name, int value) { attribute(tag, name, ByteBuffer.allocate(4).putInt(value).array()); }
        void bool(String name, boolean value) { attribute(0x22, name, new byte[]{(byte)(value ? 1 : 0)}); }
        void attribute(int tag, String name, byte[] value) {
            try { var key = name.getBytes(StandardCharsets.UTF_8); out.writeByte(tag); out.writeShort(key.length); out.write(key); out.writeShort(value.length); out.write(value); }
            catch (IOException e) { throw new UncheckedIOException(e); }
        }
        byte[] bytes() { buffer.write(3); return buffer.toByteArray(); }
    }
}
