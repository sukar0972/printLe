package io.printle.ipp;

import java.net.InetAddress;
import java.net.UnknownHostException;
import org.apache.hc.client5.http.DnsResolver;

/** Returns only checked socket destinations, preventing a second unchecked DNS lookup. */
final class PrinterDnsResolver implements DnsResolver {
    @FunctionalInterface
    interface Lookup { InetAddress[] resolve(String host) throws UnknownHostException; }

    private final Lookup lookup;

    PrinterDnsResolver() { this(InetAddress::getAllByName); }
    PrinterDnsResolver(Lookup lookup) { this.lookup = lookup; }

    @Override public InetAddress[] resolve(String host) throws UnknownHostException {
        var addresses = lookup.resolve(host);
        if (addresses.length == 0) throw new UnknownHostException("Printer has no addresses");
        for (var address : addresses) {
            if (blocked(address)) throw new UnknownHostException("Printer resolves to a restricted address");
        }
        return addresses;
    }

    @Override public String resolveCanonicalHostname(String host) throws UnknownHostException {
        resolve(host);
        return host;
    }

    static boolean blocked(InetAddress address) {
        byte[] raw = address.getAddress();
        boolean linkLocal4 = raw.length == 4 && (raw[0] & 0xff) == 169 && (raw[1] & 0xff) == 254;
        return address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
            || address.isMulticastAddress() || linkLocal4;
    }
}
