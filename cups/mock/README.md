# Development CUPS mock printers

This image runs a real CUPS scheduler with controllable backend queues. It is included only by `compose.dev.yaml`; production Compose does not expose or start it.

| Queue | Behavior |
| --- | --- |
| `mock-success` | Captures the job and completes immediately. |
| `mock-delay` | Remains processing for `MOCK_PRINT_DELAY_SECONDS`, then completes. |
| `mock-cancel` | Returns the CUPS backend cancel status. |
| `mock-hold` | Returns the CUPS backend hold status. |
| `mock-stop` | Stops the queue using the CUPS backend stop status. |

Start the development stack:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build cups
```

The CUPS web interface is available only on the local machine at <http://127.0.0.1:8631>. Submit a PDF from the host with:

```bash
lp -h 127.0.0.1:8631 -d mock-success example.pdf
lpstat -h 127.0.0.1:8631 -W all -o
```

Captured documents, submitted options, and results are stored in the `cups_mock_output` volume under a directory for each printer and CUPS job ID. They can be inspected with:

```bash
docker compose -f compose.yaml -f compose.dev.yaml exec cups \
  find /var/spool/printle-mock -maxdepth 3 -type f -print
```

The mock queues use raw mode because they test printLe's CUPS lifecycle and submitted IPP options, not a particular printer driver. Hardware-specific rendering still requires tests against supported physical printers.
