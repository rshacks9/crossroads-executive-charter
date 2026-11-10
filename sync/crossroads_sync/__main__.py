"""Write the public site snapshot.

    python -B -m crossroads_sync --config ../site.config.json --output ../site/public/data/snapshot.json
    python -B -m crossroads_sync --sample --config ../site.config.json --output ../site/public/data/snapshot.json

Live mode reads VAMSYS_CLIENT_ID and VAMSYS_CLIENT_SECRET from the environment (VAMSYS_BASE_URL is
optional). Output is printed as counts only: no names, URLs, tokens or response bodies.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .snapshot import build_snapshot

SAMPLE_RAW = Path(__file__).with_name("sample_raw.json")
PREVIEW_RAW = Path(__file__).with_name("preview_raw.json")


def write_atomic(path: Path, document: dict[str, Any], *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        payload = json.dumps(document, ensure_ascii=False, indent=1, sort_keys=False) + "\n"
    handle, temp_name = tempfile.mkstemp(prefix=".snapshot-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    except BaseException:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def run_live(site: dict[str, Any], now: datetime) -> tuple[dict[str, Any], list[str]]:
    from vamsys.client import ClientConfig, VamsysClient
    from vamsys.official import BASE_URL

    from .fetch import fetch_raw

    env = dict(os.environ)
    env.setdefault("VAMSYS_BASE_URL", BASE_URL)
    client = VamsysClient(ClientConfig.from_env(env))
    page_size = int(env.get("CROSSROADS_PAGE_SIZE", "100"))
    return fetch_raw(client, now=now, page_size=page_size)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="crossroads_sync")
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--sample", action="store_true", help="use bundled fictional test data, no network")
    mode.add_argument("--preview", action="store_true", help="use the real schedule mirror (preview_raw.json), no network")
    args = parser.parse_args(argv)

    site = json.loads(args.config.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    if args.sample or args.preview:
        source_file, source = (SAMPLE_RAW, "sample") if args.sample else (PREVIEW_RAW, "preview")
        raw = json.loads(source_file.read_text(encoding="utf-8"))
        snapshot = build_snapshot(raw, site, now=now, source=source)
    else:
        from vamsys.client import VamsysError

        try:
            raw, unavailable = run_live(site, now)
        except VamsysError as error:
            # Class name only: messages may echo status details we do not want in CI logs.
            print(f"status=error category={type(error).__name__}", file=sys.stderr)
            return 2
        snapshot = build_snapshot(raw, site, now=now, source="vamsys", unavailable=unavailable)

    write_atomic(args.output, snapshot)

    # Crew Tools briefings (live weather, runway winds, fuel, approach cards) go in a separate file
    # next to the snapshot so the main snapshot stays small. Sample mode stays fully offline.
    crew_status = "skipped"
    if not args.sample:
        crew_status = write_crew(snapshot, args.output.with_name("crew.json"), now)

    print(
        "status=ok source={source} live={live} fleet={fleet} routes={routes} hubs={hubs} "
        "events={events} recent={recent} unavailable={unavailable}".format(
            source=snapshot["source"],
            live=len(snapshot["live"]),
            fleet=len(snapshot["fleet"]),
            routes=len(snapshot["routes"]),
            hubs=len(snapshot["hubs"]),
            events=len(snapshot["events"]),
            recent=len(snapshot["recent_flights"]),
            unavailable=",".join(snapshot["unavailable"]) or "none",
        )
        + f" crew={crew_status}"
    )
    return 0


def write_crew(snapshot: dict[str, Any], path: Path, now: datetime) -> str:
    from .crew import build_crew, fetch_weather

    weather = None
    status = "ok"
    if os.environ.get("CROSSROADS_NO_WEATHER") != "1":
        try:
            weather = fetch_weather(snapshot["airports"].keys())
        except Exception as error:  # network/API problems must never block a deploy
            print(f"warning: weather unavailable ({type(error).__name__})", file=sys.stderr)
            status = "no-weather"
    else:
        status = "no-weather"
    write_atomic(path, build_crew(snapshot, now=now, weather_raw=weather), compact=True)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
