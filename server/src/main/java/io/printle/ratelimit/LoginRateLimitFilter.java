package io.printle.ratelimit;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

public class LoginRateLimitFilter extends OncePerRequestFilter {
    private final RateLimitService rateLimitService;
    private final ObjectMapper objectMapper;
    private final ClientAddressResolver addresses;

    public LoginRateLimitFilter(RateLimitService rateLimitService, ObjectMapper objectMapper, ClientAddressResolver addresses) {
        this.rateLimitService = rateLimitService;
        this.objectMapper = objectMapper;
        this.addresses = addresses;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if ("POST".equalsIgnoreCase(request.getMethod()) && "/api/auth/login".equals(request.getRequestURI())) {
            String ip = addresses.resolve(request);
            String email = request.getParameter("email");
            var result = rateLimitService.tryLogin(ip, email);
            if (!result.allowed()) {
                response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
                response.setHeader("Retry-After", String.valueOf(result.retryAfterSeconds()));
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                objectMapper.writeValue(response.getWriter(), Map.of("error", "Too many login attempts. Please try again later."));
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

}
