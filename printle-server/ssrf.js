'use strict';

/**
 * SSRF lockdown for PrintLe's printer APIs.
 *
 * Both POST /api/printer-status and POST /api/print accept a client-supplied
 * `printerUrl` and then open an outbound connection to it. Without validation
 * that is an unauthenticated server-side request forgery primitive (issue #8).
 *
 * This module provides:
 *   - readSecurityConfig(env): builds the effective config from env vars.
 *   - validatePrinterUrl(raw, config, opts): async allowlist/range validation.
 *   - requireApiKey(config): express middleware gating the print APIs.
 *   - corsOriginOption(config): CORS origin setting honoring CORS_ORIGINS.
 *
 * Design notes:
 *   - Default allowed schemes are ipp/ipps only. http(s) is rejected unless
 *     the operator explicitly adds it via PRINTER_ALLOWED_SCHEMES, because the
 *     `ipp` client happily speaks IPP-over-HTTP to arbitrary web servers.
 *   - Every resolved address of a hostname is checked (DNS-rebinding guard):
 *     if ANY address is blocked, the URL is rejected.
 *   - Literal IPv4 hosts are normalized first (decimal / hex / octal forms
 *     such as 0x7f000001 or 2130706433 collapse to 127.0.0.1) so obfuscated
 *     loopback/private addresses cannot slip through.
 *   - IPv4-mapped IPv6 addresses (::ffff:1.2.3.4) are unwrapped and judged by
 *     their inner IPv4 address.
 *   - PRINTER_ALLOWED_HOSTS / PRINTER_ALLOWED_CIDRS are explicit operator
 *     trust: a listed host (or an IP inside a listed CIDR) bypasses the
 *     range blocks. Everything else is still scheme/port/userinfo checked.
 */

const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');

function parseCsv(value, fallback) {
    if (value === undefined || value === null || String(value).trim() === '') {
        return fallback.slice();
    }
    return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function parseBool(value) {
    return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

/**
 * Effective security configuration. `env` defaults to process.env so tests
 * can pass an explicit object; createApp() merges `options.security` over it.
 */
function readSecurityConfig(env = process.env) {
    return {
        // URL schemes the printer URL may use (lowercase, no trailing ':').
        allowedSchemes: parseCsv(env.PRINTER_ALLOWED_SCHEMES, ['ipp', 'ipps'])
            .map(s => s.toLowerCase().replace(/:$/, '')),
        // Exact hostnames (case-insensitive) explicitly trusted; bypass range checks.
        allowedHosts: parseCsv(env.PRINTER_ALLOWED_HOSTS, [])
            .map(h => h.toLowerCase().replace(/\.$/, '')),
        // CIDRs (v4 or v6) explicitly trusted; member IPs bypass range checks.
        allowedCidrs: parseCsv(env.PRINTER_ALLOWED_CIDRS, []),
        // When true, loopback / RFC1918 / ULA / link-local targets are allowed
        // (needed for LAN printers and local CUPS). Default false.
        allowPrivateNetworks: parseBool(env.PRINTER_ALLOW_PRIVATE_NETWORKS),
        // Shared-secret API key; when set, x-api-key is required on print APIs.
        apiKey: (env.PRINTLE_API_KEY || '').trim() || null,
        // CORS origins CSV; unset preserves historic `*` behavior.
        corsOrigins: env.CORS_ORIGINS === undefined
            ? ['*']
            : parseCsv(env.CORS_ORIGINS, []),
    };
}

function corsOriginOption(config) {
    if (config.corsOrigins.includes('*')) return '*';
    if (config.corsOrigins.length === 0) return false; // same-origin only
    return config.corsOrigins;
}

// ---------------------------------------------------------------------------
// IP parsing (normalizing obfuscated forms)
// ---------------------------------------------------------------------------

function parseIPv4Part(part) {
    if (!/^[0-9a-fA-FxX]+$/.test(part) || part.length === 0) return null;
    let base = 10;
    let digits = part;
    if (/^0[xX]/.test(part)) {
        base = 16;
        digits = part.slice(2);
        if (!/^[0-9a-fA-F]+$/.test(digits) || digits.length === 0) return null;
    } else if (/^0[0-9]+$/.test(part)) {
        base = 8;
        if (!/^[0-7]+$/.test(part)) return null;
    } else if (!/^[0-9]+$/.test(part)) {
        return null;
    }
    const value = parseInt(digits, base);
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return value;
}

/** Parse an IPv4 literal, including inet_aton forms (1-4 parts, hex/octal/decimal). */
function parseIPv4(host) {
    const parts = host.split('.');
    if (parts.length < 1 || parts.length > 4) return null;
    const values = [];
    for (const part of parts) {
        const v = parseIPv4Part(part);
        if (v === null) return null;
        values.push(v);
    }
    // All but the last part must fit in one byte; the last may span the rest.
    for (let i = 0; i < values.length - 1; i += 1) {
        if (values[i] > 255) return null;
    }
    const maxLast = 256 ** (5 - values.length);
    if (values[values.length - 1] >= maxLast) return null;

    let addr = 0;
    for (let i = 0; i < values.length - 1; i += 1) {
        addr = addr * 256 + values[i];
    }
    const remaining = 4 - (values.length - 1);
    let last = values[values.length - 1];
    const tail = [];
    for (let i = 0; i < remaining; i += 1) {
        tail.unshift(last % 256);
        last = Math.floor(last / 256);
    }
    const bytes = [];
    let tmp = addr;
    const head = [];
    for (let i = 0; i < values.length - 1; i += 1) {
        head.unshift(tmp % 256);
        tmp = Math.floor(tmp / 256);
    }
    return { family: 4, bytes: head.concat(tail) };
}

function parseHextet(part) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    return parseInt(part, 16);
}

/** Parse an IPv6 literal (with :: compression and embedded IPv4). Returns 16 bytes or null. */
function parseIPv6(host) {
    let h = host;
    // Strip zone id (%eth0) — never valid for a printer target we dial.
    const pct = h.indexOf('%');
    if (pct !== -1) return null;

    const halves = h.split('::');
    if (halves.length > 2) return null;

    const parseSide = (side) => {
        if (side === '') return [];
        const out = [];
        const groups = side.split(':');
        for (let i = 0; i < groups.length; i += 1) {
            const g = groups[i];
            // Embedded IPv4 in the last 32 bits.
            if (g.includes('.')) {
                if (i !== groups.length - 1) return null;
                const v4 = parseIPv4(g);
                if (!v4) return null;
                out.push((v4.bytes[0] << 8) | v4.bytes[1], (v4.bytes[2] << 8) | v4.bytes[3]);
            } else {
                const v = parseHextet(g);
                if (v === null) return null;
                out.push(v);
            }
        }
        return out;
    };

    if (halves.length === 1) {
        const groups = parseSide(halves[0]);
        if (!groups || groups.length !== 8) return null;
        return { family: 6, bytes: groupsToBytes(groups) };
    }

    const left = parseSide(halves[0]);
    const right = parseSide(halves[1]);
    if (!left || !right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    const groups = left.concat(new Array(missing).fill(0), right);
    return { family: 6, bytes: groupsToBytes(groups) };
}

function groupsToBytes(groups) {
    const bytes = [];
    for (const g of groups) {
        bytes.push((g >> 8) & 0xff, g & 0xff);
    }
    return bytes;
}

/** Normalize a hostname that is a literal IP. Returns {family, bytes} or null. */
function parseIp(host) {
    if (!host || typeof host !== 'string') return null;
    // Note: WHATWG URL already normalizes most dotted/hex/octal forms in
    // .hostname, but parseIp is also used standalone (and by unit tests), so
    // it accepts the raw inet_aton spellings too: dotted, hex (0x...), octal,
    // and single decimal integers.
    const looksV4 = net.isIP(host) === 4 || host.includes('.')
        || /^0[xX][0-9a-fA-F]+$/.test(host) || /^[0-9]+$/.test(host);
    if (looksV4) {
        const v4 = parseIPv4(host);
        if (v4) return v4;
    }
    if (net.isIP(host) === 6 || host.includes(':')) {
        const v6 = parseIPv6(host);
        if (v6) {
            // Unwrap IPv4-mapped IPv6 so ::ffff:127.0.0.1 is judged as 127.0.0.1.
            const b = v6.bytes;
            const isMapped = b.slice(0, 10).every(x => x === 0) && b[10] === 0xff && b[11] === 0xff;
            if (isMapped) return { family: 4, bytes: b.slice(12) };
            return v6;
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Range classification
// ---------------------------------------------------------------------------

function inCidrV4(bytes, net4, bits) {
    const addr = ((bytes[0] * 256 + bytes[1]) * 256 + bytes[2]) * 256 + bytes[3];
    const n = ((net4[0] * 256 + net4[1]) * 256 + net4[2]) * 256 + net4[3];
    const mask = bits === 0 ? 0 : (0xffffffff - (2 ** (32 - bits) - 1)) >>> 0;
    return ((addr & mask) >>> 0) === ((n & mask) >>> 0);
}

function bytesToBigInt(bytes) {
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    return v;
}

function inCidr(bytes, cidrBytes, bits) {
    if (bytes.length !== cidrBytes.length) return false;
    const total = bytes.length * 8;
    if (bits < 0 || bits > total) return false;
    const addr = bytesToBigInt(bytes);
    const netAddr = bytesToBigInt(cidrBytes);
    const shift = BigInt(total - bits);
    return (addr >> shift) === (netAddr >> shift);
}

/**
 * Parse "1.2.3.0/24" or "2001:db8::/32". Returns {family, bytes, bits} or null.
 */
function parseCidr(cidr) {
    const m = String(cidr).trim().match(/^(.+)\/(\d{1,3})$/);
    if (!m) return null;
    const ip = parseIp(m[1]);
    if (!ip) return null;
    const bits = Number(m[2]);
    if (bits < 0 || bits > ip.bytes.length * 8) return null;
    return { family: ip.family, bytes: ip.bytes, bits };
}

function cidrContains(cidr, ip) {
    const c = typeof cidr === 'string' ? parseCidr(cidr) : cidr;
    if (!c || c.family !== ip.family) return false;
    return inCidr(ip.bytes, c.bytes, c.bits);
}

const V4_BLOCKS = [
    // [network bytes, bits, category]
    [[0, 0, 0, 0], 8, 'unspecified'],      // "this host"
    [[10, 0, 0, 0], 8, 'private'],         // RFC1918
    [[100, 64, 0, 0], 10, 'private'],      // CGNAT
    [[127, 0, 0, 0], 8, 'loopback'],
    [[169, 254, 0, 0], 16, 'link-local'],  // includes cloud metadata 169.254.169.254
    [[172, 16, 0, 0], 12, 'private'],      // RFC1918
    [[192, 0, 0, 0], 24, 'reserved'],      // IETF reserved
    [[192, 0, 2, 0], 24, null],            // TEST-NET-1 documentation — allowed
    [[192, 168, 0, 0], 16, 'private'],     // RFC1918
    [[198, 18, 0, 0], 15, 'reserved'],     // benchmarking
    [[198, 51, 100, 0], 24, null],         // TEST-NET-2 documentation — allowed
    [[203, 0, 113, 0], 24, null],          // TEST-NET-3 documentation — allowed
    [[224, 0, 0, 0], 4, 'multicast'],
    [[240, 0, 0, 0], 4, 'reserved'],
];

const V6_BLOCKS = [
    [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 128, 'unspecified'],
    [[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 128, 'loopback'],
    [[0xfc, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 7, 'private'],   // ULA
    [[0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 10, 'link-local'],
    [[0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 8, 'multicast'],
];

/** Categories that PRINTER_ALLOW_PRIVATE_NETWORKS=true permits. */
const PRIVATEISH = new Set(['loopback', 'private', 'link-local']);

/**
 * Classify an IP. Returns null when the address is publicly routable (or
 * documentation range), otherwise a category string.
 */
function blockedReason(ip) {
    const blocks = ip.family === 4 ? V4_BLOCKS : V6_BLOCKS;
    for (const [netBytes, bits, category] of blocks) {
        if (category !== null && inCidr(ip.bytes, netBytes, bits)) return category;
    }
    return null;
}

function describeIp(ip) {
    return ip.family === 4 ? ip.bytes.join('.') : ip.bytes.map(b => b.toString(16).padStart(2, '0')).join(':');
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

function fail(reason) {
    return { ok: false, reason };
}

async function defaultLookup(hostname) {
    const records = await dns.lookup(hostname, { all: true });
    return records.map(r => ({ address: r.address, family: r.family }));
}

/**
 * Validate a client-supplied printer URL against the SSRF policy.
 * Returns { ok: true, scheme, hostname, port } or { ok: false, reason }.
 * Never throws for malformed input.
 */
async function validatePrinterUrl(raw, config, opts = {}) {
    const { lookup = defaultLookup } = opts;

    if (typeof raw !== 'string' || raw.trim() === '') {
        return fail('printerUrl must be a non-empty string');
    }

    let url;
    try {
        url = new URL(raw.trim());
    } catch {
        return fail('printerUrl is not a valid URL');
    }

    const scheme = url.protocol.replace(/:$/, '').toLowerCase();
    if (!config.allowedSchemes.includes(scheme)) {
        return fail(`URL scheme '${url.protocol}' is not allowed`);
    }
    if (url.username || url.password) {
        return fail('credentials embedded in printerUrl are not allowed');
    }
    const hostname = url.hostname.toLowerCase()
        .replace(/\.$/, '')
        .replace(/^\[(.*)\]$/, '$1'); // Node keeps IPv6 brackets in .hostname
    if (!hostname) {
        return fail('printerUrl must include a host');
    }
    if (url.port !== '') {
        const port = Number(url.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return fail('printerUrl port is invalid');
        }
    }

    // Explicit host allowlist: operator-trusted, skips range checks.
    if (config.allowedHosts.length > 0) {
        if (!config.allowedHosts.includes(hostname)) {
            return fail(`host '${hostname}' is not in PRINTER_ALLOWED_HOSTS`);
        }
        return { ok: true, scheme, hostname, port: url.port || null };
    }

    // Resolve literal IPs directly; resolve names via DNS and check EVERY
    // returned address (DNS-rebinding guard).
    let ips;
    const literal = parseIp(hostname);
    if (literal) {
        ips = [literal];
    } else {
        let records;
        try {
            records = await lookup(hostname);
        } catch {
            return fail(`could not resolve printer host '${hostname}'`);
        }
        if (!records || records.length === 0) {
            return fail(`printer host '${hostname}' did not resolve to an address`);
        }
        ips = [];
        for (const r of records) {
            const parsed = parseIp(r.address);
            if (!parsed) return fail(`printer host '${hostname}' resolved to an unparsable address`);
            ips.push(parsed);
        }
    }

    for (const ip of ips) {
        const printable = describeIp(ip);
        if (config.allowedCidrs.length > 0) {
            const inside = config.allowedCidrs.some(c => {
                const parsed = parseCidr(c);
                return parsed && cidrContains(parsed, ip);
            });
            if (!inside) return fail(`address ${printable} is not in PRINTER_ALLOWED_CIDRS`);
            continue;
        }
        const category = blockedReason(ip);
        if (!category) continue;
        if (config.allowPrivateNetworks && PRIVATEISH.has(category)) continue;
        const noun = {
            unspecified: 'unspecified address',
            loopback: 'loopback address',
            private: 'private-network address',
            'link-local': 'link-local address (includes cloud metadata endpoints)',
            multicast: 'multicast address',
            reserved: 'reserved address',
        }[category] || 'blocked address';
        return fail(`printer target ${printable} is a ${noun}; set PRINTER_ALLOW_PRIVATE_NETWORKS=true to permit local targets`);
    }

    return { ok: true, scheme, hostname, port: url.port || null };
}

// ---------------------------------------------------------------------------
// API auth gate
// ---------------------------------------------------------------------------

/**
 * Express middleware: when PRINTLE_API_KEY is configured, require a matching
 * `x-api-key` header (constant-time compare). When unset, requests pass
 * through — createApp() logs a loud warning in that case.
 */
function requireApiKey(config) {
    return (req, res, next) => {
        if (!config.apiKey) return next();
        const provided = req.get('x-api-key') || '';
        const expected = Buffer.from(config.apiKey, 'utf8');
        const actual = Buffer.from(provided, 'utf8');
        const ok = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
        if (!ok) {
            return res.status(401).json({ error: 'Unauthorized: missing or invalid API key' });
        }
        next();
    };
}

module.exports = {
    blockedReason,
    cidrContains,
    corsOriginOption,
    parseCidr,
    parseIp,
    readSecurityConfig,
    requireApiKey,
    validatePrinterUrl,
};
