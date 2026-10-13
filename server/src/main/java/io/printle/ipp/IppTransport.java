package io.printle.ipp;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import org.apache.hc.client5.http.DnsResolver;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.config.ConnectionConfig;
import org.apache.hc.client5.http.config.RequestConfig;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.io.entity.InputStreamEntity;
import org.springframework.stereotype.Component;

@Component
public class IppTransport {
    private static final int RESPONSE_LIMIT = 1024 * 1024;
    private final CloseableHttpClient http;

    public IppTransport() { this(new PrinterDnsResolver()); }

    IppTransport(DnsResolver resolver) {
        var connections = PoolingHttpClientConnectionManagerBuilder.create()
            .setDnsResolver(resolver)
            .setDefaultConnectionConfig(ConnectionConfig.custom()
                .setConnectTimeout(3, java.util.concurrent.TimeUnit.SECONDS)
                .setSocketTimeout(30, java.util.concurrent.TimeUnit.SECONDS).build()).build();
        http = HttpClients.custom().setConnectionManager(connections)
            .setDefaultRequestConfig(RequestConfig.custom()
                .setConnectionRequestTimeout(3, java.util.concurrent.TimeUnit.SECONDS)
                .setResponseTimeout(30, java.util.concurrent.TimeUnit.SECONDS).build())
            // IPP operations must never be replayed or sent to redirect destinations.
            .disableAutomaticRetries().disableRedirectHandling().disableCookieManagement()
            .disableContentCompression().build();
    }

    byte[] exchange(URI target, byte[] header, Path file) throws IOException {
        var request = new HttpPost(target);
        request.setHeader("Accept", "application/ipp");
        long length = header.length + (file == null ? 0 : Files.size(file));
        try (var body = file == null ? new ByteArrayInputStream(header)
                : new SequenceInputStream(new ByteArrayInputStream(header), Files.newInputStream(file))) {
            request.setEntity(new InputStreamEntity(body, length, ContentType.create("application/ipp")));
            return http.execute(request, response -> {
                if (response.getCode() != 200) throw new DirectIppClient.IppException(
                    "Printer returned HTTP " + response.getCode() + "; check its URL, access policy, and TLS certificate");
                if (response.getEntity() == null) throw new DirectIppClient.IppException("Printer returned an empty response");
                try (var content = response.getEntity().getContent()) {
                    var bytes = content.readNBytes(RESPONSE_LIMIT + 1);
                    if (bytes.length > RESPONSE_LIMIT) throw new DirectIppClient.IppException("Printer response is too large");
                    return bytes;
                }
            });
        }
    }

    @PreDestroy public void close() throws IOException { http.close(); }
}
