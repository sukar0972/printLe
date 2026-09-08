#!/usr/bin/env python3
import json
import os
import re
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

CUPS = os.getenv("CUPS_SERVER", "cups:631")
CUPS_AUTHORITY = CUPS.split("/", 1)[0]
DATA = Path(os.getenv("PRINT_NODE_DATA", "/var/lib/print-node"))
STATE_FILE = DATA / "submissions.json"
LOCK = threading.Lock()
MAX_PDF = 30 * 1024 * 1024
QUEUE_RE = re.compile(r"^[A-Za-z0-9._-]+$")
TOKEN = os.getenv("PRINT_NODE_TOKEN", "development-only-token")
MOCK_PROFILES = os.getenv("PRINT_NODE_MOCK_PROFILES", "true").lower() == "true"
PROFILES = [
    {"queue": "mock-success", "name": "Studio Color", "location": "Main office", "status": "ONLINE", "enabled": True,
     "color": True, "duplex": True, "media": ["A4", "LETTER"], "reasons": [],
     "device": {"transport": "MOCK_USB", "vendorId": "1209", "productId": "0001", "serial": "PRINTLE-COLOR-001", "deviceId": "MFG:printLe;MDL:Color Mock;"}},
    {"queue": "mock-mono", "name": "Reception Mono", "location": "Reception", "status": "ONLINE", "enabled": True,
     "color": False, "duplex": True, "media": ["A4", "LETTER"], "reasons": [],
     "device": {"transport": "MOCK_USB", "vendorId": "1209", "productId": "0002", "serial": "PRINTLE-MONO-001", "deviceId": "MFG:printLe;MDL:Mono Mock;"}},
    {"queue": "mock-simple", "name": "Warehouse Simplex", "location": "Warehouse", "status": "ONLINE", "enabled": True,
     "color": False, "duplex": False, "media": ["A4"], "reasons": [],
     "device": {"transport": "MOCK_USB", "vendorId": "1209", "productId": "0003", "serial": "PRINTLE-SIMPLEX-001", "deviceId": "MFG:printLe;MDL:Simplex Mock;"}},
    {"queue": "mock-jam", "name": "Training Room Jam", "location": "Training room", "status": "ERROR", "enabled": True,
     "color": True, "duplex": True, "media": ["A4", "LETTER"], "reasons": ["media-jam"],
     "device": {"transport": "MOCK_USB", "vendorId": "1209", "productId": "0004", "serial": "PRINTLE-JAM-001", "deviceId": "MFG:printLe;MDL:Fault Mock;"}},
    {"queue": "mock-offline", "name": "Disconnected USB", "location": "Lab", "status": "OFFLINE", "enabled": False,
     "color": False, "duplex": False, "media": ["A4"], "reasons": ["offline"],
     "device": {"transport": "MOCK_USB", "vendorId": "1209", "productId": "0003", "serial": None, "deviceId": "MFG:printLe;MDL:Simplex Mock;"}},
]

DATA.mkdir(parents=True, exist_ok=True)

def run(args, timeout=30):
    return subprocess.run(args, text=True, capture_output=True, timeout=timeout, check=False)

def load_submissions():
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def save_submissions(value):
    temp = STATE_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(value, sort_keys=True))
    os.replace(temp, STATE_FILE)

def status(job_id):
    uri = f"ipp://{CUPS_AUTHORITY}/jobs/{job_id}"
    result = run(["ipptool", "-tv", "-d", f"job_uri={uri}", uri,
                  "/usr/share/cups/ipptool/get-job-attributes.test"], 8)
    output = result.stdout + "\n" + result.stderr
    if result.returncode:
        raise RuntimeError(output.strip() or "CUPS did not return the job")
    state_match = re.search(r"job-state \(enum\) = ([a-z-]+)", output)
    reasons_match = re.search(r"job-state-reasons \(keyword\) = ([^\r\n]+)", output)
    if not state_match:
        raise RuntimeError("CUPS response did not contain job-state")
    return {"jobId": int(job_id), "state": state_match.group(1),
            "reasons": reasons_match.group(1).strip() if reasons_match else ""}

def cups_profiles():
    result = run(["lpstat", "-h", CUPS, "-e"], 8)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout).strip() or "CUPS printer discovery failed")
    known = {profile["queue"]: profile for profile in PROFILES} if MOCK_PROFILES else {}
    profiles = []
    for queue in (line.strip() for line in result.stdout.splitlines()):
        if not queue:
            continue
        if queue in known:
            profiles.append(known[queue])
            continue
        state = run(["lpstat", "-h", CUPS, "-p", queue, "-l"], 5)
        text = (state.stdout + "\n" + state.stderr).lower()
        option_result = run(["lpoptions", "-h", CUPS, "-p", queue, "-l"], 5)
        options = option_result.stdout.lower()
        uri_result = run(["lpstat", "-h", CUPS, "-v", queue], 5)
        uri_match = re.search(r"device for [^:]+:\s*(\S+)", uri_result.stdout, re.I)
        uri = uri_match.group(1) if uri_match else ""
        serial = None
        serial_match = re.search(r"(?:serial|serialnumber)=([^&;]+)", uri, re.I)
        if serial_match:
            serial = serial_match.group(1)
        profiles.append({
            "queue": queue, "name": queue.replace("-", " ").title(), "location": "CUPS",
            "status": "OFFLINE" if "disabled" in text else "ERROR" if "error" in text else "ONLINE",
            "enabled": "disabled" not in text,
            "color": "color" in options, "duplex": "duplex" in options or "two-sided" in options,
            "media": sorted(set(re.findall(r"\b(?:a[345]|letter|legal|tabloid)\b", options, re.I))) or ["UNKNOWN"],
            "reasons": ["cups-disabled"] if "disabled" in text else [],
            "device": {"transport": uri.split(":", 1)[0].upper() if uri else "CUPS", "vendorId": None,
                       "productId": None, "serial": serial, "deviceId": uri or None}
        })
    # Mock profiles deliberately include a disconnected device that CUPS cannot enumerate.
    if MOCK_PROFILES:
        for profile in PROFILES:
            if profile["queue"] not in {item["queue"] for item in profiles}:
                profiles.append(profile)
    return profiles

class Handler(BaseHTTPRequestHandler):
    server_version = "PrintLePrintNode/1"

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)

    def reply(self, code, value):
        body = json.dumps(value).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        if self.headers.get("X-Print-Node-Token") == TOKEN:
            return True
        self.reply(401, {"error": "Print-node authentication required"})
        return False

    def do_GET(self):
        if self.path == "/health":
            result = run(["lpstat", "-h", CUPS, "-r"], 3)
            return self.reply(200 if result.returncode == 0 else 503,
                              {"ok": result.returncode == 0})
        if not self.authorized():
            return
        if self.path == "/printers":
            try:
                return self.reply(200, cups_profiles())
            except Exception as exc:
                return self.reply(502, {"error": str(exc)})
        match = re.fullmatch(r"/jobs/(\d+)", urlparse(self.path).path)
        if not match:
            return self.reply(404, {"error": "Not found"})
        try:
            return self.reply(200, status(int(match.group(1))))
        except Exception as exc:
            return self.reply(502, {"error": str(exc)})

    def do_POST(self):
        if not self.authorized():
            return
        parsed = urlparse(self.path)
        cancel_match = re.fullmatch(r"/jobs/(\d+)/cancel", parsed.path)
        if cancel_match:
            result = run(["cancel", "-h", CUPS, cancel_match.group(1)], 8)
            return self.reply(204 if result.returncode == 0 else 502,
                              {} if result.returncode == 0 else {"error": (result.stderr or result.stdout).strip()})
        match = re.fullmatch(r"/jobs/([0-9a-fA-F-]{36})", parsed.path)
        if not match:
            return self.reply(404, {"error": "Not found"})
        queue = parse_qs(parsed.query).get("queue", [""])[0]
        if not QUEUE_RE.fullmatch(queue):
            return self.reply(400, {"error": "Invalid queue"})
        length = int(self.headers.get("Content-Length", "0"))
        if length < 5 or length > MAX_PDF:
            return self.reply(413, {"error": "Invalid PDF size"})
        key = match.group(1).lower()
        with LOCK:
            submissions = load_submissions()
            if key in submissions:
                saved = submissions[key]
                try:
                    current = status(saved["jobId"])
                    current["queue"] = saved["queue"]
                    return self.reply(200, current)
                except Exception:
                    return self.reply(200, saved)
            content = self.rfile.read(length)
            if not content.startswith(b"%PDF-"):
                return self.reply(415, {"error": "Only PDF is supported"})
            duplex = self.headers.get("X-Print-Duplex", "ONE_SIDED")
            sides = {"ONE_SIDED": "one-sided", "TWO_SIDED_LONG_EDGE": "two-sided-long-edge",
                     "TWO_SIDED_SHORT_EDGE": "two-sided-short-edge", "MANUAL": "one-sided"}.get(duplex)
            if not sides:
                return self.reply(422, {"error": "Manual duplex is not supported by CUPS release yet"})
            color = "color" if self.headers.get("X-Print-Color") == "COLOR" else "monochrome"
            copies = min(100, max(1, int(self.headers.get("X-Print-Copies", "1"))))
            title = self.headers.get("X-Print-Title", "document.pdf")[:255]
            user = self.headers.get("X-Print-User", "printle")[:127]
            path = None
            try:
                with tempfile.NamedTemporaryFile(dir=DATA, suffix=".pdf", delete=False) as pdf:
                    pdf.write(content); path = pdf.name
                command = ["lp", "-h", CUPS, "-d", queue, "-t", title, "-U", user,
                           "-n", str(copies), "-o", f"sides={sides}", "-o", f"print-color-mode={color}"]
                page_set = self.headers.get("X-Print-Page-Set", "").lower()
                if page_set in ("odd", "even"):
                    command += ["-o", f"page-set={page_set}"]
                    if page_set == "even": command += ["-o", "output-order=reverse"]
                result = run(command + [path])
                found = re.search(r"request id is .+-(\d+)", result.stdout + result.stderr)
                if result.returncode or not found:
                    return self.reply(502, {"error": (result.stderr or result.stdout).strip()})
                job_id = int(found.group(1))
                try:
                    value = status(job_id)
                except Exception:
                    value = {"jobId": job_id, "state": "pending", "reasons": "none"}
                value["queue"] = queue
                submissions[key] = value
                save_submissions(submissions)
                return self.reply(201, value)
            finally:
                if path:
                    Path(path).unlink(missing_ok=True)

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
