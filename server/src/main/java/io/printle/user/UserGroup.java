package io.printle.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "user_group")
public class UserGroup {
    @Id private UUID id;
    @Column(nullable = false, unique = true) private String name;
    @Column(name = "monthly_page_quota") private Integer monthlyPageQuota;
    @Column(name = "built_in", nullable = false) private boolean builtIn;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @ManyToMany
    @JoinTable(name = "group_member", joinColumns = @JoinColumn(name = "group_id"), inverseJoinColumns = @JoinColumn(name = "user_id"))
    private Set<AppUser> members = new LinkedHashSet<>();

    protected UserGroup() {}
    public UserGroup(String name, boolean builtIn) {
        this.id = UUID.randomUUID(); this.name = name; this.builtIn = builtIn; this.createdAt = Instant.now();
    }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public Integer getMonthlyPageQuota() { return monthlyPageQuota; }
    public boolean isBuiltIn() { return builtIn; }
    public Set<AppUser> getMembers() { return members; }
    public void addMember(AppUser user) { members.add(user); }
}

