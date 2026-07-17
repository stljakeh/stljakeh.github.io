window.STL = window.STL || {};

STL.utils = {

  suffix: function(n) {
    const s = ['th','st','nd','rd'], v = n % 100;
    return s[(v - 20) % 10] || s[v] || s[0];
  },

  formatDateStr: function(dateStr, showYear) {
    const d = new Date(dateStr);
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (showYear) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  },

  formatTimeStr: function(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  },

  isGameDay: function(event) {
    if (!event || !event.date) return false;
    const d = new Date(event.date);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
           d.getMonth() === now.getMonth() &&
           d.getDate() === now.getDate();
  },

  getScoreDisplay: function(competitor) {
    if (!competitor || competitor.score == null) return '0';
    if (typeof competitor.score === 'string') return competitor.score;
    if (typeof competitor.score === 'number') return String(competitor.score);
    if (competitor.score.displayValue != null) return competitor.score.displayValue;
    return String(competitor.score.value ?? '0');
  },

  findStat: function(stats, name) {
    const s = stats.find(s => s.name === name);
    return s ? s.value : null;
  },

  findStatValue: function(categories, catName, statName) {
    const cat = categories.find(c => c.name === catName);
    if (!cat) return 0;
    const s = cat.stats.find(s => s.name === statName);
    return s ? (s.value ?? 0) : 0;
  },

  determineStatus: function(team, lastGameEvent, upcomingEvent, teamNextEvent) {
    if (!upcomingEvent && !lastGameEvent && !teamNextEvent) {
      return { text: 'Offseason', className: 'status-offseason' };
    }
    if (!upcomingEvent) {
      if (lastGameEvent) {
        var daysSince = (Date.now() - new Date(lastGameEvent.date).getTime()) / 86400000;
        if (daysSince < 30) return { text: 'Active', className: 'status-active' };
      }
      return { text: 'Offseason', className: 'status-offseason' };
    }
    const daysUntilNext = (new Date(upcomingEvent.date).getTime() - Date.now()) / 86400000;
    if (daysUntilNext > 14) {
      return { text: 'Offseason', className: 'status-offseason' };
    }
    const st = upcomingEvent.competitions?.[0]?.seasonType;
    if (st && st.name && st.name.toLowerCase().includes('playoff')) {
      return { text: 'Playoffs', className: 'status-playoffs' };
    }
    return { text: 'Active', className: 'status-active' };
  },

  c2url: function(url) {
    return STL.config.CITY2_CP + url;
  }
};
