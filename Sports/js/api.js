window.STL = window.STL || {};

STL.api = {

  _liveScoreCache: {},

  enrichLiveScores: async function() {
    const sports = new Set(STL.config.TEAMS.filter(t => t.leagueSlug !== 'mlsnp').map(t => t.sport + '/' + t.leagueSlug));
    if (sports.size === 0) return;
    const now = new Date();
    const dates = [];
    for (let i = -1; i <= 1; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
    const datesParam = dates.join('-');
    await Promise.all([...sports].map(async function(key) {
      const sportTeams = STL.config.TEAMS.filter(function(t) { return t.leagueSlug !== 'mlsnp' && t.sport + '/' + t.leagueSlug === key; });
      const prior = {};
      for (const t of sportTeams) {
        const cached = STL.api._liveScoreCache[t.cardClass];
        if (t._liveEvent) {
          prior[t.cardClass] = { event: t._liveEvent, scoreData: t._liveScoreData, status: t._liveStatus };
        } else if (cached) {
          prior[t.cardClass] = cached;
        }
      }
      try {
        const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/' + key + '/scoreboard?dates=' + datesParam);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        for (const ev of (data.events || [])) {
          const comps = ev.competitions?.[0]?.competitors;
          if (!comps) continue;
          const status = ev.competitions[0].status;
          for (const t of sportTeams) {
            const isOurs = comps.some(c => String(c.team.id) === String(t.id));
            if (!isOurs) continue;
            if (status?.type?.state === 'in') {
              t._liveEvent = ev;
              t._liveScoreData = comps;
              t._liveStatus = status;
            } else if (t._liveEvent && t._liveEvent.id === ev.id) {
              t._liveScoreData = comps;
              t._liveStatus = status;
            }
          }
        }
        for (const t of sportTeams) {
          if (t._liveEvent) {
            STL.api._liveScoreCache[t.cardClass] = { event: t._liveEvent, scoreData: t._liveScoreData, status: t._liveStatus };
          } else {
            delete STL.api._liveScoreCache[t.cardClass];
          }
        }
      } catch (e) {
        for (const t of sportTeams) {
          if (prior[t.cardClass]) {
            t._liveEvent = prior[t.cardClass].event;
            t._liveScoreData = prior[t.cardClass].scoreData;
            t._liveStatus = prior[t.cardClass].status;
          }
        }
      }
    }));
  },

  fetchMlsStandings: async function() {
    try {
      const games = await STL.api.fetchAsa('https://app.americansocceranalysis.com/api/v1/mls/games?season_name=2026&status=FullTime', 6 * 3600000);
      if (!games || !games.length) return;

      const std = {};
      for (const g of games) {
        if (g.status !== 'FullTime') continue;
        if (g.home_score == null || g.away_score == null) continue;
        for (const id of [g.home_team_id, g.away_team_id]) {
          if (!std[id]) std[id] = { w: 0, l: 0, d: 0, pts: 0 };
        }
        if (g.home_score > g.away_score) { std[g.home_team_id].w++; std[g.home_team_id].pts += 3; std[g.away_team_id].l++; }
        else if (g.away_score > g.home_score) { std[g.away_team_id].w++; std[g.away_team_id].pts += 3; std[g.home_team_id].l++; }
        else { std[g.home_team_id].d++; std[g.away_team_id].d++; std[g.home_team_id].pts++; std[g.away_team_id].pts++; }
      }

      const west = STL.config.ASA_WEST.map(function(t) {
        return { id: t.espn, pts: (std[t.asa] || { pts: 0 }).pts };
      });
      west.sort(function(a, b) { return b.pts - a.pts || a.id.localeCompare(b.id); });
      west.forEach(function(t, i) {
        window._mlsConfTeams.push({ id: t.id, pts: t.pts });
        window._mlsOverall[t.id] = (i + 1) + STL.utils.suffix(i + 1);
      });
    } catch (e) {}
  },

  fetchLineup: async function(team, event) {
    if (!event || !STL.utils.isGameDay(event)) return;
    const comp = event.competitions?.[0];
    if (!comp) return;
    const eventId = event.id;
    try {
      const resp = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.leagueSlug + '/summary?event=' + eventId
      );
      if (!resp.ok) return;
      const data = await resp.json();

      if (team.sport === 'baseball') {
        const players = data.boxscore?.players;
        if (!players) return;
        const teamIdx = players.findIndex(p => String(p.team?.id) === String(team.id));
        if (teamIdx === -1) return;
        const batting = players[teamIdx]?.statistics?.find(s => s.type === 'batting');
        if (!batting?.athletes) return;
        const batters = batting.athletes
          .filter(a => a.starter === true && a.batOrder > 0)
          .sort((a, b) => a.batOrder - b.batOrder)
          .map(a => ({
            batOrder: a.batOrder,
            position: a.position?.abbreviation || '',
            name: a.athlete?.displayName || ''
          }));
        const pitching = players[teamIdx]?.statistics?.find(s => s.type === 'pitching');
        let sp = null;
        if (pitching?.athletes) {
          const spData = pitching.athletes.find(a => a.starter === true);
          if (spData) {
            sp = {
              name: spData.athlete?.displayName || '',
              throws: spData.athlete?.throws || ''
            };
          }
        }
        if (batters.length) {
          team._lineupData = { sport: 'baseball', batters: batters, startingPitcher: sp };
        }
      } else if (team.sport === 'soccer') {
        const rosters = data.rosters;
        if (!rosters) return;
        const teamRoster = rosters.find(r => String(r.team?.id) === String(team.id));
        if (!teamRoster?.roster) return;
        const formation = teamRoster.formation || '';
        const starters = teamRoster.roster
          .filter(p => p.starter === true)
          .sort((a, b) => parseInt(a.formationPlace || 0) - parseInt(b.formationPlace || 0))
          .map(p => ({
            formationPlace: parseInt(p.formationPlace || 0),
            position: p.position?.abbreviation || '',
            name: p.athlete?.displayName || '',
            jersey: p.jersey || ''
          }));
        if (starters.length) {
          team._lineupData = { sport: 'soccer', formation: formation, starters: starters };
        }
      } else if (team.sport === 'hockey') {
        const players = data.boxscore?.players;
        if (!players) return;
        const teamIdx = players.findIndex(p => String(p.team?.id) === String(team.id));
        if (teamIdx === -1) return;
        const stats = players[teamIdx]?.statistics;
        if (!stats) return;
        const forwards = stats.find(s => s.name === 'forwards')?.athletes
          ?.filter(a => a.athlete?.scratched === false)
          ?.map(a => ({
            name: a.athlete?.displayName || '',
            position: a.athlete?.position?.abbreviation || ''
          })) || [];
        const defensemen = stats.find(s => s.name === 'defenses')?.athletes
          ?.filter(a => a.athlete?.scratched === false)
          ?.map(a => ({
            name: a.athlete?.displayName || '',
            position: a.athlete?.position?.abbreviation || ''
          })) || [];
        const goalies = stats.find(s => s.name === 'goalies')?.athletes
          ?.filter(a => a.athlete?.scratched === false)
          ?.map(a => ({
            name: a.athlete?.displayName || '',
            position: a.athlete?.position?.abbreviation || ''
          })) || [];
        let startingGoalie = null;
        const teamComp = comp.competitors?.find(c => String(c.team.id) === String(team.id));
        const probs = teamComp?.probables;
        if (probs) {
          const sg = probs.find(p => p.name === 'probableStartingGoalie');
          if (sg) startingGoalie = { name: sg.athlete?.fullName || '' };
        }
        if (forwards.length || defensemen.length || goalies.length) {
          team._lineupData = { sport: 'hockey', forwards: forwards, defensemen: defensemen, goalies: goalies, startingGoalie: startingGoalie };
        }
      }
    } catch (e) {}
  },

  fetchWinProb: async function(team, event) {
    if (!event) return;
    const comp = event.competitions?.[0];
    if (!comp) return;
    const st = comp.status?.type;
    const eventId = event.id;
    const isLive = st?.state === 'in';

    try {
      if (isLive) {
        const resp = await fetch(
          'https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.leagueSlug + '/summary?event=' + eventId
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const summaryComps = data?.competitions?.[0]?.competitors || data?.header?.competitions?.[0]?.competitors;
        const summaryStatus = data?.competitions?.[0]?.status || data?.header?.competitions?.[0]?.status;
        if (summaryComps) {
          if (!team._liveEvent) team._liveEvent = event;
          team._liveScoreData = summaryComps;
          team._liveStatus = summaryStatus;
        }
        const wp = data.winprobability;
        if (!wp || !wp.length) return;
        const latest = wp[wp.length - 1];
        const homePct = latest.homeWinPercentage;
        const tiePct = latest.tiePercentage || 0;
        const isHome = comp.competitors?.find(c => String(c.team.id) === String(team.id))?.homeAway === 'home';
        let winPct = isHome ? homePct : (1 - homePct - tiePct);
        team._winProb = Math.max(0, Math.round(winPct * 1000) / 10);
        team._winProbLive = true;
      } else {
        const d = new Date(event.date);
        const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '');
        const resp = await fetch(
          'https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.leagueSlug + '/scoreboard?dates=' + dateStr + '&includeOdds=true'
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const ev = data.events?.find(e => e.id === eventId);
        if (!ev) return;
        const odds = ev.competitions?.[0]?.odds?.[0];
        if (!odds) return;
        const isHome = ev.competitions[0].competitors?.find(c => String(c.team.id) === String(team.id))?.homeAway === 'home';
        const ml = isHome ? odds.moneyline?.home?.close?.odds : odds.moneyline?.away?.close?.odds;
        if (!ml) return;
        const num = parseInt(ml);
        let winPct;
        if (num < 0) {
          winPct = Math.abs(num) / (Math.abs(num) + 100);
        } else {
          winPct = 100 / (num + 100);
        }
        team._winProb = Math.round(winPct * 1000) / 10;
        team._winProbLive = false;
      }
    } catch (e) {}
  },

  /* ASA-sourced teams (CITY2): fetches via ASA + CORS proxy with localStorage caching */

  fetchAsa: async function(url, ttlMs) {
    const cacheKey = 'asa_cache_' + btoa(url);
    ttlMs = ttlMs || 7 * 86400000;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() < parsed.expiry) return parsed.data;
      }
    } catch (e) {}
    try {
      const resp = await fetch(STL.utils.c2url(url));
      if (!resp.ok) return [];
      const data = await resp.json();
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + ttlMs }));
      } catch (e) {}
      return data;
    } catch (e) {
      return [];
    }
  },

  /* Sofascore-sourced teams (CITY2): CORS-open API, direct fetch + localStorage caching */

  fetchSofa: async function(path, ttlMs) {
    const cacheKey = 'sofa_cache_' + btoa(path);
    ttlMs = ttlMs || 10 * 60000;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() < parsed.expiry) return parsed.data;
      }
    } catch (e) {}
    let data = null;
    try {
      const resp = await fetch('https://api.sofascore.com' + path);
      if (resp.ok) data = await resp.json();
    } catch (e) {}
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + ttlMs }));
    } catch (e) {}
    return data;
  },

  fetchSofaSeason: async function(tournament, fallback) {
    const data = await STL.api.fetchSofa('/api/v1/unique-tournament/' + tournament + '/seasons', 24 * 3600000);
    const year = new Date().getFullYear();
    if (data && Array.isArray(data.seasons)) {
      const cur = data.seasons
        .filter(function(s) { return Number(s.year) === year; })
        .sort(function(a, b) { return b.id - a.id; })[0];
      if (cur) return cur.id;
    }
    return fallback;
  },

  findNextGameFromScoreboard: async function(team, startDate) {
    var d = new Date(startDate || Date.now());
    for (var i = 1; i <= 14; i++) {
      var check = new Date(d);
      check.setDate(check.getDate() + i);
      var dateStr = check.toISOString().slice(0, 10).replace(/-/g, '');
      try {
        var resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.leagueSlug + '/scoreboard?dates=' + dateStr);
        if (!resp.ok) continue;
        var data = await resp.json();
        for (var j = 0; j < (data.events || []).length; j++) {
          var ev = data.events[j];
          var comps = ev.competitions?.[0]?.competitors;
          if (!comps) continue;
          var isOurs = comps.some(function(c) { return String(c.team.id) === String(team.id); });
          if (isOurs && ev.competitions?.[0]?.status?.type?.state === 'pre') return ev;
        }
      } catch (e) { continue; }
    }
    return null;
  },

  fetchTeam: async function(team) {
    if (team.leagueSlug === 'mlsnp') {
      await STL.api.fetchTeamSofa(team);
      return;
    }
    const baseUrl = 'https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.leagueSlug + '/teams/' + team.id;
    let data;
    try {
      const resp = await fetch(baseUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      data = await resp.json();
    } catch (e) {
      STL.render.renderError(team, 'Failed to load: ' + e.message);
      return;
    }

    let lastEvent = null;
    let nextEvent = null;
    let allEvents = [];
    try {
      const schedResp = await fetch(baseUrl + '/schedule');
      if (schedResp.ok) {
        const schedData = await schedResp.json();
        allEvents = schedData.events || [];
        let lastDate = null, nextDate = null;
        for (const e of allEvents) {
          const st = e.competitions?.[0]?.status?.type;
          const d = new Date(e.date);
          if (!isFinite(d)) continue;
          if (st && st.completed === true) {
            if (!lastDate || d > lastDate) { lastDate = d; lastEvent = e; }
          } else if (st && (st.state === 'pre' || st.state === 'in' || st.name === 'STATUS_SCHEDULED' || st.name === 'STATUS_PREVIEW')) {
            if (!nextDate || d < nextDate) { nextDate = d; nextEvent = e; }
          }
        }
      }
    } catch (e) {}

    const completedEvents = allEvents
      .filter(function(e) { var st = e.competitions?.[0]?.status?.type; return st && (st.completed === true); })
      .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    let streak = 0;
    for (const ev of completedEvents) {
      const ha = ev.competitions[0].competitors.find(function(c) { return String(c.team.id) === String(team.id); });
      const opp = ev.competitions[0].competitors.find(function(c) { return String(c.team.id) !== String(team.id); });
      if (!ha || !opp) continue;
      if (ha.winner === true) {
        if (streak >= 0) streak++; else break;
      } else if (!opp.winner) {
        break;
      } else {
        if (streak <= 0) streak--; else break;
      }
    }
    team._computedStreak = streak;

    let compWins = 0, compLosses = 0, compDraws = 0;
    for (const ev of completedEvents) {
      const ha = ev.competitions[0].competitors.find(function(c) { return String(c.team.id) === String(team.id); });
      const opp = ev.competitions[0].competitors.find(function(c) { return String(c.team.id) !== String(team.id); });
      if (!ha || !opp) continue;
      if (ha.winner === true) compWins++;
      else if (opp.winner === true) compLosses++;
      else compDraws++;
    }
    team._computedRecord = { wins: compWins, losses: compLosses, ties: compDraws, points: compWins * 3 + compDraws };

    if (!nextEvent) {
      nextEvent = await STL.api.findNextGameFromScoreboard(team, lastEvent ? lastEvent.date : null);
    }

    const renders = [];
    if (nextEvent) {
      renders.push(STL.api.fetchWinProb(team, nextEvent).then(function() {
        STL.render.renderTeam(team, data, lastEvent, nextEvent);
      }));
    } else {
      renders.push(Promise.resolve().then(function() {
        STL.render.renderTeam(team, data, lastEvent, nextEvent);
      }));
    }
    await Promise.all(renders);
  },

  fetchTeamSofa: async function(team) {
    const sofaTeam = team.sofaId || STL.config.SOFA.CITY2_TEAM;
    const tour = STL.config.SOFA.MLS_NP_TOURNAMENT;
    const season = await STL.api.fetchSofaSeason(tour, STL.config.SOFA.MLS_NP_SEASON);
    try {
      const [standings, lastPage, nextPage] = await Promise.all([
        STL.api.fetchSofa('/api/v1/unique-tournament/' + tour + '/season/' + season + '/standings/total', 6 * 3600000),
        STL.api.fetchSofa('/api/v1/team/' + sofaTeam + '/events/last/0', 60000),
        STL.api.fetchSofa('/api/v1/team/' + sofaTeam + '/events/next/0', 10 * 60000)
      ]);

      if (!standings && !lastPage && !nextPage) {
        STL.render.renderError(team, 'Failed to load CITY2 data');
        return;
      }

      const groups = (standings && standings.standings) || [];
      const west = groups.find(function(g) { return String(g.name || '').indexOf('Western') !== -1; }) || groups.find(function(g) { return (g.rows || []).some(function(r) { return String(r.team.id) === String(sofaTeam); }); });
      const row = west ? (west.rows || []).find(function(r) { return String(r.team.id) === String(sofaTeam); }) : null;
      const rank = row ? row.position : null;
      const rec = {
        wins: row ? (row.wins || 0) : 0,
        losses: row ? (row.losses || 0) : 0,
        ties: row ? (row.draws || 0) : 0,
        pts: row ? (row.points || 0) : 0
      };
      const standingStr = rank != null ? rank + STL.utils.suffix(rank) + ' in Western Conference' : 'Western Conference';

      const events = (lastPage && lastPage.events) || [];
      const ourEvents = events.filter(function(e) { return Number(e.homeTeam && e.homeTeam.id) === sofaTeam || Number(e.awayTeam && e.awayTeam.id) === sofaTeam; });
      const finished = ourEvents
        .filter(function(e) { return e.status && e.status.type === 'finished'; })
        .sort(function(a, b) { return b.startTimestamp - a.startTimestamp; });
      const live = ourEvents.find(function(e) { return e.status && e.status.type === 'inprogress'; });

      let streak = 0;
      for (const g of finished) {
        if (g.season && Number(g.season.id) !== season) break;
        const wc = g.winnerCode == null ? 0 : Number(g.winnerCode);
        if (wc !== 1 && wc !== 2) break;
        const won = wc === 1 ? Number(g.homeTeam.id) === sofaTeam : Number(g.awayTeam.id) === sofaTeam;
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
          .filter(function(e) { return Number(e.homeTeam && e.homeTeam.id) === sofaTeam || Number(e.awayTeam && e.awayTeam.id) === sofaTeam; })
          .filter(function(e) { return e.status && e.status.type === 'notstarted'; })
          .sort(function(a, b) { return a.startTimestamp - b.startTimestamp; });
        const league = nxt.filter(function(e) { return e.uniqueTournament && Number(e.uniqueTournament.id) === tour; });
        nextG = league[0] || nxt[0] || null;
      }

      const mc = function(info, ha, score, win) {
        return {
          team: { id: String(info.id), abbreviation: info.nameCode || info.shortName || '?', displayName: info.name },
          homeAway: ha, score: score != null ? { displayValue: String(score) } : null, winner: win
        };
      };

      const bld = function(e) {
        const fin = e.status && e.status.type === 'finished';
        const liveEv = e.status && e.status.type === 'inprogress';
        const home = e.homeTeam, away = e.awayTeam;
        let homeWin = null;
        if (fin && e.winnerCode != null) homeWin = Number(e.winnerCode) === 1;
        const d = new Date(Math.floor(e.startTimestamp) * 1000).toISOString();
        return {
          id: String(e.id), date: d,
          competitions: [{
            date: d, seasonType: { name: (e.season && e.season.name ? e.season.name : 'Regular Season') },
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
      };

      const lastEvent = finished[0] ? bld(finished[0]) : null;
      const liveEv = live ? bld(live) : null;
      const upcoming = liveEv || (nextG ? bld(nextG) : null);

      if (liveEv) {
        team._liveEvent = liveEv;
        team._liveScoreData = liveEv.competitions[0].competitors;
        team._liveStatus = liveEv.competitions[0].status;
      }

      await STL.render.renderTeam(team, {
        team: {
          logos: [{ href: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/St._Louis_City_SC_II.png' }],
          displayName: team.name,
          record: { items: [{ stats: [
            { name: 'wins', value: rec.wins }, { name: 'losses', value: rec.losses },
            { name: 'ties', value: rec.ties }, { name: 'points', value: rec.pts },
            { name: 'streak', value: streak }
          ]}]},
          standingSummary: standingStr
        }
      }, lastEvent, upcoming);

    } catch (e) {
      STL.render.renderError(team, 'Failed to load CITY2 data');
    }
  }
};
