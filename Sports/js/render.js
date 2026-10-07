window.STL = window.STL || {};

STL.render = {

  buildCards: function(teams) {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';
    const list = teams || STL.dashboard.teamList();
    list.forEach(t => {
      const art = document.createElement('article');
      art.className = 'teamcard team-' + t.cardClass;
      art.id = 'card-' + t.cardClass;
      art.innerHTML =
        '<div class="spine"></div>' +
        '<div class="tmain">' +
          '<div class="trow1">' +
            '<div>' +
              '<div class="tname">' + t.name + '</div>' +
              '<div class="tleague">' + t.league + (t.leagueFull && t.leagueFull !== t.league ? ' &middot; ' + t.leagueFull : '') + '</div>' +
            '</div>' +
            '<div class="trecord" id="headSub-' + t.cardClass + '">&mdash;</div>' +
          '</div>' +
          '<div class="tsub" id="headNext-' + t.cardClass + '"></div>' +
          '<span class="tstatus ' + t.statusClass + '" id="badge-' + t.cardClass + '">' + t.statusText + '</span><br>' +
          '<button class="details-btn" data-card="' + t.cardClass + '">+ details</button>' +
        '<div class="tbody" id="body-' + t.cardClass + '">' +
          '<div class="stat-row">' +
            '<span class="stat-label">Record</span>' +
            '<span class="stat-value" id="record-' + t.cardClass + '">&mdash;</span>' +
          '</div>' +
          '<div class="stat-row" id="pointsRow-' + t.cardClass + '" style="display:none">' +
            '<span class="stat-label">Points</span>' +
            '<span class="stat-value" id="points-' + t.cardClass + '"></span>' +
          '</div>' +
          '<div class="stat-row" id="standingRow-' + t.cardClass + '" style="display:none">' +
            '<span class="stat-label">Standing</span>' +
            '<span class="stat-value" id="standing-' + t.cardClass + '"></span>' +
          '</div>' +
          '<div class="stat-row" id="streakRow-' + t.cardClass + '" style="display:none">' +
            '<span class="stat-label">Streak</span>' +
            '<span class="stat-value" id="streak-' + t.cardClass + '"></span>' +
          '</div>' +
          '<div class="stat-row">' +
            '<span class="stat-label">Last Game</span>' +
            '<span class="stat-value" id="lastGame-' + t.cardClass + '">&mdash;</span>' +
          '</div>' +
          '<div id="boxScore-' + t.cardClass + '"></div>' +
          '<div id="nextGame-' + t.cardClass + '"></div>' +
          '<div class="countdown-timer" id="countdown-' + t.cardClass + '" data-target="" style="display:none"></div>' +
          '<div class="live-banner" id="liveBanner-' + t.cardClass + '" style="display:none">' +
            '<span class="live-badge">LIVE</span>' +
            '<span class="live-score" id="liveScore-' + t.cardClass + '"></span>' +
            '<div class="live-info" id="liveInfo-' + t.cardClass + '"></div>' +
          '</div>' +
          '<div id="capContainer-' + t.cardClass + '" style="display:none">' +
            '<button class="cap-toggle" onclick="STL.toggle.cap(this,\'' + t.cardClass + '\')">' +
              '<span class="cap-toggle-icon">&#9654;</span> Cap' +
            '</button>' +
            '<div class="cap-panel" id="capPanel-' + t.cardClass + '"></div>' +
          '</div>' +
          '<div id="affContainer-' + t.cardClass + '" style="display:none">' +
            '<button class="aff-toggle" onclick="STL.toggle.aff(this,\'' + t.cardClass + '\')">' +
              '<span class="aff-toggle-icon">&#9654;</span> <span id="affLabel-' + t.cardClass + '">Affiliates</span>' +
            '</button>' +
            '<div class="aff-panel" id="affPanel-' + t.cardClass + '"></div>' +
          '</div>' +
          '<div class="links" id="links-' + t.cardClass + '"></div>' +
        '</div></div>';
      grid.appendChild(art);
    });
    grid.querySelectorAll('.details-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const card = btn.closest('.teamcard');
        card.classList.toggle('open');
        btn.textContent = card.classList.contains('open') ? '\u2013 close' : '+ details';
      });
    });
  },

  renderError: function(team, msg) {
    const body = document.getElementById('body-' + team.cardClass);
    if (body) body.innerHTML = '<div class="error-msg">' + msg + '</div>';
  },

  renderNextGameHtml: function(team, ev, comp, st, vs, opponent, isLive) {
    const dateStrFull = STL.utils.formatDateStr(comp.date, true);
    const timeStr = STL.utils.formatTimeStr(comp.date);
    const venue = comp.venue ? comp.venue.fullName : '';
    const broadcasts = comp.broadcasts && comp.broadcasts.length > 0
      ? [...new Set(comp.broadcasts.map(b => b.media ? b.media.shortName : '').filter(Boolean))].join(', ')
      : '';
    const label = isLive ? 'In Progress' : 'Next Game';
    let detailHtml = '';
    if (isLive && st.detail) {
      const dc = comp.status.displayClock;
      const clock = dc && dc !== '0:00' ? ' (' + dc + ')' : '';
      detailHtml = '<div style="color:var(--card-mute);font-size:0.75rem;margin-top:2px;">' + st.detail + clock + '</div>';
    }
    let winHtml = '';
    if (team._winProb !== undefined) {
      const wp = team._winProb;
      const color = wp > 60 ? '#4caf50' : wp > 40 ? '#ff9800' : '#f44336';
      winHtml = '<div style="font-size:0.75rem;margin-top:3px;color:' + (isLive ? color : 'var(--card-mute)') + ';">' + (isLive ? 'Live Win' : 'Win') + ': ' + wp + '%</div>';
    }
    let lineupHtml = '';
    const ld = team._lineupData;
    if (ld) {
      let rows = '';
      if (ld.sport === 'baseball') {
        rows = ld.batters.map(b =>
          '<div class="lineup-row"><span class="order">' + b.batOrder + '.</span><span class="pos">' + b.position + '</span><span class="name">' + b.name + '</span></div>'
        ).join('');
        if (ld.startingPitcher) {
          rows += '<div class="sp-label">SP: ' + ld.startingPitcher.name + (ld.startingPitcher.throws ? ' (' + ld.startingPitcher.throws + ')' : '') + '</div>';
        }
      } else if (ld.sport === 'soccer') {
        const formLabel = ld.formation ? ' &middot; ' + ld.formation : '';
        rows = '<div class="lineup-header">Starting XI' + formLabel + '</div>';
        rows += ld.starters.map(s =>
          '<div class="lineup-row"><span class="pos">' + s.position + '</span><span class="name">' + s.name + '</span></div>'
        ).join('');
      } else if (ld.sport === 'hockey') {
        rows = '<div class="lineup-header">Lineup</div>';
        if (ld.forwards.length) {
          rows += '<div class="lineup-row"><span class="pos">F:</span><span class="name">' + ld.forwards.map(f => f.name).join(', ') + '</span></div>';
        }
        if (ld.defensemen.length) {
          rows += '<div class="lineup-row"><span class="pos">D:</span><span class="name">' + ld.defensemen.map(d => d.name).join(', ') + '</span></div>';
        }
        if (ld.startingGoalie) {
          rows += '<div class="lineup-row"><span class="pos">G:</span><span class="name">' + ld.startingGoalie.name + '</span></div>';
        } else if (ld.goalies.length) {
          rows += '<div class="lineup-row"><span class="pos">G:</span><span class="name">' + ld.goalies.map(g => g.name).join(', ') + '</span></div>';
        }
      }
      lineupHtml =
        '<button class="lineup-toggle" onclick="STL.toggle.lineup(this,\'' + team.cardClass + '\')">' +
          '<span class="lineup-toggle-icon">&#9654;</span> Lineup' +
        '</button>' +
        '<div class="lineup-panel">' + rows + '</div>';
    }
    return (
      '<div class="next-game">' +
        '<div class="next-game-label">' + label + '</div>' +
        '<div class="next-game-detail">' + vs + ' ' + opponent.team.displayName + ' &middot; ' + dateStrFull + ' &middot; ' + timeStr + '</div>' +
        detailHtml +
        (venue ? '<div style="color:var(--card-mute);font-size:0.75rem;margin-top:2px;">' + venue + (broadcasts ? ' &middot; ' + broadcasts : '') + '</div>' : '') +
        winHtml +
        lineupHtml +
      '</div>'
    );
  },

  renderEventComp: function(team, ev, isLast) {
    const comp = ev.competitions[0];
    const st = comp.status.type;
    const homeAway = comp.competitors.find(c => String(c.team.id) === String(team.id));
    const opponent = comp.competitors.find(c => String(c.team.id) !== String(team.id));
    if (!homeAway || !opponent) return {};
    const isHome = homeAway.homeAway === 'home';
    const vs = isHome ? 'vs' : '@';
    const oppAbbr = opponent.team.abbreviation;
    const result = {};

    if (st.completed === true || st.state === 'post') {
      const ourScore = homeAway.score ? homeAway.score.displayValue : '?';
      const oppScore = opponent.score ? opponent.score.displayValue : '?';
      const won = homeAway.winner === true;
      const lost = opponent.winner === true;
      const resultChar = won ? 'W' : lost ? 'L' : 'D';
      const resultClass = won ? 'win' : lost ? 'loss' : 'draw';
      const dateLabel = STL.utils.formatDateStr(comp.date);
      result.lastGameHtml = '<span class="stat-value ' + resultClass + '">' + resultChar + ' ' + ourScore + '-' + oppScore + ' ' + vs + ' ' + oppAbbr + ' &middot; ' + dateLabel + '</span>';
    } else if (st.state === 'in') {
      const comps = team._liveScoreData || comp.competitors;
      const ha = comps.find(c => String(c.team.id) === String(team.id));
      const opp = comps.find(c => String(c.team.id) !== String(team.id));
      const ourScore = STL.utils.getScoreDisplay(ha);
      const oppScore = STL.utils.getScoreDisplay(opp);
      if (!team._liveEvent) {
        team._liveEvent = ev;
        team._liveScoreData = comps;
        team._liveStatus = st;
      }
      if (isLast) {
        const detail = st.detail ? ' &middot; ' + st.detail : '';
        result.lastGameHtml = '<span class="stat-value win">' + ourScore + '-' + oppScore + ' ' + vs + ' ' + oppAbbr + detail + '</span>';
      } else {
        result.nextGameHtml = STL.render.renderNextGameHtml(team, ev, comp, st, vs, opponent, true);
      }
      result.statusText = 'Live';
      result.statusClass = 'status-live';
    } else if (!isLast) {
      result.nextGameHtml = STL.render.renderNextGameHtml(team, ev, comp, st, vs, opponent, false);
    }
    return result;
  },

  renderBoxScore: function(team) {
    const live = (team._liveStatus && team._liveStatus.type && team._liveStatus.type.state === 'in') || !!(team._liveEvent);
    let bs = null;
    if (live) {
      bs = team._liveBoxScore && team._liveBoxScore.isLive ? team._liveBoxScore : null;
    } else if (team._boxScoreData && team._boxScoreData.isLive !== true &&
        team._lastGameEventId != null && team._boxScoreEventId === team._lastGameEventId) {
      bs = team._boxScoreData;
    }
    if (!bs) return null;
    const isLive = !!bs.isLive;
    const stlIsAway = bs.header.away.id === String(team.id);
    const away = bs.header.away;
    const home = bs.header.home;

    const stlSpan = function(side, text) {
      const isStl = (stlIsAway && side === 'away') || (!stlIsAway && side === 'home');
      return isStl ? '<span class="bs-stl">' + text + '</span>' : text;
    };

    let html = '';
    const statusLabel = isLive ? 'LIVE' : 'FINAL';
    html += '<div class="bs-head">' + statusLabel + ' &middot; ' +
      stlSpan('away', away.abbr + ' ' + away.score) + ' - ' + stlSpan('home', home.score + ' ' + home.abbr) + '</div>';

    if (bs.parts.length) {
      const head = bs.parts.map(p => '<th>' + p.label + '</th>').join('');
      const homeCells = bs.parts.map(p => '<td>' + p.home + '</td>').join('');
      const awayCells = bs.parts.map(p => '<td>' + p.away + '</td>').join('');
      html += '<table class="bs-parts"><thead><tr><th></th>' + head + '</tr></thead><tbody>' +
        '<tr class="' + (stlIsAway ? 'bs-ours' : '') + '"><td>' + away.abbr + '</td>' + awayCells + '</tr>' +
        '<tr class="' + (!stlIsAway ? 'bs-ours' : '') + '"><td>' + home.abbr + '</td>' + homeCells + '</tr>' +
        '</tbody></table>';
    }

    if (bs.teamStats.length) {
      html += '<div class="bs-stats">' + bs.teamStats.map(function(s) {
        return '<span class="' + (s.ours ? 'bs-stat-ours' : '') + '">' + s.label + ': ' + s.abbr + ' ' + s.value + '</span>';
      }).join(' &nbsp;&middot;&nbsp; ') + '</div>';
    }

    if (bs.scoring.length) {
      const groups = [];
      bs.scoring.forEach(function(s) {
        let g = null;
        for (let i = 0; i < groups.length; i++) {
          if (groups[i].period === s.period) { g = groups[i]; break; }
        }
        if (!g) {
          g = { period: s.period, rows: [] };
          groups.push(g);
        }
        g.rows.push(s);
      });
      html += '<div class="bs-scoring">';
      groups.forEach(function(g) {
        html += '<div class="lineup-header">' + (g.period || 'Scoring') + '</div>';
        g.rows.forEach(function(r) {
          html += '<div class="bs-row' + (r.ours ? ' ours' : '') + '">' +
            '<span class="bs-clock">' + (r.clock ? r.clock : '') + '</span>' +
            '<span class="bs-scorer">' + r.text + '</span>' +
            '<span class="bs-abbr">' + r.abbr + '</span>' +
          '</div>';
        });
      });
      html += '</div>';
    }

    return html;
  },

  renderTeam: async function(team, data, schedLastEvent, schedNextEvent) {
    const body = document.getElementById('body-' + team.cardClass);
    const badge = document.getElementById('badge-' + team.cardClass);
    if (!body) return;

    const t = data.team;
    const headSub = document.getElementById('headSub-' + team.cardClass);
    const record = t.record && t.record.items ? t.record.items[0] : null;
    const statsArr = record ? (record.stats || []) : [];
    let standingSummary = team.standingOverride || t.standingSummary || '';
    standingSummary = standingSummary.replace('NL Cent', 'NL Central');

    const apiWins = STL.utils.findStat(statsArr, 'wins') || 0;
    const apiLosses = STL.utils.findStat(statsArr, 'losses') || 0;
    const apiTies = STL.utils.findStat(statsArr, 'ties') || 0;
    const apiPts = STL.utils.findStat(statsArr, 'points');
    const rc = team._computedRecord;
    const wins = rc ? rc.wins : apiWins;
    const losses = rc ? rc.losses : apiLosses;
    const ties = rc ? rc.ties : apiTies;
    const otLosses = STL.utils.findStat(statsArr, 'otLosses') || 0;
    const pts = rc && rc.points !== undefined ? rc.points : apiPts;
    const streakVal = team._computedStreak !== undefined ? team._computedStreak : STL.utils.findStat(statsArr, 'streak');

    if (standingSummary.includes('in MLS') && team.sport === 'soccer') {
      if (rc && window._mlsConfTeams && window._mlsConfTeams.length) {
        var adjusted = window._mlsConfTeams.map(function(t) { return { id: t.id, pts: t.id === String(team.id) ? rc.points : t.pts }; });
        adjusted.sort(function(a, b) { return b.pts - a.pts || a.id.localeCompare(b.id); });
        var confRank = adjusted.findIndex(function(t) { return t.id === String(team.id); }) + 1;
        standingSummary = confRank + STL.utils.suffix(confRank) + ' in Western Conference';
      } else {
        standingSummary = standingSummary.replace('in MLS', 'in Western Conference');
      }
    }

    let recordStr;
    if (team.sport === 'hockey') {
      recordStr = wins + '-' + losses + '-' + otLosses;
    } else if (team.sport === 'soccer') {
      recordStr = wins + '-' + losses + '-' + ties;
    } else {
      recordStr = wins + '-' + losses;
    }
    const totalDecisions = wins + losses + ties + (team.sport === 'hockey' ? otLosses : 0);
    if (totalDecisions > 0) {
      const winPct = (wins / totalDecisions).toFixed(3).replace(/^0/, '');
      recordStr += ' (' + winPct + ')';
    }

    const teamNextEvent = t.nextEvent && t.nextEvent[0];
    let lastGameEvent = null;
    let upcomingEvent = null;

    if (schedLastEvent) {
      lastGameEvent = schedLastEvent;
    } else if (teamNextEvent) {
      const st = teamNextEvent.competitions[0].status.type;
      if (st.completed === true || st.state === 'post') {
        lastGameEvent = teamNextEvent;
      }
    }

    if (schedNextEvent) {
      upcomingEvent = schedNextEvent;
    } else if (teamNextEvent) {
      const st = teamNextEvent.competitions[0].status.type;
      if (!(st.completed === true || st.state === 'post')) {
        upcomingEvent = teamNextEvent;
      }
    }

    let streakStr = '', streakClass = '';
    if (streakVal !== null && streakVal !== undefined) {
      const abs = Math.abs(streakVal);
      if (streakVal > 0) { streakStr = 'Won ' + abs; streakClass = 'win'; }
      else if (streakVal < 0) { streakStr = 'Lost ' + abs; streakClass = 'loss'; }
    }
    if (!streakStr && team._computedStreak === undefined && lastGameEvent) {
      const comp = lastGameEvent.competitions?.[0];
      if (comp) {
        const homeAway = comp.competitors?.find(c => String(c.team.id) === String(team.id));
        const opponent = comp.competitors?.find(c => String(c.team.id) !== String(team.id));
        if (homeAway && opponent && (comp.status?.type?.completed === true || comp.status?.type?.state === 'post')) {
          if (homeAway.winner === true) {
            streakStr = 'Won 1';
            streakClass = 'win';
          } else if (opponent.winner === true) {
            streakStr = 'Lost 1';
            streakClass = 'loss';
          } else {
            streakStr = 'Drew 1';
            streakClass = 'draw';
          }
        }
      }
    }

    if (upcomingEvent && STL.utils.isGameDay(upcomingEvent)) {
      await STL.api.fetchLineup(team, upcomingEvent);
    }

    let lastGameHtml = '';
    let nextGameHtml = '';
    const computedStatus = STL.utils.determineStatus(team, lastGameEvent, upcomingEvent, teamNextEvent);
    let statusText = computedStatus.text;
    let statusClass = computedStatus.className;

    if (lastGameEvent) {
      var r = STL.render.renderEventComp(team, lastGameEvent, true);
      if (r.lastGameHtml) lastGameHtml = r.lastGameHtml;
      if (r.nextGameHtml) nextGameHtml = r.nextGameHtml;
      if (r.statusText) { statusText = r.statusText; statusClass = r.statusClass; }
    }
    if (upcomingEvent) {
      var r = STL.render.renderEventComp(team, upcomingEvent, false);
      if (r.lastGameHtml) lastGameHtml = r.lastGameHtml;
      if (r.nextGameHtml) nextGameHtml = r.nextGameHtml;
      if (r.statusText) { statusText = r.statusText; statusClass = r.statusClass; }
    }

    document.getElementById('record-' + team.cardClass).textContent = recordStr;
    if (headSub) headSub.textContent = recordStr;
    const headNext = document.getElementById('headNext-' + team.cardClass);

    const pointsRow = document.getElementById('pointsRow-' + team.cardClass);
    const pointsEl = document.getElementById('points-' + team.cardClass);
    const showPoints = (team.sport === 'hockey' || team.sport === 'soccer') && pts !== null;
    if (showPoints) {
      pointsRow.style.display = '';
      pointsEl.textContent = Math.round(pts);
    } else {
      pointsRow.style.display = 'none';
    }

    const standingRow = document.getElementById('standingRow-' + team.cardClass);
    const standingEl = document.getElementById('standing-' + team.cardClass);
    if (standingSummary) {
      standingRow.style.display = '';
      standingEl.textContent = standingSummary;
    } else {
      standingRow.style.display = 'none';
    }

    const streakRow = document.getElementById('streakRow-' + team.cardClass);
    const streakEl = document.getElementById('streak-' + team.cardClass);
    if (streakStr) {
      streakRow.style.display = '';
      streakEl.textContent = streakStr;
      streakEl.className = 'stat-value ' + streakClass;
    } else {
      streakRow.style.display = 'none';
    }

    const lastGameEl = document.getElementById('lastGame-' + team.cardClass);
    lastGameEl.innerHTML = lastGameHtml || '<span style="color:var(--card-mute);">N/A</span>';

    const nextGameEl = document.getElementById('nextGame-' + team.cardClass);
    if (nextGameHtml) {
      nextGameEl.innerHTML = nextGameHtml;
      if (team._lineupData && window._lineupOpen && window._lineupOpen[team.cardClass]) {
        const toggle = nextGameEl.querySelector('.lineup-toggle');
        if (toggle) {
          toggle.classList.add('open');
          toggle.nextElementSibling.classList.add('open');
        }
      }
    } else if (lastGameHtml) {
      nextGameEl.innerHTML = '';
    } else {
      nextGameEl.innerHTML = '<div class="empty-msg">No upcoming games scheduled</div>';
    }

    if (headNext) {
      if (upcomingEvent) {
        const c = upcomingEvent.competitions?.[0];
        const opp = c?.competitors?.find(x => String(x.team.id) !== String(team.id));
        const ha = c?.competitors?.find(x => String(x.team.id) === String(team.id));
        const vs = ha && ha.homeAway === 'home' ? 'vs' : '@';
        headNext.textContent = 'Next: ' + vs + ' ' + (opp ? (opp.team.abbreviation || opp.team.displayName) : '') + ' · ' + STL.utils.formatDateStr(upcomingEvent.date);
      } else if (lastGameEvent) {
        headNext.textContent = standingSummary || '';
      } else headNext.textContent = '';
      team._upcomingEvent = upcomingEvent || null;
    }

    const timerEl = document.getElementById('countdown-' + team.cardClass);
    if (timerEl) {
      if (upcomingEvent && !(upcomingEvent.competitions?.[0]?.status?.type?.state === 'in')) {
        timerEl.dataset.target = upcomingEvent.date;
        timerEl.style.display = '';
      } else {
        timerEl.style.display = 'none';
      }
    }

    const linksEl = document.getElementById('links-' + team.cardClass);
    linksEl.innerHTML = team.links.map(l => '<a href="' + l.href + '" target="_blank" rel="noopener">' + l.text + '</a>').join('');

    const banner = document.getElementById('liveBanner-' + team.cardClass);
    const scoreEl = document.getElementById('liveScore-' + team.cardClass);
    const infoEl = document.getElementById('liveInfo-' + team.cardClass);
    if (banner && scoreEl && infoEl) {
      const liveState = team._liveStatus?.type?.state || team._liveEvent?.competitions?.[0]?.status?.type?.state;
      if (liveState === 'in') {
        const comps = team._liveScoreData || team._liveEvent.competitions[0].competitors;
        const ha = comps.find(c => String(c.team.id) === String(team.id));
        const opp = comps.find(c => String(c.team.id) !== String(team.id));
        if (ha && opp) {
          banner.style.display = 'flex';
          scoreEl.textContent = STL.utils.getScoreDisplay(ha) + '-' + STL.utils.getScoreDisplay(opp);
          const isHome = ha.homeAway === 'home';
          const st = team._liveStatus || team._liveEvent.competitions[0].status;
          const dc = st.displayClock;
          const clock = dc && dc !== '0:00' ? ' (' + dc + ')' : '';
          infoEl.innerHTML = (isHome ? 'vs' : '@') + ' ' + opp.team.abbreviation + '<br>' + (st.type?.detail || '') + clock;
        } else {
          banner.style.display = 'none';
        }
      } else {
        banner.style.display = 'none';
      }
    }

    const boxScoreEl = document.getElementById('boxScore-' + team.cardClass);
    if (boxScoreEl) {
      const bsHtml = STL.render.renderBoxScore(team);
      boxScoreEl.innerHTML = bsHtml ? '<div class="boxscore-body">' + bsHtml + '</div>' : '';
    }

    const capContainer = document.getElementById('capContainer-' + team.cardClass);
    const capPanel = document.getElementById('capPanel-' + team.cardClass);
    if (team.cardClass === 'blues') {
      capContainer.style.display = '';
      capPanel.innerHTML = '<div style="position:relative;width:100%;height:100%;"><iframe height="400" width="100%" style="border-radius:15px;filter:invert(1) hue-rotate(180deg);" frameborder="0" src="https://puckpedia.com/e/team/st-louis-blues/type2" title="St. Louis Blues Compact Cap Summary"></iframe></div>';
    } else {
      capContainer.style.display = 'none';
    }

    STL.render.renderAffShell(team);

    if (badge) {
      badge.textContent = statusText;
      badge.className = 'tstatus ' + statusClass;
    }
  },

  renderManual: function(team) {
    const body = document.getElementById('body-' + team.cardClass);
    if (!body) return;
    const iconEl = document.querySelector('#card-' + team.cardClass + ' .team-icon');
    if (iconEl && !iconEl.querySelector('img')) iconEl.textContent = team.icon;
    const badge = document.getElementById('badge-' + team.cardClass);
    if (badge) { badge.textContent = 'Follow'; badge.className = 'tstatus status-active'; }
    document.getElementById('record-' + team.cardClass).innerHTML = '<span style="color:var(--card-mute);">live scores coming soon</span>';
    const lg = document.getElementById('lastGame-' + team.cardClass);
    if (lg && lg.parentElement) lg.parentElement.style.display = 'none';
    const ng = document.getElementById('nextGame-' + team.cardClass);
    if (ng) ng.innerHTML = '';
    const linksEl = document.getElementById('links-' + team.cardClass);
    if (linksEl) linksEl.innerHTML = team.links.map(l => '<a href="' + l.href + '" target="_blank" rel="noopener">' + l.text + '</a>').join('');
  },

  /* NPB/KBO cards: record + standing from their league tables. No ESPN
     schedule, so no last/next, countdown, or win probability. */

  renderAsiaCard: function(team, st) {
    const body = document.getElementById('body-' + team.cardClass);
    if (!body) return;
    const iconEl = document.querySelector('#card-' + team.cardClass + ' .team-icon');
    if (iconEl) {
      if (team.logo) {
        iconEl.innerHTML = '<img src="' + team.logo + '" alt="' + team.name + '" onerror="this.parentNode.textContent=\'' + team.icon + '\'">';
      } else {
        iconEl.textContent = team.icon;
      }
    }
    const w = st.wins != null ? st.wins : '?';
    const l = st.losses != null ? st.losses : '?';
    const t = st.ties != null ? st.ties : 0;
    let rec = w + '-' + l + '-' + t;
    if (st.pct) rec += ' (' + st.pct + ')';
    document.getElementById('record-' + team.cardClass).textContent = rec;
    const standingRow = document.getElementById('standingRow-' + team.cardClass);
    const standingEl = document.getElementById('standing-' + team.cardClass);
    if (st.rank != null) {
      standingRow.style.display = '';
      let s = st.rank + STL.utils.suffix(parseInt(st.rank)) + ' in ' + (st.leagueName || team.league);
      if (st.gb != null && String(st.gb) !== '-' && String(st.gb) !== '0' && String(st.gb) !== '0.0') {
        s += ' · ' + st.gb + ' GB';
      }
      if (st.note) s += '<br><span style="color:var(--card-mute);font-weight:400;">' + st.note + '</span>';
      standingEl.innerHTML = s;
    } else {
      standingRow.style.display = 'none';
    }
    const streakRow = document.getElementById('streakRow-' + team.cardClass);
    const streakEl = document.getElementById('streak-' + team.cardClass);
    if (streakRow && st.streak) {
      streakRow.style.display = '';
      streakEl.textContent = st.streak;
      const ch = String(st.streak).charAt(0).toUpperCase();
      streakEl.className = 'stat-value ' + (ch === 'W' ? 'win' : ch === 'L' ? 'loss' : 'draw');
    } else if (streakRow) {
      streakRow.style.display = 'none';
    }
    const lg = document.getElementById('lastGame-' + team.cardClass);
    if (lg && lg.parentElement) lg.parentElement.style.display = 'none';
    const ng = document.getElementById('nextGame-' + team.cardClass);
    if (ng) ng.innerHTML = '';
    const linksEl = document.getElementById('links-' + team.cardClass);
    if (linksEl) linksEl.innerHTML = team.links.map(x => '<a href="' + x.href + '" target="_blank" rel="noopener">' + x.text + '</a>').join('');
    const badge = document.getElementById('badge-' + team.cardClass);
    if (badge) {
      const active = st.remaining == null || parseInt(st.remaining) > 0;
      badge.textContent = active ? 'Active' : 'Offseason';
      badge.className = 'tstatus ' + (active ? 'status-active' : 'status-offseason');
    }
  },

  /* Affiliates dropdown: static rows render with the parent card; live
     record + prospects fill in when STL.api.fetchAffiliates resolves. */

  renderAffShell: function(team) {
    const key = team.cardClass === 'cardinals' ? 'cardinals' : team.cardClass === 'blues' ? 'blues' : null;
    const container = document.getElementById('affContainer-' + team.cardClass);
    const panel = document.getElementById('affPanel-' + team.cardClass);
    const label = document.getElementById('affLabel-' + team.cardClass);
    if (!key || !container || !panel) return;
    const list = (STL.config.AFFILIATES && STL.config.AFFILIATES[key]) || [];
    if (!list.length) { container.style.display = 'none'; return; }
    container.style.display = '';
    if (label) label.textContent = key === 'cardinals' ? 'Farm System' : 'Affiliates';
    panel.innerHTML = list.map(a => STL.render.affRowHtml(team.cardClass, a)).join('');
    if (window._affOpen && window._affOpen[team.cardClass]) {
      const toggle = container.querySelector('.aff-toggle');
      if (toggle) { toggle.classList.add('open'); panel.classList.add('open'); }
    }
  },

  affRowHtml: function(cardClass, aff) {
    const cached = STL.api._affCache && STL.api._affCache[aff.name];
    let sub = '<span style="color:var(--card-mute);">tap to load record + prospects</span>';
    let gamesHtml = '';
    if (cached) {
      if (cached.error) {
        sub = '<span style="color:var(--card-mute);">live data unavailable</span>';
      } else if (cached.record) {
        const r = cached.record;
        const games = (r.wins || 0) + (r.losses || 0);
        if (games === 0) {
          sub = '<span style="color:var(--card-mute);">live data unavailable</span>';
        } else {
          let rec;
          if (r.pct !== undefined && r.otl === undefined) {
            rec = (r.wins || 0) + '-' + (r.losses || 0) + (r.pct ? ' (' + r.pct + ')' : '');
          } else {
            rec = (r.wins || 0) + '-' + (r.losses || 0) + '-' + (r.otl || 0) +
              (r.sol ? '-' + r.sol : '') + ' (' + (r.points || 0) + ' pts)';
          }
          if (cached.isFinal && (cached.season || cached.seasonName)) {
            const tag = cached.season || String(cached.seasonName).replace(' Regular Season', '');
            rec += ' · Final ' + tag;
          }
          if (cached.standing) {
            rec += '<br><span style="color:var(--card-mute);font-weight:400;">' + cached.standing + '</span>';
          }
          sub = '<span class="aff-rec">' + rec + '</span>';
        }
      } else if (cached.seasonStart) {
        sub = '<span style="color:var(--card-mute);">season begins ' + STL.render.fmtSeasonStart(cached.seasonStart) + '</span>';
      }
      if (cached.lastGame) gamesHtml += '<div class="aff-game">Last: ' + cached.lastGame + '</div>';
      if (cached.nextGame) gamesHtml += '<div class="aff-game">Next: ' + cached.nextGame + '</div>';
    }
    let pros = '';
    if (cached && cached.prospects && cached.prospects.length) {
      const pSeason = cached.prospectSeason || cached.season;
      let prosLabel = 'Rising prospects';
      if (pSeason && (cached.isFinal || pSeason !== STL.api.milbSeasonYear())) {
        prosLabel = 'Top performers · ' + pSeason;
      } else if (cached.isFinal && cached.seasonName) {
        prosLabel = 'Top performers · ' + String(cached.seasonName).replace(' Regular Season', '');
      }
      pros = '<div class="prospects">' +
        '<div class="prospects-label">' + prosLabel + '</div>' +
        cached.prospects.map(p =>
          '<div class="prospect-row"><span class="pos">' + p.pos + '</span>' +
          '<span class="name">' + p.name + '</span>' +
          '<span class="pline">' + p.line + '</span></div>'
        ).join('') + '</div>';
    }
    return '<div class="aff-row" id="aff-' + cardClass + '-' + aff.name.replace(/[^a-z0-9]/gi, '') + '">' +
      '<div class="aff-top"><span class="aff-name">' + aff.name + '</span>' +
      '<span class="aff-level">' + aff.level + '</span></div>' +
      '<div class="aff-sub">' + sub + ' &middot; <a href="' + aff.site + '" target="_blank" rel="noopener">site</a></div>' +
      gamesHtml + pros + '</div>';
  },

  fmtSeasonStart: function(iso) {
    try {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const parts = String(iso).split('-');
      return months[parseInt(parts[1]) - 1] + ' ' + parseInt(parts[2]);
    } catch (e) { return String(iso); }
  },

  refreshAffPanel: function(cardClass) {
    const key = cardClass === 'cardinals' ? 'cardinals' : cardClass === 'blues' ? 'blues' : null;
    if (!key) return;
    const panel = document.getElementById('affPanel-' + cardClass);
    if (!panel || !panel.classList.contains('open')) {
      // Still refresh underlying HTML so it is current on next open.
      const team = STL.dashboard.teamList().find(t => t.cardClass === cardClass) ||
        STL.config.TEAMS.find(t => t.cardClass === cardClass);
      if (!team) return;
      const list = (STL.config.AFFILIATES && STL.config.AFFILIATES[key]) || [];
      panel.innerHTML = list.map(a => STL.render.affRowHtml(cardClass, a)).join('');
      return;
    }
    const team = STL.dashboard.teamList().find(t => t.cardClass === cardClass) ||
      STL.config.TEAMS.find(t => t.cardClass === cardClass);
    if (!team) return;
    const list = (STL.config.AFFILIATES && STL.config.AFFILIATES[key]) || [];
    panel.innerHTML = list.map(a => STL.render.affRowHtml(cardClass, a)).join('');
  },

};
