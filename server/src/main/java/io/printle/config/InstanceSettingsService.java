package io.printle.config;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InstanceSettingsService {
    private final InstanceSettingsRepository settings; private final PrintleProperties defaults;
    public InstanceSettingsService(InstanceSettingsRepository settings, PrintleProperties defaults) { this.settings = settings; this.defaults = defaults; }
    @Transactional public InstanceSettings current() { return settings.findById(1).orElseGet(() -> settings.save(new InstanceSettings(defaults))); }
}
