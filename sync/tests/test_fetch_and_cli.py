from __future__ import annotations

import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from crossroads_sync.__main__ import main
from crossroads_sync.fetch import fetch_raw
from vamsys.client import ResponseError

NOW = datetime(2026, 11, 10, 18, 0, tzinfo=timezone.utc)
CONFIG = Path(__file__).parents[2] / "site.config.json"


class FakeClient:
    def __init__(self, fail: set[str] | None = None):
        self.fail = fail or set()
        self.calls: list[tuple[str, dict]] = []

    def _maybe_fail(self, path):
        if path in self.fail:
            raise ResponseError("GET request returned HTTP 403", 403)

    def get_collection(self, path, query=None):
        self.calls.append((path, dict(query or {})))
        self._maybe_fail(path)
        if path == "/fleet":
            return [{"id": 1, "code": "C25C"}, {"id": 2, "code": "TRN1", "hide_in_phoenix": True}]
        return []

    def get_json(self, path, query=None):
        self.calls.append((path, dict(query or {})))
        self._maybe_fail(path)
        return {"data": []}


class FetchTests(unittest.TestCase):
    def test_reads_expected_endpoints_with_get_only_client(self):
        client = FakeClient()
        raw, unavailable = fetch_raw(client, now=NOW)
        paths = [path for path, _ in client.calls]
        for expected in ("/fleet", "/airports", "/routes", "/hubs", "/ranks", "/flight-map", "/activities/events", "/pireps", "/statistics/airline"):
            self.assertIn(expected, paths)
        self.assertEqual(unavailable, [])
        self.assertIn("/fleet/1/aircraft", paths)
        self.assertNotIn("/fleet/2/aircraft", paths, "hidden fleets must not be expanded")
        pireps_query = dict(client.calls)["/pireps"]
        self.assertEqual(pireps_query["filter[status]"], "accepted")
        stats_queries = [q for p, q in client.calls if p == "/statistics/airline"]
        self.assertEqual(stats_queries[1]["from"], "2026-10-11T18:00:00Z")

    def test_optional_failure_degrades(self):
        raw, unavailable = fetch_raw(FakeClient(fail={"/flight-map", "/activities/events"}), now=NOW)
        self.assertEqual(sorted(unavailable), ["events", "flight_map"])
        self.assertIsNone(raw["flight_map"])

    def test_required_failure_raises(self):
        with self.assertRaises(ResponseError):
            fetch_raw(FakeClient(fail={"/routes"}), now=NOW)


class CliTests(unittest.TestCase):
    def test_sample_mode_writes_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "data" / "snapshot.json"
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                code = main(["--sample", "--config", str(CONFIG), "--output", str(out)])
            self.assertEqual(code, 0)
            self.assertIn("status=ok source=sample", stdout.getvalue())
            document = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(document["source"], "sample")
            self.assertEqual([p.name for p in out.parent.iterdir()], ["snapshot.json"])

    def test_live_mode_without_credentials_fails_cleanly_and_keeps_old_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "snapshot.json"
            out.write_text("previous", encoding="utf-8")
            env = {k: v for k, v in os.environ.items() if not k.startswith("VAMSYS_")}
            env["VAMSYS_CLIENT_SECRET"] = "s3cret-value"
            stderr = io.StringIO()
            with mock.patch.dict(os.environ, env, clear=True), redirect_stderr(stderr), redirect_stdout(io.StringIO()):
                code = main(["--config", str(CONFIG), "--output", str(out)])
            self.assertEqual(code, 2)
            self.assertIn("status=error category=ConfigurationError", stderr.getvalue())
            self.assertNotIn("s3cret-value", stderr.getvalue())
            self.assertEqual(out.read_text(encoding="utf-8"), "previous")


if __name__ == "__main__":
    unittest.main()
