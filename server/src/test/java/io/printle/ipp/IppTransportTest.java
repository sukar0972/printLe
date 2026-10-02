package io.printle.ipp;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;
import org.apache.hc.client5.http.SystemDefaultDnsResolver;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class IppTransportTest {
    @Test void streamsTheDocumentAndDoesNotRetryFailedPosts() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var requests = new AtomicInteger();
        server.createContext("/", exchange -> {
            requests.incrementAndGet();
            var bytes = exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.createContext("/failure", exchange -> {
            requests.incrementAndGet();
            exchange.getRequestBody().readAllBytes();
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();
        var file = Files.createTempFile("ipp-transport", ".pdf");
        // Inject a permissive resolver only in transport tests; production rejects loopback.
        var transport = new IppTransport(SystemDefaultDnsResolver.INSTANCE);
        try {
            Files.write(file, new byte[]{4, 5, 6});
            String origin = "http://127.0.0.1:" + server.getAddress().getPort();
            assertArrayEquals(new byte[]{1, 2, 3, 4, 5, 6}, transport.exchange(URI.create(origin), new byte[]{1, 2, 3}, file));
            assertThrows(DirectIppClient.IppException.class, () -> transport.exchange(URI.create(origin + "/failure"), new byte[]{1}, null));
            assertEquals(2, requests.get());
        } finally { transport.close(); server.stop(0); Files.delete(file); }
    }

    @Test void rejectsAHostResolvingToLoopbackBeforeOpeningASocket() throws Exception {
        var transport = new IppTransport(new PrinterDnsResolver(host -> new InetAddress[]{InetAddress.getByName("127.0.0.1")}));
        try {
            assertThrows(IOException.class, () -> transport.exchange(URI.create("http://printer.example:631"), new byte[]{1}, null));
        } finally { transport.close(); }
    }
}
