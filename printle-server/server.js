const express = require('express');
const multer = require('multer');
const ipp = require('ipp');
const fs = require('fs');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

const PORT = 3001;
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

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

function buildPrintJob(file, fileBuffer, grayscale, duplexType) {
    const docFormat = file.mimetype === 'application/pdf' ? 'application/pdf' : 'application/octet-stream';
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

    app.post('/api/print', upload.single('file'), async (req, res) => {
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

        try {
            let fileBuffer = fs.readFileSync(file.path);

            if (file.mimetype !== 'application/pdf' && (pageRange || duplexType === 'odd' || duplexType === 'even')) {
                try { fs.unlinkSync(file.path); } catch (e) {}
                return res.status(400).json({
                    error: 'Page ranges and manual duplex are only supported for PDF files.'
                });
            }

            if (file.mimetype === 'application/pdf') {
                let pdfDoc = await PDFDocument.load(fileBuffer);
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

            const data = buildPrintJob(file, fileBuffer, grayscale, duplexType);
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
    app,
    buildPrintJob,
    checkPrinterReachability,
    createApp,
    getPageIndices,
    isSuccessfulIppStatus
};
