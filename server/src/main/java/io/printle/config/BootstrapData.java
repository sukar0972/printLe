package io.printle.config;

import io.printle.user.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class BootstrapData implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BootstrapData.class);
    private final AppUserRepository users; private final UserGroupRepository groups;
    private final PasswordEncoder passwords; private final PrintleProperties properties;
    public BootstrapData(AppUserRepository users, UserGroupRepository groups, PasswordEncoder passwords, PrintleProperties properties) {
        this.users = users; this.groups = groups; this.passwords = passwords; this.properties = properties;
    }
    @Override @Transactional public void run(ApplicationArguments args) {
        groups.findByName("Everyone").orElseGet(() -> groups.save(new UserGroup("Everyone", true)));
        if (users.count() > 0) return;
        if (!usableBootstrapPassword(properties.bootstrapAdminPassword())) {
            log.info("No users yet. Complete Getting started in the web UI, or set PRINTLE_BOOTSTRAP_ADMIN_PASSWORD.");
            return;
        }
        var everyone = groups.findByName("Everyone").orElseThrow();
        var admin = users.save(new AppUser(properties.bootstrapAdminEmail(), "Administrator",
            passwords.encode(properties.bootstrapAdminPassword()), Role.ADMIN));
        everyone.addMember(admin);
        log.warn("Created bootstrap administrator {}. Change its password before exposing printLe.", admin.getEmail());
    }

    static boolean usableBootstrapPassword(String password) {
        return password != null && password.length() >= 12
            && !password.startsWith("replace-with-")
            && !password.equals("change-me-now");
    }
}
