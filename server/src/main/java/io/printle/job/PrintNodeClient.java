package io.printle.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.printle.config.PrintleProperties;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

@Component
public class PrintNodeClient {
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final ObjectMapper json;
    private final String baseUrl;

    public PrintNodeClient(ObjectMapper json, PrintleProperties properties) {
        this.json = json;
        this.baseUrl = properties.printNodeUrl() == null ? "" : properties.printNodeUrl().replaceAll("/$", "");
    }

    public Submission submit(UUID key, String queue, Path file, String title, String user, int copies,
                             ColorMode color, DuplexMode duplex) {
        if (baseUrl.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Printing is not configured");
        try {
            var uri = URI.create(baseUrl + "/jobs/" + key + "?queue=" + enc(queue));
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/pdf")
                .header("X-Print-Title", header(title)).header("X-Print-User", header(user))
                .header("X-Print-Copies", Integer.toString(copies))
                .header("X-Print-Color", color.name()).header("X-Print-Duplex", duplex.name())
                .POST(HttpRequest.BodyPublishers.ofFile(file)).build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) throw new IOExceptionResponse(response.body());
            return json.readValue(response.body(), Submission.class);
        } catch (Exception e) {
            if (e instanceof ResponseStatusException status) throw status;
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The print node could not accept the job", e);
        }
    }

    public IppStatus status(int cupsJobId) {
        try {
            var request = HttpRequest.newBuilder(URI.create(baseUrl + "/jobs/" + cupsJobId))
                .timeout(Duration.ofSeconds(5)).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) throw new IOExceptionResponse(response.body());
            return json.readValue(response.body(), IppStatus.class);
        } catch (Exception e) { throw new IllegalStateException("Could not read CUPS job state", e); }
    }

    private String enc(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private String header(String value) { return value.replaceAll("[\\r\\n]", " "); }
    public record Submission(int jobId, String queue, String state, String reasons) {}
    public record IppStatus(int jobId, String state, String reasons) {}
    private static class IOExceptionResponse extends RuntimeException { IOExceptionResponse(String message) { super(message); } }
}
