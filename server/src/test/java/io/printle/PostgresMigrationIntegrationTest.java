package io.printle;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
@Import(PostgresTestConfiguration.class)
class PostgresMigrationIntegrationTest {
    @Autowired DataSource dataSource;

    @Test void upgradesExistingJobsAndPreservesLedgerWhenJobsAreDeleted() {
        var jdbc = new JdbcTemplate(dataSource);
        String schema = "upgrade_" + UUID.randomUUID().toString().replace("-", "");
        try {
            Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
                .target("2").load().migrate();
            UUID user = UUID.randomUUID(), completed = UUID.randomUUID(), held = UUID.randomUUID();
            jdbc.update("insert into " + schema + ".app_user (id,email,display_name,password_hash,role,status,created_at,updated_at) "
                + "values (?, 'migration@test.local', 'Migration test', 'unused', 'USER', 'ACTIVE', now(), now())", user);
            for (UUID id : new UUID[]{completed, held}) {
                jdbc.update("insert into " + schema + ".print_job "
                    + "(id,owner_id,original_filename,storage_key,content_type,size_bytes,pages,copies,color_mode,duplex_mode,status,created_at,updated_at) "
                    + "values (?, ?, 'test.pdf', ?, 'application/pdf', 100, 3, 2, 'MONOCHROME', 'ONE_SIDED', ?, now(), now())",
                    id, user, id + ".pdf", id.equals(completed) ? "COMPLETED" : "HELD");
            }

            var flyway = Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema).load();
            flyway.migrate();
            assertEquals(0, flyway.info().pending().length);
            assertEquals(4, jdbc.queryForObject("select count(*) from " + schema + ".quota_ledger", Integer.class));
            assertEquals(6, jdbc.queryForObject("select pages from " + schema + ".quota_ledger where job_id = ? and entry_type = 'DEBIT'", Integer.class, completed));
            assertEquals(true, jdbc.queryForObject("select expires_at = created_at + interval '24 hours' from " + schema + ".print_job where id = ?", Boolean.class, held));
            // V3's PostgreSQL foreign key change must retain accounting after job retention cleanup.
            jdbc.update("delete from " + schema + ".print_job where id = ?", completed);
            assertEquals(3, jdbc.queryForObject("select count(*) from " + schema + ".quota_ledger where job_id is null", Integer.class));
        } finally {
            jdbc.execute("drop schema if exists " + schema + " cascade");
        }
    }
}
