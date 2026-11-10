"""End to end: real VamsysClient + fetch_raw + build_snapshot against a loopback fake vAMSYS."""

from __future__ import annotations

import json
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from crossroads_sync.fetch import fetch_raw
from crossroads_sync.snapshot import build_snapshot
from vamsys.client import ClientConfig, VamsysClient

SAMPLE = json.loads((Path(__file__).parents[1] / "crossroads_sync" / "sample_raw.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)


def envelope(items, next_cursor=None):
    return {"data": items, "links": [], "meta": {"path": None, "per_page": 2, "next_cursor": next_cursor}}


class FakeVamsys(BaseHTTPRequestHandler):
    seen: list[tuple[str, str, dict]] = []

    def log_message(self, *args):  # keep test output clean
        pass

    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        form = parse_qs(self.rfile.read(length).decode())
        FakeVamsys.seen.append(("POST", self.path, form))
        if self.path == "/oauth/token" and form.get("scope") == ["ops:read"]:
            self._send(200, {"access_token": "tok", "token_type": "Bearer", "expires_in": 3600})
        else:
            self._send(400, {"error": "bad token request"})

    def do_GET(self):
        url = urlsplit(self.path)
        query = parse_qs(url.query)
        FakeVamsys.seen.append(("GET", url.path, query))
        if self.headers.get("Authorization") != "Bearer tok":
            return self._send(401, {})
        path = url.path.removeprefix("/api/v3/operations")
        if path == "/routes":
            routes = SAMPLE["routes"]
            # Two pages, to prove cursor pagination is followed.
            if query.get("page[cursor]") == ["p2"]:
                return self._send(200, envelope(routes[6:]))
            return self._send(200, envelope(routes[:6], "p2"))
        collections = {"/fleet": SAMPLE["fleet"], "/airports": SAMPLE["airports"], "/hubs": SAMPLE["hubs"], "/ranks": SAMPLE["ranks"], "/activities/events": SAMPLE["events"]}
        if path in collections:
            return self._send(200, envelope(collections[path]))
        if path.startswith("/fleet/") and path.endswith("/aircraft"):
            return self._send(200, envelope(SAMPLE["aircraft_by_fleet"].get(path.split("/")[2], [])))
        if path == "/statistics/airline":
            return self._send(200, SAMPLE["stats_all_time"])
        if path == "/flight-map":
            return self._send(503, {})  # optional section down
        if path == "/pireps":
            return self._send(200, envelope(SAMPLE["pireps"]))
        self._send(404, {})


class IntegrationTest(unittest.TestCase):
    def setUp(self):
        FakeVamsys.seen = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeVamsys)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        port = self.server.server_address[1]
        config = ClientConfig(
            base_url=f"http://127.0.0.1:{port}/api/v3/operations",
            client_id="id",
            client_secret="secret",
            allow_loopback_http=True,
            max_retries=0,
        )
        self.client = VamsysClient(config)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def test_full_pipeline(self):
        raw, unavailable = fetch_raw(self.client, now=NOW)
        snapshot = build_snapshot(raw, {"name": "Crossroad Executive & Charter"}, now=NOW, source="vamsys", unavailable=unavailable)

        self.assertEqual(unavailable, ["flight_map"])
        self.assertEqual(snapshot["live"], [])
        self.assertEqual(len(snapshot["routes"]), 11, "both route pages, hidden route dropped")
        self.assertEqual(len(snapshot["fleet"]), 5)
        self.assertEqual(snapshot["stats"]["all_time"]["flights"], 1284)
        self.assertEqual([r["callsign"] for r in snapshot["recent_flights"]][:2], ["CXC102", "CXC700"])

        methods = {(m, p) for m, p, _ in FakeVamsys.seen}
        self.assertEqual({m for m, _ in methods}, {"GET", "POST"})
        self.assertEqual([p for m, p in methods if m == "POST"], ["/oauth/token"])
        self.assertEqual(sum(1 for m, _, _ in FakeVamsys.seen if m == "POST"), 1, "token reused")
        self.assertNotIn(("GET", "/api/v3/operations/fleet/99/aircraft"), methods)


if __name__ == "__main__":
    unittest.main()
