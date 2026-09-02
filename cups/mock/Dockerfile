FROM debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
        cups=2.4.2-3+deb12u9 \
        cups-client=2.4.2-3+deb12u9 \
        cups-filters=1.28.17-3+deb12u1 \
    && rm -rf /var/lib/apt/lists/*

COPY cupsd.conf /etc/cups/cupsd.conf
COPY mockprint /usr/lib/cups/backend/mockprint
COPY entrypoint.sh /usr/local/bin/printle-cups-entrypoint

RUN chmod 0755 /usr/lib/cups/backend/mockprint /usr/local/bin/printle-cups-entrypoint \
    && mkdir -p /var/spool/printle-mock \
    && chown lp:lp /var/spool/printle-mock

EXPOSE 631
VOLUME ["/var/spool/printle-mock"]

ENTRYPOINT ["/usr/local/bin/printle-cups-entrypoint"]
