// Fetches CITY2 (MLS Next Pro) data server-side from Sofascore and writes
// Sports/data/city2.json for the dashboard. Runs via the city2-snapshot
// GitHub Actions workflow (server-side fetch bypasses Sofascore's
// Origin-bearing-request block). Node 18+.

import fs from 'fs';

const HOST = 'https://api.sofascore.com';
const TEAM = 411361;
const TOUR = 18641;
const SEASON = 89065;
const LOGO = 'https://upload.wikimedia.org/wikipedia/commons/7/7e/St._Louis_City_SC_II.png';
const OUT = 'Sports/data/city2.json';

async function get(path) {
  const resp = await fetch(HOST + path, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!resp.ok) return null;
  return resp.json();
}

function mc(info, ha, score, win) {
  return {
    team: { id: String(info.id), abbreviation: info.nameCode || info.shortName || '?', displayName: info.name },
    homeAway: ha,
    score: score != null ? { displayValue: String(score) } : null,
    winner: win
  };
}

function bld(e) {
  const fin = e.status && e.status.type === 'finished';
  const liveEv = e.status && e.status.type === 'inprogress';
  const home = e.homeTeam, away = e.awayTeam;
  let homeWin = null;
  if (fin && e.winnerCode != null) homeWin = Number(e.winnerCode) === 1;
  const d = new Date(Math.floor(e.startTimestamp) * 1000).toISOString();
  return {
    id: String(e.id), date: d,
    competitions: [{
      date: d,
      seasonType: { name: (e.season && e.season.name ? e.season.name : 'Regular Season') },
      status: {
        type: fin
          ? { completed: true, state: 'post', detail: e.status.description || '' }
          : liveEv
            ? { state: 'in', completed: false, detail: e.status.description || '', displayClock: null }
            : { state: 'pre', completed: false },
        displayClock: null
      },
      venue: { fullName: (e.venue && e.venue.name) ? e.venue.name : '' },
      broadcasts: [{ media: { shortName: 'MLSNextPro.com' } }],
      competitors: [
        mc(home, 'home', (home && e.homeScore) ? e.homeScore.current : null, fin ? homeWin : null),
        mc(away, 'away', (away && e.awayScore) ? e.awayScore.current : null, fin ? (homeWin != null ? !homeWin : null) : null)
      ]
    }]
  };
}

const standings = await get('/api/v1/unique-tournament/' + TOUR + '/season/' + SEASON + '/standings/total');
const lastPage = await get('/api/v1/team/' + TEAM + '/events/last/0');
if (!standings || !lastPage) {
  console.error('standings or events/last unavailable; leaving snapshot untouched');
  process.exit(1);
}
const nextPage = await get('/api/v1/team/' + TEAM + '/events/next/0');

const groups = standings.standings || [];
const west = groups.find((g) => String(g.name || '').indexOf('Western') !== -1)
  || groups.find((g) => (g.rows || []).some((r) => String(r.team.id) === String(TEAM)));
const row = west ? (west.rows || []).find((r) => String(r.team.id) === String(TEAM)) : null;
const rank = row ? row.position : null;
const rec = {
  wins: row ? (row.wins || 0) : 0,
  losses: row ? (row.losses || 0) : 0,
  ties: row ? (row.draws || 0) : 0,
  pts: row ? (row.points || 0) : 0
};
const standingStr = rank != null ? rank + ordinal(rank) + ' in Western Conference' : 'Western Conference';

const events = lastPage.events || [];
const ourEvents = events.filter((e) => Number(e.homeTeam && e.homeTeam.id) === TEAM || Number(e.awayTeam && e.awayTeam.id) === TEAM);
const finished = ourEvents
  .filter((e) => e.status && e.status.type === 'finished')
  .sort((a, b) => b.startTimestamp - a.startTimestamp);
const live = ourEvents.find((e) => e.status && e.status.type === 'inprogress');

let streak = 0;
for (const g of finished) {
  if (g.season && Number(g.season.id) !== SEASON) break;
  const wc = g.winnerCode == null ? 0 : Number(g.winnerCode);
  if (wc !== 1 && wc !== 2) break;
  const won = wc === 1 ? Number(g.homeTeam.id) === TEAM : Number(g.awayTeam.id) === TEAM;
  if (streak === 0) {
    streak = won ? 1 : -1;
  } else if ((streak > 0 && won) || (streak < 0 && !won)) {
    streak += won ? 1 : -1;
  } else {
    break;
  }
}

let nextG = null;
if (nextPage && Array.isArray(nextPage.events)) {
  const nxt = nextPage.events
    .filter((e) => Number(e.homeTeam && e.homeTeam.id) === TEAM || Number(e.awayTeam && e.awayTeam.id) === TEAM)
    .filter((e) => e.status && e.status.type === 'notstarted')
    .sort((a, b) => a.startTimestamp - b.startTimestamp);
  const league = nxt.filter((e) => e.uniqueTournament && Number(e.uniqueTournament.id) === TOUR);
  nextG = league[0] || nxt[0] || null;
}

const lastEvent = finished[0] ? bld(finished[0]) : null;
const liveEv = live ? bld(live) : null;
const nextEvent = liveEv || (nextG ? bld(nextG) : null);

const snap = {
  fetchedAt: new Date().toISOString(),
  team: {
    id: String(TEAM),
    logos: [{ href: LOGO }],
    displayName: 'CITY2',
    record: { items: [{ stats: [
      { name: 'wins', value: rec.wins },
      { name: 'losses', value: rec.losses },
      { name: 'ties', value: rec.ties },
      { name: 'points', value: rec.pts },
      { name: 'streak', value: streak }
    ] }] },
    standingSummary: standingStr
  },
  lastEvent: lastEvent,
  nextEvent: nextEvent,
  live: liveEv ? {
    event: liveEv,
    competitors: liveEv.competitions[0].competitors,
    status: liveEv.competitions[0].status
  } : null
};

fs.writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n');
console.log('wrote', OUT, 'fetchedAt', snap.fetchedAt, '| rank', rank, '| W-L-T-P', rec.wins + '-' + rec.losses + '-' + rec.ties + '-' + rec.pts, '| streak', streak, '| live', !!liveEv, '| next', nextG ? nextG.id : 'none');

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}