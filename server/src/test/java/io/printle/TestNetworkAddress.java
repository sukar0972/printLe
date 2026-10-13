package io.printle;

import java.net.Inet4Address;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Collections;

/** Integration printers need an actual LAN address because production blocks loopback. */
public final class TestNetworkAddress {
    private TestNetworkAddress() {}

    public static String host() throws SocketException {
        for (var network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!network.isUp() || network.isLoopback()) continue;
            for (var address : Collections.list(network.getInetAddresses())) {
                if (address instanceof Inet4Address && !address.isLoopbackAddress() && !address.isLinkLocalAddress())
                    return address.getHostAddress();
            }
        }
        throw new IllegalStateException("IPP integration tests require a non-loopback IPv4 interface");
    }
}
