window.STL = window.STL || {};

STL.api = {

  _liveScoreCache: {},

  enrichLiveScores: async function() {
    const sports = new Set(STL.config.TEAMS.filter(t => !t.customFetch).map(t => t.sport + '/' + t.leagueSlug));
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
      const sportTeams = STL.config.TEAMS.filter(function(t) { return !t.customFetch && t.sport + '/' + t.leagueSlug === key; });
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
      const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/standings');
      if (!resp.ok) return;
      const data = await resp.json();
      const entries = data?.standings?.entries;
      if (!entries) return;
      for (const entry of entries) {
        const tid = entry.team?.id;
        if (!tid) continue;
        const rankStat = entry.stats?.find(s => s.name === 'rank');
        if (rankStat && rankStat.value != null) {
          const r = Math.round(rankStat.value);
          window._mlsOverall[tid] = r + STL.utils.suffix(r);
        }
      }
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

  fetchStatLeaders: async function(team, data) {
    if (team.sport === 'soccer') {
      try {
        const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/teams/' + team.id + '/roster?season=2026');
        if (!resp.ok) return;
        const roster = await resp.json();
        const players = [];
        for (const item of (roster.athletes || [])) {
          const cats = item.statistics?.splits?.categories;
          if (!cats) continue;
          const apps = STL.utils.findStatValue(cats, 'general', 'appearances');
          if (!apps) continue;
          players.push({
            name: item.shortName || item.displayName,
            goals: STL.utils.findStatValue(cats, 'offensive', 'totalGoals'),
            assists: STL.utils.findStatValue(cats, 'offensive', 'goalAssists')
          });
        }
        const top = function(arr, key) { return [...arr].sort((a, b) => b[key] - a[key]).filter(p => p[key] > 0).slice(0, 3); };
        const cats = [];
        const g = top(players, 'goals');
        if (g.length) cats.push({ cat: 'Goals', items: g.map(p => ({ name: p.name, val: p.goals })) });
        const a = top(players, 'assists');
        if (a.length) cats.push({ cat: 'Assists', items: a.map(p => ({ name: p.name, val: p.assists })) });
        if (cats.length) team._leaders = cats;
      } catch (e) {}
    } else if (team.sport === 'hockey') {
      try {
        const ne = data?.team?.nextEvent?.[0];
        if (!ne) return;
        const comps = ne.competitions?.[0]?.competitors;
        if (!comps) return;
        const us = comps.find(c => String(c.team.id) === String(team.id));
        const leaders = us?.roster?.leaders;
        if (!leaders) return;
        const seen = {};
        for (const group of leaders) {
          for (const entry of (group.leaders || [])) {
            const id = entry.athlete?.id;
            if (!id || seen[id]) continue;
            const cats = entry.statistics?.splits?.categories;
            if (!cats) continue;
            const off = cats.find(c => c.name === 'offensive');
            if (!off) continue;
            const ytdG = off.stats.find(s => s.name === 'ytdGoals');
            const pts = off.stats.find(s => s.name === 'points');
            const ast = off.stats.find(s => s.name === 'assists');
            if (!ytdG || !pts) continue;
            seen[id] = {
              name: entry.athlete.shortName || entry.athlete.displayName,
              goals: ytdG.value ?? 0,
              assists: ast ? (ast.value ?? 0) : 0,
              points: pts.value ?? 0
            };
          }
        }
        const items = Object.values(seen).filter(p => p.goals > 0 || p.points > 0);
        if (!items.length) return;
        const byPts = [...items].sort((a, b) => b.points - a.points).slice(0, 5);
        const byG = [...items].sort((a, b) => b.goals - a.goals).slice(0, 5);
        const cats = [];
        const g2 = byG.filter(p => p.goals > 0);
        if (g2.length) cats.push({ cat: 'Goals', items: g2.map(p => ({ name: p.name, val: p.goals })) });
        cats.push({ cat: 'Points', items: byPts.map(p => ({ name: p.name, val: p.points })) });
        team._leaders = cats;
      } catch (e) {}
    } else if (team.sport === 'baseball') {
      try {
        const resp = await fetch('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/' + team.id + '/statistics');
        if (!resp.ok) return;
        const st = await resp.json();
        const cats = st?.results?.stats?.categories;
        if (!cats) return;
        const batting = cats.find(c => c.name === 'batting')?.stats || [];
        const pitching = cats.find(c => c.name === 'pitching')?.stats || [];
        const fv = function(arr, name) { const s = arr.find(x => x.name === name); return s ? s.displayValue : '&mdash;'; };
        team._leaders = [
          { cat: 'Batting', items: [
            { name: 'AVG', val: fv(batting, 'avg') },
            { name: 'HR', val: fv(batting, 'homeRuns') },
            { name: 'RBI', val: fv(batting, 'RBIs') },
          ]},
          { cat: 'Pitching', items: [
            { name: 'ERA', val: fv(pitching, 'ERA') },
            { name: 'WHIP', val: fv(pitching, 'WHIP') },
            { name: 'K', val: fv(pitching, 'strikeouts') },
          ]}
        ];
      } catch (e) {}
    }
  },

  /* CITY2-specific: fetches via ASA + CORS proxy with localStorage caching */

  fetchAsa: async function(url) {
    const cacheKey = 'asa_cache_' + btoa(url);
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
        localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + 7 * 86400000 }));
      } catch (e) {}
      return data;
    } catch (e) {
      return [];
    }
  },

  fetchTeam: async function(team) {
    if (team.customFetch) {
      await STL.api.fetchCity2Data(team);
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
    try {
      const schedResp = await fetch(baseUrl + '/schedule');
      if (schedResp.ok) {
        const schedData = await schedResp.json();
        const events = schedData.events || [];
        let lastDate = null, nextDate = null;
        for (const e of events) {
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

    const renders = [];
    if (nextEvent) {
      renders.push(STL.api.fetchWinProb(team, nextEvent).then(function() {
        STL.render.renderTeam(team, data, lastEvent, nextEvent);
      }));
    }
    renders.push(STL.api.fetchStatLeaders(team, data).then(function() {
      STL.render.renderTeam(team, data, lastEvent, nextEvent);
    }));
    await Promise.all(renders);
  },

  fetchCity2Data: async function(team) {
    try {
      const [fullGames, premGames, asaTeams, asaStadia] = await Promise.all([
        fetch(STL.utils.c2url('https://app.americansocceranalysis.com/api/v1/mlsnp/games?season_name=2026')).then(function(r) { if (!r.ok) throw new Error(); return r.json(); }),
        fetch(STL.utils.c2url('https://app.americansocceranalysis.com/api/v1/mlsnp/games?season_name=2026&status=PreMatch')).then(function(r) { if (!r.ok) throw new Error(); return r.json(); }),
        STL.api.fetchAsa('https://app.americansocceranalysis.com/api/v1/mlsnp/teams'),
        STL.api.fetchAsa('https://app.americansocceranalysis.com/api/v1/mlsnp/stadia')
      ]);
      const allGames = fullGames.concat(premGames);

      const std = {};
      for (const g of allGames) {
        if (g.status !== 'FullTime') continue;
        if (g.home_score == null || g.away_score == null) continue;
        if (!std[g.home_team_id]) std[g.home_team_id] = { w:0, l:0, t:0, pts:0 };
        if (!std[g.away_team_id]) std[g.away_team_id] = { w:0, l:0, t:0, pts:0 };
        if (g.home_penalties != null || g.away_penalties != null) {
          std[g.home_team_id].t++; std[g.away_team_id].t++;
          const hp = g.home_penalties || 0, ap = g.away_penalties || 0;
          std[g.home_team_id].pts += hp > ap ? 2 : 1;
          std[g.away_team_id].pts += ap > hp ? 2 : 1;
        } else if (g.home_score > g.away_score) {
          std[g.home_team_id].w++; std[g.home_team_id].pts += 3;
          std[g.away_team_id].l++;
        } else {
          std[g.away_team_id].w++; std[g.away_team_id].pts += 3;
          std[g.home_team_id].l++;
        }
      }

      if (team.winsOffset) {
        if (!std[team.id]) std[team.id] = { w:0, l:0, t:0, pts:0 };
        std[team.id].w += team.winsOffset;
        std[team.id].pts += team.winsOffset * 3;
      }

      const west = Object.entries(std).filter(x => STL.config.WEST_CONF.has(x[0])).sort((a, b) => b[1].pts - a[1].pts);
      const idx = west.findIndex(x => x[0] === team.id);
      const rank = idx >= 0 ? idx + 1 : null;
      const rec = std[team.id] || { w:0, l:0, t:0, pts:0 };
      const standingStr = rank != null ? rank + STL.utils.suffix(rank) + ' in Western Conference' : 'Western Conference';

      const c2g = allGames.filter(g => g.home_team_id === team.id || g.away_team_id === team.id);
      const done = c2g.filter(g => g.status === 'FullTime').sort((a, b) => b.date_time_utc.localeCompare(a.date_time_utc));
      const soon = c2g.filter(g => g.status === 'PreMatch').sort((a, b) => a.date_time_utc.localeCompare(b.date_time_utc));
      const lastG = done[0] || null;
      const nextG = soon[0] || null;

      let streak = 0;
      for (const g of done) {
        let won;
        if (g.home_penalties != null || g.away_penalties != null) {
          won = g.home_team_id === team.id
            ? (g.home_penalties || 0) > (g.away_penalties || 0)
            : (g.away_penalties || 0) > (g.home_penalties || 0);
        } else if (g.home_score > g.away_score) {
          won = g.home_team_id === team.id;
        } else if (g.away_score > g.home_score) {
          won = g.away_team_id === team.id;
        } else {
          break;
        }
        if (streak === 0) {
          streak = won ? 1 : -1;
        } else if ((streak > 0 && won) || (streak < 0 && !won)) {
          streak += won ? 1 : -1;
        } else {
          break;
        }
      }

      var info = function(id) {
        if (!Array.isArray(asaTeams)) return { team_id: id, team_abbreviation: '?', team_name: '?' };
        return asaTeams.find(t => t.team_id === id) || { team_id: id, team_abbreviation: '?', team_name: '?' };
      };

      var mc = function(info, ha, score, win) {
        return { team: { id: info.team_id, abbreviation: info.team_abbreviation, displayName: info.team_name }, homeAway: ha, score: score != null ? { displayValue: String(score) } : null, winner: win };
      };

      var bld = function(g, last) {
        const homeI = info(g.home_team_id), awayI = info(g.away_team_id);
        const stad = asaStadia && asaStadia.length ? asaStadia.find(s => s.stadium_id === g.stadium_id) : null;
        let homeW = null;
        if (last && g.home_score != null && g.away_score != null) {
          homeW = (g.home_penalties != null || g.away_penalties != null)
            ? (g.home_penalties || 0) > (g.away_penalties || 0)
            : g.home_score > g.away_score;
        }
        const d = g.date_time_utc.replace(' ', 'T').replace(' UTC', 'Z');
        return {
          id: g.game_id, date: d,
          competitions: [{
            date: d, seasonType: { name: 'Regular Season' },
            status: { type: last ? { completed: true, state: 'post' } : { state: 'pre', completed: false }, displayClock: null },
            venue: { fullName: stad ? stad.stadium_name : '' },
            broadcasts: [{ media: { shortName: 'MLSNextPro.com' } }, { media: { shortName: 'OneFootball' } }],
            competitors: [mc(homeI, 'home', g.home_score, homeW), mc(awayI, 'away', g.away_score, homeW != null ? !homeW : null)]
          }]
        };
      };

      await STL.render.renderTeam(team, {
        team: {
          logos: [{ href: 'https://upload.wikimedia.org/wikipedia/commons/7/7e/St._Louis_City_SC_II.png' }],
          displayName: team.name,
          record: { items: [{ stats: [
            { name: 'wins', value: rec.w }, { name: 'losses', value: rec.l },
            { name: 'ties', value: rec.t }, { name: 'points', value: rec.pts },
            { name: 'streak', value: streak }
          ]}]},
          standingSummary: standingStr
        }
      }, lastG ? bld(lastG, true) : null, nextG ? bld(nextG, false) : null);

    } catch (e) {
      STL.render.renderError(team, 'Failed to load CITY2 data');
    }
  }
};
