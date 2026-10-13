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
import re
import sys
import time
import urllib.error
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
MAX_STEPS_BACK = 12
# Fail-soft window: when the month-API walk finds nothing but the on-disk
# JSON is this fresh (and has a last game), refresh generated_at + standings
# and exit 0 instead of paging with a red run every 6h.
FRESH_DAYS = 7
RETRY_SLEEPS = (5, 15, 30)
STANDINGS_URL = "https://eng.koreabaseball.com/Standings/TeamStandings.aspx"
# Column order of the standings table (verified 2026-10-13):
# RK, TEAM, GAMES, W, L, D, PCT, GB, STREAK, HOME, AWAY.


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def fetch_standings():
    """Current-season NC row from the official standings table."""
    req = urllib.request.Request(STANDINGS_URL, headers=UA)
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    for m in re.finditer(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        cells = [re.sub(r"<.*?>", "", c).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", m.group(1), re.S)]
        if len(cells) < 9 or cells[1] != "NC":
            continue
        rk, games, w, l, d = (to_int(cells[i]) for i in (0, 2, 3, 4, 5))
        pct = (cells[6] or "").lstrip("0")
        return {
            "wins": w, "losses": l, "ties": d,
            "pct": pct if pct.startswith(".") or not pct else pct,
            "rank": rk, "leagueName": "KBO League",
            "gb": cells[7] or None, "streak": cells[8] or None,
            "remaining": 144 - games if games else None,
        }
    raise RuntimeError("NC row not found")


def post_month(year, month):
    body = json.dumps({"year": "%04d" % year, "month": "%02d" % month,
                       "ncOnly": True}).encode("utf-8")
    last_err = None
    for attempt, sleep_s in [(0, 0)] + [(i + 1, s) for i, s in enumerate(RETRY_SLEEPS)]:
        if sleep_s:
            time.sleep(sleep_s)
        try:
            req = urllib.request.Request(API, data=body, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    raise RuntimeError("HTTP %d" % resp.status)
                data = json.loads(resp.read().decode("utf-8", "ignore"))
            # resultCode arrives as "200" today; accept int 200 too so a
            # serialization-side change doesn't red-bar every run.
            if str(data.get("resultCode")) != "200":
                raise RuntimeError("resultCode %r" % (data.get("resultCode"),))
            return (data.get("data") or {}).get("gameList") or []
        except Exception as e:
            last_err = e
            if not _retryable(e) or attempt == len(RETRY_SLEEPS):
                raise
            print("month %04d-%02d: attempt %d: %s (retrying)" % (
                year, month, attempt + 1, e), file=sys.stderr)
    raise last_err


def _retryable(e):
    # Transient network/edge failures get retries; contract changes
    # (resultCode, JSON shape) fail fast so logs stay unambiguous.
    msg = str(e)
    if msg.startswith("resultCode"):
        return False
    if isinstance(e, urllib.error.HTTPError):
        return e.code == 429 or 500 <= e.code <= 599
    if isinstance(e, RuntimeError):
        m = re.match(r"HTTP (\d+)", msg)
        if m:
            st = int(m.group(1))
            return st == 429 or 500 <= st <= 599
        return False
    return isinstance(e, (urllib.error.URLError, TimeoutError, ConnectionError))


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


def _log_status_histogram():
    # Self-describing logs for the next zero-finals mystery: one extra fetch
    # of the current month showing which gameStatus/gameFlag values exist, so
    # a schema change reads as data instead of silence. Best-effort, one shot,
    # no retries.
    try:
        now = datetime.now(timezone.utc)
        body = json.dumps({"year": "%04d" % now.year, "month": "%02d" % now.month,
                           "ncOnly": True}).encode("utf-8")
        req = urllib.request.Request(API, data=body, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8", "ignore"))
        hist = {}
        for g in ((data.get("data") or {}).get("gameList") or []):
            key = "%s/%s/%s" % (g.get("gameStatus"), g.get("gameFlag"),
                                g.get("gameCancelName") or "-")
            hist[key] = hist.get(key, 0) + 1
        print("status histogram (current month): %s" % hist, file=sys.stderr)
    except Exception as e:
        print("histogram: %s" % e, file=sys.stderr)


def _fail_soft(dest, now):
    # Total walk failure: keep the last-good JSON instead of red-barring every
    # 6h, but ONLY while it is fresh enough to still be truthful. Refresh
    # generated_at + standings so the card doesn't go stale-looking; a
    # missing/ancient file still exits 1 so real breakage pages.
    try:
        with open(dest, encoding="utf-8") as f:
            out = json.load(f)
    except (OSError, ValueError):
        return 1
    if not (out.get("lastGame") or {}).get("text"):
        return 1
    try:
        age_days = (now - datetime.fromisoformat(out["generated_at"])).days
    except (TypeError, ValueError, KeyError):
        return 1
    if age_days > FRESH_DAYS:
        print("last-good is %d days old (>%d), failing" % (age_days, FRESH_DAYS),
              file=sys.stderr)
        return 1
    try:
        st = fetch_standings()
        if st and (st["wins"] + st["losses"] > 0):
            out["standings"] = st
    except Exception as e:
        print("standings: %s" % e, file=sys.stderr)
    out["generated_at"] = now.isoformat()
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("WARNING: month-API walk failed; kept last-good (%s)" % (
        out["lastGame"]["text"]))
    return 0


def main():
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "kbo-lastgame.json")
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month
    games = []
    for _ in range(MAX_STEPS_BACK):
        try:
            raw = post_month(year, month)
            month_games = [g for g in raw if is_final(g)]
            print("month %04d-%02d: %d games, %d finals" % (
                year, month, len(raw), len(month_games)))
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
        _log_status_histogram()
        return _fail_soft(dest, now)
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
    try:
        st = fetch_standings()
        if st and (st["wins"] + st["losses"] > 0):
            out["standings"] = st
    except Exception as e:
        print("standings: %s" % e, file=sys.stderr)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print("wrote", dest, "->", text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
