package io.printle.user;

import io.printle.audit.AuditService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@RestController
@RequestMapping("/api/admin/groups")
@PreAuthorize("hasRole('ADMIN')")
public class AdminGroupController {
    private final UserGroupRepository groups; private final AppUserRepository users; private final AuditService audit;
    public AdminGroupController(UserGroupRepository groups, AppUserRepository users, AuditService audit) { this.groups = groups; this.users = users; this.audit = audit; }
    @GetMapping @Transactional(readOnly = true) public List<GroupView> list() { return groups.findAll().stream().map(GroupView::from).toList(); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    public GroupView create(@Valid @RequestBody GroupRequest request, Authentication auth) {
        if (groups.findByName(request.name()).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Group name already exists");
        var group = new UserGroup(request.name().trim(), false); group.update(request.name(), request.monthlyPageQuota()); groups.save(group);
        audit.record(actor(auth), "GROUP_CREATED", "GROUP", group.getId().toString(), group.getName()); return GroupView.from(group);
    }
    @PutMapping("/{id}") @Transactional
    public GroupView update(@PathVariable UUID id, @Valid @RequestBody GroupRequest request, Authentication auth) {
        var group = group(id); try { group.update(request.name(), request.monthlyPageQuota()); }
        catch (IllegalStateException e) { throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage()); }
        audit.record(actor(auth), "GROUP_UPDATED", "GROUP", id.toString(), group.getName()); return GroupView.from(group);
    }
    @PutMapping("/{id}/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void add(@PathVariable UUID id, @PathVariable UUID userId, Authentication auth) {
        var group = group(id); group.addMember(users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)));
        audit.record(actor(auth), "GROUP_MEMBER_ADDED", "GROUP", id.toString(), userId.toString());
    }
    @DeleteMapping("/{id}/members/{userId}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void remove(@PathVariable UUID id, @PathVariable UUID userId, Authentication auth) {
        var group = group(id); group.removeMember(users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)));
        audit.record(actor(auth), "GROUP_MEMBER_REMOVED", "GROUP", id.toString(), userId.toString());
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void delete(@PathVariable UUID id, Authentication auth) {
        var group = group(id); if (group.isBuiltIn()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Built-in groups cannot be deleted");
        groups.delete(group); audit.record(actor(auth), "GROUP_DELETED", "GROUP", id.toString(), group.getName());
    }
    private UserGroup group(UUID id) { return groups.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND)); }
    private AppUser actor(Authentication auth) { return users.findByEmailIgnoreCase(auth.getName()).orElseThrow(); }
    public record GroupRequest(@NotBlank @Size(max=120) String name, @Min(0) Integer monthlyPageQuota) {}
    public record MemberView(UUID id, String email, String displayName) { static MemberView from(AppUser u) { return new MemberView(u.getId(), u.getEmail(), u.getDisplayName()); } }
    public record GroupView(UUID id, String name, Integer monthlyPageQuota, boolean builtIn, List<MemberView> members) {
        static GroupView from(UserGroup g) { return new GroupView(g.getId(), g.getName(), g.getMonthlyPageQuota(), g.isBuiltIn(), g.getMembers().stream().map(MemberView::from).toList()); }
    }
}
