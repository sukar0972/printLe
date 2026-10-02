package io.printle.printer;

import io.printle.user.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
public class PrinterAccessService {
    private final PrinterAclRepository acls; private final AppUserRepository users; private final UserGroupRepository groups;
    public PrinterAccessService(PrinterAclRepository acls, AppUserRepository users, UserGroupRepository groups) { this.acls = acls; this.users = users; this.groups = groups; }
    public boolean allowed(String email, Printer printer, PrinterPermission permission) {
        AppUser user = users.findByEmailIgnoreCase(email).orElseThrow();
        if (user.getRole() == Role.ADMIN) return true;
        if (acls.countByPrinterId(printer.getId()) == 0) return true;
        var groupIds = groups.findAllByMembersId(user.getId()).stream().map(UserGroup::getId).toList();
        for (var granted : satisfying(permission)) {
            if (acls.existsByPrinterIdAndPermissionAndPrincipalTypeAndPrincipalIdIn(printer.getId(), granted, PrinterPrincipalType.USER, List.of(user.getId()))) return true;
            if (!groupIds.isEmpty() && acls.existsByPrinterIdAndPermissionAndPrincipalTypeAndPrincipalIdIn(printer.getId(), granted, PrinterPrincipalType.GROUP, groupIds)) return true;
        }
        return false;
    }

    /** Stored permissions that satisfy a check. View does not include release. Submit, release, and manage include both. */
    private static Set<PrinterPermission> satisfying(PrinterPermission requested) {
        return switch (requested) {
            case VIEW -> EnumSet.of(PrinterPermission.VIEW, PrinterPermission.SUBMIT, PrinterPermission.RELEASE_OWN, PrinterPermission.RELEASE_ANY, PrinterPermission.MANAGE);
            case SUBMIT, RELEASE_OWN -> EnumSet.of(PrinterPermission.SUBMIT, PrinterPermission.RELEASE_OWN, PrinterPermission.RELEASE_ANY, PrinterPermission.MANAGE);
            case RELEASE_ANY -> EnumSet.of(PrinterPermission.RELEASE_ANY, PrinterPermission.MANAGE);
            case MANAGE -> EnumSet.of(PrinterPermission.MANAGE);
        };
    }
    public void require(String email, Printer printer, PrinterPermission permission) {
        if (!allowed(email, printer, permission)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to use this printer");
    }
}
