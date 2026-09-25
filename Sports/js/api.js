window.STL = window.STL || {};

STL.api = {

  _liveScoreCache: {},

  enrichLiveScores: async function() {
    const sports = new Set(STL.config.TEAMS.map(t => t.sport + '/' + t.leagueSlug));
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
      const sportTeams = STL.config.TEAMS.filter(function(t) { return t.sport + '/' + t.leagueSlug === key; });
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

  fetchBoxScore: async function(team, event) {
    if (!event) return;
    try {
      const resp = await fetch(
        'https://site.api.espn.com/apis/site/v2/sports/' + team.sport + '/' + team.leagueSlug + '/summary?event=' + event.id
      );
      if (!resp.ok) return;
      const data = await resp.json();
      const bs = STL.api.parseBoxScore(data, event.id, false, team);
      if (bs) {
        team._boxScoreData = bs;
        team._boxScoreEventId = event.id;
      }
    } catch (e) {}
  },

  parseBoxScore: function(data, eventId, isLive, team) {
    try {
      const comps = data?.competitions?.[0]?.competitors || data?.header?.competitions?.[0]?.competitors;
      if (!comps || comps.length < 2) return null;
      const home = comps.find(c => c.homeAway === 'home');
      const away = comps.find(c => c.homeAway === 'away') || comps.find(c => c !== home);
      if (!home || !away) return null;
      const sport = team ? team.sport : '';
      const abbrFor = function(id) {
        const c = comps.find(function(x) { return String(x.team?.id) === String(id); });
        return c && c.team ? (c.team.abbreviation || c.team.shortDisplayName || '') : '';
      };
      const bs = {
        eventId: eventId,
        isLive: !!isLive,
        header: {
          home: { id: String(home.team?.id), abbr: abbrFor(home.team?.id) || 'H', name: home.team?.displayName || '', score: STL.utils.getScoreDisplay(home) },
          away: { id: String(away.team?.id), abbr: abbrFor(away.team?.id) || 'A', name: away.team?.displayName || '', score: STL.utils.getScoreDisplay(away) }
        },
        parts: [],
        scoring: [],
        skaters: [],
        goalies: [],
        teamStats: []
      };

      const lineVal = function(entry) {
        if (entry == null) return '';
        if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
        if (entry.displayValue != null) return String(entry.displayValue);
        if (entry.value != null) return String(entry.value);
        return '';
      };
      const SKIP_LABEL = '__SKIP__';
      const labelFor = function(entry, idx) {
        if (entry && typeof entry === 'object') {
          const n = parseInt(entry.number, 10);
          if (!isNaN(n)) return n <= 3 ? String(n) : (n === 4 ? 'OT' : n === 5 ? 'SO' : String(n));
          if (entry.name) {
            const nm = String(entry.name).trim().replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (nm === 't' || nm === 'tot' || nm === 'total' || nm === 'f' || nm === 'fin' || nm === 'final' || nm === 'ft') return SKIP_LABEL;
            if (nm === 'ot' || nm === 'ovt' || nm === 'overtime') return 'OT';
            if (nm === 'so' || nm === 'shootout' || nm === 'ps') return 'SO';
            const dm = nm.match(/^(\d+)$/);
            if (dm) return sport === 'basketball' ? 'Q' + dm[1] : dm[1];
            const qm = nm.match(/^q(\d+)$/) || nm.match(/^(\d+)q(r|t)?$/);
            if (qm) return 'Q' + qm[1];
            const hm = nm.match(/^(\d+)h(alf)?$/);
            if (hm) return hm[1] + 'H';
          }
        }
        return String((idx || 0) + 1);
      };
      const pushParts = function(la, lb) {
        const len = Math.max(la.length, lb.length);
        for (let i = 0; i < len; i++) {
          const label = labelFor(la[i] || lb[i] || { number: i + 1 }, i);
          if (label === SKIP_LABEL) continue;
          bs.parts.push({ label: label, home: lineVal(la[i]), away: lineVal(lb[i]) });
        }
        bs.parts.push({ label: 'T', home: bs.header.home.score, away: bs.header.away.score });
      };

      const homeLS = home.linescores;
      const awayLS = away.linescores;
      if (homeLS && awayLS && homeLS.length && awayLS.length) {
        pushParts(homeLS, awayLS);
      } else if (data?.boxscore?.teams) {
        const hb = data.boxscore.teams.find(t => String(t.team?.id) === String(home.team?.id));
        const ab = data.boxscore.teams.find(t => String(t.team?.id) === String(away.team?.id));
        const hls = hb && hb.linescores;
        const als = ab && ab.linescores;
        if (hls && als && hls.length && als.length) pushParts(hls, als);
      }

      const plays = data?.scoringPlays || [];
      if (plays.length) {
        const periodLabel = function(p) {
          if (p && typeof p === 'object') {
            const n = parseInt(p.number, 10);
            if (!isNaN(n)) return n <= 3 ? ['1st', '2nd', '3rd'][n - 1] : (n === 4 ? 'OT' : n === 5 ? 'SO' : String(n));
            if (p.displayValue) return String(p.displayValue);
          }
          return '';
        };
        for (const play of plays) {
          const type = (play.type && (play.type.text || play.type.name)) || '';
          const teamId = play.team && play.team.id;
          const abbr = abbrFor(teamId) || (play.team && play.team.abbreviation) || '';
          const pNames = (play.participants || []).map(pn => pn.athlete && pn.athlete.displayName).filter(Boolean);
          const clock = (play.clock && play.clock.displayValue) || (play.time && play.time.displayValue) || (play.clock && play.clock.value) || '';
          let text = '';
          if (pNames.length) {
            const scorer = pNames[0];
            const assists = pNames.slice(1);
            text = scorer + (assists.length ? ' (' + assists.join(', ') + ')' : '');
          } else if (play.description || play.textDescription) {
            text = play.description || play.textDescription;
          } else {
            continue;
          }
          let kind = '';
          if (type && sport && (sport === 'football' || sport === 'basketball') && type !== 'Goal') kind = type;
          bs.scoring.push({
            teamId: teamId != null ? String(teamId) : '',
            abbr: abbr || '',
            period: periodLabel(play.period),
            clock: String(clock),
            text: kind ? kind + ' ' + text : text,
            ours: team ? String(teamId) === String(team.id) : false
          });
        }
      }

      if (sport === 'hockey' && data?.boxscore?.players) {
        const num = function(x) { const n = parseInt(x, 10); return isNaN(n) ? null : n; };
        const skaters = [];
        for (const blk of data.boxscore.players) {
          const tri = String(blk.team?.id || '');
          if (tri !== String(team.id)) continue;
          const abbr = abbrFor(tri) || blk.team?.abbreviation || '';
          const cats = blk.statistics || [];
          for (const cat of cats) {
            if (cat.name !== 'forwards' && cat.name !== 'defenses') continue;
            for (const a of (cat.athletes || [])) {
              const av = a.stats || a.statistics;
              let g = null, aa = null, pm = null;
              if (Array.isArray(av)) {
                g = num(av[0]);
                aa = num(av[1]);
                pm = num(av[2]);
              }
              skaters.push({
                abbr: abbr,
                ours: tri === String(team.id),
                name: (a.athlete && a.athlete.displayName) || '',
                pos: (a.athlete && a.athlete.position && a.athlete.position.abbreviation) || '',
                g: g,
                a: aa,
                p: (g != null && aa != null) ? g + aa : null,
                pm: pm != null ? (pm > 0 ? '+' + pm : String(pm)) : null
              });
            }
          }
        }
        bs.skaters = skaters;
        for (const blk of data.boxscore.players) {
          const tri = String(blk.team?.id || '');
          if (tri !== String(team.id)) continue;
          const gstat = (blk.statistics || []).find(s => s.name === 'goalies');
          if (gstat && gstat.athletes) {
            for (const a of gstat.athletes) {
              const av = a.stats || a.statistics;
              bs.goalies.push({
                abbr: abbrFor(tri) || blk.team?.abbreviation || '',
                ours: tri === String(team.id),
                name: (a.athlete && a.athlete.displayName) || '',
                sa: (Array.isArray(av) && !isNaN(parseInt(av[0], 10))) ? parseInt(av[0], 10) : null,
                ga: (Array.isArray(av) && !isNaN(parseInt(av[1], 10))) ? parseInt(av[1], 10) : null,
                sv: (Array.isArray(av) && !isNaN(parseInt(av[2], 10))) ? parseInt(av[2], 10) : null,
                svpct: (Array.isArray(av) && av[3] != null) ? String(av[3]) : null
              });
            }
          }
        }
      }

      if (data?.boxscore?.teams) {
        for (const blk of data.boxscore.teams) {
          const tri = String(blk.team?.id || '');
          const st = blk.statistics || [];
          const val = function(name) {
            const s = st.find(s => s.name === name);
            return s && s.displayValue != null ? String(s.displayValue) : null;
          };
          if (sport === 'baseball') {
            const R = val('runs'), H = val('hits'), E = val('errors');
            if (R != null || H != null || E != null) {
              bs.teamStats.push({
                abbr: abbrFor(tri) || blk.team?.abbreviation || '',
                ours: tri === String(team.id),
                label: 'R-H-E',
                value: (R == null ? '-' : R) + '-' + (H == null ? '-' : H) + '-' + (E == null ? '-' : E)
              });
            }
          } else if (sport === 'hockey') {
            const s = val('shotsOnGoal') || val('shots');
            if (s != null) {
              bs.teamStats.push({
                abbr: abbrFor(tri) || blk.team?.abbreviation || '',
                ours: tri === String(team.id),
                label: 'Shots',
                value: s
              });
            }
          }
        }
      }

      if (!bs.parts.length && !bs.scoring.length && !bs.skaters.length && !bs.goalies.length && !bs.teamStats.length) return null;
      return bs;
    } catch (e) { return null; }
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
        team._liveBoxScore = STL.api.parseBoxScore(data, eventId, true, team) || null;
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

  /* ASA-sourced data (MLS standings override): fetches via ASA + CORS proxy with localStorage caching */

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
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const resp = await fetch(STL.utils.c2url(url));
        if (resp.status === 429) {
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          continue;
        }
        if (!resp.ok) return [];
        const data = await resp.json();
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + ttlMs }));
        } catch (e) {}
        return data;
      } catch (e) {
        if (attempt === 3) return [];
      }
    }
    return [];
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
    const computedRecord = { wins: compWins, losses: compLosses, ties: compDraws };
    if (team.sport === 'soccer') computedRecord.points = compWins * 3 + compDraws;
    team._computedRecord = computedRecord;

    team._lastGameEventId = lastEvent ? lastEvent.id : null;
    if (lastEvent && team._boxScoreEventId !== lastEvent.id) {
      await STL.api.fetchBoxScore(team, lastEvent);
    }

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
  }
};
