#!/usr/bin/env python3
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from html import unescape

BASE = "https://site.api.espn.com/apis/site/v2/sports"
CITY_INDEX = "https://www.stlcitysc.com/matchday/media/transactions"
CITY_ORIGIN = "https://www.stlcitysc.com"
UFL_INDEX = "https://www.theufl.com/news"
UA = {"User-Agent": "stljakeh.github.io-transactions/1.0"}
TEAMS = (
    ("24", "St. Louis Cardinals"),
    ("19", "St. Louis Blues"),
    ("21812", "CITY SC"),
    ("112651", "St. Louis Battlehawks"),
)
CUTOFF_DAYS = 120
DATE_PUBLISHED_RE = re.compile(r'"datePublished"\s*:\s*"([^"]+)"', re.I)
ROSTER_RE = re.compile(
    r"\b(?:sign(?:s|ed|ing)?|trade(?:s|d)?|draft(?:s|ed)?|roster|loan(?:s|ed)?|"
    r"release(?:s|d)?|waive(?:s|d)?|contract|free agent|add(?:s|ed)?|"
    r"acquir(?:e|es|ed))\b",
    re.I,
)
TEAM_MATCH_RE = re.compile(r"Battlehawks", re.I)
TEAM_TITLE_RE = re.compile(r"Battlehawks", re.I)
LEAGUE_TITLE_RE = re.compile(r"^(?:UFL|United Football League)\b", re.I)
EXCLUDE_TITLE_RE = re.compile(
    r"fan experience|home season|sponsorship|kickoff|ticket|schedule", re.I
)
SCRIPT_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", re.I | re.S)
TAG_RE = re.compile(r"<[^>]+>")
ANCHOR_RE = re.compile(r"<a\b([^>]*)>(.*?)</a>", re.I | re.S)
UFL_CARD_RE = re.compile(
    r"<time\b[^>]*>([^<]+)</time>(.*?)<a\b([^>]*)>([^<]+)</a>", re.I | re.S
)


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError("HTTP %d" % resp.status)
        return resp.read().decode("utf-8", "ignore")


def fetch_json(url):
    return json.loads(fetch(url))


def clean(value):
    return re.sub(r"\s+", " ", unescape(value or "")).strip()


def attr(attrs, name):
    m = re.search(name + r"\s*=\s*([\"'])(.*?)\1", attrs, re.I | re.S)
    return clean(m.group(2)) if m else ""


def parse_date(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def make_item(team_id, team_name, date, kind, text, source, url):
    return {
        "teamId": team_id,
        "teamName": team_name,
        "date": date,
        "kind": kind,
        "text": clean(text),
        "source": source,
        "url": url,
    }


def fetch_espn(sport, slug, team_id, team_name, year):
    items = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=CUTOFF_DAYS)
    query = "season=%d&" % year if year else ""
    for page in range(1, 4):
        url = "%s/%s/%s/transactions?%slimit=500&page=%d" % (
            BASE, sport, slug, query, page
        )
        rows = fetch_json(url).get("transactions") or []
        if not rows:
            break
        for row in rows:
            if str((row.get("team") or {}).get("id")) != team_id:
                continue
            date = row.get("date") or ""
            if not parse_date(date):
                continue
            items.append(make_item(
                team_id, team_name, date, "Transaction",
                row.get("description") or "", "ESPN", None
            ))
        oldest = parse_date(rows[-1].get("date"))
        if oldest and oldest < cutoff:
            break
    return items


def city_article_links(page):
    seen = set()
    links = []
    for attrs, inner in ANCHOR_RE.findall(page):
        href = attr(attrs, "href")
        if "/news/" not in href or href.endswith("/index"):
            continue
        title = attr(attrs, "title") or clean(TAG_RE.sub(" ", inner))
        if not title:
            continue
        url = href if href.startswith("http") else CITY_ORIGIN + href
        key = url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        links.append((url, title))
    return links[:25]


def fetch_city(fallback_date):
    items = []
    for url, title in city_article_links(fetch(CITY_INDEX)):
        date = fallback_date
        try:
            article = fetch(url)
            m = DATE_PUBLISHED_RE.search(article)
            if m:
                date = m.group(1)
        except Exception as e:
            print("CITY SC article FAIL %s %s" % (url, e), file=sys.stderr)
        items.append(make_item(
            "21812", "CITY SC", date, "Transfer", title, "CITY SC", url
        ))
    return items


def ufl_listing(page):
    seen = set()
    links = []
    for raw_date, _, attrs, raw_title in UFL_CARD_RE.findall(page):
        href = attr(attrs, "href")
        if "/news/" not in href:
            continue
        url = href if href.startswith("http") else "https://www.theufl.com" + href
        key = url.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        try:
            date = datetime.strptime(clean(raw_date), "%B %d, %Y").date().isoformat()
        except ValueError:
            parsed = parse_date(clean(raw_date))
            date = parsed.date().isoformat() if parsed else ""
        if date:
            links.append((url, clean(raw_title), date))
    return links[:30]


def fetch_ufl():
    items = []
    for url, title, date in ufl_listing(fetch(UFL_INDEX)):
        if EXCLUDE_TITLE_RE.search(title):
            continue
        if not (TEAM_TITLE_RE.search(title) or LEAGUE_TITLE_RE.search(title)):
            continue
        try:
            article = fetch(url)
        except Exception as e:
            print("UFL article FAIL %s %s" % (url, e), file=sys.stderr)
            continue
        m = DATE_PUBLISHED_RE.search(article)
        if m:
            date = m.group(1)
        visible = clean(TAG_RE.sub(" ", SCRIPT_RE.sub(" ", article)))
        if not TEAM_MATCH_RE.search(visible) or not ROSTER_RE.search(visible):
            continue
        items.append(make_item(
            "112651", "St. Louis Battlehawks", date, "Roster news",
            title, "UFL", url
        ))
    return items


def dedupe(items):
    seen = set()
    out = []
    for item in items:
        key = (item["teamId"], clean(item["text"]).lower(), item["date"][:10])
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    out.sort(key=lambda x: x["date"], reverse=True)
    return out[:300]


def main():
    now = datetime.now(timezone.utc)
    items = []
    succeeded = 0
    jobs = (
        ("MLB transactions", fetch_espn, ("baseball", "mlb", "24", TEAMS[0][1], now.year)),
        ("NHL transactions", fetch_espn, ("hockey", "nhl", "19", TEAMS[1][1], None)),
        ("CITY SC transactions", fetch_city, (now.date().isoformat(),)),
        ("UFL news", fetch_ufl, ()),
    )
    for name, fn, args in jobs:
        try:
            found = fn(*args)
            items.extend(found)
            succeeded += 1
            print("%-22s ok (%d items)" % (name, len(found)))
        except Exception as e:
            print("%-22s FAIL %s" % (name, e), file=sys.stderr)
    if not succeeded:
        print("zero sources succeeded", file=sys.stderr)
        return 1
    out = {"generated_at": now.isoformat(), "items": dedupe(items)}
    dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data",
                        "transactions.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("wrote %s (%d items)" % (dest, len(out["items"])))
    print("by team: " + ", ".join(
        "%s=%d" % (name, sum(1 for x in out["items"] if x["teamId"] == tid))
        for tid, name in TEAMS
    ))
    print("by source: " + ", ".join(
        "%s=%d" % (source, sum(1 for x in out["items"] if x["source"] == source))
        for source in ("ESPN", "CITY SC", "UFL")
    ))
    return 0


if __name__ == "__main__":
    sys.exit(main())
