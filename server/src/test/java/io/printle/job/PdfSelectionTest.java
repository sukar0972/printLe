package io.printle.job;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.io.ByteArrayOutputStream;
import static org.junit.jupiter.api.Assertions.*;

class PdfSelectionTest {
    private byte[] pdf() throws Exception {
        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            for (int i = 1; i <= 5; i++) doc.addPage(new PDPage(new PDRectangle(100 * i, 600)));
            doc.save(out); return out.toByteArray();
        }
    }
    @Test void selectsOriginalPagesAndDeduplicatesRanges() throws Exception {
        try (var doc = Loader.loadPDF(PdfSelection.select(pdf(), "1-2, 2, 5"))) {
            assertEquals(3, doc.getNumberOfPages());
            assertEquals(500, doc.getPage(2).getMediaBox().getWidth());
        }
        assertThrows(ResponseStatusException.class, () -> PdfSelection.select(pdf(), "0, 8"));
        assertThrows(ResponseStatusException.class, () -> PdfSelection.select(pdf(), "3-1"));
    }
    @Test void manualDuplexExpandsCopiesAndPadsOddDocuments() throws Exception {
        try (var odd = Loader.loadPDF(PdfSelection.manualPass(pdf(), false, 2, false));
             var even = Loader.loadPDF(PdfSelection.manualPass(pdf(), true, 2, true))) {
            assertEquals(6, odd.getNumberOfPages());
            assertEquals(6, even.getNumberOfPages());
            assertEquals(100, odd.getPage(3).getMediaBox().getWidth());
            assertEquals(500, even.getPage(0).getMediaBox().getWidth());
            assertFalse(even.getPage(0).hasContents());
            assertEquals(400, even.getPage(1).getMediaBox().getWidth());
            assertEquals(200, even.getPage(2).getMediaBox().getWidth());
        }
    }
}
