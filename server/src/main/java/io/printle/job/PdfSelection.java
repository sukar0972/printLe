package io.printle.job;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;

/** Page ranges use original document numbers. `odd` and `even` select that parity, with an optional bound such as `odd 1-10`. Manual passes use the selected document. */
public final class PdfSelection {
    private enum Side { ODD, EVEN }
    private PdfSelection() {}
    public static byte[] select(byte[] pdf, String range) throws IOException {
        if (range == null || range.isBlank()) return pdf;
        if (range.length() > 1000) throw invalid("Page selection is too long");
        try (var source = Loader.loadPDF(pdf); var selected = new PDDocument()) {
            for (int index : indices(range, source.getNumberOfPages())) selected.importPage(source.getPage(index));
            return save(selected);
        }
    }
    static List<Integer> indices(String range, int count) {
        String trimmed = range.trim();
        Side side = side(trimmed);
        if (side != null) return parityIndices(trimmed, side, count);
        var pages = new LinkedHashSet<Integer>();
        for (String piece : range.split(",", -1)) {
            String part = piece.trim();
            if (!part.matches("[0-9]+(?:\\s*-\\s*[0-9]+)?")) throw invalid("Use page ranges such as 1-3, 5");
            String[] bounds = part.split("\\s*-\\s*");
            try {
                int first = Integer.parseInt(bounds[0]), last = bounds.length == 1 ? first : Integer.parseInt(bounds[1]);
                if (first < 1 || last < first || last > count) throw invalid("Page ranges must be within 1–" + count);
                for (int page = first; page <= last; page++) pages.add(page - 1);
            } catch (NumberFormatException e) { throw invalid("Invalid page number"); }
        }
        if (pages.isEmpty()) throw invalid("Choose at least one page");
        return List.copyOf(pages);
    }
    private static Side side(String trimmed) {
        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (lower.equals("even") || lower.startsWith("even ")) return Side.EVEN;
        if (lower.equals("odd") || lower.startsWith("odd ")) return Side.ODD;
        return null;
    }
    private static List<Integer> parityIndices(String trimmed, Side side, int count) {
        String rest = trimmed.replaceFirst("(?i)^(odd|even)\\s*", "");
        int first = 1, last = count;
        if (!rest.isEmpty()) {
            if (!rest.matches("[0-9]+(?:\\s*-\\s*[0-9]+)?")) throw invalid("Use page ranges such as 1-3, 5");
            String[] bounds = rest.split("\\s*-\\s*");
            try {
                first = Integer.parseInt(bounds[0]);
                last = bounds.length == 1 ? first : Integer.parseInt(bounds[1]);
            } catch (NumberFormatException e) { throw invalid("Invalid page number"); }
            if (first < 1 || last < first || last > count) throw invalid("Page ranges must be within 1–" + count);
        }
        var pages = new ArrayList<Integer>();
        for (int page = first; page <= last; page++) {
            if ((page % 2 == 0) == (side == Side.EVEN)) pages.add(page - 1);
        }
        if (pages.isEmpty()) throw invalid("Choose at least one page");
        return List.copyOf(pages);
    }
    public static byte[] manualPass(byte[] pdf, boolean even, int copies, boolean reverse) throws IOException {
        try (var source = Loader.loadPDF(pdf); var output = new PDDocument()) {
            int sheets = (source.getNumberOfPages() + 1) / 2;
            // Expand copies in the PDF so the printer cannot collate the two passes differently.
            for (int n = 0; n < sheets * copies; n++) {
                int position = reverse ? sheets * copies - 1 - n : n;
                int index = (position % sheets) * 2 + (even ? 1 : 0);
                if (index < source.getNumberOfPages()) output.importPage(source.getPage(index));
                else {
                    var last = source.getPage(source.getNumberOfPages() - 1);
                    var blank = new PDPage(last.getMediaBox());
                    blank.setCropBox(last.getCropBox()); blank.setRotation(last.getRotation());
                    output.addPage(blank);
                }
            }
            return save(output);
        }
    }
    private static byte[] save(PDDocument document) throws IOException {
        var out = new ByteArrayOutputStream(); document.save(out); return out.toByteArray();
    }
    private static ResponseStatusException invalid(String reason) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason); }
}
