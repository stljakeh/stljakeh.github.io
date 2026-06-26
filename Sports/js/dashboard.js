window.STL = window.STL || {};

window._lineupOpen = {};
window._leadersOpen = {};
window._mlsOverall = {};

var refreshTimer = null;
var isRefreshing = false;
var countdownTimer = null;

STL.dashboard = {

  init: function() {
    const d = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('liveDate').textContent = d.toLocaleDateString('en-US', opts);
    STL.render.buildCards();
    STL.dashboard.refresh();
    refreshTimer = setInterval(STL.dashboard.refresh, 60000);
  },

  refresh: async function() {
    if (isRefreshing) return;
    isRefreshing = true;
    STL.config.TEAMS.forEach(t => { t._liveEvent = null; t._liveScoreData = null; t._liveStatus = null; t._lineupData = null; });
    const btn = document.getElementById('refreshBtn');
    const spinner = document.getElementById('spinner');
    const label = document.getElementById('btnLabel');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    label.textContent = 'Updating';

    window._mlsOverall = {};
    await STL.api.enrichLiveScores();
    await Promise.all([...STL.config.TEAMS.map(t => STL.api.fetchTeam(t)), STL.api.fetchMlsStandings()]);
    STL.dashboard.adjustRefreshInterval();
    STL.dashboard.startCountdownTimer();

    const grid = document.getElementById('cardGrid');
    const cards = Array.from(grid.children);
    const live = [], playoffs = [], active = [], brk = [], offseason = [];
    for (const card of cards) {
      const badge = card.querySelector('.status-badge');
      const cls = badge ? badge.className : '';
      if (cls.includes('status-live')) live.push(card);
      else if (cls.includes('status-playoffs')) playoffs.push(card);
      else if (cls.includes('status-active')) active.push(card);
      else if (cls.includes('status-break')) brk.push(card);
      else offseason.push(card);
    }
    [...live, ...playoffs, ...active, ...brk, ...offseason].forEach(c => grid.appendChild(c));

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
    const hasLive = STL.config.TEAMS.some(t => t._liveEvent);
    refreshTimer = setInterval(STL.dashboard.refresh, hasLive ? 20000 : 60000);
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
