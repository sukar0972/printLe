package io.printle.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.printle.user.AppUserRepository;
import io.printle.user.UserStatus;
import io.printle.audit.AuditService;
import io.printle.ratelimit.LoginRateLimitFilter;
import io.printle.ratelimit.RateLimitService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(PrintleProperties.class)
public class SecurityConfig {
    @Bean org.springframework.security.core.session.SessionRegistry sessionRegistry() {
        return new org.springframework.security.core.session.SessionRegistryImpl();
    }

    @Bean org.springframework.security.web.session.HttpSessionEventPublisher sessionEventPublisher() {
        return new org.springframework.security.web.session.HttpSessionEventPublisher();
    }

    @Bean PasswordEncoder passwordEncoder() { return Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8(); }

    @Bean UserDetailsService userDetailsService(AppUserRepository users) {
        return username -> users.findByEmailIgnoreCase(username)
            .filter(user -> user.getStatus() == UserStatus.ACTIVE)
            .map(user -> User.withUsername(user.getEmail()).password(user.getPasswordHash()).roles(user.getRole().name()).build())
            .orElseThrow(() -> new org.springframework.security.core.userdetails.UsernameNotFoundException("Invalid credentials"));
    }

    @Bean SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper objectMapper, AppUserRepository users, AuditService audit, org.springframework.security.core.session.SessionRegistry sessions, RateLimitService rateLimitService) throws Exception {
        var csrf = CookieCsrfTokenRepository.withHttpOnlyFalse();
        csrf.setCookiePath("/");
        var handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        return http
            .addFilterBefore(new LoginRateLimitFilter(rateLimitService, objectMapper), org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter.class)
            .csrf(config -> config.csrfTokenRepository(csrf).csrfTokenRequestHandler(handler)
                .ignoringRequestMatchers("/api/fake-printer/ipp/*"))
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"))
                .frameOptions(frame -> frame.deny())
                .contentTypeOptions(options -> {}))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/fake-printer/ipp/*").permitAll()
                .requestMatchers("/actuator/health/**", "/api/auth/csrf", "/api/auth/login").permitAll()
                .anyRequest().authenticated())
            .sessionManagement(session -> session.maximumSessions(-1).sessionRegistry(sessions)
                .expiredSessionStrategy(event -> {
                    event.getResponse().setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    event.getResponse().setContentType(MediaType.APPLICATION_JSON_VALUE);
                    objectMapper.writeValue(event.getResponse().getWriter(), java.util.Map.of("error", "Session revoked; sign in again"));
                }))
            .formLogin(form -> form
                .loginProcessingUrl("/api/auth/login")
                .usernameParameter("email")
                .passwordParameter("password")
                .successHandler((request, response, authentication) -> {
                    users.findByEmailIgnoreCase(authentication.getName()).ifPresent(user -> {
                        user.signedIn(); users.save(user); audit.record(user, "LOGIN_SUCCESS", "SESSION", null, request.getRemoteAddr());
                    });
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    objectMapper.writeValue(response.getWriter(), java.util.Map.of("authenticated", true));
                })
                .failureHandler((request, response, exception) -> {
                    var email = request.getParameter("email");
                    users.findByEmailIgnoreCase(email == null ? "" : email).ifPresent(user -> audit.record(user, "LOGIN_FAILURE", "SESSION", null, request.getRemoteAddr()));
                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    objectMapper.writeValue(response.getWriter(), java.util.Map.of("error", "Invalid email or password"));
                }))
            .logout(logout -> logout.logoutUrl("/api/auth/logout").logoutSuccessHandler((request, response, auth) -> {
                if (auth != null) users.findByEmailIgnoreCase(auth.getName()).ifPresent(user -> audit.record(user, "LOGOUT", "SESSION", null, request.getRemoteAddr()));
                response.setStatus(204);
            }))
            .exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> {
                response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                objectMapper.writeValue(response.getWriter(), java.util.Map.of("error", "Authentication required"));
            }))
            .build();
    }
}
