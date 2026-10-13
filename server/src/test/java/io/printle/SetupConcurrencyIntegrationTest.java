package io.printle;

import io.printle.auth.AuthController;
import io.printle.user.AppUserRepository;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = "printle.bootstrap-admin-password=change-me-now")
@Import(PostgresTestConfiguration.class)
class SetupConcurrencyIntegrationTest {
    @Autowired AuthController controller;
    @Autowired AppUserRepository users;

    @Test void concurrentSetupRequestsCreateExactlyOneAdministrator() throws Exception {
        assertThat(users.count()).isZero();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var requests = List.of("first@test.local", "second@test.local").stream()
                .map(email -> executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Setup start timed out");
                    try {
                        controller.completeSetup(new AuthController.SetupRequest(email, "Administrator", "test-password-123"));
                        return 204;
                    } catch (ResponseStatusException e) {
                        return e.getStatusCode().value();
                    }
                })).toList();
            boolean bothReady = ready.await(10, TimeUnit.SECONDS);
            start.countDown();
            assertThat(bothReady).isTrue();
            assertThat(List.of(requests.get(0).get(30, TimeUnit.SECONDS), requests.get(1).get(30, TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(204, 409);
        }
        assertThat(users.count()).isEqualTo(1);
        assertThat(controller.setup()).containsEntry("required", false);
    }
}
