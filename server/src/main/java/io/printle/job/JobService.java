package io.printle.job;

import io.printle.audit.AuditService;
import io.printle.config.PrintleProperties;
import io.printle.user.AppUser;
import io.printle.user.AppUserRepository;
import org.apache.pdfbox.Loader;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.*;
import java.util.List;
import java.util.UUID;

@Service
public class JobService {
    private final PrintJobRepository jobs; private final AppUserRepository users;
    private final AuditService audit; private final Path storage;
    public JobService(PrintJobRepository jobs, AppUserRepository users, AuditService audit, PrintleProperties properties) throws IOException {
        this.jobs = jobs; this.users = users; this.audit = audit; this.storage = Path.of(properties.storagePath()).toAbsolutePath().normalize();
        Files.createDirectories(storage);
    }

    @Transactional
    public PrintJob create(String email, MultipartFile file, int copies, ColorMode color, DuplexMode duplex) {
        if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF to upload");
        if (copies < 1 || copies > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Copies must be between 1 and 100");
        byte[] bytes;
        try { bytes = file.getBytes(); } catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read upload", e); }
        if (bytes.length < 5 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F' || bytes[4] != '-')
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only PDF files are supported");
        int pages;
        try (var document = Loader.loadPDF(bytes)) { pages = document.getNumberOfPages(); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF is invalid or encrypted", e); }
        if (pages < 1) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The PDF has no pages");
        var owner = users.findByEmailIgnoreCase(email).orElseThrow();
        var originalName = safeName(file.getOriginalFilename());
        var storageKey = UUID.randomUUID() + ".pdf";
        try { Files.write(storage.resolve(storageKey), bytes, StandardOpenOption.CREATE_NEW); }
        catch (IOException e) { throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Could not store upload", e); }
        var job = jobs.save(new PrintJob(owner, originalName, storageKey, bytes.length, pages, copies, color, duplex));
        audit.record(owner, "JOB_UPLOADED", "PRINT_JOB", job.getId().toString(), originalName);
        return job;
    }

    @Transactional(readOnly = true)
    public List<PrintJob> list(String email) {
        var owner = users.findByEmailIgnoreCase(email).orElseThrow();
        return jobs.findAllByOwnerIdOrderByCreatedAtDesc(owner.getId());
    }

    @Transactional
    public void cancel(String email, UUID id) {
        var job = ownedJob(email, id);
        if (job.getStatus() != JobStatus.HELD) throw new ResponseStatusException(HttpStatus.CONFLICT, "Only held jobs can be cancelled");
        job.cancel();
        try { Files.deleteIfExists(storage.resolve(job.getStorageKey())); } catch (IOException ignored) {}
        audit.record(job.getOwner(), "JOB_CANCELLED", "PRINT_JOB", id.toString(), job.getOriginalFilename());
    }

    @Transactional(readOnly = true)
    public QuotaView quota(String email, int defaultLimit) {
        AppUser owner = users.findByEmailIgnoreCase(email).orElseThrow();
        int limit = owner.getMonthlyPageQuota() == null ? defaultLimit : owner.getMonthlyPageQuota();
        int pending = jobs.findAllByOwnerIdOrderByCreatedAtDesc(owner.getId()).stream()
            .filter(job -> job.getStatus() == JobStatus.HELD || job.getStatus() == JobStatus.RELEASE_QUEUED)
            .mapToInt(job -> job.getPages() * job.getCopies()).sum();
        return new QuotaView(limit, 0, pending, owner.isQuotaExempt() ? null : Math.max(0, limit - pending), owner.isQuotaExempt());
    }

    private PrintJob ownedJob(String email, UUID id) {
        var job = jobs.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!job.getOwner().getEmail().equalsIgnoreCase(email)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return job;
    }
    private String safeName(String name) {
        String value = name == null || name.isBlank() ? "document.pdf" : Path.of(name).getFileName().toString();
        value = value.replaceAll("[\\p{Cntrl}]", "");
        return value.length() > 255 ? value.substring(value.length() - 255) : value;
    }
    public record QuotaView(int limit, int used, int pending, Integer remaining, boolean exempt) {}
}

