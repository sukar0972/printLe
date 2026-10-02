package io.printle.ipp;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class DirectIppClientTest {
    @Test
    void acceptsIppAndIppsOnLanAndPublicHosts() {
        assertEquals("ipp://192.168.1.50/ipp/print", DirectIppClient.validateUri("ipp://192.168.1.50/ipp/print"));
        assertEquals("ipps://printer.example/ipp/print", DirectIppClient.validateUri("ipps://printer.example/ipp/print"));
    }

    @Test
    void mapsIppToHttpTransportOnPort631() {
        var ipp = URI.create(DirectIppClient.validateUri("ipp://192.168.1.50/ipp/print"));
        assertEquals("http://192.168.1.50:631/ipp/print", DirectIppClient.transportUri(ipp).toString());
        assertEquals("ipp://192.168.1.50/ipp/print", DirectIppClient.printerUri(ipp).toString());
    }

    @Test
    void rejectsCredentialsUnknownSchemesAndUnsafeHosts() {
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("ipp://user:pass@host/ipp/print"));
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("ftp://192.168.1.50/ipp/print"));
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("http://192.168.1.50:631/ipp/print"));
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("https://printer.example/ipp/print"));
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("ipp://127.0.0.1/ipp/print"));
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("ipp://169.254.169.254/latest/meta-data"));
        assertThrows(ResponseStatusException.class, () -> DirectIppClient.validateUri("ipp://localhost/ipp/print"));
    }
}
