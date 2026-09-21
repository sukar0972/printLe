package io.printle.job;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class PdfSelectionTest {
    @Test void keepsTheRequestedPageOrder() {
        assertEquals(List.of(4, 0, 1), PdfSelection.indices("5, 1-2", 5));
    }
}
