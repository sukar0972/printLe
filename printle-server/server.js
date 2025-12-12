const express = require('express');
const multer = require('multer');
const ipp = require('ipp');
const fs = require('fs');
const cors = require('cors');
const { PDFDocument } = require('pdf-lib');
const path = require('path');

const app = express();

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const upload = multer({ dest: 'uploads/' });

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => res.send('PrintLe Server is running!'));

function getPageIndices(rangeStr, totalPages) {
    if (!rangeStr) return null;
    const indices = new Set();
    const parts = rangeStr.split(',');
    parts.forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(Number);
            for (let i = start; i <= end; i++) {
                if (i > 0 && i <= totalPages) indices.add(i - 1);
            }
        } else {
            const page = Number(part);
            if (page > 0 && page <= totalPages) indices.add(page - 1);
        }
    });
    return Array.from(indices).sort((a, b) => a - b);
}

app.post('/api/print', upload.single('file'), async (req, res) => {
    console.log('\n--- /api/print POST RECEIVED ---');
    
    const file = req.file;
    const printerUrl = req.body.printerUrl;
    const duplexType = req.body.duplex;
    const pageRange = req.body.pages;
    const grayscale = req.body.grayscale === 'true'; // Check for grayscale flag
    
    if (!file || !printerUrl) {
         try { fs.unlinkSync(file.path); } catch(e) {}
         return res.status(400).json({ error: 'Missing file or printerUrl' });
    }

    console.log(`Job: ${file.originalname}`);
    console.log(`Settings: [Duplex: ${duplexType || 'None'}] [Pages: ${pageRange || 'All'}] [Grayscale: ${grayscale}]`);

    try {
        let fileBuffer = fs.readFileSync(file.path);
        
        // Handle PDF Modifications (Pages & Duplex Splitting)
        if (file.mimetype === 'application/pdf') {
            let pdfDoc = await PDFDocument.load(fileBuffer);
            let modified = false;

            if (pageRange) {
                const indices = getPageIndices(pageRange, pdfDoc.getPageCount());
                if (indices && indices.length > 0) {
                    const newPdf = await PDFDocument.create();
                    const copiedPages = await newPdf.copyPages(pdfDoc, indices);
                    copiedPages.forEach(page => newPdf.addPage(page));
                    pdfDoc = newPdf;
                    modified = true;
                }
            }

            if (duplexType === 'odd' || duplexType === 'even') {
                const newPdf = await PDFDocument.create();
                const pageCount = pdfDoc.getPageCount();
                for (let i = 0; i < pageCount; i++) {
                    const isOddIndex = (i % 2 === 0);
                    if ((duplexType === 'odd' && isOddIndex) || (duplexType === 'even' && !isOddIndex)) {
                        const [page] = await newPdf.copyPages(pdfDoc, [i]);
                        newPdf.addPage(page);
                    }
                }
                pdfDoc = newPdf;
                modified = true;
            }

            // NOTE: We REMOVED the "convertToGrayscale" function here because it was causing blank pages.
            // We will handle grayscale via IPP attributes below.

            if (modified) {
                const pdfBytes = await pdfDoc.save();
                fileBuffer = Buffer.from(pdfBytes);
            }
        }

        const docFormat = file.mimetype === 'application/pdf' ? 'application/pdf' : 'application/octet-stream';

        const data = {
            "operation-attributes-tag": {
                "requesting-user-name": "PrintLe-User",
                "job-name": `${file.originalname}`,
                "document-format": docFormat
            },
            "job-attributes-tag": {},
            data: fileBuffer
        };

        // --- IPP ATTRIBUTES ---
        
        // 1. Grayscale: Use 'print-color-mode' attribute
        if (grayscale) {
             data['job-attributes-tag']['print-color-mode'] = 'monochrome';
             console.log('Set IPP attribute: print-color-mode = monochrome');
        }

        // 2. Auto Duplex
        if (duplexType === 'auto') {
            data['job-attributes-tag']['sides'] = 'two-sided-long-edge';
        }

        const printer = ipp.Printer(printerUrl);
        printer.execute("Print-Job", data, (err, response) => {
            try { fs.unlinkSync(file.path); } catch(e) {}
            if (err) return res.status(500).json({ error: 'Printer Connection Failed', details: err });
            
            if (response.statusCode === 'successful-ok' || response.statusCode === 'successful-ok-ignored-or-substituted-attributes') {
                res.json({ success: true, jobId: response['job-attributes-tag']['job-id'] });
            } else {
                res.status(500).json({ error: 'Printer reported error', ippStatus: response.statusCode });
            }
        });

    } catch (error) {
        console.error("Processing Error:", error);
        if (file) try { fs.unlinkSync(file.path); } catch(e) {}
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`PrintLe Server running on port ${PORT}`);
});
