package io.printle.job;

import io.printle.audit.AuditService;
import io.printle.config.*;
import io.printle.ipp.DirectIppClient;
import io.printle.printer.*;
import io.printle.quota.*;
import io.printle.user.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JobSubmissionTest {
    @TempDir Path storage;
    PrintJobRepository jobs;
    QuotaService quotas;
    DirectIppClient ipp;
    JobService service;
    PrintJob job;
    Printer printer;
    final String email = "review@test.local";
    final String endpoint = "ipp://localhost/ipp/print";

    @BeforeEach void setup() throws Exception {
        jobs = mock(PrintJobRepository.class);
        quotas = mock(QuotaService.class);
        ipp = mock(DirectIppClient.class);
        var printers = mock(PrinterRepository.class);
        var props = mock(PrintleProperties.class);
        when(props.storagePath()).thenReturn(storage.toString());
        var tm = mock(PlatformTransactionManager.class);
        when(tm.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        service = new JobService(jobs, mock(AppUserRepository.class), mock(AuditService.class), quotas,
            mock(QuotaLedgerRepository.class), printers, mock(PrinterAccessService.class),
            mock(InstanceSettingsService.class), mock(UserGroupRepository.class), props, ipp, tm);
        var owner = new AppUser(email, "Review", "hash", Role.USER);
        job = new PrintJob(owner, "review.pdf", "review.pdf", 10, 4, 1, ColorMode.MONOCHROME, DuplexMode.ONE_SIDED, Instant.now().plusSeconds(600));
        try (var document = new org.apache.pdfbox.pdmodel.PDDocument()) {
            for (int page = 0; page < 4; page++) document.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            document.save(storage.resolve("review.pdf").toFile());
        }
        printer = new Printer("Review", "Review printer");
        printer.connectIpp(endpoint, caps(List.of("monochrome", "color")));
        when(printers.findById(printer.getId())).thenReturn(Optional.of(printer));
        when(jobs.findByIdForUpdate(job.getId())).thenReturn(Optional.of(job));
        when(jobs.findAllByStatusOrderByCompletedAtDesc(JobStatus.SUBMISSION_UNKNOWN)).thenAnswer(x -> job.getStatus() == JobStatus.SUBMISSION_UNKNOWN ? List.of(job) : List.of());
        when(jobs.findAllByIppJobIdIsNotNullAndStatusIn(any())).thenReturn(List.of());
    }

    static DirectIppClient.Capabilities caps(List<String> modes) {
        return new DirectIppClient.Capabilities("Review", "", "ONLINE", true, true,
            List.of("one-sided"), List.of(), List.of(), modes, 10, List.of(2, 5, 6));
    }

    @Test void cancelDuringSubmissionMustNotBeOverwrittenBySubmissionResponse() {
        var prepared = new DirectIppClient.PreparedSubmission(endpoint, null, false);
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any())).thenReturn(prepared);
        when(ipp.submit(eq(prepared), any())).thenAnswer(x -> {
            assertEquals(JobStatus.SUBMISSION_UNKNOWN, job.getStatus());
            service.cancel(email, job.getId());
            assertEquals(JobStatus.CANCELED, job.getStatus());
            return new DirectIppClient.Submission(42, endpoint, "processing", "none");
        });
        service.release(email, job.getId(), printer.getId());
        verify(ipp).cancel(endpoint, 42, email);
        assertEquals(JobStatus.CANCELED, job.getStatus(), "A completed Cancel must not be overwritten by a late submission response");
    }

    @Test void failedSendRemainsRetryableWhenPollingRunsDuringSend() {
        var prepared = new DirectIppClient.PreparedSubmission(endpoint, null, true);
        var remote = new DirectIppClient.Submission(42, endpoint, "pending-held", "job-incoming");
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any())).thenReturn(prepared);
        when(ipp.submit(eq(prepared), isNull())).thenReturn(remote);
        when(ipp.findJob(anyString(), any(), anyString())).thenReturn(remote);
        doAnswer(x -> {
            service.syncActiveJobs();
            assertEquals(JobStatus.SUBMISSION_UNKNOWN, job.getStatus());
            throw new DirectIppClient.IppException("send failed");
        }).when(ipp).send(anyString(), anyInt(), anyString(), any());
        assertThrows(DirectIppClient.IppException.class, () -> service.release(email, job.getId(), printer.getId()));
        verify(ipp).cancel(endpoint, 42, email);
        verify(ipp, never()).findJob(anyString(), any(), anyString());
        assertTrue(Files.exists(storage.resolve(job.getStorageKey())));
        assertEquals(JobStatus.HELD, job.getStatus(), "Successful remote cancellation must restore the retained job for retry");
    }

    @Test void canceledEvenPassMustDebitAlreadyPrintedOddPages() {
        manualJob();
        job.submittedManualOdd(41, JobStatus.COMPLETED, "none");
        job.submittedManualEven(42, JobStatus.PROCESSING, "none");
        when(jobs.findAllByIppJobIdIsNotNullAndStatusIn(any())).thenReturn(List.of(job));
        when(ipp.status(endpoint, 42, email)).thenReturn(new DirectIppClient.IppStatus(42, "canceled", "none"));
        service.syncActiveJobs();
        assertEquals(JobStatus.CANCELED, job.getStatus());
        verify(quotas).settlePrinted(job, 2);
    }

    @Test void cancellationBeforeSendDoesNotUploadTheDocument() {
        var prepared = new DirectIppClient.PreparedSubmission(endpoint, null, true);
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any())).thenReturn(prepared);
        when(ipp.submit(eq(prepared), isNull())).thenAnswer(x -> {
            service.cancel(email, job.getId());
            return new DirectIppClient.Submission(42, endpoint, "pending-held", "job-incoming");
        });
        assertEquals(JobStatus.CANCELED, service.release(email, job.getId(), printer.getId()).getStatus());
        verify(ipp, never()).send(anyString(), anyInt(), anyString(), any());
        verify(ipp).cancel(endpoint, 42, email);
    }

    @Test void failedSendRetryUsesANewRemoteJobName() {
        var prepared = new DirectIppClient.PreparedSubmission(endpoint, null, true);
        var keys = new ArrayList<UUID>();
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any())).thenAnswer(x -> {
            keys.add(x.getArgument(1));
            return prepared;
        });
        when(ipp.submit(eq(prepared), isNull())).thenReturn(new DirectIppClient.Submission(42, endpoint, "pending-held", "job-incoming"));
        doThrow(new DirectIppClient.IppException("send failed")).doNothing()
            .when(ipp).send(anyString(), anyInt(), anyString(), any());
        assertThrows(DirectIppClient.IppException.class, () -> service.release(email, job.getId(), printer.getId()));
        assertEquals(JobStatus.PENDING_HELD, service.release(email, job.getId(), printer.getId()).getStatus());
        assertEquals(2, keys.size());
        assertNotEquals(keys.get(0), keys.get(1));
    }

    @Test void failedEvenSendCanBeRetriedWithANewRemoteJobName() {
        manualJob();
        job.submittedManualOdd(41, JobStatus.COMPLETED, "none");
        var prepared = new DirectIppClient.PreparedSubmission(endpoint, null, true);
        var keys = new ArrayList<UUID>();
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any())).thenAnswer(x -> {
            keys.add(x.getArgument(1));
            return prepared;
        });
        when(ipp.submit(eq(prepared), isNull())).thenReturn(new DirectIppClient.Submission(42, endpoint, "pending-held", "job-incoming"));
        doThrow(new DirectIppClient.IppException("send failed")).doNothing()
            .when(ipp).send(anyString(), anyInt(), anyString(), any());
        assertThrows(DirectIppClient.IppException.class, () -> service.confirmFlip(email, job.getId()));
        assertEquals(JobStatus.AWAITING_FLIP, job.getStatus());
        assertEquals(41, job.getIppJobId());
        assertTrue(Files.exists(storage.resolve(job.getStorageKey())));
        assertEquals(JobStatus.PENDING_HELD, service.confirmFlip(email, job.getId()).getStatus());
        assertNotEquals(keys.get(0), keys.get(1));
        verifyNoInteractions(quotas);
    }

    @Test void failedRemoteCancellationRetainsJobForReconciliation() {
        var prepared = new DirectIppClient.PreparedSubmission(endpoint, null, true);
        when(ipp.prepare(anyString(), any(), anyString(), anyInt(), any(), any())).thenReturn(prepared);
        when(ipp.submit(eq(prepared), isNull())).thenReturn(new DirectIppClient.Submission(42, endpoint, "pending-held", "job-incoming"));
        doThrow(new DirectIppClient.IppException("send failed")).when(ipp).send(anyString(), anyInt(), anyString(), any());
        doThrow(new DirectIppClient.IppException("cancel failed")).when(ipp).cancel(anyString(), anyInt(), anyString());
        assertThrows(DirectIppClient.IppException.class, () -> service.release(email, job.getId(), printer.getId()));
        assertEquals(JobStatus.PENDING_HELD, job.getStatus());
        assertEquals(42, job.getIppJobId());
        assertTrue(Files.exists(storage.resolve(job.getStorageKey())));
        verifyNoInteractions(quotas);
    }

    @Test void staleReconciliationCannotOverwriteANewerSubmission() {
        UUID oldKey = UUID.randomUUID(), newKey = UUID.randomUUID();
        job.useDirectIpp(endpoint);
        job.beginDirectSubmission(oldKey, null);
        when(ipp.findJob(endpoint, oldKey, email)).thenAnswer(x -> {
            job.beginDirectSubmission(newKey, null);
            return new DirectIppClient.Submission(41, endpoint, "canceled", "none");
        });
        service.syncActiveJobs();
        assertEquals(JobStatus.SUBMISSION_UNKNOWN, job.getStatus());
        assertEquals(newKey, job.getSubmissionKey());
        verifyNoInteractions(quotas);
        assertTrue(Files.exists(storage.resolve(job.getStorageKey())));
    }

    @Test void abandoningAnUnconfirmedEvenPassStillChargesOddPages() {
        manualJob();
        job.submittedManualOdd(41, JobStatus.COMPLETED, "none");
        job.beginDirectSubmission(UUID.randomUUID(), "EVEN");
        service.cancel(email, job.getId());
        assertEquals(JobStatus.CANCELED, job.getStatus());
        verify(quotas).settlePrinted(job, 2);
    }

    private void manualJob() {
        job = new PrintJob(job.getOwner(), "review.pdf", "review.pdf", 10, 4, 1,
            ColorMode.MONOCHROME, DuplexMode.MANUAL, Instant.now().plusSeconds(600));
        job.assignPrinter(printer);
        job.useDirectIpp(endpoint);
        when(jobs.findByIdForUpdate(job.getId())).thenReturn(Optional.of(job));
    }
}
