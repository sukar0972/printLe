package io.printle.ratelimit;

import io.github.bucket4j.Bucket;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Keeps active limits intact under key churn; excess keys share an overflow limit. */
final class BucketStore {
    private record Entry(Bucket bucket, long accessedAt) {}
    private final LinkedHashMap<String, Entry> entries = new LinkedHashMap<>(16, .75f, true);
    private final int capacity;
    private final long idleNanos;
    private final Supplier<Bucket> factory;
    private final LongSupplier ticker;
    private final Bucket overflow;

    BucketStore(int capacity, Duration idleTime, Supplier<Bucket> factory, LongSupplier ticker) {
        this.capacity = capacity;
        this.idleNanos = idleTime.toNanos();
        this.factory = factory;
        this.ticker = ticker;
        this.overflow = factory.get();
    }

    synchronized Bucket get(String key) {
        long now = ticker.getAsLong();
        var oldest = entries.entrySet().iterator();
        while (oldest.hasNext()) {
            if (now - oldest.next().getValue().accessedAt() < idleNanos) break;
            oldest.remove();
        }
        var entry = entries.get(key);
        if (entry != null) {
            entries.put(key, new Entry(entry.bucket(), now));
            return entry.bucket();
        }
        if (entries.size() >= capacity) return overflow;
        var bucket = factory.get();
        entries.put(key, new Entry(bucket, now));
        return bucket;
    }

    synchronized void clear() {
        entries.clear();
        overflow.reset();
    }
}
