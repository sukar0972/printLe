package io.printle.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Locale;

@Service
public class RateLimitService {
    private final BucketStore ipBuckets = store(10);
    private final BucketStore emailBuckets = store(5);
    private final BucketStore uploadBuckets = store(10);

    private static BucketStore store(int limit) {
        // A bucket fully refills in one minute, so dropping an idle entry after two is safe.
        return new BucketStore(10_000, Duration.ofMinutes(2), () -> bucket(limit), System::nanoTime);
    }

    private static Bucket bucket(int limit) {
        return Bucket.builder()
            .addLimit(Bandwidth.builder().capacity(limit).refillGreedy(limit, Duration.ofMinutes(1)).build())
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
        var result = consume(ipBuckets.get(key(ip, "unknown")));
        if (!result.allowed()) return result;
        if (email != null && !email.isBlank()) {
            return consume(emailBuckets.get(key(email, "unknown")));
        }

        return RateLimitResult.ok();
    }

    public RateLimitResult tryUpload(String user) {
        return consume(uploadBuckets.get(key(user, "anonymous")));
    }

    private static String key(String value, String fallback) {
        String normalized = value == null ? fallback : value.trim().toLowerCase(Locale.ROOT);
        // Bound key memory as well as the number of entries.
        return normalized.length() > 256 ? normalized.substring(0, 256) : normalized;
    }

    private static RateLimitResult consume(Bucket bucket) {
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
