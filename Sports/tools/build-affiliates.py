#!/usr/bin/env python3
"""Prefetch Blues affiliate panels server-side (GitHub Action, no CORS there).

Replicates STL.api.fetchHockeyAffiliate/fetchHockeySchedule (Sports/js/api.js)
and writes Sports/data/blues-affiliates.json, which the dashboard reads
same-origin before falling back to the live proxied HockeyTech path.

Stdlib only. Per-affiliate failures are recorded as {"error": ...} so one
league failing never blocks the other.
"""
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = "https://lscluster.hockeytech.com/feed/index.php"
LEAGUES = {
    "ahl": {"code": "ahl", "key": "ccb91f29d6744675"},
    "echl": {"code": "echl", "key": "2c2b89ea7345cae8"},
}
# Mirror STL.config.AFFILIATES.blues (+ league for the HockeyTech feed).
AFFILIATES = [
    {"name": "Springfield Thunderbirds", "league": "ahl"},
    {"name": "Worcester Railers", "league": "echl"},
]
UA = {"User-Agent": "stljakeh.github.io-affiliates/1.0"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return resp.read().decode("utf-8")


def parse_maybe_jsonp(text):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.index("["), text.rindex("]")
        return json.loads(text[start:end + 1])


def ht(league, params):
    lg = LEAGUES[league]
    q = {"key": lg["key"], "client_code": lg["code"], "fmt": "json"}
    q.update(params)
    return parse_maybe_jsonp(get(BASE + "?" + urllib.parse.urlencode(q)))


def pick_season(seasons, today):
    """Mirror STL.api.htPickSeason exactly."""
    if not seasons:
        return None
    is_reg = lambda s: bool(re.search(r"regular", s.get("season_name") or "", re.I))
    in_range = [s for s in seasons if s.get("start_date", "") <= today <= s.get("end_date", "")]
    reg_in_range = [s for s in in_range if is_reg(s)]
    if reg_in_range:
        return reg_in_range[-1]
    if in_range:
        return in_range[-1]
    regs = [s for s in seasons if is_reg(s) and str(s.get("career")) == "1"]
    if regs:
        regs.sort(key=lambda s: int(s["season_id"]))
        return regs[-1]
    return seasons[-1]


def suffix(n):
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    if 11 <= (n % 100) <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def prior_regular(seasons, today):
    """Most recent completed regular season (playoffs are separate entries)."""
    regs = [s for s in (seasons or [])
            if re.search(r"regular", s.get("season_name") or "", re.I)
            and str(s.get("career")) == "1"
            and (s.get("end_date") or "") < today]
    if not regs:
        return None
    regs.sort(key=lambda s: int(s["season_id"]))
    return regs[-1]


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def build_schedule(league, team_id, season_id):
    """Mirror STL.api.fetchHockeySchedule exactly."""
    out = {"last": None, "next": None}
    data = ht(league, {"feed": "statviewfeed", "view": "schedule",
                       "team": team_id, "season": season_id, "month": -1})
    rows = []
    for sec in data or []:
        for s in (sec.get("sections") or []):
            for d in (s.get("data") or []):
                if d and (d.get("row") or {}).get("game_status"):
                    rows.append((d["row"], d.get("prop") or {}))
    if not rows:
        return out
    # Any 'Final*' status (Final, Final OT, Final SO) is a completed game.
    is_final = lambda r: bool(re.match(r"final", str(r.get("game_status") or ""), re.I))
    next_idx = next((i for i, (r, _) in enumerate(rows) if not is_final(r)),
                    len(rows))

    def side(row, prop):
        home = str((prop.get("home_team_city") or {}).get("teamLink")) == str(team_id)
        return home, (row["visiting_team_city"] if home else row["home_team_city"])

    if next_idx > 0:
        row, prop = rows[next_idx - 1]
        home, opp = side(row, prop)
        ours = to_int(row["home_goal_count"] if home else row["visiting_goal_count"])
        opp_s = to_int(row["visiting_goal_count"] if home else row["home_goal_count"])
        res = "W" if ours > opp_s else ("L" if ours < opp_s else "D")
        out["last"] = "%s %d-%d %s %s" % (res, ours, opp_s, "vs" if home else "@", opp)
        # ECHL rows carry `date` instead of `date_with_day`.
        day = row.get("date_with_day") or row.get("date")
        if day:
            out["last"] += " \u00b7 %s" % day
    if next_idx < len(rows):
        row, prop = rows[next_idx]
        home, opp = side(row, prop)
        parts = ["%s %s" % ("vs" if home else "@", opp),
                 row.get("date_with_day") or row.get("date"), row.get("game_status")]
        out["next"] = " \u00b7 ".join(str(p) for p in parts if p)
    return out


def build_season_data(league, aff, season):
    """Mirror STL.api.fetchHockeySeasonData exactly."""
    sid = season["season_id"]
    teams = (ht(league, {"feed": "modulekit", "view": "teamsbyseason", "season_id": sid})
             .get("SiteKit", {}).get("Teamsbyseason")) or []
    us = next((t for t in teams
               if str(t.get("name") or "").lower() == aff["name"].lower()), None)
    if not us:
        raise RuntimeError("team not found")
    tid = us["id"]

    record = None
    standing = None
    try:
        std = (ht(league, {"feed": "modulekit", "view": "statviewtype", "stat": "division",
                           "type": "standings", "season_id": sid})
               .get("SiteKit", {}).get("Statviewtype")) or []
        row = next((r for r in std if str(r.get("team_id")) == str(tid)), None)
        if row:
            record = {"wins": to_int(row.get("wins")), "losses": to_int(row.get("losses")),
                      "otl": to_int(row.get("ot_losses")), "sol": to_int(row.get("shootout_losses")),
                      "points": to_int(row.get("points")), "streak": row.get("streak") or ""}
            div_name = row.get("divisname") or row.get("division_name") or ""
            try:
                rn = int(row.get("rank"))
                standing = "%d%s%s" % (rn, suffix(rn), (" " + div_name) if div_name else "")
            except (TypeError, ValueError):
                if row.get("rank"):
                    standing = str(row.get("rank"))
    except Exception:
        pass

    prospects = []
    try:
        sk = (ht(league, {"feed": "modulekit", "view": "statviewtype", "type": "skaters",
                          "team_id": tid, "season_id": sid, "sort": "points"})
              .get("SiteKit", {}).get("Statviewtype")) or []
        skaters = [p for p in sk if p.get("position") != "G" and to_int(p.get("points")) > 0]
        for p in skaters[:3]:
            name = p.get("name") or ("%s %s" % (p.get("first_name", ""), p.get("last_name", ""))).strip()
            prospects.append({"name": name, "pos": p.get("position") or "",
                              "line": "%s G / %s A / %s PTS \u00b7 %s GP" % (
                                  p.get("goals"), p.get("assists"),
                                  p.get("points"), p.get("games_played"))})
    except Exception:
        pass

    games = build_schedule(league, tid, sid)
    return {"record": record, "prospects": prospects, "standing": standing,
            "lastGame": games["last"], "nextGame": games["next"],
            "seasonName": season.get("season_name"), "seasonStart": season.get("start_date")}


def build_affiliate(aff, today):
    league = aff["league"]
    seasons = (ht(league, {"feed": "modulekit", "view": "seasons"})
               .get("SiteKit", {}).get("Seasons"))
    season = pick_season(seasons, today)
    if not season:
        raise RuntimeError("no season")
    cur = build_season_data(league, aff, season)
    # Preseason/offseason: most recent completed regular season's final for
    # record + last game + prospects, keeping the current next game.
    rec = cur.get("record") or {}
    cur_games = rec.get("wins", 0) + rec.get("losses", 0) + rec.get("otl", 0) + rec.get("sol", 0)
    is_preseason = bool(re.search(r"preseason", season.get("season_name") or "", re.I))
    is_empty = (cur.get("record") is None
                or (cur_games == 0 and not cur.get("lastGame") and not cur.get("prospects")))
    if is_preseason or is_empty:
        prior = prior_regular(seasons, today)
        if prior and str(prior.get("season_id")) != str(season.get("season_id")):
            try:
                prev = build_season_data(league, aff, prior)
                prev_rec = prev.get("record") or {}
                if prev_rec.get("wins", 0) + prev_rec.get("losses", 0) > 0:
                    prev["nextGame"] = cur.get("nextGame")
                    prev["isFinal"] = True
                    return prev
            except Exception:
                pass
    return cur


def main():
    import os
    today = datetime.now(timezone.utc).date().isoformat()
    out = {"generated_at": datetime.now(timezone.utc).isoformat(), "affiliates": {}}
    for aff in AFFILIATES:
        try:
            out["affiliates"][aff["name"]] = build_affiliate(aff, today)
        except Exception as e:
            out["affiliates"][aff["name"]] = {"error": str(e)}
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "blues-affiliates.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
        f.write("\n")
    print("wrote", dest)


if __name__ == "__main__":
    main()
