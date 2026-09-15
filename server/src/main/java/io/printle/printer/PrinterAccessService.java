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
        if (acls.existsByPrinterIdAndPermissionAndPrincipalTypeAndPrincipalIdIn(printer.getId(), permission, PrinterPrincipalType.USER, List.of(user.getId()))) return true;
        var groupIds = groups.findAllByMembersId(user.getId()).stream().map(UserGroup::getId).toList();
        return !groupIds.isEmpty() && acls.existsByPrinterIdAndPermissionAndPrincipalTypeAndPrincipalIdIn(printer.getId(), permission, PrinterPrincipalType.GROUP, groupIds);
    }
    public void require(String email, Printer printer, PrinterPermission permission) {
        if (!allowed(email, printer, permission)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not have permission to use this printer");
    }
}
