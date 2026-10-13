#!/usr/bin/env python3
"""Read-only check that the shared printLe dev stack is the one to drive."""

import json
import sys
import urllib.error
import urllib.request

UI = "http://127.0.0.1:5173/"
API = "http://127.0.0.1:8081/api/auth/me"
WEB_CONTAINER = "printle-web-1"


def fetch(url: str) -> int:
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main() -> int:
    problems: list[str] = []
    try:
        ui = fetch(UI)
    except Exception as error:  # noqa: BLE001 — report any connection failure
        ui = 0
        problems.append(f"UI {UI} did not answer: {error}")
    else:
        if ui != 200:
            problems.append(f"UI {UI} returned {ui}, expected 200")
        else:
            print(f"ui {UI} {ui}")

    try:
        api = fetch(API)
    except Exception as error:  # noqa: BLE001
        api = 0
        problems.append(f"API {API} did not answer: {error}")
    else:
        if api not in (200, 401):
            problems.append(f"API {API} returned {api}, expected 200 or 401")
        else:
            print(f"api {API} {api}")

    try:
        import subprocess

        listed = subprocess.run(
            ["docker", "ps", "--filter", f"name={WEB_CONTAINER}", "--format", "{{.Names}} {{.Status}}"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        line = next((row for row in listed.stdout.splitlines() if row.startswith(WEB_CONTAINER)), "")
    except Exception as error:  # noqa: BLE001
        line = ""
        problems.append(f"docker ps failed: {error}")
    if not line:
        problems.append(f"{WEB_CONTAINER} is not running; refusing to drive an unidentified UI")
    elif "healthy" not in line and "Up" not in line:
        problems.append(f"{WEB_CONTAINER} is not up: {line}")
    else:
        print(f"container {line}")

    if problems:
        print(json.dumps({"ok": False, "problems": problems}))
        return 1
    print(json.dumps({"ok": True, "ui": ui, "api": api}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
