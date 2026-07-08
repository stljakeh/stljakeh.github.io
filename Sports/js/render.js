window.STL = window.STL || {};

STL.render = {

  buildCards: function() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';
    STL.config.TEAMS.forEach(t => {
      const card = document.createElement('div');
      card.className = 'card ' + t.cardClass;
      card.id = 'card-' + t.cardClass;
      card.innerHTML =
        '<div class="card-head">' +
          '<div class="team-info">' +
            '<div class="team-icon">' + t.icon + '</div>' +
            '<div>' +
              '<div class="team-name">' + t.name + '</div>' +
              '<div class="team-league">' + t.league + (t.leagueFull && t.leagueFull !== t.league ? ' &middot; ' + t.leagueFull : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="status-badge ' + t.statusClass + '" id="badge-' + t.cardClass + '">' + t.statusText + '</span>' +
        '</div>' +
        '<div class="card-body" id="body-' + t.cardClass + '">' +
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
          '<div id="nextGame-' + t.cardClass + '"></div>' +
          '<div class="countdown-timer" id="countdown-' + t.cardClass + '" data-target="" style="display:none"></div>' +
          '<div class="live-banner" id="liveBanner-' + t.cardClass + '" style="display:none">' +
            '<span class="live-badge">LIVE</span>' +
            '<span class="live-score" id="liveScore-' + t.cardClass + '"></span>' +
            '<div class="live-info" id="liveInfo-' + t.cardClass + '"></div>' +
          '</div>' +
          '<div id="leadersContainer-' + t.cardClass + '" style="display:none">' +
            '<button class="leaders-toggle" onclick="STL.toggle.leaders(this,\'' + t.cardClass + '\')">' +
              '<span class="leaders-toggle-icon">&#9654;</span> Stats' +
            '</button>' +
            '<div class="leaders-panel" id="leadersPanel-' + t.cardClass + '"></div>' +
          '</div>' +
          '<div id="capContainer-' + t.cardClass + '" style="display:none">' +
            '<button class="cap-toggle" onclick="STL.toggle.cap(this,\'' + t.cardClass + '\')">' +
              '<span class="cap-toggle-icon">&#9654;</span> Cap' +
            '</button>' +
            '<div class="cap-panel" id="capPanel-' + t.cardClass + '"></div>' +
          '</div>' +
          '<div class="links" id="links-' + t.cardClass + '"></div>' +
        '</div>';
      grid.appendChild(card);
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
      detailHtml = '<div style="color:#888;font-size:0.75rem;margin-top:2px;">' + st.detail + clock + '</div>';
    }
    let winHtml = '';
    if (team._winProb !== undefined) {
      const wp = team._winProb;
      const color = wp > 60 ? '#4caf50' : wp > 40 ? '#ff9800' : '#f44336';
      winHtml = '<div style="font-size:0.75rem;margin-top:3px;color:' + (isLive ? color : '#aaa') + ';">' + (isLive ? 'Live Win' : 'Win') + ': ' + wp + '%</div>';
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
        (venue ? '<div style="color:#888;font-size:0.75rem;margin-top:2px;">' + venue + (broadcasts ? ' &middot; ' + broadcasts : '') + '</div>' : '') +
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
      const won = homeAway.winner;
      const resultChar = won ? 'W' : 'L';
      const resultClass = won ? 'win' : 'loss';
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

  renderTeam: async function(team, data, schedLastEvent, schedNextEvent) {
    const body = document.getElementById('body-' + team.cardClass);
    const badge = document.getElementById('badge-' + team.cardClass);
    if (!body) return;

    const t = data.team;
    const iconEl = document.querySelector('#card-' + team.cardClass + ' .team-icon');
    if (iconEl && t.logos && t.logos[0]) {
      iconEl.innerHTML = '<img src="' + t.logos[0].href + '" alt="' + t.displayName + '">';
    }
    const record = t.record && t.record.items ? t.record.items[0] : null;
    const statsArr = record ? (record.stats || []) : [];
    let standingSummary = team.standingOverride || t.standingSummary || '';
    standingSummary = standingSummary.replace('NL Cent', 'NL Central');
    if (standingSummary.includes('in MLS')) {
      standingSummary = standingSummary.replace('in MLS', 'in Western Conference');
      if (window._mlsOverall && window._mlsOverall[team.id]) {
        standingSummary += ' | ' + window._mlsOverall[team.id] + ' in MLS';
      }
    }

    const wins = STL.utils.findStat(statsArr, 'wins') || 0;
    const losses = STL.utils.findStat(statsArr, 'losses') || 0;
    const ties = STL.utils.findStat(statsArr, 'ties') || 0;
    const otLosses = STL.utils.findStat(statsArr, 'otLosses') || 0;
    const pts = STL.utils.findStat(statsArr, 'points');
    const streakVal = STL.utils.findStat(statsArr, 'streak');

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
    if (!streakStr && lastGameEvent) {
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
            streakClass = '';
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
    lastGameEl.innerHTML = lastGameHtml || '<span style="color:#666;">N/A</span>';

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

    STL.render.renderStatLeaders(team);

    const capContainer = document.getElementById('capContainer-' + team.cardClass);
    const capPanel = document.getElementById('capPanel-' + team.cardClass);
    if (team.cardClass === 'blues') {
      capContainer.style.display = '';
      capPanel.innerHTML = '<div style="position:relative;width:100%;height:100%;"><iframe height="400" width="100%" style="border-radius:15px;filter:invert(1) hue-rotate(180deg);" frameborder="0" src="https://puckpedia.com/e/team/st-louis-blues/type2" title="St. Louis Blues Compact Cap Summary"></iframe></div>';
    } else {
      capContainer.style.display = 'none';
    }

    if (badge) {
      badge.textContent = statusText;
      badge.className = 'status-badge ' + statusClass;
    }
  },

  renderStatLeaders: function(team) {
    const container = document.getElementById('leadersContainer-' + team.cardClass);
    const panel = document.getElementById('leadersPanel-' + team.cardClass);
    if (!container || !panel) return;
    if (!team._leaders || !team._leaders.length) {
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    panel.innerHTML = team._leaders.map(function(g) {
      return '<div class="leader-cat">' + g.cat + '</div>' +
        g.items.map(function(p) {
          return '<div class="leader-row"><span class="leader-name">' + p.name + '</span><span class="leader-val">' + p.val + '</span></div>';
        }).join('');
    }).join('');
    if (window._leadersOpen && window._leadersOpen[team.cardClass]) {
      const btn = container.querySelector('.leaders-toggle');
      if (btn) {
        btn.classList.add('open');
        btn.nextElementSibling.classList.add('open');
      }
    }
  }
};
