package io.printle.user;

import io.printle.audit.AuditService;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class UserImportService {
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    private static final String UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private static final String LOWER = "abcdefghijklmnopqrstuvwxyz";
    private static final String DIGITS = "0123456789";
    private static final String SPECIAL = "!@#$%^&*()-_=+";
    private static final String ALL = UPPER + LOWER + DIGITS + SPECIAL;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppUserRepository users;
    private final UserGroupRepository groups;
    private final PasswordEncoder passwords;
    private final AuditService audit;

    public UserImportService(AppUserRepository users, UserGroupRepository groups, PasswordEncoder passwords, AuditService audit) {
        this.users = users;
        this.groups = groups;
        this.passwords = passwords;
        this.audit = audit;
    }

    @Transactional
    public ImportSummary importUsers(InputStream inputStream, boolean dryRun, AppUser actor) {
        try (var reader = new InputStreamReader(inputStream, StandardCharsets.UTF_8)) {
            var format = CSVFormat.RFC4180.builder()
                .setHeader()
                .setSkipHeaderRecord(true)
                .setIgnoreHeaderCase(true)
                .setTrim(true)
                .build();

            var parser = new CSVParser(reader, format);
            var headerMap = parser.getHeaderMap();
            if (headerMap == null || headerMap.keySet().stream().noneMatch(h -> h.equalsIgnoreCase("email"))
                || headerMap.keySet().stream().noneMatch(h -> h.equalsIgnoreCase("displayName"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CSV must contain 'email' and 'displayName' header columns");
            }

            var seenEmails = new HashSet<String>();
            var rows = new ArrayList<RowResult>();
            int rowNum = 1;
            var everyoneGroup = !dryRun ? groups.findByName("Everyone").orElse(null) : null;

            for (CSVRecord record : parser) {
                rowNum++;
                var errors = new ArrayList<String>();

                String rawEmail = getField(record, "email");
                String displayName = getField(record, "displayName");
                String rawRole = getField(record, "role");
                String rawStatus = getField(record, "status");
                String rawQuota = getField(record, "monthlyPageQuota");
                String rawExempt = getField(record, "quotaExempt");
                String rawPassword = getField(record, "password");

                // Validate email
                String email = null;
                if (rawEmail == null || rawEmail.isBlank()) {
                    errors.add("Email is required");
                } else {
                    email = rawEmail.trim().toLowerCase();
                    if (!EMAIL_PATTERN.matcher(email).matches()) {
                        errors.add("Invalid email format");
                    } else if (email.length() > 255) {
                        errors.add("Email must not exceed 255 characters");
                    } else if (!seenEmails.add(email)) {
                        errors.add("Duplicate email in CSV file: " + email);
                    } else if (users.findByEmailIgnoreCase(email).isPresent()) {
                        errors.add("Email already exists: " + email);
                    }
                }

                // Validate displayName
                if (displayName == null || displayName.isBlank()) {
                    errors.add("Display name is required");
                } else if (displayName.length() > 120) {
                    errors.add("Display name must not exceed 120 characters");
                }

                // Validate role
                Role role = Role.USER;
                if (rawRole != null && !rawRole.isBlank()) {
                    try {
                        role = Role.valueOf(rawRole.trim().toUpperCase());
                    } catch (IllegalArgumentException e) {
                        errors.add("Invalid role: " + rawRole + " (must be USER, OPERATOR, MANAGER, or ADMIN)");
                    }
                }

                // Validate status
                UserStatus status = UserStatus.ACTIVE;
                if (rawStatus != null && !rawStatus.isBlank()) {
                    try {
                        status = UserStatus.valueOf(rawStatus.trim().toUpperCase());
                    } catch (IllegalArgumentException e) {
                        errors.add("Invalid status: " + rawStatus + " (must be ACTIVE or DISABLED)");
                    }
                }

                // Validate monthlyPageQuota
                Integer quota = null;
                if (rawQuota != null && !rawQuota.isBlank()) {
                    try {
                        quota = Integer.parseInt(rawQuota.trim());
                        if (quota < 0) {
                            errors.add("Monthly page quota must be non-negative");
                        }
                    } catch (NumberFormatException e) {
                        errors.add("Invalid monthly page quota integer: " + rawQuota);
                    }
                }

                // Validate quotaExempt
                boolean quotaExempt = false;
                if (rawExempt != null && !rawExempt.isBlank()) {
                    String norm = rawExempt.trim().toLowerCase();
                    if (List.of("true", "1", "yes", "t").contains(norm)) {
                        quotaExempt = true;
                    } else if (List.of("false", "0", "no", "f").contains(norm)) {
                        quotaExempt = false;
                    } else {
                        errors.add("Invalid quota exempt boolean: " + rawExempt);
                    }
                }

                // Validate password or generate temporary password
                String passwordToHash = null;
                String generatedPassword = null;
                boolean passwordChangeRequired = false;

                if (rawPassword != null && !rawPassword.isBlank()) {
                    if (rawPassword.length() < 12 || rawPassword.length() > 128) {
                        errors.add("Password must be between 12 and 128 characters");
                    } else {
                        passwordToHash = rawPassword;
                        passwordChangeRequired = false;
                    }
                } else {
                    generatedPassword = generateTemporaryPassword();
                    passwordToHash = generatedPassword;
                    passwordChangeRequired = true;
                }

                boolean success = errors.isEmpty();
                String exposedPassword = success ? generatedPassword : null;

                if (success && !dryRun) {
                    var user = new AppUser(email, displayName, passwords.encode(passwordToHash), role, status, quota, quotaExempt, passwordChangeRequired);
                    var saved = users.save(user);
                    if (everyoneGroup != null) {
                        everyoneGroup.addMember(saved);
                    }
                    audit.record(actor, "USER_CREATED", "USER", saved.getId().toString(), saved.getEmail());
                }

                rows.add(new RowResult(rowNum, email != null ? email : rawEmail, displayName, success, errors, exposedPassword));
            }

            int totalRows = rows.size();
            int validRows = (int) rows.stream().filter(RowResult::success).count();
            int importedRows = dryRun ? 0 : validRows;
            int errorRows = totalRows - validRows;

            return new ImportSummary(totalRows, validRows, importedRows, errorRows, dryRun, rows);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not parse CSV file: " + e.getMessage(), e);
        }
    }

    private String getField(CSVRecord record, String name) {
        for (String header : record.getParser().getHeaderNames()) {
            if (header.equalsIgnoreCase(name)) {
                return record.isMapped(header) ? record.get(header) : null;
            }
        }
        return null;
    }

    public static String generateTemporaryPassword() {
        var sb = new StringBuilder(16);
        sb.append(UPPER.charAt(RANDOM.nextInt(UPPER.length())));
        sb.append(LOWER.charAt(RANDOM.nextInt(LOWER.length())));
        sb.append(DIGITS.charAt(RANDOM.nextInt(DIGITS.length())));
        sb.append(SPECIAL.charAt(RANDOM.nextInt(SPECIAL.length())));
        for (int i = 4; i < 16; i++) {
            sb.append(ALL.charAt(RANDOM.nextInt(ALL.length())));
        }
        char[] chars = sb.toString().toCharArray();
        for (int i = chars.length - 1; i > 0; i--) {
            int j = RANDOM.nextInt(i + 1);
            char temp = chars[i];
            chars[i] = chars[j];
            chars[j] = temp;
        }
        return new String(chars);
    }

    public record RowResult(int rowNumber, String email, String displayName, boolean success, List<String> errors, String temporaryPassword) {}

    public record ImportSummary(int totalRows, int validRows, int importedRows, int errorRows, boolean dryRun, List<RowResult> rows) {}
}
