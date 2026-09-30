window.STL = window.STL || {};

STL.api = {

  _liveScoreCache: {},

  enrichLiveScores: async function() {
    const teams = STL.dashboard.teamList().filter(t => !t.manual && !t.npbName && !t.kbo);
    const sports = new Set(teams.map(t => t.sport + '/' + t.leagueSlug));
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
      const sportTeams = teams.filter(function(t) { return t.sport + '/' + t.leagueSlug === key; });
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
      const matches = await STL.api.fetchMlsMatches();
      if (!matches || !matches.length) return;

      const std = {};
      for (const m of matches) {
        if (m.match_status !== 'finalWhistle') continue;
        if (m.home_team_goals == null || m.away_team_goals == null) continue;
        const hc = m.home_team_three_letter_code;
        const ac = m.away_team_three_letter_code;
        if (!hc || !ac) continue;
        for (const id of [hc, ac]) {
          if (!std[id]) std[id] = { w: 0, l: 0, d: 0, pts: 0 };
        }
        if (m.home_team_goals > m.away_team_goals) { std[hc].w++; std[hc].pts += 3; std[ac].l++; }
        else if (m.away_team_goals > m.home_team_goals) { std[ac].w++; std[ac].pts += 3; std[hc].l++; }
        else { std[hc].d++; std[ac].d++; std[hc].pts++; std[ac].pts++; }
      }

      const west = STL.config.MLSWEST.map(function(t) {
        return { id: t.espn, pts: (std[t.code] || { pts: 0 }).pts };
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

      const isGoalType = function(d) {
        const t = d && d.type && (d.type.text || d.type.name);
        return !!t && /goal|touchdown|home.?run|field goal|extra point|two.?point|safety|dunk|layup|three.?point|free throw/i.test(String(t));
      };
      const playSources = [
        data?.header?.competitions?.[0]?.details,
        data?.competitions?.[0]?.details,
        data?.plays
      ];
      let plays = data?.scoringPlays || [];
      if (!plays.length) {
        for (const src of playSources) {
          if (!src || !src.length) continue;
          const flagged = src.filter(function(d) { return d && d.scoringPlay === true; });
          if (flagged.length) { plays = flagged; break; }
        }
      }
      if (!plays.length) {
        for (const src of playSources) {
          if (!src || !src.length) continue;
          const typed = src.filter(function(d) { return d && isGoalType(d); });
          if (typed.length) { plays = typed; break; }
        }
      }
      if (plays.length) {
        const periodLabel = function(p) {
          if (typeof p === 'number') return p <= 3 ? ['1st', '2nd', '3rd'][p - 1] : (p === 4 ? 'OT' : p === 5 ? 'SO' : String(p));
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
          } else if (play.text || play.shortText || play.description || play.textDescription) {
            text = play.text || play.shortText || play.description || play.textDescription;
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

      if (!bs.parts.length && !bs.scoring.length && !bs.teamStats.length) return null;
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

  /* MLS-official data: stats-api.mlssoccer.com sends CORS *, so plain fetch with localStorage caching */

  fetchMlsMatches: async function() {
    const url = 'https://stats-api.mlssoccer.com/matches/seasons/' + STL.config.MLS_SEASON_ID +
      '?competition_id=' + STL.config.MLS_COMPETITION_ID +
      '&match_date%5Bgte%5D=2026-02-01&match_date%5Blte%5D=2026-12-31' +
      '&per_page=1000&sort=planned_kickoff_time%3Aasc';
    const cacheKey = 'mls_cache_' + btoa(url);
    const ttlMs = 6 * 3600000;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() < parsed.expiry) return parsed.data;
      }
    } catch (e) {}
    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      const matches = (data && data.schedule) || [];
      try {
        localStorage.setItem(cacheKey, JSON.stringify({ data: matches, expiry: Date.now() + ttlMs }));
      } catch (e) {}
      return matches;
    } catch (e) {
      return [];
    }
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
    if (team.manual) {
      STL.render.renderManual(team);
      return;
    }
    if (team.kbo) {
      return STL.api.fetchKboLive(team);
    }
    if (team.npbName) {
      return STL.api.fetchAsiaBaseball(team);
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
  },

  /* Farm-system affiliates. Lazy-loaded on dropdown open (see STL.toggle.aff).
     MiLB via MLB Stats API (CORS *). AHL/ECHL render statically until their
     league APIs are wired — panels never block the parent card. */

  _affCache: {},
  _affFetching: {},

  fetchAffiliates: async function(cardClass) {
    if (STL.api._affFetching[cardClass]) return;
    STL.api._affFetching[cardClass] = true;
    try {
      const key = cardClass === 'cardinals' ? 'cardinals' : cardClass === 'blues' ? 'blues' : null;
      if (!key) return;
      const list = (STL.config.AFFILIATES && STL.config.AFFILIATES[key]) || [];
      if (key === 'cardinals') {
        await Promise.all(list.map(a => STL.api.fetchMilbAffiliate(cardClass, a)));
      } else {
        await Promise.all(list.map(a => STL.api.fetchHockeyAffiliate(cardClass, a)));
      }
      STL.render.refreshAffPanel(cardClass);
    } finally {
      STL.api._affFetching[cardClass] = false;
    }
  },

  milbSeasonYear: function() { return new Date().getFullYear(); },

  fetchMilbScheduleFinal: async function(tid, sportId, season) {
    // Last regular-season game for the team + the leagueRecord snapshot
    // carried on it (authoritative final W-L — hydrate=record goes empty
    // offseason). Playoff/championship finals are skipped so the record and
    // the Last: line stay regular-season. &team= is ignored by the API, so
    // filter client-side.
    try {
      // Last ~4 weeks only: keeps the payload small (one call per sport).
      const isComplex = sportId === 16;
      const startDate = season + (isComplex ? '-07-01' : '-09-01');
      const endDate = season + (isComplex ? '-08-15' : '-10-01');
      const url = 'https://statsapi.mlb.com/api/v1/schedule?sportIds=' + sportId +
        '&season=' + season + '&startDate=' + startDate + '&endDate=' + endDate + '&hydrate=team';
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      const finals = [];
      for (const d of (data.dates || [])) {
        for (const g of (d.games || [])) {
          if (g.gameType && g.gameType !== 'R') continue;
          const st = g.status && g.status.detailedState;
          if (!/^final/i.test(st || '') && !/^completed early/i.test(st || '')) continue;
          const away = g.teams && g.teams.away;
          const home = g.teams && g.teams.home;
          if (!away || !home) continue;
          if (String(away.team.id) !== String(tid) && String(home.team.id) !== String(tid)) continue;
          finals.push(g);
        }
      }
      if (!finals.length) return null;
      finals.sort(function(a, b) { return new Date(a.gameDate) - new Date(b.gameDate); });
      const g = finals[finals.length - 1];
      const away = g.teams.away, home = g.teams.home;
      const ours = String(away.team.id) === String(tid) ? away : home;
      const opp = ours === away ? home : away;
      const isHome = ours === home;
      const lr = ours.leagueRecord || {};
      const ourScore = ours.score != null ? ours.score : '?';
      const oppScore = opp.score != null ? opp.score : '?';
      const res = ourScore > oppScore ? 'W' : ourScore < oppScore ? 'L' : 'D';
      let dateLabel = '';
      try {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const dt = new Date(g.gameDate);
        dateLabel = months[dt.getMonth()] + ' ' + dt.getDate();
      } catch (e) {}
      const oppName = (opp.team && opp.team.name) || 'opp';
      return {
        record: { wins: lr.wins || 0, losses: lr.losses || 0, ties: 0, pct: lr.pct || '' },
        lastGame: res + ' ' + ourScore + '-' + oppScore + ' ' + (isHome ? 'vs' : '@') + ' ' + oppName +
          (dateLabel ? ' · ' + dateLabel : '')
      };
    } catch (e) { return null; }
  },

  fetchMilbStanding: async function(tid, leagueId, season, sportId) {
    // date= must be in-season or records come back empty. Regular-season
    // table only — postseason/all-star rows are skipped.
    try {
      const date = season + (sportId === 16 ? '-07-23' : '-09-20');
      const url = 'https://statsapi.mlb.com/api/v1/standings?leagueId=' + leagueId + '&season=' + season + '&date=' + date;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      const recs = (data.records || []).filter(function(r) { return !r.standingsType || r.standingsType === 'regularSeason'; }).slice().reverse();
      for (const r of recs) {
        const rows = (r.teamRecords || []).slice().reverse();
        for (const row of rows) {
          if (String(row.team && row.team.id) !== String(tid)) continue;
          const lr = row.leagueRecord || {};
          if ((lr.wins || 0) + (lr.losses || 0) === 0) continue;
          let standing = null;
          const bits = [];
          // Rank + GB + streak only: the endpoint returns division/league as
          // bare {id,link} with no name, so no division label is available.
          if (row.divisionRank) {
            const rn = parseInt(row.divisionRank);
            bits.push(isFinite(rn) ? rn + STL.utils.suffix(rn) : row.divisionRank);
          }
          if (row.gamesBack != null && String(row.gamesBack) !== '-' && String(row.gamesBack) !== '0' && String(row.gamesBack) !== '0.0') {
            bits.push(row.gamesBack + ' GB');
          }
          if (row.streak && row.streak.streakCode) bits.push(row.streak.streakCode);
          if (bits.length) standing = bits.join(' · ');
          return {
            record: { wins: lr.wins || 0, losses: lr.losses || 0, ties: 0, pct: lr.pct || '' },
            standing: standing
          };
        }
      }
      return null;
    } catch (e) { return null; }
  },

  fetchMilbAffiliate: async function(cardClass, aff) {
    const cacheKey = 'milb_aff_v8_' + aff.name;
    const ttlMs = 6 * 3600000;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() < cached.expiry) {
        STL.api._affCache[aff.name] = cached.data;
        return;
      }
      // Drop stale entries (rows cached with empty or prior-year prospects,
      // or with an "undefined" division name in the standing line).
      try { localStorage.removeItem('milb_aff_v7_' + aff.name); } catch (e) {}
      try { localStorage.removeItem('milb_aff_v6_' + aff.name); } catch (e) {}
      try { localStorage.removeItem('milb_aff_v5_' + aff.name); } catch (e) {}
      try { localStorage.removeItem('milb_aff_v4_' + aff.name); } catch (e) {}
      try { localStorage.removeItem('milb_aff_v3_' + aff.name); } catch (e) {}
      try { localStorage.removeItem('milb_aff_v2_' + aff.name); } catch (e) {}
      try { localStorage.removeItem('milb_aff_' + aff.name); } catch (e) {}
    } catch (e) {}
    try {
      // Hardcoded ids (config.js). hydrate=record goes empty in the offseason,
      // so the record comes from the schedule-last-final snapshot with a
      // date-pinned standings fallback. Current year first, then prior year.
      const season = STL.api.milbSeasonYear();
      const tid = aff.id;
      if (!tid) throw new Error('team not found');
      const sportId = aff.sportId;
      const leagueId = aff.leagueId;
      let rec = null, lastGame = null, standing = null, usedSeason = season, isFinal = false;
      for (const yr of [season, season - 1]) {
        const sched = (sportId && tid) ? await STL.api.fetchMilbScheduleFinal(tid, sportId, yr) : null;
        const st = (leagueId && tid) ? await STL.api.fetchMilbStanding(tid, leagueId, yr, sportId) : null;
        const cand = (sched && sched.record && (sched.record.wins + sched.record.losses > 0)) ? sched.record
          : (st && st.record) ? st.record : null;
        if (cand && (cand.wins + cand.losses > 0)) {
          rec = cand;
          lastGame = (sched && sched.lastGame) || null;
          standing = (st && st.standing) || null;
          usedSeason = yr;
          isFinal = (yr !== season);
          break;
        }
      }
      if (!rec) throw new Error('no record found');
      // Prospects use the same season as the record (league leaderboards
      // filtered to our team, so they work offseason too). Falls back one
      // year if the first try comes up empty.
      let prospects = await STL.api.fetchMilbProspects(tid, usedSeason, sportId);
      let prospectSeason = usedSeason;
      if ((!prospects || !prospects.length) && usedSeason > season - 1) {
        const prevPros = await STL.api.fetchMilbProspects(tid, usedSeason - 1, sportId);
        if (prevPros && prevPros.length) {
          prospects = prevPros;
          prospectSeason = usedSeason - 1;
        }
      }
      const data = { record: rec, prospects: prospects, teamId: tid, season: usedSeason, isFinal: isFinal, lastGame: lastGame, standing: standing, prospectSeason: prospectSeason };
      STL.api._affCache[aff.name] = data;
      try { localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + ttlMs })); } catch (e) {}
    } catch (e) {
      if (!STL.api._affCache[aff.name]) {
        STL.api._affCache[aff.name] = { error: String(e.message || e) };
      }
    }
  },

  fetchMilbProspects: async function(mlbamId, season, sportId) {
    season = season || STL.api.milbSeasonYear();
    // League-wide season leaderboards, filtered to our team client-side.
    // (The roster hydrate only returns MLB-level stats, and the /stats
    // endpoint ignores its team param — verified 2026-09-30.) Hitters sorted
    // by OPS, pitchers by K (the ERA board is qualifier-limited, so the best
    // ERA is picked from our own pitchers after filtering).
    try {
      const base = 'https://statsapi.mlb.com/api/v1/stats?stats=season&season=' + season + '&gameType=R' +
        (sportId ? '&sportIds=' + sportId : '');
      const hitResp = await fetch(base + '&group=hitting&limit=200&sortStat=onBasePlusSlugging&order=desc');
      const pitResp = await fetch(base + '&group=pitching&limit=200&sortStat=strikeOuts&order=desc');
      const splitsOf = async function(resp) {
        try {
          if (!resp || !resp.ok) return [];
          const data = await resp.json();
          const out = [];
          for (const b of (data.stats || [])) {
            for (const sp of (b.splits || [])) out.push(sp);
          }
          return out;
        } catch (e) { return []; }
      };
      const hitters = [];
      const pitchers = [];
      for (const sp of (await splitsOf(hitResp))) {
        if (String(sp.team && sp.team.id) !== String(mlbamId)) continue;
        const s = sp.stat || {};
        const pa = s.plateAppearances || 0;
        if (pa < 50) continue;
        const ops = parseFloat(s.ops);
        if (!isFinite(ops)) continue;
        hitters.push({
          name: (sp.player && sp.player.fullName) || '',
          pos: (sp.position && sp.position.abbreviation) || '',
          avg: s.avg, hr: s.homeRuns, ops: s.ops, opsNum: ops
        });
      }
      for (const sp of (await splitsOf(pitResp))) {
        if (String(sp.team && sp.team.id) !== String(mlbamId)) continue;
        const s = sp.stat || {};
        const ip = parseFloat(s.inningsPitched);
        if (!isFinite(ip) || ip < 10) continue;
        pitchers.push({ name: (sp.player && sp.player.fullName) || '', pos: 'P', era: s.era, whip: s.whip, so: s.strikeOuts });
      }
      hitters.sort((a, b) => b.opsNum - a.opsNum);
      pitchers.sort((a, b) => parseFloat(a.era) - parseFloat(b.era));
      const out = hitters.slice(0, 2).map(h => ({ name: h.name, pos: h.pos, line: h.avg + ' AVG / ' + h.hr + ' HR / ' + h.ops + ' OPS' }));
      if (pitchers.length) {
        const p = pitchers[0];
        out.push({ name: p.name, pos: 'P', line: p.era + ' ERA / ' + p.whip + ' WHIP / ' + p.so + ' K' });
      } else if (hitters[2]) {
        const h = hitters[2];
        out.push({ name: h.name, pos: h.pos, line: h.avg + ' AVG / ' + h.hr + ' HR / ' + h.ops + ' OPS' });
      }
      return out.slice(0, 3);
    } catch (e) { return []; }
  },

  /* Hockey affiliates via HockeyTech LeagueStat (public client keys embedded
     in the league sites; same feed theahl.com/echl.com use). Served prefetch-first
     from Sports/data/blues-affiliates.json (same-origin, refreshed every 6h by
     .github/workflows/affiliates.yml); live HockeyTech fetch via CORS proxy
     chain (STL.api.HT.proxies) is the fallback, since HockeyTech sends no CORS
     headers. Season + team id resolved at runtime so no per-season edits are
     needed. 6h localStorage cache; any failure degrades to the static row. */

  HT: {
    base: 'https://lscluster.hockeytech.com/feed/index.php',
    // Verified 2026-09-30: both forward the body unchanged + Access-Control-Allow-Origin: *.
    // cors.lol is primary but rate-limits bursts (HTTP 429); allorigins is the
    // fallback but throws transient 520s. (codetabs 522, corsproxy.io needs an
    // API key, corsfix/isomorphic-git reject us.)
    proxies: [
      'https://api.cors.lol/?url=',
      'https://api.allorigins.win/raw?url='
    ],
    leagues: {
      ahl: { code: 'ahl', key: 'ccb91f29d6744675' },
      echl: { code: 'echl', key: '2c2b89ea7345cae8' }
    }
  },

  htUrl: function(league, params) {
    const lg = STL.api.HT.leagues[league];
    let url = STL.api.HT.base + '?key=' + lg.key + '&client_code=' + lg.code + '&fmt=json';
    for (const k in params) url += '&' + k + '=' + encodeURIComponent(params[k]);
    return url;
  },

  _sleep: function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); },

  // Prefetched affiliate panels, fetched once per page load (6h memory cache).
  _affPrefetch: null,

  fetchAffPrefetch: async function() {
    const now = Date.now();
    if (STL.api._affPrefetch && now - STL.api._affPrefetch.at < 6 * 3600000) {
      return STL.api._affPrefetch.data;
    }
    const resp = await fetch('data/blues-affiliates.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    STL.api._affPrefetch = { at: now, data: data };
    return data;
  },

  htFetchJson: async function(cacheKey, url, ttlMs) {
    ttlMs = ttlMs || 6 * 3600000;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() < cached.expiry) return cached.data;
    } catch (e) {}
    const load = async function(u) {
      const resp = await fetch(u);
      if (!resp.ok) {
        const err = new Error('HTTP ' + resp.status);
        err.status = resp.status;
        throw err;
      }
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        // statviewfeed schedule comes back as JSONP: ([{...}])
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start < 0 || end < 0) throw e;
        return JSON.parse(text.substring(start, end + 1));
      }
    };
    const store = function(data) {
      try { localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + ttlMs })); } catch (e) {}
    };
    // Proxied first (works in browsers), direct as fallback (works server-side
    // and if HockeyTech ever adds CORS headers). Cached body is identical either way.
    // Proxies are chained: a failure on one falls through to the next, and
    // HTTP 429 (burst rate-limit) is retried with backoff before moving on.
    const targets = STL.api.HT.proxies.map(function(p) { return p + encodeURIComponent(url); });
    targets.push(url);
    let lastErr = null;
    for (const t of targets) {
      const isDirect = (t === url);
      let attempt = 0;
      while (true) {
        try {
          const data = await load(t);
          store(data);
          return data;
        } catch (e) {
          lastErr = e;
          const retryable = !isDirect && e && (e.status === 429 || (e.status >= 500 && e.status <= 599)) && attempt < 2;
          if (retryable) { attempt++; await STL.api._sleep(1500 * attempt); continue; }
          break;
        }
      }
    }
    throw lastErr || new Error('fetch failed');
  },

  htPickSeason: function(seasons) {
    if (!seasons || !seasons.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    const isReg = s => /regular/i.test(s.season_name || '');
    const inRange = seasons.filter(s => s.start_date <= today && today <= s.end_date);
    const regInRange = inRange.filter(isReg);
    if (regInRange.length) return regInRange[regInRange.length - 1];
    if (inRange.length) return inRange[inRange.length - 1];
    const regs = seasons.filter(s => isReg(s) && String(s.career) === '1');
    if (regs.length) {
      regs.sort((a, b) => String(a.season_id).localeCompare(String(b.season_id), undefined, { numeric: true }));
      return regs[regs.length - 1];
    }
    return seasons[seasons.length - 1];
  },

  htPriorRegular: function(seasons) {
    // Most recent completed regular season: name matches /regular/,
    // career==1, ended before today. Playoffs are separate entries.
    if (!seasons || !seasons.length) return null;
    const today = new Date().toISOString().slice(0, 10);
    const regs = seasons.filter(s =>
      /regular/i.test(s.season_name || '') && String(s.career) === '1' && s.end_date < today);
    if (!regs.length) return null;
    regs.sort((a, b) => String(a.season_id).localeCompare(String(b.season_id), undefined, { numeric: true }));
    return regs[regs.length - 1];
  },

  fetchHockeySeasonData: async function(league, aff, season, ttlMs) {
    const sid = season.season_id;
    const teamsData = await STL.api.htFetchJson(
      'ht_teams_' + league + '_' + sid,
      STL.api.htUrl(league, { feed: 'modulekit', view: 'teamsbyseason', season_id: sid }), ttlMs);
    const teams = (teamsData && teamsData.SiteKit && teamsData.SiteKit.Teamsbyseason) || [];
    const us = teams.find(t => String(t.name || '').toLowerCase() === aff.name.toLowerCase());
    if (!us) throw new Error('team not found');
    const tid = us.id;

    let record = null;
    let standing = null;
    try {
      const stdData = await STL.api.htFetchJson(
        'ht_std_' + league + '_' + sid,
        STL.api.htUrl(league, { feed: 'modulekit', view: 'statviewtype', stat: 'division', type: 'standings', season_id: sid }), ttlMs);
      const rows = (stdData && stdData.SiteKit && stdData.SiteKit.Statviewtype) || [];
      const row = rows.find(r => String(r.team_id) === String(tid));
      if (row) {
        record = {
          wins: parseInt(row.wins) || 0,
          losses: parseInt(row.losses) || 0,
          otl: parseInt(row.ot_losses) || 0,
          sol: parseInt(row.shootout_losses) || 0,
          points: parseInt(row.points) || 0,
          streak: row.streak || ''
        };
        const divName = row.divisname || row.division_name || '';
        const rn = parseInt(row.rank);
        if (isFinite(rn)) {
          standing = rn + STL.utils.suffix(rn) + (divName ? ' ' + divName : '');
        } else if (row.rank) {
          standing = String(row.rank);
        }
      }
    } catch (e) {}

    let prospects = [];
    try {
      const skData = await STL.api.htFetchJson(
        'ht_sk_' + league + '_' + tid + '_' + sid,
        STL.api.htUrl(league, { feed: 'modulekit', view: 'statviewtype', type: 'skaters', team_id: tid, season_id: sid, sort: 'points' }), ttlMs);
      const skaters = ((skData && skData.SiteKit && skData.SiteKit.Statviewtype) || [])
        .filter(p => p.position !== 'G' && parseInt(p.points) > 0);
      prospects = skaters.slice(0, 3).map(p => ({
        name: p.name || (p.first_name + ' ' + p.last_name),
        pos: p.position || '',
        line: p.goals + ' G / ' + p.assists + ' A / ' + p.points + ' PTS · ' + p.games_played + ' GP'
      }));
    } catch (e) {}

    const games = await STL.api.fetchHockeySchedule(league, tid, sid, ttlMs);
    return {
      record: record, prospects: prospects, standing: standing,
      lastGame: games.last, nextGame: games.next,
      seasonName: season.season_name, seasonStart: season.start_date
    };
  },

  fetchHockeyAffiliate: async function(cardClass, aff) {
    const cacheKey = 'ht_aff_v2_' + aff.name;
    const ttlMs = 6 * 3600000;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() < cached.expiry) {
        STL.api._affCache[aff.name] = cached.data;
        return;
      }
    } catch (e) {}
    // Drop the stale v1 entry (preseason 0-0-0 rows without finals).
    try { localStorage.removeItem('ht_aff_' + aff.name); } catch (e) {}
    // Prefetched panels (Sports/data/blues-affiliates.json, refreshed every 6h
    // by .github/workflows/affiliates.yml). Same-origin, so no CORS involved.
    // Falls through to the live path when missing, errored, or older than 24h.
    try {
      const pre = await STL.api.fetchAffPrefetch();
      const gen = pre && pre.generated_at ? Date.parse(pre.generated_at) : 0;
      const entry = pre && pre.affiliates && pre.affiliates[aff.name];
      if (entry && !entry.error && gen && Date.now() - gen < 24 * 3600000) {
        STL.api._affCache[aff.name] = entry;
        try { localStorage.setItem(cacheKey, JSON.stringify({ data: entry, expiry: Date.now() + ttlMs })); } catch (e) {}
        return;
      }
    } catch (e) {}
    try {
      const league = aff.league;
      const seasonsData = await STL.api.htFetchJson(
        'ht_seasons_' + league,
        STL.api.htUrl(league, { feed: 'modulekit', view: 'seasons' }), ttlMs);
      const allSeasons = seasonsData && seasonsData.SiteKit && seasonsData.SiteKit.Seasons;
      const season = STL.api.htPickSeason(allSeasons);
      if (!season) throw new Error('no season');
      const cur = await STL.api.fetchHockeySeasonData(league, aff, season, ttlMs);
      // Preseason/offseason: show the most recent completed regular season's
      // final (record + last game + prospects), keeping the current next game.
      const curGames = cur.record ?
        (cur.record.wins + cur.record.losses + cur.record.otl + cur.record.sol) : 0;
      const isPreseason = /preseason/i.test(season.season_name || '');
      const isEmpty = !cur.record || (curGames === 0 && !cur.lastGame && (!cur.prospects || !cur.prospects.length));
      let data = cur;
      if (isPreseason || isEmpty) {
        const prior = STL.api.htPriorRegular(allSeasons);
        if (prior && String(prior.season_id) !== String(season.season_id)) {
          try {
            const prev = await STL.api.fetchHockeySeasonData(league, aff, prior, ttlMs);
            const prevGames = prev.record ? (prev.record.wins + prev.record.losses) : 0;
            if (prevGames > 0) {
              data = {
                record: prev.record,
                prospects: prev.prospects,
                standing: prev.standing,
                lastGame: prev.lastGame,
                nextGame: cur.nextGame,
                seasonName: prev.seasonName,
                seasonStart: prev.seasonStart,
                isFinal: true
              };
            }
          } catch (e) {}
        }
      }
      STL.api._affCache[aff.name] = data;
      try { localStorage.setItem(cacheKey, JSON.stringify({ data: data, expiry: Date.now() + ttlMs })); } catch (e) {}
    } catch (e) {
      if (!STL.api._affCache[aff.name]) {
        STL.api._affCache[aff.name] = { error: String(e.message || e) };
      }
    }
  },

  fetchHockeySchedule: async function(league, teamId, seasonId, ttlMs) {
    const out = { last: null, next: null };
    try {
      const data = await STL.api.htFetchJson(
        'ht_sched_' + league + '_' + teamId + '_' + seasonId,
        STL.api.htUrl(league, { feed: 'statviewfeed', view: 'schedule', team: teamId, season: seasonId, month: -1 }), ttlMs);
      const rows = [];
      (data || []).forEach(sec => ((sec && sec.sections) || []).forEach(s => ((s && s.data) || []).forEach(d => {
        if (d && d.row && d.row.game_status) rows.push({ row: d.row, prop: d.prop || {} });
      })));
      if (!rows.length) return out;
      // Any 'Final*' status (Final, Final OT, Final SO) is a completed game.
      const isFinal = g => /^final/i.test(g.row.game_status || '');
      let nextIdx = rows.findIndex(g => !isFinal(g));
      if (nextIdx < 0) nextIdx = rows.length;
      const fmtSide = g => {
        const home = String((g.prop.home_team_city || {}).teamLink) === String(teamId);
        const opp = home ? g.row.visiting_team_city : g.row.home_team_city;
        return { home: home, opp: opp };
      };
      if (nextIdx > 0) {
        const g = rows[nextIdx - 1];
        const s = fmtSide(g);
        const ours = parseInt(s.home ? g.row.home_goal_count : g.row.visiting_goal_count);
        const oppS = parseInt(s.home ? g.row.visiting_goal_count : g.row.home_goal_count);
        const res = ours > oppS ? 'W' : ours < oppS ? 'L' : 'D';
        out.last = res + ' ' + ours + '-' + oppS + ' ' + (s.home ? 'vs' : '@') + ' ' + s.opp +
          ((g.row.date_with_day || g.row.date) ? ' · ' + (g.row.date_with_day || g.row.date) : '');
      }
      if (nextIdx < rows.length) {
        const g = rows[nextIdx];
        const s = fmtSide(g);
        out.next = [(s.home ? 'vs' : '@') + ' ' + s.opp, g.row.date_with_day || g.row.date, g.row.game_status]
          .filter(Boolean).join(' · ');
      }
    } catch (e) {}
    return out;
  },

  /* Asia baseball: NPB via the free npb-result worker API; KBO via a live
     scrape of the official KBO standings HTML. Both degrade gracefully. */

  fetchAsiaBaseball: async function(team) {
    try {
      await STL.api.fetchNpb(team);
    } catch (e) {
      STL.render.renderManual(team);
    }
  },

  fetchNpb: async function(team) {
    const cacheKey = 'npb_pl_standings';
    const ttlMs = 6 * 3600000;
    let rows = null;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey));
      if (cached && Date.now() < cached.expiry) rows = cached.data;
    } catch (e) {}
    if (!rows) {
      const resp = await fetch('https://npb-result.ant-npb.workers.dev/api/pl');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      rows = await resp.json();
      try { localStorage.setItem(cacheKey, JSON.stringify({ data: rows, expiry: Date.now() + ttlMs })); } catch (e) {}
    }
    const us = (rows || []).find(r => r.name === team.npbName);
    if (!us) throw new Error('team not found');
    STL.render.renderAsiaCard(team, {
      wins: us.win, losses: us.lose, ties: us.draw,
      pct: us.pct != null ? String(us.pct).replace(/^0/, '') : '',
      rank: us.rank, leagueName: 'Pacific League',
      gb: us.gamesBehind, remaining: us.remainingGames
    });
  },

  fetchKboLive: async function(team) {
    const cacheKey = 'kbo_standings_html';
    const ttlMs = 6 * 3600000;
    const fallback = function() {
      if (team.manualFallback) {
        STL.render.renderAsiaCard(team, team.manualFallback);
      } else {
        STL.render.renderManual(team);
      }
    };
    try {
      let html = null;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey));
        if (cached && Date.now() < cached.expiry) html = cached.data;
      } catch (e) {}
      if (!html) {
        const resp = await fetch('https://eng.koreabaseball.com/Standings/TeamStandings.aspx');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        html = await resp.text();
        try { localStorage.setItem(cacheKey, JSON.stringify({ data: html, expiry: Date.now() + ttlMs })); } catch (e) {}
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const cells = doc.querySelectorAll('td[title="TEAM"]');
      let row = null;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].textContent.trim().toUpperCase() === team.kboName.toUpperCase()) {
          row = cells[i].parentElement;
          break;
        }
      }
      if (!row) throw new Error('team row not found');
      const val = function(title) {
        const c = row.querySelector('td[title="' + title + '"]');
        return c ? c.textContent.trim() : null;
      };
      const games = parseInt(val('GAMES')) || 0;
      STL.render.renderAsiaCard(team, {
        wins: parseInt(val('W')), losses: parseInt(val('L')), ties: parseInt(val('D')) || 0,
        pct: val('PCT') ? String(val('PCT')).replace(/^0/, '') : '',
        rank: parseInt(val('RK')), leagueName: 'KBO League',
        gb: val('GB'), streak: val('STREAK'),
        remaining: games ? 144 - games : null
      });
    } catch (e) {
      fallback();
    }
  }
};
