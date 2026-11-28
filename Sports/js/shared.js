window.STL = window.STL || {};

STL.shared = {
  PROXIES: [
    'https://api.cors.lol/?url=',
    'https://api.allorigins.win/raw?url='
  ],

  MLS_SEASON_ID: 'MLS-SEA-0001KA',
  MLS_COMPETITION_ID: 'MLS-COM-000001',
  MLS_WEST: [
    { code: 'COL', espn: '184' },
    { code: 'DAL', espn: '185' },
    { code: 'SKC', espn: '186' },
    { code: 'LA', espn: '187' },
    { code: 'HOU', espn: '6077' },
    { code: 'RSL', espn: '4771' },
    { code: 'SJ', espn: '191' },
    { code: 'POR', espn: '9723' },
    { code: 'SEA', espn: '9726' },
    { code: 'VAN', espn: '9727' },
    { code: 'MIN', espn: '17362' },
    { code: 'LAFC', espn: '18966' },
    { code: 'ATX', espn: '20906' },
    { code: 'STL', espn: '21812' },
    { code: 'SD', espn: '22529' }
  ],

  readCache: function(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && Date.now() < parsed.expiry) return parsed.data;
    } catch (e) {}
    return null;
  },

  writeCache: function(key, data, ttlMs) {
    try {
      localStorage.setItem(key, JSON.stringify({ data: data, expiry: Date.now() + (ttlMs || 6 * 3600000) }));
    } catch (e) {}
  },

  sleep: function(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  },

  jitterSleep: function(baseMs, spreadMs) {
    var ms = (baseMs || 350) + Math.random() * (spreadMs == null ? 450 : spreadMs);
    return STL.shared.sleep(ms);
  },

  fetchWithTimeout: function(url, ms, fetchOpts) {
    ms = ms || 8000;
    if (typeof AbortController === 'undefined') return fetch(url, fetchOpts);
    var ctrl = new AbortController();
    var t = setTimeout(function() { ctrl.abort(); }, ms);
    var opts = fetchOpts ? Object.assign({}, fetchOpts, { signal: ctrl.signal }) : { signal: ctrl.signal };
    return fetch(url, opts).then(
      function(r) { clearTimeout(t); return r; },
      function(e) { clearTimeout(t); throw e; }
    );
  },

  // Timeout covers the ENTIRE request including resp.text() body streaming so
  // a proxy that sends HTTP 200 headers and stalls mid-body never hangs forever.
  fetchTextWithTimeout: function(url, ms, fetchOpts) {
    ms = ms || 6500;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var opts = ctrl
      ? (fetchOpts ? Object.assign({}, fetchOpts, { signal: ctrl.signal }) : { signal: ctrl.signal })
      : fetchOpts;
    return new Promise(function(resolve, reject) {
      var done = false;
      var timer = setTimeout(function() {
        if (done) return;
        done = true;
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        var err = new Error('timeout');
        err.name = 'AbortError';
        reject(err);
      }, ms);
      var finishOk = function(val) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(val);
      };
      var finishErr = function(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(err);
      };
      fetch(url, opts).then(function(resp) {
        if (!resp.ok) {
          if (resp.body && resp.body.cancel) { try { resp.body.cancel(); } catch (e) {} }
          finishErr(new Error('HTTP ' + resp.status));
          return;
        }
        resp.text().then(function(text) {
          finishOk(text);
        }, finishErr);
      }, finishErr);
    });
  },

  ensureJson: async function(resp) {
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var text = await resp.text();
    var parsed = null;
    try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
    if (parsed && typeof parsed === 'object') {
      return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error('non-JSON body');
  },

  raceUrls: function(urls, ms) {
    return new Promise(function(resolve, reject) {
      var pending = urls.length;
      var lastErr = null;
      if (!pending) { reject(new Error('no urls')); return; }
      var settled = false;
      var fail = function(e) {
        lastErr = e;
        if (--pending === 0 && !settled) reject(lastErr);
      };
      urls.forEach(function(u) {
        STL.shared.fetchTextWithTimeout(u, ms).then(function(text) {
          if (settled) return;
          var parsed = null;
          try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
          if (parsed && typeof parsed === 'object') {
            settled = true;
            resolve(new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } }));
          } else {
            fail(new Error('non-JSON body'));
          }
        }, fail);
      });
    });
  },

  // Endpoints known to omit Access-Control-Allow-Origin headers in browsers:
  // skip the guaranteed-to-fail direct fetch so we don't waste a round-trip.
  shouldSkipDirect: function(url) {
    if (/^https:\/\/site\.api\.espn\.com\/apis\/site\/v2\/sports\/[^/]+\/[^/]+\/teams\/\d+(\?.*)?$/.test(url)) {
      return true;
    }
    if (url.indexOf('https://lscluster.hockeytech.com/') === 0) {
      return true;
    }
    return false;
  },

  fetchResponseWithFallback: async function(url, ms, opts) {
    ms = ms || 6500;
    var maxRounds = (opts && opts.maxRounds) || 2;
    var directErr = null;
    if (!STL.shared.shouldSkipDirect(url)) {
      try {
        var text = await STL.shared.fetchTextWithTimeout(url, ms);
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e0) { parsed = null; }
        if (parsed && typeof parsed === 'object') {
          return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error('non-JSON body');
      } catch (e) {
        directErr = e;
        var isAbort = e && e.name === 'AbortError';
        var isTypeError = (typeof TypeError !== 'undefined' && e instanceof TypeError) ||
          (e && e.name === 'TypeError');
        var isBadBody = e && e.message === 'non-JSON body';
        var isRetryableStatus = false;
        if (e && typeof e.message === 'string') {
          var m = e.message.match(/^HTTP (\d+)/);
          if (m) {
            var st = parseInt(m[1], 10);
            isRetryableStatus = (st === 429 || (st >= 500 && st <= 599));
          }
        }
        if (!isAbort && !isTypeError && !isBadBody && !isRetryableStatus) throw e;
      }
    }
    var urls = STL.shared.PROXIES.map(function(p) { return p + encodeURIComponent(url); });
    for (var round = 0; round < maxRounds; round++) {
      if (round > 0) await STL.shared.jitterSleep(250, 350);
      try {
        return await STL.shared.raceUrls(urls, ms);
      } catch (e2) {
        if (!directErr) directErr = e2;
      }
    }
    throw directErr || new Error('network error');
  },

  _mlsMatchesInFlight: null,

  fetchMlsMatches: async function() {
    var seasonId = (STL.config && STL.config.MLS_SEASON_ID) || STL.shared.MLS_SEASON_ID;
    var compId = (STL.config && STL.config.MLS_COMPETITION_ID) || STL.shared.MLS_COMPETITION_ID;
    var url = 'https://stats-api.mlssoccer.com/matches/seasons/' + seasonId +
      '?competition_id=' + compId +
      '&match_date%5Bgte%5D=2026-02-01&match_date%5Blte%5D=2026-12-31' +
      '&per_page=1000&sort=planned_kickoff_time%3Aasc';
    var cacheKey = 'mls_cache_' + btoa(url);
    var cached = STL.shared.readCache(cacheKey);
    if (cached) return cached;
    if (STL.shared._mlsMatchesInFlight) return STL.shared._mlsMatchesInFlight;
    STL.shared._mlsMatchesInFlight = (async function() {
      try {
        var resp = await STL.shared.fetchResponseWithFallback(url);
        if (!resp.ok) return [];
        var data = await resp.json();
        var matches = (data && data.schedule) || [];
        STL.shared.writeCache(cacheKey, matches, 6 * 3600000);
        return matches;
      } catch (e) {
        return [];
      } finally {
        STL.shared._mlsMatchesInFlight = null;
      }
    })();
    return STL.shared._mlsMatchesInFlight;
  }
};
