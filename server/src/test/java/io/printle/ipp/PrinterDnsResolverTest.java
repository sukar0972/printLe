package io.printle.ipp;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PrinterDnsResolverTest {
    @Test void rejectsHostnamesResolvingToRestrictedIpv4OrIpv6Addresses() throws Exception {
        for (String ip : new String[]{"127.0.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "::ffff:127.0.0.1"}) {
            var address = InetAddress.getByName(ip);
            var resolver = new PrinterDnsResolver(host -> new InetAddress[]{address});
            assertThrows(UnknownHostException.class, () -> resolver.resolve("printer.example"), ip);
        }
    }

    @Test void rejectsMixedAnswersAndRechecksChangedDnsOnEveryConnection() throws Exception {
        var lan = InetAddress.getByName("192.168.1.50");
        var loopback = InetAddress.getByName("127.0.0.1");
        var answers = new AtomicReference<>(new InetAddress[]{lan});
        var resolver = new PrinterDnsResolver(host -> answers.get());
        assertArrayEquals(new InetAddress[]{lan}, resolver.resolve("printer.example"));
        answers.set(new InetAddress[]{lan, loopback});
        assertThrows(UnknownHostException.class, () -> resolver.resolve("printer.example"));
        answers.set(new InetAddress[]{loopback});
        assertThrows(UnknownHostException.class, () -> resolver.resolve("printer.example"));
    }
}
