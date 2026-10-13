package io.printle.user;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;
import java.util.List;

public interface UserGroupRepository extends JpaRepository<UserGroup, UUID> {
    Optional<UserGroup> findByName(String name);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select g from UserGroup g where g.name = :name")
    Optional<UserGroup> findByNameForUpdate(@org.springframework.data.repository.query.Param("name") String name);
    List<UserGroup> findAllByMembersId(UUID userId);
}
