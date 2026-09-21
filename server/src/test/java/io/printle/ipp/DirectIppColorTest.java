package io.printle.ipp;

import com.hp.jipp.encoding.Tag;
import com.hp.jipp.model.Types;
import io.printle.job.ColorMode;
import io.printle.job.DuplexMode;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DirectIppColorTest {
    private final String endpoint = "ipp://localhost/ipp/print";

    private DirectIppClient client(boolean color, List<String> modes) {
        var client = spy(new DirectIppClient());
        doReturn(new DirectIppClient.Capabilities("Printer", "", "ONLINE", true, color,
            List.of("one-sided"), List.of(), List.of(), modes, 10, List.of(2)))
            .when(client).inspect(endpoint);
        return client;
    }

    private String mode(DirectIppClient client, ColorMode color) {
        return client.prepare(endpoint, UUID.randomUUID(), "user@test.local", 1, color, DuplexMode.ONE_SIDED)
            .packet().getString(Tag.jobAttributes, Types.printColorMode);
    }

    @Test void grayscaleRejectsAutomaticColorOnlyPrinters() {
        var error = assertThrows(ResponseStatusException.class,
            () -> mode(client(true, List.of("auto", "color")), ColorMode.MONOCHROME));
        assertEquals(409, error.getStatusCode().value());
    }

    @Test void grayscalePrefersBiLevelOverAutomaticColor() {
        assertEquals("bi-level", mode(client(true, List.of("auto", "bi-level", "color")), ColorMode.MONOCHROME));
    }

    @Test void grayscaleIsExplicitWhenAColorPrinterOmitsSupportedModes() {
        assertEquals("monochrome", mode(client(true, List.of()), ColorMode.MONOCHROME));
    }

    @Test void monochromePrintersDoNotNeedAColorModeAttribute() {
        assertNull(mode(client(false, List.of()), ColorMode.MONOCHROME));
    }

    @Test void explicitColorAndProcessMonochromeRemainSupported() {
        assertEquals("color", mode(client(true, List.of("auto", "color")), ColorMode.COLOR));
        assertEquals("process-monochrome", mode(client(true, List.of("auto", "process-monochrome")), ColorMode.MONOCHROME));
    }
}
