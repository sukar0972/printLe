'use strict';

/**
 * Server-side document-type detection for print uploads (issue #9).
 *
 * The client's declared Content-Type / file extension is attacker-controlled
 * and was previously trusted to decide how an upload is processed and which
 * `document-format` is sent to the printer. Detection here is authoritative:
 * it inspects the file's magic bytes and returns the IPP document-format for
 * the types PrintLe can actually print, or null for everything else.
 */

const SIGNATURES = [
    {
        format: 'application/pdf',
        label: 'PDF',
        // "%PDF-"
        bytes: [0x25, 0x50, 0x44, 0x46, 0x2d],
    },
    {
        format: 'image/jpeg',
        label: 'JPEG',
        // SOI + marker prefix
        bytes: [0xff, 0xd8, 0xff],
    },
    {
        format: 'image/png',
        label: 'PNG',
        bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    },
];

const SUPPORTED_FORMATS = SIGNATURES.map(s => s.format);

/**
 * Return the IPP document-format ('application/pdf' | 'image/jpeg' |
 * 'image/png') for a buffer whose magic bytes match a supported type, or
 * null when the content is not a printable document type.
 */
function sniffDocumentFormat(buffer) {
    if (!buffer || buffer.length === 0) return null;
    for (const sig of SIGNATURES) {
        if (buffer.length < sig.bytes.length) continue;
        let match = true;
        for (let i = 0; i < sig.bytes.length; i += 1) {
            if (buffer[i] !== sig.bytes[i]) { match = false; break; }
        }
        if (match) return sig.format;
    }
    return null;
}

module.exports = {
    SUPPORTED_FORMATS,
    sniffDocumentFormat,
};
