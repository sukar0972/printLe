package io.printle.ratelimit;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;

class ClientAddressResolverTest {
    @Test void ignoresSpoofedHeadersFromAnUntrustedPeer() {
        var request = request("192.168.1.99", "203.0.113.4");
        assertEquals("192.168.1.99", new ClientAddressResolver("127.0.0.1").resolve(request));
        assertEquals("192.168.1.99", new ClientAddressResolver("").resolve(request));
    }

    @Test void acceptsOnlyASingleNumericAddressFromATrustedProxy() {
        var resolver = new ClientAddressResolver("localhost");
        assertEquals("203.0.113.4", resolver.resolve(request("127.0.0.1", "203.0.113.4")));
        assertEquals("127.0.0.1", resolver.resolve(request("127.0.0.1", "203.0.113.4, 192.168.1.99")));
        assertEquals("127.0.0.1", resolver.resolve(request("127.0.0.1", "attacker.example")));
    }

    private static MockHttpServletRequest request(String peer, String header) {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr(peer);
        request.addHeader("X-Forwarded-For", header);
        return request;
    }
}
