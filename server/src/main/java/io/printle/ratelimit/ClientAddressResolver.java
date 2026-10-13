package io.printle.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;

/** Forwarded addresses are accepted only from explicitly configured proxy peers. */
public final class ClientAddressResolver {
    private final List<String> trustedProxies;

    public ClientAddressResolver(String trustedProxies) {
        this.trustedProxies = Arrays.stream(trustedProxies.split(","))
            .map(String::trim).filter(value -> !value.isEmpty()).toList();
    }

    public String resolve(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        if (!trusted(peer)) return peer;
        String forwarded = request.getHeader("X-Forwarded-For");
        // Our edge proxy overwrites this header with a single address.
        if (forwarded == null || !(forwarded.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}")
            || forwarded.contains(":") && forwarded.matches("[0-9a-fA-F:.]+"))) return peer;
        try { return InetAddress.getByName(forwarded).getHostAddress(); }
        catch (UnknownHostException e) { return peer; }
    }

    private boolean trusted(String peer) {
        for (String proxy : trustedProxies) {
            try {
                for (var address : InetAddress.getAllByName(proxy)) {
                    if (address.getHostAddress().equals(peer)) return true;
                }
            } catch (UnknownHostException ignored) { /* An unavailable proxy grants no trust. */ }
        }
        return false;
    }
}
