#!/usr/bin/env python3
"""Prefetch the Rakuten Eagles' last game server-side (GitHub Action).

npb.jp sends no CORS headers, so browsers can't scrape the official team
calendar directly. This replicates the parse and writes
Sports/data/npb-lastgame.json, which the dashboard reads same-origin.

Source: https://npb.jp/bis/eng/teams/calendar_e_{MM}.html (+ _index.html for
the current month). Each played day carries a score cell like
  <div class="tescore"><a href="/bis/eng/2026/games/s2026100501982.html">E 3 - 1 H</a></div>
  <div class="terslt">W</div><div class="testdm">(Rakuten Mobile)</div>
The walk starts at the current-month page and goes backward (10..04) until a
month with a final — so it works in-season and all offseason with year-agnostic
URLs. The game date comes from the box-score link (sYYYYMMDD), never the page.

Stdlib only. On total failure (no finals anywhere) writes NOTHING and exits
nonzero, so the last good data persists.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://npb.jp"
TEAM_PAGE = BASE + "/bis/eng/teams/calendar_e_{}.html"
MONTHS = ["index", "10", "09", "08", "07", "06", "05", "04"]
UA = {"User-Agent": "stljakeh.github.io-npb/1.0"}
MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# Stadiums that mean a Rakuten home game.
HOME_MARKS = ("rakuten", "miyagi", "sendai", "mobile", "kobo")

# Calendar score-cell abbreviations -> display names (unknown codes fall back
# to the abbreviation itself, never blank).
ABBR_NAMES = {
    "T": "Hanshin Tigers",
    "DB": "DeNA BayStars",
    "G": "Yomiuri Giants",
    "D": "Chunichi Dragons",
    "C": "Hiroshima Carp",
    "S": "Yakult Swallows",
    "H": "SoftBank Hawks",
    "F": "Nippon-Ham Fighters",
    "B": "Orix Buffaloes",
    "L": "Seibu Lions",
    "M": "Lotte Marines",
}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return resp.read().decode("utf-8", "ignore")


def parse_month(html):
    """Return [(date_iso, ours, opp, opp_abbr, home, result, box_url)]."""
    out = []
    cells = re.findall(r'teschedule[^>]*>(.*?)</td>', html, re.S)
    for c in cells:
        dm = re.search(r'teschedate[^0-9]*([0-9]+)', c)
        sm = re.search(r'tescore[^>]*><a href="([^"]+)">([^<]+)</a>', c)
        rm = re.search(r'terslt[^A-Z]*([A-Z]+)', c)
        if not (dm and sm and rm):
            continue
        vm = re.search(r'testdm[^A-Za-z(]*\(([^)]+)\)', c)
        venue = vm.group(1).strip() if vm else ""
        m = re.match(r'\s*([A-Z]+)\s+(\d+)\s*-\s*(\d+)\s+([A-Z]+)\s*', sm.group(2))
        if not m:
            continue
        abbr_a, runs_a, runs_b, abbr_b = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
        if abbr_a == "E":
            ours, opp_runs, opp_abbr = runs_a, runs_b, abbr_b
            e_first = True
        elif abbr_b == "E":
            ours, opp_runs, opp_abbr = runs_b, runs_a, abbr_a
            e_first = False
        else:
            continue
        vl = venue.lower()
        if venue and any(mark in vl for mark in HOME_MARKS):
            home = True
        elif venue:
            home = False
        else:
            home = e_first
        res = rm.group(1)
        # Exact game date from the box-score link (sYYYYMMDD...).
        date_iso = None
        season = None
        lm = re.search(r'/(\d{4})/games/s(\d{4})(\d{2})(\d{2})', sm.group(1))
        if lm:
            season = lm.group(1)
            date_iso = "%s-%s-%s" % (lm.group(2), lm.group(3), lm.group(4))
        out.append({
            "date": date_iso,
            "day": int(dm.group(1)),
            "ours": ours,
            "opp_runs": opp_runs,
            "opp": opp_abbr,
            "home": home,
            "result": res,
            "box": urllib.parse.urljoin(BASE + "/", sm.group(1)),
            "season": season,
        })
    return out


def main():
    games = []
    for key in MONTHS:
        try:
            html = get(TEAM_PAGE.format(key))
        except Exception as e:
            print("month %s: %s" % (key, e), file=sys.stderr)
            continue
        month_games = [g for g in parse_month(html) if g["result"] in ("W", "L", "D")]
        if month_games:
            games = month_games
            break
    if not games:
        print("no finals found in any month", file=sys.stderr)
        return 1
    games.sort(key=lambda g: (g["date"] or "", g["day"]))
    g = games[-1]
    cls = "win" if g["result"] == "W" else ("loss" if g["result"] == "L" else "draw")
    if g["date"]:
        y, m, d = g["date"].split("-")
        date_label = "%s %d" % (MONTH_ABBR[int(m) - 1], int(d))
    else:
        date_label = "day %d" % g["day"]
    opp_name = ABBR_NAMES.get(g["opp"], g["opp"])
    text = "%s %d-%d %s %s \u00b7 %s" % (
        g["result"], g["ours"], g["opp_runs"],
        "vs" if g["home"] else "@", opp_name, date_label)
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "team": "Rakuten Eagles",
        "season": g["season"],
        "lastGame": {"text": text, "cls": cls, "box": g["box"]},
    }
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "npb-lastgame.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote", dest, "->", text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
