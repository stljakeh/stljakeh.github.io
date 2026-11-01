#!/usr/bin/env python3
"""Prefetch St. Louis CITY academy data server-side (GitHub Action).

FootyAccess (footyaccess.com) server-renders the team page with the current
season's per-age-group aggregates AND every fixture, but sends no CORS
headers — so browsers can't read it directly. This parses initialTeam
(records) and initialMatches (last/next game per age group) out of the
Next.js flight data, then pulls career player totals from FootyAccess's own
JSON API (footy-access-dev.onrender.com/api) for the prospects rows.
Writes Sports/data/city-academy.json, which the dashboard reads same-origin.

Page parse failure -> writes NOTHING and exits nonzero, so the last good
data persists. API failure -> still writes records + fixtures, without
prospects (exit 0).

Stdlib only.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

PAGE = ("https://www.footyaccess.com/leagues/mls-next/teams/"
        "St.%20Louis%20City%20SC")
API = "https://footy-access-dev.onrender.com/api"
TEAM = "St. Louis City SC"
UA = {"User-Agent": "stljakeh.github.io-academy/1.0"}
AGES = ("U14", "U16", "U17", "U19")
MARKER = "self.__next_f.push([1,"
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return resp.read().decode("utf-8", "ignore")


def flight_strings(html):
    dec = json.JSONDecoder()
    for part in html.split(MARKER)[1:]:
        try:
            s, _ = dec.raw_decode(part.strip())
        except Exception:
            continue
        if isinstance(s, str):
            yield s


def flight_value(s, key):
    """Pull the JSON value that follows "key": out of a flight chunk."""
    i = s.find('"' + key + '"')
    if i < 0:
        return None
    j = i + len(key) + 2
    while j < len(s) and s[j] not in "{[":
        j += 1
    try:
        value, _ = json.JSONDecoder().raw_decode(s, j)
        return value
    except Exception:
        return None


def parse_page(html):
    for s in flight_strings(html):
        team = flight_value(s, "initialTeam")
        if not team:
            continue
        return team, (flight_value(s, "initialMatches") or [])
    raise RuntimeError("initialTeam not found")


def fmt_day(iso):
    try:
        return "%s %d" % (MONTHS[int(iso[5:7]) - 1], int(iso[8:10]))
    except (ValueError, IndexError):
        return iso


def stl_side(match):
    """(is_home, opponent, goals_for, goals_against) for a CITY match."""
    home = match["teams"]["home"]["name"] == TEAM
    them = match["teams"]["away" if home else "home"]["name"]
    goals = match.get("goals") or {}
    gf = goals.get("home" if home else "away")
    ga = goals.get("away" if home else "home")
    return home, them, gf, ga


def last_next(matches, age):
    ours = [m for m in matches if m.get("ageGroup") == age]
    played, upcoming = [], []
    for m in ours:
        iso = ((m.get("fixture") or {}).get("date")) or ""
        status = (((m.get("fixture") or {}).get("status")) or {}).get("short")
        if not iso:
            continue
        (played if status == "FT" else upcoming).append((iso, m))
    played.sort(key=lambda x: x[0])
    upcoming.sort(key=lambda x: x[0])
    out = {"lastGame": None, "nextGame": None}
    if played:
        iso, m = played[-1]
        home, them, gf, ga = stl_side(m)
        if gf is not None and ga is not None:
            res = "W" if gf > ga else "L" if gf < ga else "D"
            out["lastGame"] = "%s %d-%d %s %s · %s" % (
                res, gf, ga, "vs" if home else "@", them, fmt_day(iso))
        else:
            out["lastGame"] = "%s %s · %s" % (
                "vs" if home else "@", them, fmt_day(iso))
    if upcoming:
        iso, m = upcoming[0]
        home, them, _, _ = stl_side(m)
        out["nextGame"] = "%s %s · %s" % (
            "vs" if home else "@", them, fmt_day(iso))
    return out


def fetch_prospects():
    """Career totals per age group from FootyAccess's JSON API.

    The API's `team` filter is unreliable (it pads the list with other
    clubs), so fetch a wide window and filter on the exact team name.
    """
    url = API + "/insights/player-stats-from-events?team=" + \
        urllib.parse.quote(TEAM) + "&limit=2000"
    last = None
    for attempt in range(2):
        try:
            payload = json.loads(get(url, timeout=90))
            break
        except Exception as e:
            last = e
            if attempt == 0:
                time.sleep(3)
    else:
        raise RuntimeError("prospects API: %s" % last)
    players = ((payload or {}).get("data") or {}).get("players") or []
    by_age = {}
    for p in players:
        if p.get("team") != TEAM or p.get("ageGroup") not in AGES:
            continue
        if not p.get("goals"):
            continue
        by_age.setdefault(p["ageGroup"], []).append({
            "pos": p.get("position") or "",
            "name": p.get("name") or "",
            "line": "%d G · %d apps" % (p["goals"], p.get("appearances") or 0),
            "_goals": p["goals"],
            "_apps": p.get("appearances") or 0
        })
    out = {}
    for age, rows in by_age.items():
        rows.sort(key=lambda r: (-r["_goals"], -r["_apps"], r["name"]))
        out[age] = [{k: v for k, v in r.items() if not k.startswith("_")}
                    for r in rows[:3]]
    return out


def main():
    html = get(PAGE)
    initial, matches = parse_page(html)
    stats = (initial.get("stats") or {})
    groups = stats.get("ageGroupStats") or {}
    teams = {}
    for age in AGES:
        g = groups.get(age) or {}
        try:
            w, d, l = int(g["wins"]), int(g["draws"]), int(g["losses"])
        except (TypeError, ValueError, KeyError) as e:
            print("age %s: %s" % (age, e), file=sys.stderr)
            continue
        entry = {
            "record": {"wins": w, "losses": l, "ties": d,
                       "points": w * 3 + d},
            "goalsFor": g.get("goalsFor"),
            "goalsAgainst": g.get("goalsAgainst"),
            "played": g.get("played"),
        }
        entry.update(last_next(matches, age))
        teams[age] = entry
        print("%s: %d-%d-%d (%d pts, %s games) | last %s | next %s" % (
            age, w, l, d, w * 3 + d, g.get("played"),
            entry["lastGame"], entry["nextGame"]))
    if not teams:
        print("no age groups parsed", file=sys.stderr)
        return 1

    try:
        prospects = fetch_prospects()
    except Exception as e:
        print("prospects unavailable: %s" % e, file=sys.stderr)
        prospects = {}
    for age, rows in prospects.items():
        if age in teams:
            teams[age]["prospects"] = rows
        print("%s leaders: %s" % (age, ", ".join(
            "%s (%s)" % (r["name"], r["line"]) for r in rows)))

    from datetime import datetime, timezone
    filters = initial.get("filters") or {}
    out = {"generated_at": datetime.now(timezone.utc).isoformat(),
           "team": "St. Louis CITY SC Academy",
           "season": filters.get("seasonLabel"),
           "prospectsNote": "career totals",
           "teams": teams}
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "city-academy.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote", dest)
    return 0


if __name__ == "__main__":
    sys.exit(main())
