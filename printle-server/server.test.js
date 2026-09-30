const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const ipp = require('ipp');
const { PDFDocument } = require('pdf-lib');

const {
    buildPrintJob,
    checkPrinterReachability,
    createApp,
    getPageIndices
} = require('./server');

async function startTestServer(app) {
    return new Promise((resolve) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${address.port}`
            });
        });
    });
}

async function stopTestServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

async function startMockIppPrinter() {
    const jobs = [];

    const server = http.createServer((req, res) => {
        const chunks = [];

        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            const message = ipp.parse(body);

            if (message.operation === 'Get-Printer-Attributes') {
                const responseBody = ipp.serialize({
                    version: message.version,
                    statusCode: 'successful-ok',
                    id: message.id,
                    'printer-attributes-tag': {
                        'printer-name': 'Mock IPP Printer',
                        'printer-state': 'idle',
                        'printer-is-accepting-jobs': true
                    }
                });

                res.writeHead(200, { 'Content-Type': 'application/ipp' });
                res.end(responseBody);
                return;
            }

            if (message.operation === 'Print-Job') {
                jobs.push({
                    message,
                    documentText: message.data || ''
                });

                const responseBody = ipp.serialize({
                    version: message.version,
                    statusCode: 'successful-ok',
                    id: message.id,
                    'job-attributes-tag': {
                        'job-id': jobs.length,
                        'job-uri': `ipp://127.0.0.1/jobs/${jobs.length}`,
                        'job-state': 'pending'
                    }
                });

                res.writeHead(200, { 'Content-Type': 'application/ipp' });
                res.end(responseBody);
                return;
            }

            const responseBody = ipp.serialize({
                version: message.version,
                statusCode: 'server-error-operation-not-supported',
                id: message.id
            });

            res.writeHead(200, { 'Content-Type': 'application/ipp' });
            res.end(responseBody);
        });
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({
                jobs,
                printerUrl: `ipp://127.0.0.1:${address.port}/printers/mock`,
                server
            });
        });
    });
}

async function createPdfBytes(pageCount = 2) {
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i += 1) {
        pdfDoc.addPage([200, 200]);
    }
    return Buffer.from(await pdfDoc.save());
}

test('getPageIndices returns sorted unique zero-based page indices', () => {
    assert.deepEqual(getPageIndices('3, 1-2, 2', 4), [0, 1, 2]);
});

test('getPageIndices rejects malformed or out-of-bounds ranges', () => {
    assert.throws(() => getPageIndices('4-2', 5), /Start page must be before end page/);
    assert.throws(() => getPageIndices('0', 5), /outside the document bounds/);
    assert.throws(() => getPageIndices('1,,3', 5), /empty segment/);
    assert.throws(() => getPageIndices('abc', 5), /Invalid page range segment/);
});

test('buildPrintJob applies grayscale and automatic duplex IPP attributes', () => {
    const job = buildPrintJob(
        { originalname: 'example.pdf', mimetype: 'application/pdf' },
        Buffer.from('pdf'),
        true,
        'auto'
    );

    assert.equal(job['operation-attributes-tag']['document-format'], 'application/pdf');
    assert.equal(job['job-attributes-tag']['print-color-mode'], 'monochrome');
    assert.equal(job['job-attributes-tag'].sides, 'two-sided-long-edge');
});

test('checkPrinterReachability resolves printer metadata from a successful IPP response', async () => {
    const status = await checkPrinterReachability('ipp://192.0.2.10:631/printers/main', {
        printerFactory: () => ({
            execute(operation, message, callback) {
                assert.equal(operation, 'Get-Printer-Attributes');
                assert.equal(message['operation-attributes-tag']['printer-uri'], 'ipp://192.0.2.10:631/printers/main');
                callback(null, {
                    statusCode: 'successful-ok',
                    'printer-attributes-tag': {
                        'printer-name': 'Office Printer',
                        'printer-state': 3,
                        'printer-is-accepting-jobs': true
                    }
                });
            }
        })
    });

    assert.deepEqual(status, {
        reachable: true,
        statusCode: 'successful-ok',
        printerName: 'Office Printer',
        printerState: 3,
        acceptingJobs: true
    });
});

test('checkPrinterReachability rejects when the printer probe times out', async () => {
    await assert.rejects(
        checkPrinterReachability('ipp://printer.local:631/printers/main', {
            timeoutMs: 20,
            printerFactory: () => ({
                execute() {}
            })
        }),
        /Timed out/
    );
});

test('printer status endpoint returns reachable=false when the printer is unavailable', async () => {
    const app = createApp({
        printerFactory: () => ({
            execute(operation, message, callback) {
                callback(new Error('Network unreachable'));
            }
        })
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        // 192.0.2.10 is TEST-NET-1 (documentation): publicly routable on paper,
        // so it passes SSRF validation without DNS; the stubbed factory then
        // simulates an unreachable printer.
        const response = await fetch(`${baseUrl}/api/printer-status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ printerUrl: 'ipp://192.0.2.10:631/printers/main' })
        });

        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.reachable, false);
        assert.match(result.error, /Network unreachable/);
    } finally {
        await stopTestServer(server);
    }
});

test('print endpoint rejects invalid PDF page ranges instead of printing the whole file', async () => {
    let printInvoked = false;
    const app = createApp({
        printerFactory: () => ({
            execute(operation, message, callback) {
                printInvoked = true;
                callback(null, {
                    statusCode: 'successful-ok',
                    'job-attributes-tag': { 'job-id': 123 }
                });
            }
        })
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        const formData = new FormData();
        formData.append('printerUrl', 'ipp://192.0.2.10:631/printers/main');
        formData.append('pages', '99');
        formData.append('file', new Blob([await createPdfBytes(2)], { type: 'application/pdf' }), 'sample.pdf');

        const response = await fetch(`${baseUrl}/api/print`, {
            method: 'POST',
            body: formData
        });

        assert.equal(response.status, 400);
        const result = await response.json();
        assert.match(result.error, /outside the document bounds/);
        assert.equal(printInvoked, false);
    } finally {
        await stopTestServer(server);
    }
});

test('print endpoint sends a real job to a mock IPP printer and the printer receives PDF data', async () => {
    // The mock printer listens on loopback, which SSRF validation rejects by
    // default; the test explicitly opts in, mirroring an operator who sets
    // PRINTER_ALLOW_PRIVATE_NETWORKS=true for a LAN printer.
    const app = createApp({ security: { allowPrivateNetworks: true } });
    const [{ server: appServer, baseUrl }, mockPrinter] = await Promise.all([
        startTestServer(app),
        startMockIppPrinter()
    ]);

    try {
        const formData = new FormData();
        formData.append('printerUrl', mockPrinter.printerUrl);
        formData.append('grayscale', 'true');
        formData.append('duplex', 'auto');
        formData.append('file', new Blob([await createPdfBytes(2)], { type: 'application/pdf' }), 'sample.pdf');

        const response = await fetch(`${baseUrl}/api/print`, {
            method: 'POST',
            body: formData
        });

        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.success, true);
        assert.equal(result.jobId, 1);

        assert.equal(mockPrinter.jobs.length, 1);
        const [receivedJob] = mockPrinter.jobs;
        assert.equal(receivedJob.message.operation, 'Print-Job');
        assert.equal(receivedJob.message['operation-attributes-tag']['job-name'], 'sample.pdf');
        assert.equal(receivedJob.message['job-attributes-tag']['print-color-mode'], 'monochrome');
        assert.equal(receivedJob.message['job-attributes-tag'].sides, 'two-sided-long-edge');
        assert.match(receivedJob.documentText, /^%PDF-/);
    } finally {
        await Promise.all([
            stopTestServer(appServer),
            stopTestServer(mockPrinter.server)
        ]);
    }
});

// ---------------------------------------------------------------------------
// SSRF lockdown (issue #8): printerUrl validation on the API endpoints
// ---------------------------------------------------------------------------

test('printer-status endpoint rejects http(s) printer URLs with 403 without contacting them', async () => {
    let factoryCalled = false;
    const app = createApp({
        printerFactory: () => {
            factoryCalled = true;
            return { execute() {} };
        }
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        for (const printerUrl of [
            'http://192.0.2.10:631/printers/main',
            'https://192.0.2.10/printers/main',
        ]) {
            const response = await fetch(`${baseUrl}/api/printer-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printerUrl })
            });
            assert.equal(response.status, 403, printerUrl);
            const result = await response.json();
            assert.match(result.error, /not allowed/);
            assert.match(result.reason, /scheme/);
        }
        assert.equal(factoryCalled, false, 'no outbound connection may be attempted for rejected URLs');
    } finally {
        await stopTestServer(server);
    }
});

test('printer-status endpoint rejects loopback, private, and metadata targets with 403', async () => {
    let factoryCalled = false;
    const app = createApp({
        printerFactory: () => {
            factoryCalled = true;
            return { execute() {} };
        }
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        for (const printerUrl of [
            'ipp://127.0.0.1:631/printers/main',
            'ipp://10.0.0.5:631/printers/main',
            'ipp://192.168.1.50:631/printers/main',
            'ipp://169.254.169.254:80/', // cloud metadata endpoint
            'ipp://0x7f000001:631/printers/main', // obfuscated loopback
        ]) {
            const response = await fetch(`${baseUrl}/api/printer-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printerUrl })
            });
            assert.equal(response.status, 403, printerUrl);
        }
        assert.equal(factoryCalled, false);
    } finally {
        await stopTestServer(server);
    }
});

test('printer-status endpoint allows loopback when private networks are explicitly permitted', async () => {
    const app = createApp({
        security: { allowPrivateNetworks: true },
        printerFactory: () => ({
            execute(operation, message, callback) {
                callback(null, {
                    statusCode: 'successful-ok',
                    'printer-attributes-tag': {
                        'printer-name': 'Local Printer',
                        'printer-state': 3,
                        'printer-is-accepting-jobs': true
                    }
                });
            }
        })
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        const response = await fetch(`${baseUrl}/api/printer-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ printerUrl: 'ipp://127.0.0.1:631/printers/main' })
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.reachable, true);
        assert.equal(result.printerName, 'Local Printer');
    } finally {
        await stopTestServer(server);
    }
});

test('print endpoint rejects SSRF printer URLs with 403 and never prints', async () => {
    let printInvoked = false;
    const app = createApp({
        printerFactory: () => ({
            execute() {
                printInvoked = true;
            }
        })
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        const formData = new FormData();
        formData.append('printerUrl', 'http://169.254.169.254/latest/meta-data/');
        formData.append('file', new Blob([await createPdfBytes(1)], { type: 'application/pdf' }), 'evil.pdf');

        const response = await fetch(`${baseUrl}/api/print`, {
            method: 'POST',
            body: formData
        });

        assert.equal(response.status, 403);
        const result = await response.json();
        assert.match(result.error, /not allowed/);
        assert.equal(printInvoked, false);
    } finally {
        await stopTestServer(server);
    }
});

// ---------------------------------------------------------------------------
// API-key gate (issue #8)
// ---------------------------------------------------------------------------

test('print APIs require the API key when PRINTLE_API_KEY is configured', async () => {
    const app = createApp({
        security: { apiKey: 's3cret' },
        printerFactory: () => ({
            execute(operation, message, callback) {
                callback(null, { statusCode: 'successful-ok', 'printer-attributes-tag': {} });
            }
        })
    });

    const { server, baseUrl } = await startTestServer(app);

    try {
        const post = (headers) => fetch(`${baseUrl}/api/printer-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ printerUrl: 'ipp://192.0.2.10:631/printers/main' })
        });

        assert.equal((await post({})).status, 401);
        assert.equal((await post({ 'x-api-key': 'wrong' })).status, 401);

        const ok = await post({ 'x-api-key': 's3cret' });
        assert.equal(ok.status, 200);
        assert.equal((await ok.json()).reachable, true);
    } finally {
        await stopTestServer(server);
    }
});

test('print endpoint enforces the API key before accepting uploads', async () => {
    const app = createApp({ security: { apiKey: 's3cret' } });
    const { server, baseUrl } = await startTestServer(app);

    try {
        const formData = new FormData();
        formData.append('printerUrl', 'ipp://192.0.2.10:631/printers/main');
        formData.append('file', new Blob([await createPdfBytes(1)], { type: 'application/pdf' }), 'doc.pdf');

        const denied = await fetch(`${baseUrl}/api/print`, { method: 'POST', body: formData });
        assert.equal(denied.status, 401);
    } finally {
        await stopTestServer(server);
    }
});

test('API key can be configured through the PRINTLE_API_KEY environment variable', async () => {
    const previous = process.env.PRINTLE_API_KEY;
    process.env.PRINTLE_API_KEY = 'env-secret';
    try {
        const app = createApp({
            printerFactory: () => ({
                execute(operation, message, callback) {
                    callback(null, { statusCode: 'successful-ok', 'printer-attributes-tag': {} });
                }
            })
        });
        const { server, baseUrl } = await startTestServer(app);
        try {
            const denied = await fetch(`${baseUrl}/api/printer-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ printerUrl: 'ipp://192.0.2.10:631/printers/main' })
            });
            assert.equal(denied.status, 401);

            const allowed = await fetch(`${baseUrl}/api/printer-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': 'env-secret' },
                body: JSON.stringify({ printerUrl: 'ipp://192.0.2.10:631/printers/main' })
            });
            assert.equal(allowed.status, 200);
            assert.equal((await allowed.json()).reachable, true);
        } finally {
            await stopTestServer(server);
        }
    } finally {
        if (previous === undefined) delete process.env.PRINTLE_API_KEY;
        else process.env.PRINTLE_API_KEY = previous;
    }
});
