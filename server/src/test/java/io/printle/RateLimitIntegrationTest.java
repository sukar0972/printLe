package io.printle;

import io.printle.ratelimit.RateLimitService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

import java.io.ByteArrayOutputStream;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class RateLimitIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired RateLimitService rateLimitService;

    @BeforeEach
    void setup() {
        rateLimitService.reset();
    }

    @Test
    void loginRateLimitsByIpAfterTenAttempts() throws Exception {
        String testIp = "192.168.1.100";
        // First 10 attempts with distinct emails should proceed to auth check (401 Unauthorized for wrong password)
        for (int i = 0; i < 10; i++) {
            mvc.perform(post("/api/auth/login")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("email", "user" + i + "@test.local")
                    .param("password", "wrong-password-" + i)
                    .with(request -> {
                        request.setRemoteAddr(testIp);
                        return request;
                    }))
                .andExpect(status().isUnauthorized());
        }

        // 11th attempt from same IP should be blocked by rate limiter with 429
        mvc.perform(post("/api/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", "user11@test.local")
                .param("password", "wrong-password-11")
                .with(request -> {
                    request.setRemoteAddr(testIp);
                    return request;
                }))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().exists("Retry-After"))
            .andExpect(jsonPath("$.error", containsString("Too many login attempts")));
    }

    @Test
    void loginRateLimitsByEmailAfterFiveAttemptsAcrossDifferentIps() throws Exception {
        String email = "target@test.local";
        // 5 attempts from distinct IPs for the same email
        for (int i = 1; i <= 5; i++) {
            final String ip = "10.0.0." + i;
            mvc.perform(post("/api/auth/login")
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("email", email)
                    .param("password", "wrong-password")
                    .with(request -> {
                        request.setRemoteAddr(ip);
                        return request;
                    }))
                .andExpect(status().isUnauthorized());
        }

        // 6th attempt from a brand new IP but targeting same email should be blocked with 429
        mvc.perform(post("/api/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("email", email)
                .param("password", "wrong-password")
                .with(request -> {
                    request.setRemoteAddr("10.0.0.99");
                    return request;
                }))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().exists("Retry-After"))
            .andExpect(jsonPath("$.error", containsString("Too many login attempts")));
    }

    @Test
    @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void uploadRateLimitsAfterTenRequestsPerMinute() throws Exception {
        byte[] pdfBytes = samplePdf();

        for (int i = 0; i < 10; i++) {
            var file = new MockMultipartFile("file", "test-" + i + ".pdf", "application/pdf", pdfBytes);
            mvc.perform(multipart("/api/jobs")
                    .file(file)
                    .with(csrf()))
                .andExpect(status().isCreated());
        }

        // 11th upload should be rejected with 429
        var file = new MockMultipartFile("file", "test-11.pdf", "application/pdf", pdfBytes);
        mvc.perform(multipart("/api/jobs")
                .file(file)
                .with(csrf()))
            .andExpect(status().isTooManyRequests())
            .andExpect(header().exists("Retry-After"))
            .andExpect(jsonPath("$.error", containsString("Too many upload requests")));
    }

    private static byte[] samplePdf() throws Exception {
        try (var doc = new PDDocument(); var out = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        }
    }
}
