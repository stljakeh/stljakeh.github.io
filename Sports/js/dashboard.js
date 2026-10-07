window.STL = window.STL || {};

window._lineupOpen = {};
window._mlsOverall = {};
window._mlsConfTeams = [];

var refreshTimer = null;
var isRefreshing = false;
var countdownTimer = null;

STL.dashboard = {

  teamList: function() {
    if (window._useOtherTeams && STL.config.OTHER_TEAMS) return STL.config.OTHER_TEAMS;
    return STL.config.TEAMS;
  },

  init: function() {
    const d = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const ld = document.getElementById('liveDate');
    if (ld) ld.textContent = d.toLocaleDateString('en-US', opts);
    STL.render.buildCards();
    STL.dashboard.refresh();
    refreshTimer = setInterval(STL.dashboard.refresh, 60000);
  },

  refresh: async function() {
    if (isRefreshing) return;
    isRefreshing = true;
    const teams = STL.dashboard.teamList();
    teams.forEach(t => { t._liveEvent = null; t._liveScoreData = null; t._liveStatus = null; t._lineupData = null; t._liveBoxScore = null; });
    const btn = document.getElementById('refreshBtn');
    const spinner = document.getElementById('spinner');
    const label = document.getElementById('btnLabel');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    label.textContent = 'Updating';

    window._mlsOverall = {};
    window._mlsConfTeams = [];
    await STL.api.enrichLiveScores();
    await STL.api.fetchMlsStandings();
    await Promise.all(teams.map(t => STL.api.fetchTeam(t)));
    STL.dashboard.applyHideWhenIdle();
    STL.dashboard.adjustRefreshInterval();
    STL.dashboard.startCountdownTimer();

    const grid = document.getElementById('cardGrid');
    const cards = Array.from(grid.children);
    const live = [], playoffs = [], active = [], offseason = [];
    for (const card of cards) {
      const badge = card.querySelector('.tstatus');
      const cls = badge ? badge.className : '';
      if (cls.includes('status-live')) live.push(card);
      else if (cls.includes('status-playoffs')) playoffs.push(card);
      else if (cls.includes('status-active')) active.push(card);
      else offseason.push(card);
    }
    [...live, ...playoffs, ...active, ...offseason].forEach(c => grid.appendChild(c));
    STL.dashboard.updateHero();

    const now = new Date();
    const ts = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('updateTime').textContent = 'last updated ' + ts;

    btn.disabled = false;
    spinner.classList.add('hidden');
    label.textContent = 'Refresh';
    isRefreshing = false;
  },

  adjustRefreshInterval: function() {
    if (refreshTimer) clearInterval(refreshTimer);
    const hasLive = STL.dashboard.teamList().some(t => t._liveEvent);
    refreshTimer = setInterval(STL.dashboard.refresh, hasLive ? 20000 : 60000);
  },

  applyHideWhenIdle: function() {
    if (STL.dashboard._idleHidden === false) {
      STL.dashboard.teamList().forEach(t => {
        const card = document.getElementById('card-' + t.cardClass);
        if (card) card.style.display = '';
      });
      const note = document.getElementById('idleNote');
      if (note) note.remove();
      return;
    }
    STL.dashboard.teamList().forEach(t => {
      if (!t.hideWhenIdle) return;
      const card = document.getElementById('card-' + t.cardClass);
      if (!card) return;
      const badge = card.querySelector('.tstatus');
      const isOff = badge && badge.className.includes('status-offseason');
      const hasNext = !!document.getElementById('nextGame-' + t.cardClass)?.textContent?.trim();
      card.style.display = (isOff && !hasNext) ? 'none' : '';
    });
    const hidden = STL.dashboard.teamList().filter(t => {
      const card = document.getElementById('card-' + t.cardClass);
      return card && card.style.display === 'none';
    }).length;
    const total = STL.dashboard.teamList().length;
    if (hidden > 0 && hidden < total) {
      let note = document.getElementById('idleNote');
      if (!note) {
        note = document.createElement('div');
        note.id = 'idleNote';
        note.className = 'idle-note';
        document.getElementById('cardGrid').after(note);
      }
      note.textContent = hidden + ' idle national-team card' + (hidden > 1 ? 's' : '') + ' hidden (offseason)';
    } else {
      const note = document.getElementById('idleNote');
      if (note) note.remove();
    }
  },

  updateHero: function() {
    const headline = document.getElementById('heroHeadline');
    const kicker = document.getElementById('heroKicker');
    const hero = document.querySelector('.hero');
    if (!headline || !hero) return;
    const teams = STL.dashboard.teamList();
    const HEROC = {
      cardinals: ['#c41e3a', '#8f1227'], blues: ['#003087', '#001f5c'],
      'city-sc': ['#e80a4d', '#a30636'], battlehawks: ['#00529b', '#003a6e'],
      cougars: ['#c8102e', '#8f0b20'], 'cougars-soccer': ['#c8102e', '#8f0b20'],
      steelers: ['#4a4a4a', '#222222'], bayern: ['#dc052d', '#96031e'],
      forest: ['#dd0741', '#96052c'], grampus: ['#8a6d00', '#5c4a00'],
      kholood: ['#5a2d82', '#3a1d55'], usmnt: ['#3c3b6e', '#23223f'],
      germany: ['#4a4a4a', '#222222'], dinos: ['#0a2a5e', '#061a3b'],
      rakuten: ['#bf0000', '#7d0000']
    };
    const VERB = { baseball: 'First pitch', hockey: 'Puck drop', soccer: 'Kickoff', football: 'Kickoff', basketball: 'Tipoff' };
    const fmtDur = function(ms) {
      const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
      if (d > 0) return d + (d === 1 ? ' day' : ' days');
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm';
    };
    const liveTeam = teams.find(t => t._liveEvent);
    let pick = null, pickDate = null, headlineText = '', kickerText = 'ST. LOUIS SPORTS';
    if (liveTeam) {
      pick = liveTeam;
      const comps = liveTeam._liveScoreData || liveTeam._liveEvent.competitions[0].competitors;
      const ha = comps.find(c => String(c.team.id) === String(liveTeam.id));
      const opp = comps.find(c => String(c.team.id) !== String(liveTeam.id));
      const st = liveTeam._liveStatus || liveTeam._liveEvent.competitions[0].status;
      headlineText = liveTeam.name + ' ' + STL.utils.getScoreDisplay(ha) + ' · Opp ' + STL.utils.getScoreDisplay(opp) + ' — live' + (st.type?.detail ? ' (' + st.type.detail + ')' : '') + '.';
      kickerText = 'LIVE NOW · ' + liveTeam.league;
    } else {
      let soon = null;
      teams.forEach(t => {
        if (t._upcomingEvent && t._upcomingEvent.date) {
          const ms = new Date(t._upcomingEvent.date).getTime() - Date.now();
          if (ms > 0 && (!soon || ms < soon.ms)) soon = { team: t, ms: ms };
        }
      });
      if (soon) {
        pick = soon.team; pickDate = soon.ms;
        const verb = VERB[soon.team.sport] || 'Game time';
        headlineText = verb + ' for the ' + soon.team.name + ' in ' + fmtDur(soon.ms) + '.';
        kickerText = 'NEXT UP · ' + soon.team.league;
      } else {
        const activeTeam = teams.find(t => {
          const b = document.getElementById('badge-' + t.cardClass);
          return b && b.className.includes('status-active');
        });
        pick = activeTeam || teams[0];
        if (pick) {
          headlineText = 'Following the ' + pick.name + ' all season long.';
          kickerText = pick.league + ' · ' + pick.name.toUpperCase();
        }
      }
    }
    headline.textContent = headlineText || 'Checking the schedules…';
    kicker.textContent = kickerText;
    if (pick && HEROC[pick.cardClass]) {
      hero.style.setProperty('--hero', HEROC[pick.cardClass][0]);
      hero.style.setProperty('--hero-deep', HEROC[pick.cardClass][1]);
    }
  },

  startCountdownTimer: function() {
    if (countdownTimer) clearInterval(countdownTimer);
    STL.dashboard.updateCountdowns();
    countdownTimer = setInterval(STL.dashboard.updateCountdowns, 1000);
  },

  updateCountdowns: function() {
    const now = Date.now();
    document.querySelectorAll('.countdown-timer').forEach(function(el) {
      const target = new Date(el.dataset.target).getTime();
      const diff = target - now;
      if (diff <= 0) { el.textContent = ''; el.style.display = 'none'; return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      let str = d > 0 ? d + 'd ' + h + 'h ' + m + 'm' : h > 0 ? h + 'h ' + m + 'm ' + s + 's' : m + 'm ' + s + 's';
      el.textContent = 'Starts in ' + str;
    });
  }
};
