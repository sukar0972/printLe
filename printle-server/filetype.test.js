'use strict';

// Unit tests for magic-byte document detection (issue #9).

const test = require('node:test');
const assert = require('node:assert/strict');

const { SUPPORTED_FORMATS, sniffDocumentFormat } = require('./filetype');

test('sniffs PDF by magic bytes', () => {
    const buf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
    assert.equal(sniffDocumentFormat(buf), 'application/pdf');
});

test('sniffs JPEG by magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    assert.equal(sniffDocumentFormat(buf), 'image/jpeg');
});

test('sniffs PNG by magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    assert.equal(sniffDocumentFormat(buf), 'image/png');
});

test('rejects Office documents (ZIP and OLE containers)', () => {
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]); // PK zip
    const doc = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);  // OLE2
    assert.equal(sniffDocumentFormat(docx), null);
    assert.equal(sniffDocumentFormat(doc), null);
});

test('rejects plain text, executables, and random bytes', () => {
    assert.equal(sniffDocumentFormat(Buffer.from('just some text')), null);
    assert.equal(sniffDocumentFormat(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), null); // MZ exe
    assert.equal(sniffDocumentFormat(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])), null);
});

test('rejects empty and undersized buffers', () => {
    assert.equal(sniffDocumentFormat(Buffer.alloc(0)), null);
    assert.equal(sniffDocumentFormat(Buffer.from([0x25, 0x50])), null); // partial %PD
    assert.equal(sniffDocumentFormat(null), null);
    assert.equal(sniffDocumentFormat(undefined), null);
});

test('requires the signature at offset 0 (no smuggled prefixes)', () => {
    const buf = Buffer.concat([Buffer.from('junk'), Buffer.from('%PDF-1.7')]);
    assert.equal(sniffDocumentFormat(buf), null);
});

test('supported formats list matches the sniffer', () => {
    assert.deepEqual(SUPPORTED_FORMATS, ['application/pdf', 'image/jpeg', 'image/png']);
});
