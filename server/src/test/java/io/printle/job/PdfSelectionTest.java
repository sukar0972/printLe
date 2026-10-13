package io.printle.job;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import static org.junit.jupiter.api.Assertions.*;

class PdfSelectionTest {
    @Test void keepsTheRequestedPageOrder() {
        assertEquals(java.util.List.of(4, 0, 1), PdfSelection.indices("5, 1-2, 5", 5));
    }
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

    @Test void selectingPagesPreservesInheritedImagesInTheRequestedOrder() throws Exception {
        var pdf = inheritedResourcesPdf();
        try (var original = Loader.loadPDF(pdf);
             var selected = Loader.loadPDF(PdfSelection.select(pdf, "2, 1"))) {
            assertNull(original.getPage(0).getCOSObject().getDictionaryObject(COSName.RESOURCES));
            assertEquals(0xff0000, imageColor(original, 0));
            assertEquals(0x0000ff, imageColor(original, 1));
            assertEquals(0x0000ff, imageColor(selected, 0));
            assertEquals(0xff0000, imageColor(selected, 1));
        }
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void manualPassesPreserveInheritedImagesAcrossCopies(boolean even) throws Exception {
        try (var pass = Loader.loadPDF(PdfSelection.manualPass(inheritedResourcesPdf(), even, 2, true))) {
            assertEquals(2, pass.getNumberOfPages());
            int expected = even ? 0x0000ff : 0xff0000;
            assertEquals(expected, imageColor(pass, 0));
            assertEquals(expected, imageColor(pass, 1));
        }
    }

    private byte[] inheritedResourcesPdf() throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            var resources = new PDResources();
            for (int color : new int[] {0xff0000, 0x0000ff}) {
                var page = new PDPage(new PDRectangle(200, 200));
                page.setResources(resources);
                document.addPage(page);
                var image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
                for (int x = 0; x < 2; x++) for (int y = 0; y < 2; y++) image.setRGB(x, y, color);
                try (var content = new PDPageContentStream(document, page)) {
                    content.drawImage(LosslessFactory.createFromImage(document, image), 20, 20, 40, 40);
                }
                page.getCOSObject().removeItem(COSName.RESOURCES);
            }
            document.getPages().getCOSObject().setItem(COSName.RESOURCES, resources.getCOSObject());
            document.save(output);
            return output.toByteArray();
        }
    }

    private int imageColor(PDDocument document, int page) throws Exception {
        return new PDFRenderer(document).renderImage(page).getRGB(40, 160) & 0xffffff;
    }
}
