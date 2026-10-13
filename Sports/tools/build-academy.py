#!/usr/bin/env python3
"""Prefetch St. Louis CITY academy records server-side (GitHub Action).

FootyAccess (footyaccess.com) serves per-age-group MLS NEXT aggregates
server-rendered in its Next.js flight data, but sends no CORS headers — so
browsers can't read it directly. This extracts initialTeam.stats.ageGroupStats
and writes Sports/data/city-academy.json, which the dashboard reads
same-origin. No match-level data exists server-side (last/next games stay
manual config entries).

Stdlib only. On total failure (fetch fails, shape changes) writes NOTHING and
exits nonzero, so the last good data persists.
"""
import json
import os
import sys
import urllib.request

PAGE = ("https://www.footyaccess.com/leagues/mls-next/teams/"
        "St.%20Louis%20City%20SC")
UA = {"User-Agent": "stljakeh.github.io-academy/1.0"}
AGES = ("U14", "U16", "U17", "U19")
MARKER = "self.__next_f.push([1,"


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
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


def extract_initial_team(html):
    for s in flight_strings(html):
        idx = s.find('"initialTeam"')
        if idx < 0:
            continue
        start = s.find("{", idx + len('"initialTeam"'))
        if start < 0:
            continue
        depth = 0
        in_str = False
        esc = False
        for i in range(start, len(s)):
            ch = s[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(s[start:i + 1])
                        except Exception:
                            break
    raise RuntimeError("initialTeam not found")


def main():
    html = get(PAGE)
    initial = extract_initial_team(html)
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
        teams[age] = {
            "record": {"wins": w, "losses": l, "ties": d,
                       "points": w * 3 + d},
            "goalsFor": g.get("goalsFor"),
            "goalsAgainst": g.get("goalsAgainst"),
            "played": g.get("played"),
        }
        print("%s: %d-%d-%d (%d pts, %s games)" % (
            age, w, l, d, w * 3 + d, g.get("played")))
    if not teams:
        print("no age groups parsed", file=sys.stderr)
        return 1
    from datetime import datetime, timezone
    out = {"generated_at": datetime.now(timezone.utc).isoformat(),
           "team": "St. Louis CITY SC Academy",
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
