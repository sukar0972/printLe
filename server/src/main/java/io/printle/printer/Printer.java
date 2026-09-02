package io.printle.printer;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import java.math.BigDecimal;
import io.printle.job.PrintNodeClient;

@Entity
@Table(name = "printer")
public class Printer {
    @Id private UUID id;
    @Column(nullable = false) private String name;
    private String description;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private PrinterStatus status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "cups_queue", unique = true, length = 127) private String cupsQueue;
    @Column(length = 160) private String location;
    @Column(nullable = false) private boolean enabled;
    @Column(nullable = false) private boolean maintenance;
    @Column(name = "color_capable", nullable = false) private boolean colorCapable;
    @Column(name = "duplex_capable", nullable = false) private boolean duplexCapable;
    @Column(name = "media_supported", length = 500) private String mediaSupported;
    @Column(name = "state_reasons", length = 1000) private String stateReasons;
    @Enumerated(EnumType.STRING) @Column(name = "error_policy", nullable = false) private PrinterErrorPolicy errorPolicy;
    @Column(name = "transport", length = 30) private String transport;
    @Column(name = "vendor_id", length = 20) private String vendorId;
    @Column(name = "product_id", length = 20) private String productId;
    @Column(name = "device_serial", length = 160) private String deviceSerial;
    @Column(name = "ieee1284_device_id", length = 500) private String ieee1284DeviceId;
    @Column(name = "last_seen_at") private Instant lastSeenAt;
    @Column(name = "mono_page_rate", precision = 10, scale = 4, nullable = false) private BigDecimal monoPageRate;
    @Column(name = "color_page_rate", precision = 10, scale = 4, nullable = false) private BigDecimal colorPageRate;
    @Column(name = "rate_version", nullable = false) private int rateVersion;
    protected Printer() {}
    public Printer(String name, String description) {
        this.id = UUID.randomUUID(); this.name = name.trim(); this.description = description;
        this.status = PrinterStatus.UNCONFIGURED; this.createdAt = Instant.now(); this.updatedAt = createdAt;
        this.enabled = true; this.errorPolicy = PrinterErrorPolicy.BLOCK;
        this.monoPageRate = new BigDecimal("0.05"); this.colorPageRate = new BigDecimal("0.20"); this.rateVersion = 1;
    }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public PrinterStatus getStatus() { return status; }
    public String getCupsQueue() { return cupsQueue; }
    public String getLocation() { return location; }
    public boolean isEnabled() { return enabled; }
    public boolean isMaintenance() { return maintenance; }
    public boolean isColorCapable() { return colorCapable; }
    public boolean isDuplexCapable() { return duplexCapable; }
    public String getMediaSupported() { return mediaSupported; }
    public String getStateReasons() { return stateReasons; }
    public PrinterErrorPolicy getErrorPolicy() { return errorPolicy; }
    public String getTransport() { return transport; }
    public String getVendorId() { return vendorId; }
    public String getProductId() { return productId; }
    public String getDeviceSerial() { return deviceSerial; }
    public String getIeee1284DeviceId() { return ieee1284DeviceId; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public BigDecimal getMonoPageRate() { return monoPageRate; }
    public BigDecimal getColorPageRate() { return colorPageRate; }
    public int getRateVersion() { return rateVersion; }

    public void configure(String name, String description, String location, boolean enabled, boolean maintenance,
                          PrinterErrorPolicy errorPolicy, BigDecimal monoRate, BigDecimal colorRate) {
        this.name = name.trim(); this.description = description; this.location = location; this.enabled = enabled;
        this.maintenance = maintenance; this.errorPolicy = errorPolicy;
        if (monoRate.compareTo(monoPageRate) != 0 || colorRate.compareTo(colorPageRate) != 0) rateVersion++;
        this.monoPageRate = monoRate; this.colorPageRate = colorRate; this.updatedAt = Instant.now();
    }

    public void synchronize(PrintNodeClient.PrinterProfile profile) {
        boolean firstDiscovery = this.cupsQueue == null;
        this.cupsQueue = profile.queue();
        if (firstDiscovery) { this.name = profile.name(); this.location = profile.location(); }
        this.status = PrinterStatus.valueOf(profile.status());
        this.colorCapable = profile.color(); this.duplexCapable = profile.duplex();
        this.mediaSupported = String.join(",", profile.media()); this.stateReasons = String.join(",", profile.reasons());
        if (profile.device() != null) {
            this.transport = profile.device().transport(); this.vendorId = profile.device().vendorId();
            this.productId = profile.device().productId(); this.deviceSerial = profile.device().serial();
            this.ieee1284DeviceId = profile.device().deviceId();
        }
        this.lastSeenAt = Instant.now(); this.updatedAt = lastSeenAt;
    }
    public void markMissing() {
        this.status = PrinterStatus.OFFLINE; this.stateReasons = "not-seen-by-print-node"; this.updatedAt = Instant.now();
    }
}
