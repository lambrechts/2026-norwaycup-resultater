#!/usr/bin/env python3
"""Fetch selected Norway Cup teams and write their matches to CSV."""

from __future__ import annotations

import csv
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


API_URL = "https://norwaycup.cupmanager.net/rest/results_api/call"
OUTPUT = Path("data/results.csv")
TEAMS = {
    75750516: "G16 Varegg Fotball/Sandviken Gul",
    75750514: "G16 Varegg Fotball/Sandviken Blå",
    76353121: "J14 Sandviken/Varegg Blå",
    76353123: "J14 Sandviken/Varegg Hvit",
    76353119: "J14 Sandviken/Varegg Rød",
}

# CupManager uses JSON5-like syntax for expansion fields. Scalar fields are
# returned automatically; these expansions fetch the related entities.
EXPANSION = (
    "{matches:[{home:{team:{club:{}}},away:{team:{club:{}}},result:{},"
    "division:{stage:{},category:{}},arena:{location:{}}}]}"
)

FIELDS = [
    "tracked_team_id",
    "tracked_team_name",
    "match_id",
    "start_time",
    "status",
    "match_number",
    "category",
    "stage",
    "group",
    "home_team",
    "away_team",
    "home_goals",
    "away_goals",
    "winner",
    "arena",
    "source_url",
]


def fetch_team(team_id: int, attempts: int = 3) -> dict[str, Any]:
    call = f"Team({{id:{team_id}}}){EXPANSION}"
    url = f"{API_URL}?{urlencode({'call': call})}"
    request = Request(url, headers={"User-Agent": "norwaycup-results/1.0"})

    for attempt in range(1, attempts + 1):
        try:
            with urlopen(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts:
                raise
            time.sleep(attempt * 2)
    raise AssertionError("unreachable")


def dereference(value: Any, responses: dict[str, Any], seen: frozenset[str] = frozenset()) -> Any:
    """Recursively replace CupManager href objects with their entities."""
    if isinstance(value, list):
        return [dereference(item, responses, seen) for item in value]
    if not isinstance(value, dict):
        return value
    if set(value) == {"href"}:
        href = value["href"]
        if href in seen:
            return None
        item = responses.get(href)
        if not item or "entity" not in item:
            return None
        return dereference(item["entity"], responses, seen | {href})
    return {key: dereference(item, responses, seen) for key, item in value.items()}


def display_name(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("fullName", "clubName", "name", "nb", "no", "sv", "en"):
            if value.get(key):
                return display_name(value[key])
    return ""


def start_time(timestamp: Any) -> str:
    if not isinstance(timestamp, (int, float)):
        return ""
    # The API timestamp is Unix milliseconds. Keep an explicit UTC offset so
    # spreadsheet programs interpret it as a point in time, not local text.
    return datetime.fromtimestamp(timestamp / 1000, ZoneInfo("Europe/Oslo")).isoformat(timespec="minutes")


def status(match: dict[str, Any]) -> str:
    if match.get("finished"):
        return "finished"
    if match.get("live"):
        return "live"
    return "scheduled"


def match_rows(team_id: int, label: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    responses = payload.get("responses", {})
    root_key = f"Team({{id:{team_id}}})"
    root = responses.get(root_key, {}).get("entity")
    if not root:
        raise RuntimeError(f"Norway Cup returned no team data for {team_id}")
    team = dereference(root, responses)
    matches = team.get("matches") or []
    rows = []

    for match in matches:
        if not match:
            continue
        home = match.get("home") or {}
        away = match.get("away") or {}
        result = match.get("result") or {}
        division = match.get("division") or {}
        arena = match.get("arena") or {}
        winner = result.get("winner") or ""
        rows.append(
            {
                "tracked_team_id": team_id,
                "tracked_team_name": label,
                "match_id": match.get("id", ""),
                "start_time": start_time(match.get("start")),
                "status": status(match),
                "match_number": match.get("matchNr", ""),
                "category": display_name((division.get("category") or {}).get("name")),
                "stage": display_name((division.get("stage") or {}).get("name")),
                "group": display_name(division.get("name")),
                "home_team": display_name(home.get("name")),
                "away_team": display_name(away.get("name")),
                "home_goals": result.get("homeGoals", "") if match.get("finished") or match.get("live") else "",
                "away_goals": result.get("awayGoals", "") if match.get("finished") or match.get("live") else "",
                "winner": winner if match.get("finished") else "",
                "arena": arena.get("completeName") or arena.get("fieldName") or "",
                "source_url": f"https://norwaycup.cupmanager.net/2026,nb/result/team/{team_id}",
            }
        )
    return rows


def main() -> None:
    rows: list[dict[str, Any]] = []
    for team_id, label in TEAMS.items():
        print(f"Fetching {label} ({team_id})")
        rows.extend(match_rows(team_id, label, fetch_team(team_id)))

    rows.sort(key=lambda row: (row["start_time"], str(row["tracked_team_id"]), str(row["match_id"])))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    with temporary.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    temporary.replace(OUTPUT)
    print(f"Wrote {len(rows)} rows to {OUTPUT}")


if __name__ == "__main__":
    main()
