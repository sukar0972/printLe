package io.printle.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class BucketStoreTest {
    @Test void keyChurnDoesNotResetActiveLimitsAndOverflowIsShared() {
        var clock = new AtomicLong();
        var store = new BucketStore(2, Duration.ofMinutes(2), BucketStoreTest::bucket, clock::get);
        var existing = store.get("first");
        assertTrue(existing.tryConsume(1));
        store.get("second");
        assertTrue(store.get("excess-1").tryConsume(1));
        assertFalse(store.get("excess-2").tryConsume(1));
        assertSame(existing, store.get("first"));
        assertFalse(store.get("first").tryConsume(1));
    }

    @Test void expiredKeysFreeCapacityWithoutDroppingRecentlyUsedLimits() {
        var clock = new AtomicLong();
        var store = new BucketStore(2, Duration.ofMinutes(2), BucketStoreTest::bucket, clock::get);
        var idle = store.get("idle");
        var active = store.get("active");
        clock.set(Duration.ofMinutes(1).toNanos());
        store.get("active");
        clock.set(Duration.ofMinutes(2).toNanos());
        var fresh = store.get("new");
        assertSame(active, store.get("active"));
        assertNotSame(idle, fresh);
        assertTrue(fresh.tryConsume(1));
        assertTrue(store.get("overflow").tryConsume(1));
    }

    private static Bucket bucket() {
        return Bucket.builder().addLimit(Bandwidth.builder().capacity(1)
            .refillGreedy(1, Duration.ofDays(1)).build()).build();
    }
}
