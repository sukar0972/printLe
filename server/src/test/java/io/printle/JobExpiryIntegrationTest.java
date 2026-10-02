package io.printle;

import io.printle.job.JobService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import io.printle.job.JobStatus;
import io.printle.job.PrintJobRepository;
import io.printle.quota.QuotaEntryType;
import io.printle.quota.QuotaLedgerRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doAnswer;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"printle.held-job-ttl=1ms", "printle.failed-job-retention=1ms", "printle.cleanup-interval-ms=3600000"})
@org.springframework.context.annotation.Import(io.printle.PostgresTestConfiguration.class)
@AutoConfigureMockMvc
class JobExpiryIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JobService jobs;
    @MockitoSpyBean PrintJobRepository repository;
    @Autowired QuotaLedgerRepository ledger;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoBean io.printle.job.JobStatePoller jobPoller;

    @Test @WithMockUser(username = "admin@test.local", roles = "ADMIN")
    void expiresHeldJobReleasesQuotaAndPurgesRecord() throws Exception {
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage()); document.save(output);
            mvc.perform(multipart("/api/jobs").file(new MockMultipartFile("file", "expire.pdf", "application/pdf", output.toByteArray())).with(csrf()))
                .andExpect(status().isCreated());
        }
        Thread.sleep(5);
        jobs.expireHeldJobs();
        mvc.perform(get("/api/jobs")).andExpect(status().isOk()).andExpect(jsonPath("$[0].status").value("EXPIRED"));
        mvc.perform(get("/api/jobs/quota")).andExpect(status().isOk()).andExpect(jsonPath("$.pending").value(0));
        Thread.sleep(5);
        jobs.purgeRetainedJobs();
        mvc.perform(get("/api/jobs")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test void doesNotExpireAJobReleasedAfterCandidateDiscovery() throws Exception {
        byte[] pdf;
        try (var document = new PDDocument(); var output = new ByteArrayOutputStream()) {
            document.addPage(new PDPage()); document.save(output); pdf = output.toByteArray();
        }
        var job = jobs.create("admin@test.local", new MockMultipartFile("file", "race.pdf", "application/pdf", pdf),
            1, io.printle.job.ColorMode.MONOCHROME, io.printle.job.DuplexMode.ONE_SIDED, "");
        jdbc.update("update print_job set expires_at = ? where id = ?", java.sql.Timestamp.from(Instant.now().minusSeconds(10)), job.getId());
        var discovered = new CountDownLatch(1);
        var proceed = new CountDownLatch(1);
        doAnswer(call -> {
            discovered.countDown();
            assertTrue(proceed.await(10, TimeUnit.SECONDS));
            return java.util.List.of(job.getId());
        }).when(repository).findExpiredIds(eq(JobStatus.HELD), any());

        try (var executor = Executors.newSingleThreadExecutor()) {
            var cleanup = executor.submit(jobs::expireHeldJobs);
            try {
                assertTrue(discovered.await(10, TimeUnit.SECONDS));
                new TransactionTemplate(transactionManager).executeWithoutResult(tx ->
                    repository.findByIdForUpdate(job.getId()).orElseThrow().beginDirectSubmission(UUID.randomUUID(), null));
            } finally { proceed.countDown(); }
            cleanup.get(10, TimeUnit.SECONDS);
        }
        assertEquals(JobStatus.SUBMISSION_UNKNOWN, repository.findById(job.getId()).orElseThrow().getStatus());
        assertFalse(ledger.existsByJobIdAndEntryTypeAndAttempt(job.getId(), QuotaEntryType.RELEASE, job.getAttempt()));
        assertTrue(Files.exists(Path.of(System.getProperty("java.io.tmpdir"), "printle-tests", job.getStorageKey())));
        // Leave no active reservation or payload for the other tests in this context.
        new TransactionTemplate(transactionManager).executeWithoutResult(tx ->
            repository.findByIdForUpdate(job.getId()).orElseThrow().restoreBeforeSubmission(null));
        jobs.cancel("admin@test.local", job.getId());
        jobs.purgeRetainedJobs();
    }
}
