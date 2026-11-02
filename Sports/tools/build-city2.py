#!/usr/bin/env python3
"""Prefetch St. Louis CITY2 career scoring leaders (GitHub Action).

CITY2 is not on FootyAccess, so its leaders come from the MLS stats API
(stats-api.mlssoccer.com) - the same feed family the dashboard already uses
for CITY2's record. That API is cursor-paginated (~270 rows per page, the
whole league is 1200+ rows per season) and each page is ~900 KB, so this
stays server-side instead of shipping five league-wide fetches to browsers.

Regular season only (MLS-COM-000003), matching the record on the card.
Career = every season the API has player stats for (2023 onward; 2022
returns 404). Sums goals, appearances, cards and minutes per player while
they were at CITY2. Writes Sports/data/city2-leaders.json, which the
dashboard reads same-origin next to the CITY2 record.

Page fetch failure -> that season is skipped. No seasons left -> writes
NOTHING and exits nonzero, so the last good data persists.

Stdlib only.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

COMP = "MLS-COM-000003"
TEAM_ID = "MLS-CLU-00001G"
SEASONS = "https://stats-api.mlssoccer.com/competitions/%s/seasons" % COMP
STATS = ("https://stats-api.mlssoccer.com/statistics/players/competitions/"
         "%s/seasons/" % COMP)
UA = {"User-Agent": "stljakeh.github.io-city2/1.0"}


def get_json(url, timeout=90):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return json.loads(resp.read().decode("utf-8", "ignore"))


def season_ids():
    data = get_json(SEASONS)
    out = []
    for s in data.get("seasons") or []:
        sid = s.get("season_id")
        if sid:
            out.append((sid, s.get("season")))
    return out


def season_rows(sid):
    rows = []
    token = None
    for _ in range(40):
        url = STATS + urllib.parse.quote(sid) + "?per_page=2000"
        if token:
            url += "&page_token=" + urllib.parse.quote(token)
        data = get_json(url)
        rows.extend(data.get("player_statistics") or [])
        token = data.get("next_page_token")
        if not token:
            break
    return rows


def main():
    totals = {}
    used = []
    for sid, label in season_ids():
        try:
            rows = season_rows(sid)
        except Exception as e:
            print("season %s (%s) skipped: %s" % (sid, label, e), file=sys.stderr)
            continue
        ours = [r for r in rows if r.get("team_id") == TEAM_ID]
        if not ours:
            print("season %s (%s): no CITY2 rows" % (sid, label), file=sys.stderr)
            continue
        used.append(label)
        for r in ours:
            pid = r.get("player_id")
            if not pid:
                continue
            name = " ".join(p for p in (
                r.get("player_first_name"), r.get("player_last_name")) if p)
            t = totals.setdefault(pid, {
                "name": name,
                "gk": bool(r.get("goal_keeper")),
                "goals": 0, "assists": 0, "apps": 0,
                "yellow": 0, "red": 0, "minutes": 0
            })
            t["goals"] += int(r.get("goals") or 0)
            t["assists"] += int(r.get("assists") or 0)
            t["apps"] += int(r.get("matches_played") or 0)
            t["yellow"] += int(r.get("cards_yellow") or 0)
            t["red"] += int(r.get("cards_red") or 0)
            t["minutes"] += int(r.get("normalized_player_minutes") or 0)
    if not totals:
        print("no player totals parsed", file=sys.stderr)
        return 1

    ranked = sorted(totals.values(),
                    key=lambda t: (-t["goals"], -t["apps"], t["name"]))
    players = []
    for t in ranked[:3]:
        players.append({
            "pos": "GK" if t["gk"] else "",
            "name": t["name"],
            "line": "%d G \u00b7 %d apps" % (t["goals"], t["apps"]),
            "yellow": t["yellow"],
            "red": t["red"],
            "minutes": t["minutes"],
            "assists": t["assists"]
        })

    used = sorted(set(u for u in used if u))
    span = "%d-%d" % (used[0], used[-1]) if used else ""
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "team": "St. Louis CITY2",
        "team_id": TEAM_ID,
        "competition": "MLS NEXT Pro - Regular Season",
        "seasons": span,
        "prospectsNote": "career totals",
        "players": players,
    }
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                        "data", "city2-leaders.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    for p in players:
        print("%s (%s) | %s | %dY %dR | %d min" % (
            p["name"], p["pos"] or "?", p["line"],
            p["yellow"], p["red"], p["minutes"]))
    print("wrote", dest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
