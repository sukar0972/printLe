package io.printle.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Service
public class RateLimitService {
    private final ConcurrentMap<String, Bucket> ipBuckets = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Bucket> emailBuckets = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Bucket> uploadBuckets = new ConcurrentHashMap<>();

    private Bucket createIpBucket() {
        return Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(10).refillGreedy(10, Duration.ofMinutes(1)).build())
            .build();
    }

    private Bucket createEmailBucket() {
        return Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(5).refillGreedy(5, Duration.ofMinutes(1)).build())
            .build();
    }

    private Bucket createUploadBucket() {
        return Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(10).refillGreedy(10, Duration.ofMinutes(1)).build())
            .build();
    }

    public record RateLimitResult(boolean allowed, long retryAfterSeconds) {
        public static RateLimitResult ok() {
            return new RateLimitResult(true, 0);
        }

        public static RateLimitResult rejected(long retryAfterSeconds) {
            return new RateLimitResult(false, Math.max(1, retryAfterSeconds));
        }
    }

    public RateLimitResult tryLogin(String ip, String email) {
        Bucket ipBucket = ipBuckets.computeIfAbsent(ip != null ? ip : "unknown", k -> createIpBucket());
        ConsumptionProbe ipProbe = ipBucket.tryConsumeAndReturnRemaining(1);
        if (!ipProbe.isConsumed()) {
            long waitSec = (long) Math.ceil(ipProbe.getNanosToWaitForRefill() / 1_000_000_000.0);
            return RateLimitResult.rejected(waitSec);
        }

        if (email != null && !email.isBlank()) {
            String normEmail = email.trim().toLowerCase();
            Bucket emailBucket = emailBuckets.computeIfAbsent(normEmail, k -> createEmailBucket());
            ConsumptionProbe emailProbe = emailBucket.tryConsumeAndReturnRemaining(1);
            if (!emailProbe.isConsumed()) {
                long waitSec = (long) Math.ceil(emailProbe.getNanosToWaitForRefill() / 1_000_000_000.0);
                return RateLimitResult.rejected(waitSec);
            }
        }

        return RateLimitResult.ok();
    }

    public RateLimitResult tryUpload(String user) {
        String key = user != null ? user.trim().toLowerCase() : "anonymous";
        Bucket bucket = uploadBuckets.computeIfAbsent(key, k -> createUploadBucket());
        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (!probe.isConsumed()) {
            long waitSec = (long) Math.ceil(probe.getNanosToWaitForRefill() / 1_000_000_000.0);
            return RateLimitResult.rejected(waitSec);
        }
        return RateLimitResult.ok();
    }

    public void reset() {
        ipBuckets.clear();
        emailBuckets.clear();
        uploadBuckets.clear();
    }
}
