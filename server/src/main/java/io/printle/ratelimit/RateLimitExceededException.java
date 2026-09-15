package io.printle.ratelimit;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class RateLimitExceededException extends ResponseStatusException {
    private final HttpHeaders headers;

    public RateLimitExceededException(String message, long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, message);
        this.headers = new HttpHeaders();
        this.headers.set("Retry-After", String.valueOf(Math.max(1, retryAfterSeconds)));
    }

    @Override
    public HttpHeaders getResponseHeaders() {
        return headers;
    }

    @Override
    public HttpHeaders getHeaders() {
        return headers;
    }
}
