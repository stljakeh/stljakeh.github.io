#!/usr/bin/env python3
"""Prefetch ESPN team + schedule payloads server-side (GitHub Action).

Browsers increasingly can't rely on live ESPN fetches (the bare team
endpoint sends no CORS headers; public CORS proxies are flaky and
rate-limited). This fetches every dashboard/others team up front and writes
Sports/data/espn-prefetch.json, which the dashboard reads same-origin to
paint instantly — live fetches then revalidate behind it on the refresh cycle.

Payloads are trimmed to exactly the fields the render path reads (mirrors
STL.api.trimEspnTeam/trimEspnEvent in Sports/js/api.js):
  team: {record, standingSummary, nextEvent[]}
  events: [{id, date, seasonType?, name?,
            competitions: [{status, competitors, venue?, broadcasts?,
                            odds?, seasonType?}]}]
  competitors: [{team: {id, abbreviation, displayName}, homeAway,
                 score, winner}]

Stdlib only. Teams that fail are omitted (their cards load live as before).
Writes NOTHING and exits nonzero when zero teams succeed.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

BASE = "https://site.api.espn.com/apis/site/v2/sports"
UA = {"User-Agent": "stljakeh.github.io-espn/1.0"}
# (cardClass, sport, leagueSlug, espnId) — mirrors STL.config TEAMS +
# OTHER_TEAMS, minus the non-ESPN entries (KBO/NPB).
TEAMS = [
    ("cardinals", "baseball", "mlb", "24"),
    ("blues", "hockey", "nhl", "19"),
    ("city-sc", "soccer", "usa.1", "21812"),
    ("battlehawks", "football", "ufl", "112651"),
    ("steelers", "football", "nfl", "23"),
    ("bayern", "soccer", "ger.1", "132"),
    ("forest", "soccer", "eng.1", "393"),
    ("grampus", "soccer", "jpn.1", "7108"),
    ("kholood", "soccer", "ksa.1", "22028"),
    ("usmnt", "soccer", "fifa.world", "660"),
    ("germany", "soccer", "fifa.world", "481"),
    ("cougars", "basketball", "mens-college-basketball", "2565"),
    ("cougars-soccer", "soccer", "usa.ncaa.m.1", "17412"),
]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return json.loads(resp.read().decode("utf-8", "ignore"))


def trim_competitor(x):
    t = x.get("team") or {}
    return {
        "team": {"id": t.get("id"), "abbreviation": t.get("abbreviation"),
                 "displayName": t.get("displayName")},
        "homeAway": x.get("homeAway"),
        "score": x.get("score"),
        "winner": x.get("winner") is True,
    }


def trim_event(e):
    comps = e.get("competitions") or []
    if not comps or not isinstance(comps[0], dict):
        return None
    c = comps[0]
    tc = {"status": c.get("status"),
          "competitors": [trim_competitor(x) for x in (c.get("competitors") or [])]}
    for k in ("venue", "broadcasts", "odds", "seasonType"):
        if c.get(k):
            tc[k] = c[k]
    out = {"id": e.get("id"), "date": e.get("date"), "competitions": [tc]}
    if e.get("seasonType"):
        out["seasonType"] = e["seasonType"]
    if e.get("name"):
        out["name"] = e["name"]
    return out


def trim_team(t):
    if not t:
        return None
    return {
        "record": t.get("record"),
        "standingSummary": t.get("standingSummary") or "",
        "nextEvent": [e for e in
                      (trim_event(x) for x in (t.get("nextEvent") or [])) if e],
    }


def main():
    out = {"generated_at": datetime.now(timezone.utc).isoformat(), "teams": {}}
    failed = []
    for card_class, sport, slug, tid in TEAMS:
        base = "%s/%s/%s/teams/%s" % (BASE, sport, slug, tid)
        try:
            team = (get(base).get("team") or {})
            events = get(base + "/schedule").get("events") or []
            out["teams"][card_class] = {
                "team": trim_team(team),
                "events": [e for e in (trim_event(x) for x in events) if e],
            }
            print("%-15s team+schedule ok (%d events)" % (card_class, len(events)))
        except Exception as e:
            failed.append(card_class)
            print("%-15s FAIL %s" % (card_class, e), file=sys.stderr)
    if not out["teams"]:
        print("zero teams succeeded", file=sys.stderr)
        return 1
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "espn-prefetch.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
        f.write("\n")
    size_kb = os.path.getsize(dest) // 1024
    print("wrote %s (%d KB, %d/%d teams%s)" % (
        dest, size_kb, len(out["teams"]), len(TEAMS),
        "" if not failed else ", failed: " + ",".join(failed)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
