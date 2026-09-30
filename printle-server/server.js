const express = require('express');
const multer = require('multer');
const ipp = require('ipp');
const fs = require('fs');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');
const path = require('path');
const { sniffDocumentFormat } = require('./filetype');

const PORT = 3001;
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Upload size limit (issue #9). The UI has always claimed "up to 10MB" but
// nothing enforced it on the server, and nginx's client_max_body_size only
// covers the proxied path — direct hits to :3001 were unbounded. Operators
// can raise/lower it with PRINTLE_MAX_UPLOAD_BYTES.
const MAX_UPLOAD_BYTES = (() => {
    const parsed = Number(process.env.PRINTLE_MAX_UPLOAD_BYTES);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 10 * 1024 * 1024;
})();

const upload = multer({
    dest: uploadDir,
    // Note: busboy/multer trip the size limit AT the bound (a file of exactly
    // fileSize bytes is rejected), so the streaming guard uses MAX + 1 and
    // the handler enforces the exact byte limit on the stored file.
    limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 }
});

// Run multer and translate its errors into JSON responses (the default
// Express handler returns an HTML 500 page, which API clients can't use).
function uploadSingleFile(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: `File too large: uploads are limited to ${MAX_UPLOAD_BYTES} bytes.`
            });
        }
        return res.status(400).json({ error: `Upload failed: ${err.message}` });
    });
}

function isSuccessfulIppStatus(statusCode) {
    return statusCode === 'successful-ok' ||
        statusCode === 'successful-ok-ignored-or-substituted-attributes';
}

function getPageIndices(rangeStr, totalPages) {
    if (!rangeStr || !rangeStr.trim()) return null;

    const indices = new Set();
    const parts = rangeStr.split(',');

    if (parts.some(part => !part.trim())) {
        throw new Error('Page range contains an empty segment.');
    }

    for (const rawPart of parts) {
        const part = rawPart.trim();
        const rangeMatch = part.match(/^(\d+)-(\d+)$/);
        const singleMatch = part.match(/^(\d+)$/);

        if (rangeMatch) {
            const start = Number(rangeMatch[1]);
            const end = Number(rangeMatch[2]);

            if (start > end) {
                throw new Error(`Invalid page range "${part}". Start page must be before end page.`);
            }
            if (start < 1 || end > totalPages) {
                throw new Error(`Page range "${part}" is outside the document bounds of 1-${totalPages}.`);
            }

            for (let page = start; page <= end; page += 1) {
                indices.add(page - 1);
            }
            continue;
        }

        if (singleMatch) {
            const page = Number(singleMatch[1]);
            if (page < 1 || page > totalPages) {
                throw new Error(`Page "${page}" is outside the document bounds of 1-${totalPages}.`);
            }
            indices.add(page - 1);
            continue;
        }

        throw new Error(`Invalid page range segment "${part}". Use formats like "1-3, 5".`);
    }

    if (indices.size === 0) {
        throw new Error('Page range did not select any pages.');
    }

    return Array.from(indices).sort((a, b) => a - b);
}

function buildPrintJob(file, fileBuffer, grayscale, duplexType, documentFormat) {
    // Prefer the server-sniffed format; the mimetype fallback only serves
    // legacy callers/tests that never sniffed (endpoint always passes one).
    const docFormat = documentFormat
        || (file.mimetype === 'application/pdf' ? 'application/pdf' : 'application/octet-stream');
    const jobAttributes = {};

    if (grayscale) {
        jobAttributes['print-color-mode'] = 'monochrome';
    }

    if (duplexType === 'auto') {
        jobAttributes.sides = 'two-sided-long-edge';
    }

    return {
        "operation-attributes-tag": {
            "requesting-user-name": "PrintLe-User",
            "job-name": `${file.originalname}`,
            "document-format": docFormat
        },
        "job-attributes-tag": jobAttributes,
        data: fileBuffer
    };
}

function checkPrinterReachability(printerUrl, options = {}) {
    const {
        printerFactory = ipp.Printer,
        timeoutMs = 5000
    } = options;

    return new Promise((resolve, reject) => {
        let settled = false;
        const printer = printerFactory(printerUrl);

        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error(`Timed out after ${timeoutMs}ms while contacting the printer.`));
        }, timeoutMs);

        const message = {
            "operation-attributes-tag": {
                "requesting-user-name": "PrintLe-Healthcheck",
                "printer-uri": printerUrl,
                "requested-attributes": [
                    'printer-name',
                    'printer-state',
                    'printer-is-accepting-jobs'
                ]
            }
        };

        printer.execute('Get-Printer-Attributes', message, (err, response = {}) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);

            if (err) {
                reject(err);
                return;
            }

            const printerAttributes = response['printer-attributes-tag'] || {};
            resolve({
                reachable: isSuccessfulIppStatus(response.statusCode),
                statusCode: response.statusCode,
                printerName: printerAttributes['printer-name'] || null,
                printerState: printerAttributes['printer-state'] || null,
                acceptingJobs: printerAttributes['printer-is-accepting-jobs'] ?? null
            });
        });
    });
}

function createApp(options = {}) {
    const {
        printerFactory = ipp.Printer
    } = options;

    const app = express();

    app.use(cors({ origin: '*' }));
    app.use(express.json());

    app.get('/', (req, res) => res.send('PrintLe Server is running!'));

    app.post('/api/printer-status', async (req, res) => {
        const printerUrl = req.body?.printerUrl;

        if (!printerUrl) {
            return res.status(400).json({ error: 'Missing printerUrl' });
        }

        try {
            const status = await checkPrinterReachability(printerUrl, { printerFactory });
            res.json(status);
        } catch (error) {
            res.json({
                reachable: false,
                statusCode: null,
                printerName: null,
                printerState: null,
                acceptingJobs: null,
                error: error.message || 'Unable to reach printer.'
            });
        }
    });

    app.post('/api/print', uploadSingleFile, async (req, res) => {
        console.log('\n--- /api/print POST RECEIVED ---');

        const file = req.file;
        const printerUrl = req.body.printerUrl;
        const duplexType = req.body.duplex;
        const pageRange = req.body.pages;
        const grayscale = req.body.grayscale === 'true';

        if (!file || !printerUrl) {
            if (file) {
                try { fs.unlinkSync(file.path); } catch (e) {}
            }
            return res.status(400).json({ error: 'Missing file or printerUrl' });
        }

        console.log(`Job: ${file.originalname}`);
        console.log(`Settings: [Duplex: ${duplexType || 'None'}] [Pages: ${pageRange || 'All'}] [Grayscale: ${grayscale}]`);

        // Exact upload-size enforcement (see the multer limits note above).
        if (file.size > MAX_UPLOAD_BYTES) {
            try { fs.unlinkSync(file.path); } catch (e) {}
            return res.status(413).json({
                error: `File too large: uploads are limited to ${MAX_UPLOAD_BYTES} bytes.`
            });
        }

        try {
            let fileBuffer = fs.readFileSync(file.path);

            // Authoritative type detection (issue #9): the declared
            // mimetype/extension is client-controlled, so the magic bytes
            // decide. Anything that is not a real PDF/JPEG/PNG is rejected —
            // previously e.g. Office documents were forwarded to printers as
            // raw application/octet-stream.
            const detectedFormat = sniffDocumentFormat(fileBuffer);
            if (!detectedFormat) {
                try { fs.unlinkSync(file.path); } catch (e) {}
                return res.status(415).json({
                    error: 'Unsupported file type: only PDF, JPEG, and PNG files can be printed.'
                });
            }

            if (detectedFormat !== 'application/pdf' && (pageRange || duplexType === 'odd' || duplexType === 'even')) {
                try { fs.unlinkSync(file.path); } catch (e) {}
                return res.status(400).json({
                    error: 'Page ranges and manual duplex are only supported for PDF files.'
                });
            }

            if (detectedFormat === 'application/pdf') {
                let pdfDoc;
                try {
                    pdfDoc = await PDFDocument.load(fileBuffer);
                } catch (e) {
                    try { fs.unlinkSync(file.path); } catch (err) {}
                    return res.status(400).json({ error: 'Invalid or corrupt PDF file.' });
                }
                // pdf-lib's parser is lenient: garbage with a %PDF- header
                // "loads" into a document with no readable pages. Such a
                // file cannot print, so treat it as corrupt too.
                let pageCount = 0;
                try { pageCount = pdfDoc.getPageCount(); } catch (e) { pageCount = 0; }
                if (pageCount < 1) {
                    try { fs.unlinkSync(file.path); } catch (e) {}
                    return res.status(400).json({ error: 'Invalid or corrupt PDF file.' });
                }
                let modified = false;

                if (pageRange) {
                    const indices = getPageIndices(pageRange, pdfDoc.getPageCount());
                    const newPdf = await PDFDocument.create();
                    const copiedPages = await newPdf.copyPages(pdfDoc, indices);
                    copiedPages.forEach(page => newPdf.addPage(page));
                    pdfDoc = newPdf;
                    modified = true;
                }

                if (duplexType === 'odd' || duplexType === 'even') {
                    const newPdf = await PDFDocument.create();
                    const pageCount = pdfDoc.getPageCount();

                    for (let i = 0; i < pageCount; i += 1) {
                        const isOddIndex = i % 2 === 0;
                        if ((duplexType === 'odd' && isOddIndex) || (duplexType === 'even' && !isOddIndex)) {
                            const [page] = await newPdf.copyPages(pdfDoc, [i]);
                            newPdf.addPage(page);
                        }
                    }

                    pdfDoc = newPdf;
                    modified = true;
                }

                if (modified) {
                    const pdfBytes = await pdfDoc.save();
                    fileBuffer = Buffer.from(pdfBytes);
                }
            }

            const data = buildPrintJob(file, fileBuffer, grayscale, duplexType, detectedFormat);
            const printer = printerFactory(printerUrl);

            printer.execute('Print-Job', data, (err, response = {}) => {
                try { fs.unlinkSync(file.path); } catch (e) {}

                if (err) {
                    return res.status(500).json({ error: 'Printer Connection Failed', details: err.message || err });
                }

                if (isSuccessfulIppStatus(response.statusCode)) {
                    return res.json({
                        success: true,
                        jobId: response['job-attributes-tag']?.['job-id'] ?? null
                    });
                }

                return res.status(500).json({ error: 'Printer reported error', ippStatus: response.statusCode });
            });
        } catch (error) {
            console.error('Processing Error:', error);
            if (file) {
                try { fs.unlinkSync(file.path); } catch (e) {}
            }

            if (error.message && error.message.toLowerCase().includes('page')) {
                return res.status(400).json({ error: error.message });
            }

            return res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    return app;
}

const app = createApp();

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`PrintLe Server running on port ${PORT}`);
    });
}

module.exports = {
    MAX_UPLOAD_BYTES,
    app,
    buildPrintJob,
    checkPrinterReachability,
    createApp,
    getPageIndices,
    isSuccessfulIppStatus,
    sniffDocumentFormat
};
