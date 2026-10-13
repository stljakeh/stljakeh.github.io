#!/usr/bin/env python3
"""Prefetch the NC Dinos' last game server-side (GitHub Action).

www.ncdinos.com sends no CORS headers (and the month API needs a JSON POST,
which triggers a preflight), so browsers can't call it directly. This posts
/api/game/getMajorGameScheduleMonth.do month-by-month and writes
Sports/data/kbo-lastgame.json, which the dashboard reads same-origin.

Each game item carries homeCode/awayCode, homeScore/awayScore, gameStatus
(END/CANCEL/ING), gameFlag ('1' = spring exhibition, skipped), gameCancelName
and a gameDate/gmKey starting YYYYMMDD. The walk starts at the current
year-month and steps back (up to 9 months) until one holds an END
regular-season game — so it works in-season and all offseason.

Stdlib only. On total failure writes NOTHING and exits nonzero, so the last
good data persists.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://www.ncdinos.com/api/game/getMajorGameScheduleMonth.do"
UA = {"User-Agent": "stljakeh.github.io-kbo/1.0",
      "Content-Type": "application/json; charset=utf-8"}
MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
# Site team codes (legacy-style) -> display names. Unknown codes fall back
# to the code itself, never blank.
CODE_NAMES = {
    "NC": "NC Dinos",
    "HH": "Hanwha Eagles",
    "HT": "Kia Tigers",
    "LG": "LG Twins",
    "OB": "Doosan Bears",
    "SK": "SSG Landers",
    "KT": "KT Wiz",
    "LT": "Lotte Giants",
    "SS": "Samsung Lions",
    "WO": "Kiwoom Heroes",
    "KIA": "Kia Tigers",
}
MAX_STEPS_BACK = 9


def post_month(year, month):
    body = json.dumps({"year": "%04d" % year, "month": "%02d" % month,
                       "ncOnly": True}).encode("utf-8")
    req = urllib.request.Request(API, data=body, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        data = json.loads(resp.read().decode("utf-8", "ignore"))
    if data.get("resultCode") != "200":
        raise RuntimeError("resultCode %r" % (data.get("resultCode"),))
    return (data.get("data") or {}).get("gameList") or []


def is_final(g):
    if (g.get("gameStatus") or "").upper() != "END":
        return False
    if str(g.get("gameFlag") or "0") == "1":
        return False
    if g.get("gameCancelName"):
        return False
    return True


def game_key_date(g):
    for src in (g.get("gameDate"), (g.get("gmKey") or "")[:8]):
        try:
            s = str(src)
            if len(s) == 8 and s.isdigit():
                return "%s-%s-%s" % (s[:4], s[4:6], s[6:8])
        except (TypeError, ValueError):
            continue
    return None


def main():
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    games = []
    for _ in range(MAX_STEPS_BACK):
        try:
            month_games = [g for g in post_month(year, month) if is_final(g)]
        except Exception as e:
            print("month %04d-%02d: %s" % (year, month, e), file=sys.stderr)
            month_games = []
        if month_games:
            games = month_games
            break
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    if not games:
        print("no finals found in any month", file=sys.stderr)
        return 1
    dated = [(game_key_date(g) or "", g) for g in games]
    dated.sort(key=lambda t: t[0])
    date_iso, g = dated[-1]
    nc_home = (g.get("homeCode") or "").upper() == "NC"
    try:
        home_runs = int(g.get("homeScore"))
        away_runs = int(g.get("awayScore"))
    except (TypeError, ValueError):
        print("unparseable score", file=sys.stderr)
        return 1
    ours = home_runs if nc_home else away_runs
    opp_runs = away_runs if nc_home else home_runs
    opp_code = (g.get("awayCode") if nc_home else g.get("homeCode")) or ""
    opp_name = CODE_NAMES.get(opp_code.upper(), opp_code or "opp")
    if ours > opp_runs:
        res, cls = "W", "win"
    elif ours < opp_runs:
        res, cls = "L", "loss"
    else:
        res, cls = "D", "draw"
    if date_iso:
        y, m, d = date_iso.split("-")
        date_label = "%s %d" % (MONTH_ABBR[int(m) - 1], int(d))
        season = y
    else:
        date_label = "?"
        season = None
    text = "%s %d-%d %s %s \u00b7 %s" % (
        res, ours, opp_runs, "vs" if nc_home else "@", opp_name, date_label)
    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "team": "NC Dinos",
        "season": season,
        "lastGame": {"text": text, "cls": cls},
    }
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "kbo-lastgame.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote", dest, "->", text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
