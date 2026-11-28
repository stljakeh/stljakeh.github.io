#!/usr/bin/env python3
"""Sync St. Louis coaches + active records to Sports/data/coaches.json.

Checks official MLB Stats API (Cardinals), ESPN Roster/Team APIs (Blues/Cardinals),
and Wikipedia team infoboxes (CITY SC / Battlehawks, plus fallback) for coaching
changes. When a new coach/manager is detected, fetches their Wikipedia bio/infobox
and updates Sports/data/coaches.json automatically.

Stdlib only.
"""
import json
import os
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "stljakeh.github.io-coaches/1.0"}
DATA_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "data", "coaches.json"
)


def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return json.loads(resp.read().decode("utf-8", "ignore"))


def normalize_name(name):
    s = unicodedata.normalize("NFD", str(name or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def initials_for(name):
    parts = [p for p in str(name or "").strip().split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def clean_wiki_value(raw):
    if not raw:
        return ""
    s = str(raw)
    s = re.sub(r"<!--[\s\S]*?-->", "", s)
    s = re.sub(r"<ref[^>]*>[\s\S]*?</ref>", "", s, flags=re.I)
    s = re.sub(r"<ref[^>]*/>", "", s, flags=re.I)
    s = re.sub(r"<br\s*/?>", ", ", s, flags=re.I)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"'''?", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    if re.match(r"^(vacant|tbd|tba|none|n/a|-+|—+)$", s, re.I):
        return ""
    return s


def parse_infobox_field(wikitext, fields):
    if not wikitext:
        return "", ""
    for field in fields:
        m = re.search(
            r"^\|\s*" + re.escape(field) + r"\s*=\s*(.+)$",
            wikitext,
            flags=re.I | re.M,
        )
        if not m:
            continue
        raw = m.group(1).split("\n|")[0].strip()
        lm = re.search(r"\[\[([^|\]]+)(?:\|([^\]]+))?\]\]", raw)
        link_title = lm.group(1).strip() if lm else ""
        val = clean_wiki_value(raw)
        if val:
            return val, link_title
    return "", ""


def parse_birth_date(wikitext):
    if not wikitext:
        return ""
    m = re.search(
        r"\{\{birth\s+date(?:\s+and\s+age)?\|(?:[^|{}]*\|)*?(\d{4})\|(\d{1,2})\|(\d{1,2})",
        wikitext,
        flags=re.I,
    )
    if not m:
        return ""
    return "%s-%02d-%02d" % (m.group(1), int(m.group(2)), int(m.group(3)))


def detect_coach(coach):
    src = coach.get("sources") or {}
    if src.get("mlbCoaches"):
        try:
            data = get_json(src["mlbCoaches"])
            for r in data.get("roster") or []:
                if r.get("jobId") == "MNGR" or re.match(
                    r"^manager$", r.get("job") or "", re.I
                ):
                    fn = (r.get("person") or {}).get("fullName")
                    if fn:
                        return fn.strip(), "", "MLB Stats API"
        except Exception:
            pass

    if src.get("espnRoster"):
        try:
            data = get_json(src["espnRoster"])
            coaches = data.get("coach") or []
            if coaches:
                c0 = coaches[0]
                name = " ".join(
                    p for p in [c0.get("firstName"), c0.get("lastName")] if p
                ).strip()
                if name:
                    return name, "", "ESPN Roster API"
        except Exception:
            pass

    if src.get("wikiTitle"):
        try:
            url = (
                "https://en.wikipedia.org/w/api.php?action=query&titles="
                + urllib.parse.quote(src["wikiTitle"])
                + "&redirects=1&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json"
            )
            data = get_json(url)
            pages = list((data.get("query") or {}).get("pages", {}).values())
            wt = (
                pages[0].get("revisions", [{}])[0]
                .get("slots", {})
                .get("main", {})
                .get("*", "")
                if pages
                else ""
            )
            val, link = parse_infobox_field(
                wt, src.get("wikiFields") or ["coach", "head_coach", "manager"]
            )
            if val:
                return val, link, "Wikipedia"
        except Exception:
            pass

    return None


def fetch_live_record(coach):
    url = (coach.get("sources") or {}).get("espnTeam")
    if not url:
        return None
    try:
        data = get_json(url)
        team = data.get("team") or {}
        items = (team.get("record") or {}).get("items") or []
        if not items:
            return None
        stats = {
            s.get("name"): s.get("value")
            for s in (items[0].get("stats") or [])
            if isinstance(s.get("value"), (int, float))
        }
        return {
            "wins": int(stats["wins"]) if "wins" in stats else None,
            "losses": int(stats["losses"]) if "losses" in stats else None,
            "ties": int(stats.get("ties", 0)),
            "otLosses": int(stats.get("otLosses", 0)),
            "gamesPlayed": int(stats["gamesPlayed"]) if "gamesPlayed" in stats else None,
            "winPercent": stats.get("winPercent"),
            "standingSummary": team.get("standingSummary") or "",
        }
    except Exception:
        return None


def build_new_coach(base, name, link_title, source_label, live_rec):
    lookup = link_title or name
    birth_date = ""
    birth_place = "—"
    alma_mater = "—"
    bio = "%s was detected via %s as the %s of the %s." % (
        name,
        source_label,
        base["role"].lower(),
        base["team"],
    )
    headshot = ""
    career_rows = []

    try:
        info = get_json(
            "https://en.wikipedia.org/w/api.php?action=query&titles="
            + urllib.parse.quote(lookup)
            + "&redirects=1&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json"
        )
        pages = list((info.get("query") or {}).get("pages", {}).values())
        wt = (
            pages[0].get("revisions", [{}])[0]
            .get("slots", {})
            .get("main", {})
            .get("*", "")
            if pages
            else ""
        )
        birth_date = parse_birth_date(wt)
        bp, _ = parse_infobox_field(wt, ["birth_place"])
        if bp:
            birth_place = bp
        am, _ = parse_infobox_field(wt, ["alma_mater", "college", "education"])
        if am:
            alma_mater = am
        prev, _ = parse_infobox_field(wt, ["coached_for", "past_teams", "former_teams"])
        if prev:
            career_rows.append({"label": "Prior Coaching / Playing", "value": prev})
    except Exception:
        pass

    try:
        summary = get_json(
            "https://en.wikipedia.org/api/rest_v1/page/summary/"
            + urllib.parse.quote(lookup.replace(" ", "_"))
        )
        extract = summary.get("extract") or ""
        if extract:
            sentences = re.split(r"(?<=[.!?])\s+", extract.strip())[:2]
            if sentences:
                bio = " ".join(sentences)
        raw_img = (
            (summary.get("thumbnail") or {}).get("source")
            or (summary.get("originalimage") or {}).get("source")
            or ""
        )
        if raw_img:
            headshot = raw_img.split("?")[0]
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    today_iso = now.strftime("%Y-%m-%d")
    today_disp = now.strftime("%b %d, %Y").replace(" 0", " ")

    if live_rec and live_rec.get("wins") is not None:
        if base.get("sport") == "hockey":
            rec_str = "%d–%d–%d" % (
                live_rec["wins"],
                live_rec["losses"],
                live_rec.get("otLosses", 0),
            )
        elif base.get("sport") == "soccer":
            rec_str = "%d–%d–%d" % (
                live_rec["wins"],
                live_rec["losses"],
                live_rec.get("ties", 0),
            )
        else:
            rec_str = "%d–%d" % (live_rec["wins"], live_rec["losses"])
    else:
        rec_str = "0–0"

    out = dict(base)
    out.update(
        {
            "initials": initials_for(name),
            "headshot": headshot,
            "name": name,
            "aliases": [name],
            "franchiseNumber": "Appointed %s (auto-detected via %s)"
            % (today_disp, source_label),
            "hiredDate": today_iso,
            "hiredDisplay": today_disp,
            "birthDate": birth_date,
            "birthPlace": birth_place,
            "almaMater": alma_mater,
            "contractNote": "Replaces %s · Detected via %s"
            % (base["name"], source_label),
            "headlineRecord": rec_str,
            "headlineLabel": "CURRENT TENURE",
            "rateValue": "New Hire",
            "rateSub": (live_rec or {}).get("standingSummary") or "Newly appointed",
            "postseasonValue": "—",
            "postseasonSub": "First season in STL",
            "highlightTag": "New Coach Detected",
            "autoUpdated": True,
            "detectedSource": source_label,
            "previousCoach": {
                "name": base["name"],
                "record": base["headlineRecord"],
                "hiredDisplay": base["hiredDisplay"],
            },
            "bio": bio,
            "seasons": [
                {
                    "season": "Current",
                    "record": rec_str,
                    "rate": "—",
                    "finish": (live_rec or {}).get("standingSummary")
                    or "Active tenure",
                    "live": True,
                    "w": (live_rec or {}).get("wins") or 0,
                    "l": (live_rec or {}).get("losses") or 0,
                    "t": (
                        (live_rec or {}).get("otLosses", 0)
                        if base.get("sport") == "hockey"
                        else (live_rec or {}).get("ties", 0)
                    ),
                }
            ],
            "seasonTotal": {
                "record": rec_str,
                "rate": "—",
                "finish": (live_rec or {}).get("standingSummary")
                or "New coaching tenure",
            },
            "careerRows": career_rows
            or [
                {
                    "label": "Prior Tenure",
                    "value": "Succeeded %s (%s)"
                    % (base["name"], base["headlineRecord"]),
                }
            ],
            "honors": [
                "Auto-updated from %s upon coaching change detection" % source_label
            ],
        }
    )
    return out


def sync_live_record(coach, live_rec):
    if not live_rec or live_rec.get("wins") is None:
        return coach
    if coach.get("sport") != "hockey":
        return coach
    seasons = list(coach.get("seasons") or [])
    live_idx = next((i for i, s in enumerate(seasons) if s.get("live")), -1)
    if live_idx == -1:
        return coach

    w = int(live_rec["wins"])
    l = int(live_rec["losses"])
    otl = int(live_rec.get("otLosses", 0))
    gp = int(live_rec.get("gamesPlayed") or (w + l + otl))
    pts_pct = ("%.3f" % ((w * 2 + otl) / (gp * 2))).lstrip("0") if gp > 0 else ".000"

    seasons[live_idx] = dict(
        seasons[live_idx],
        w=w,
        l=l,
        t=otl,
        record="%d–%d–%d" % (w, l, otl),
        rate=pts_pct,
        finish="In progress (%d GP)" % gp,
    )

    tot_w = sum(s.get("w", 0) for s in seasons)
    tot_l = sum(s.get("l", 0) for s in seasons)
    tot_t = sum(s.get("t", 0) for s in seasons)
    tot_gp = tot_w + tot_l + tot_t
    tot_rate = (
        ("%.3f" % ((tot_w * 2 + tot_t) / (tot_gp * 2))).lstrip("0")
        if tot_gp > 0
        else ".000"
    )

    out = dict(coach)
    out["headlineRecord"] = "%d–%d–%d" % (tot_w, tot_l, tot_t)
    out["rateValue"] = "%s PTS%%" % tot_rate
    out["rateSub"] = "%d games coached" % tot_gp
    out["seasons"] = seasons
    out["seasonTotal"] = dict(
        coach.get("seasonTotal") or {},
        record=out["headlineRecord"],
        rate=tot_rate,
        finish="%d GP · 3–4 Postseason" % tot_gp,
    )
    return out


def main():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    coaches = data.get("coaches") or []
    updated = []
    changes = 0

    for c in coaches:
        det = detect_coach(c)
        rec = fetch_live_record(c)
        if det:
            det_name, det_link, det_src = det
            known = [normalize_name(x) for x in [c["name"]] + (c.get("aliases") or [])]
            if normalize_name(det_name) and normalize_name(det_name) not in known:
                print("Coaching change detected for %s: %s -> %s (%s)" % (c["team"], c["name"], det_name, det_src))
                updated.append(build_new_coach(c, det_name, det_link, det_src, rec))
                changes += 1
                continue
        updated.append(sync_live_record(c, rec))

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "coaches": updated,
    }
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("Wrote %s (%d coaches, %d changes detected)" % (DATA_PATH, len(updated), changes))
    return 0


if __name__ == "__main__":
    sys.exit(main())
