'use strict';

// Unit tests for the SSRF lockdown (issue #8): printerUrl validation,
// IP-range classification, auth middleware, and CORS option handling.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    blockedReason,
    cidrContains,
    corsOriginOption,
    parseIp,
    readSecurityConfig,
    requireApiKey,
    validatePrinterUrl,
} = require('./ssrf');

const baseConfig = (overrides = {}) => ({ ...readSecurityConfig({}), ...overrides });

// A lookup stub that must never be called (for literal-IP cases).
const noDns = async () => { throw new Error('DNS lookup should not have been needed'); };

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

test('readSecurityConfig defaults to ipp/ipps schemes and no key', () => {
    const cfg = readSecurityConfig({});
    assert.deepEqual(cfg.allowedSchemes, ['ipp', 'ipps']);
    assert.deepEqual(cfg.allowedHosts, []);
    assert.deepEqual(cfg.allowedCidrs, []);
    assert.equal(cfg.allowPrivateNetworks, false);
    assert.equal(cfg.apiKey, null);
    assert.deepEqual(cfg.corsOrigins, ['*']);
});

test('readSecurityConfig honors env overrides', () => {
    const cfg = readSecurityConfig({
        PRINTER_ALLOWED_SCHEMES: 'ipp, ipps, http',
        PRINTER_ALLOWED_HOSTS: 'printer.lan, Print2.LAN.',
        PRINTER_ALLOWED_CIDRS: '192.168.0.0/16',
        PRINTER_ALLOW_PRIVATE_NETWORKS: 'true',
        PRINTLE_API_KEY: 's3cret',
        CORS_ORIGINS: 'https://a.example, https://b.example',
    });
    assert.deepEqual(cfg.allowedSchemes, ['ipp', 'ipps', 'http']);
    assert.deepEqual(cfg.allowedHosts, ['printer.lan', 'print2.lan']);
    assert.deepEqual(cfg.allowedCidrs, ['192.168.0.0/16']);
    assert.equal(cfg.allowPrivateNetworks, true);
    assert.equal(cfg.apiKey, 's3cret');
    assert.deepEqual(cfg.corsOrigins, ['https://a.example', 'https://b.example']);
});

test('corsOriginOption maps config to the cors package option', () => {
    assert.equal(corsOriginOption(baseConfig()), '*');
    assert.deepEqual(corsOriginOption(baseConfig({ corsOrigins: ['https://a.example'] })), ['https://a.example']);
    assert.equal(corsOriginOption(baseConfig({ corsOrigins: [] })), false);
});

// ---------------------------------------------------------------------------
// Scheme / shape validation
// ---------------------------------------------------------------------------

test('allows ipp and ipps URLs to public literal IPs without DNS', async () => {
    for (const raw of ['ipp://192.0.2.10:631/printers/main', 'ipps://203.0.113.7/printers/x']) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, true, `${raw}: ${r.reason}`);
    }
});

test('rejects http and https schemes by default', async () => {
    for (const raw of ['http://192.0.2.10:631/printers/main', 'https://192.0.2.10/printers/main']) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false);
        assert.match(r.reason, /scheme/);
    }
});

test('allows extra schemes only when explicitly configured', async () => {
    const cfg = baseConfig({ allowedSchemes: ['ipp', 'ipps', 'http'] });
    const r = await validatePrinterUrl('http://192.0.2.10:631/printers/main', cfg, { lookup: noDns });
    assert.equal(r.ok, true);
});

test('rejects malformed, empty, and non-string printer URLs', async () => {
    for (const raw of ['', '   ', 'not a url', 'ipp://', null, undefined, 42]) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false, JSON.stringify(raw));
    }
});

test('rejects credentials embedded in the URL', async () => {
    const r = await validatePrinterUrl('ipp://admin:s3cret@192.0.2.10/printers/main', baseConfig(), { lookup: noDns });
    assert.equal(r.ok, false);
    assert.match(r.reason, /credentials/);
});

// ---------------------------------------------------------------------------
// Blocked ranges (default deny)
// ---------------------------------------------------------------------------

test('rejects loopback targets by default', async () => {
    for (const raw of [
        'ipp://127.0.0.1:631/printers/main',
        'ipp://127.1:631/printers/main',
        'ipp://[::1]/printers/main',
        'ipp://[::ffff:127.0.0.1]/printers/main',
    ]) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false, raw);
        assert.match(r.reason, /loopback/);
    }
});

test('rejects obfuscated loopback forms (hex / decimal / octal)', async () => {
    for (const raw of [
        'ipp://0x7f000001:631/printers/main',
        'ipp://2130706433:631/printers/main',
        'ipp://0177.0.0.01:631/printers/main',
    ]) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false, raw);
    }
});

test('rejects private-network targets by default', async () => {
    for (const raw of [
        'ipp://10.0.0.5:631/printers/main',
        'ipp://172.16.9.9:631/printers/main',
        'ipp://192.168.1.50:631/printers/main',
        'ipp://[fc00::1]/printers/main',
        'ipp://[fd00::5]/printers/main',
    ]) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false, raw);
        assert.match(r.reason, /private/);
    }
});

test('rejects link-local and cloud-metadata targets by default', async () => {
    for (const raw of [
        'ipp://169.254.169.254:80/',          // cloud metadata endpoint
        'ipp://169.254.10.20:631/printers/x',
        'ipp://[fe80::1]/printers/main',
    ]) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false, raw);
        assert.match(r.reason, /link-local/);
    }
});

test('rejects unspecified, multicast, and reserved targets', async () => {
    for (const raw of [
        'ipp://0.0.0.0:631/printers/main',
        'ipp://224.0.0.1:631/printers/main',
        'ipp://240.0.0.1:631/printers/main',
    ]) {
        const r = await validatePrinterUrl(raw, baseConfig(), { lookup: noDns });
        assert.equal(r.ok, false, raw);
    }
});

test('allows loopback/private/link-local when explicitly configured', async () => {
    const cfg = baseConfig({ allowPrivateNetworks: true });
    for (const raw of [
        'ipp://127.0.0.1:631/printers/main',
        'ipp://10.0.0.5:631/printers/main',
        'ipp://192.168.1.50:631/printers/main',
        'ipp://169.254.169.254:80/',
        'ipp://[fe80::1]/printers/main',
        'ipp://[::1]/printers/main',
    ]) {
        const r = await validatePrinterUrl(raw, cfg, { lookup: noDns });
        assert.equal(r.ok, true, `${raw}: ${r.reason}`);
    }
});

test('still rejects unspecified and multicast even when private networks are allowed', async () => {
    const cfg = baseConfig({ allowPrivateNetworks: true });
    for (const raw of ['ipp://0.0.0.0:631/printers/main', 'ipp://224.0.0.1:631/printers/main']) {
        const r = await validatePrinterUrl(raw, cfg, { lookup: noDns });
        assert.equal(r.ok, false, raw);
    }
});

// ---------------------------------------------------------------------------
// DNS-based validation
// ---------------------------------------------------------------------------

test('rejects hostnames that resolve to blocked addresses (DNS-rebinding guard)', async () => {
    const lookup = async () => [{ address: '10.1.2.3', family: 4 }];
    const r = await validatePrinterUrl('ipp://printer.corp:631/printers/main', baseConfig(), { lookup });
    assert.equal(r.ok, false);
    assert.match(r.reason, /private/);
});

test('rejects when ANY resolved address is blocked', async () => {
    const lookup = async () => [
        { address: '203.0.113.10', family: 4 },
        { address: '169.254.169.254', family: 4 },
    ];
    const r = await validatePrinterUrl('ipp://flaky.example:631/printers/main', baseConfig(), { lookup });
    assert.equal(r.ok, false);
    assert.match(r.reason, /link-local/);
});

test('allows hostnames that resolve only to public addresses', async () => {
    const lookup = async () => [{ address: '203.0.113.10', family: 4 }];
    const r = await validatePrinterUrl('ipp://printer.example:631/printers/main', baseConfig(), { lookup });
    assert.equal(r.ok, true);
});

test('rejects hostnames that do not resolve', async () => {
    const lookup = async () => { throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }); };
    const r = await validatePrinterUrl('ipp://no-such-printer.invalid:631/printers/main', baseConfig(), { lookup });
    assert.equal(r.ok, false);
    assert.match(r.reason, /resolve/);
});

// ---------------------------------------------------------------------------
// Explicit allowlists
// ---------------------------------------------------------------------------

test('allowedHosts permits only listed hosts and skips range checks', async () => {
    const cfg = baseConfig({ allowedHosts: ['printer.lan'] });
    const ok = await validatePrinterUrl('ipp://192.168.1.50:631/printers/main', cfg, {
        lookup: async () => [{ address: '192.168.1.50', family: 4 }],
    });
    assert.equal(ok.ok, false, 'hostname allowlist must match the URL host, not the IP');

    const okHost = await validatePrinterUrl('ipp://printer.lan:631/printers/main', cfg, { lookup: noDns });
    assert.equal(okHost.ok, true, okHost.reason);

    const other = await validatePrinterUrl('ipp://192.0.2.10:631/printers/main', cfg, { lookup: noDns });
    assert.equal(other.ok, false);
    assert.match(other.reason, /ALLOWED_HOSTS/);
});

test('allowedCidrs restricts targets to the listed ranges', async () => {
    const cfg = baseConfig({ allowedCidrs: ['192.168.0.0/16'] });
    const inside = await validatePrinterUrl('ipp://192.168.7.7:631/printers/main', cfg, { lookup: noDns });
    assert.equal(inside.ok, true, inside.reason);
    const outside = await validatePrinterUrl('ipp://192.0.2.10:631/printers/main', cfg, { lookup: noDns });
    assert.equal(outside.ok, false);
    assert.match(outside.reason, /CIDR/);
});

test('allowedCidrs supports IPv6 ranges', async () => {
    const cfg = baseConfig({ allowedCidrs: ['2001:db8:1::/48'] });
    const inside = await validatePrinterUrl('ipp://[2001:db8:1::99]/printers/main', cfg, { lookup: noDns });
    assert.equal(inside.ok, true, inside.reason);
    const outside = await validatePrinterUrl('ipp://[2001:db8:2::99]/printers/main', cfg, { lookup: noDns });
    assert.equal(outside.ok, false);
});

// ---------------------------------------------------------------------------
// IP parsing helpers
// ---------------------------------------------------------------------------

test('parseIp normalizes obfuscated IPv4 forms', async () => {
    assert.deepEqual(parseIp('0x7f000001').bytes, [127, 0, 0, 1]);
    assert.deepEqual(parseIp('2130706433').bytes, [127, 0, 0, 1]);
    assert.deepEqual(parseIp('0177.0.0.01').bytes, [127, 0, 0, 1]);
    assert.deepEqual(parseIp('127.1').bytes, [127, 0, 0, 1]);
    assert.equal(parseIp('999.1.1.1'), null);
    assert.equal(parseIp('printer.lan'), null);
});

test('parseIp unwraps IPv4-mapped IPv6', async () => {
    const ip = parseIp('::ffff:127.0.0.1');
    assert.equal(ip.family, 4);
    assert.deepEqual(ip.bytes, [127, 0, 0, 1]);
    assert.equal(blockedReason(ip), 'loopback');
});

test('cidrContains matches IPv4 and IPv6 ranges', async () => {
    assert.equal(cidrContains('192.168.0.0/16', parseIp('192.168.7.7')), true);
    assert.equal(cidrContains('192.168.0.0/16', parseIp('192.167.7.7')), false);
    assert.equal(cidrContains('2001:db8::/32', parseIp('2001:db8::1')), true);
    assert.equal(cidrContains('2001:db8::/32', parseIp('2001:db9::1')), false);
    assert.equal(cidrContains('not-a-cidr', parseIp('192.168.7.7')), false);
});

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function runMiddleware(mw, headers) {
    return new Promise((resolve) => {
        const req = { get: (name) => headers[name.toLowerCase()] || undefined };
        const res = {
            statusCode: null,
            body: null,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; resolve({ denied: true, statusCode: this.statusCode, body: payload }); },
        };
        mw(req, res, () => resolve({ denied: false }));
    });
}

test('requireApiKey passes everything through when no key is configured', async () => {
    const result = await runMiddleware(requireApiKey(baseConfig()), {});
    assert.equal(result.denied, false);
});

test('requireApiKey enforces the shared secret when configured', async () => {
    const mw = requireApiKey(baseConfig({ apiKey: 's3cret' }));
    assert.equal((await runMiddleware(mw, {})).denied, true);
    assert.equal((await runMiddleware(mw, { 'x-api-key': 'wrong' })).denied, true);
    const ok = await runMiddleware(mw, { 'x-api-key': 's3cret' });
    assert.equal(ok.denied, false);

    const denied = await runMiddleware(mw, { 'x-api-key': 'wrong' });
    assert.equal(denied.statusCode, 401);
});
